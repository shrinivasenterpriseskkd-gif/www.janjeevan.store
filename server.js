import "dotenv/config";
import express from "express";
import { access, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Razorpay from "razorpay";
import { applicationDefault, cert, initializeApp as initializeFirebaseAdmin } from "firebase-admin/app";
import { getAuth as getFirebaseAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore as getFirebaseAdminFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { createCheckoutRouter } from "./routes.js";
import { normalizePaymentLink } from "./js/payment-link.js";
const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 5500;
const root = path.dirname(fileURLToPath(import.meta.url));
const adminLoginIdSecret = defineSecret("ADMIN_LOGIN_ID");
const adminPasswordSecret = defineSecret("ADMIN_PASSWORD");
const razorpayKeyIdSecret = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecretSecret = defineSecret("RAZORPAY_KEY_SECRET");
const postalRatesSecret = defineSecret("INDIA_POST_RETAIL_RATES_JSON");
let razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;
const adminSessions = new Map();
const loginAttempts = new Map();
const adminSessionDuration = 8 * 60 * 60 * 1000;
const loginAttemptWindow = 15 * 60 * 1000;
const maxLoginAttempts = 5;
const merchantShopCategories = [
  "Beauty / Parlour", "Barber Shop", "Kirana Store", "General Store",
  "Garage", "Welding Shop", "Cycle Shop", "Hotel", "Lodge", "Mechanic Shop",
  "Driving School", "Book Shop", "Stationery Shop", "Clothing Store",
  "Footwear Shop", "Electronics Shop", "Mobile Phone Shop", "Hardware Store",
  "Electrical Shop", "Pharmacy", "Restaurant", "Bakery", "Dairy Shop",
  "Fruit and Vegetable Shop", "Tailoring Shop", "Agricultural Supplies", "Other"
];
let adminAllowedOrigin = process.env.ADMIN_ALLOWED_ORIGIN || "https://www.janjeevan.store";
let appAllowedOrigins = new Set([
  ...(process.env.APP_ALLOWED_ORIGINS || "").split(",").map(origin => origin.trim()),
  adminAllowedOrigin
].filter(Boolean).map(origin => {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}));
const normalizeOrigin = origin => {
  if (!origin) return "";
  try {
    return new URL(origin).origin;
  } catch {
    return "";
  }
};
const isConfiguredOriginAllowed = request => {
  const origin = request.get("origin");
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  if (appAllowedOrigins.has(normalizedOrigin)) return true;
  const requestHost = request.get("host");
  const sameOrigin = request.protocol && requestHost ? `${request.protocol}://${requestHost}` : "";
  if (sameOrigin && normalizedOrigin === sameOrigin) return true;
  const hostname = new URL(normalizedOrigin).hostname;
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
};
const firebaseCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  : applicationDefault();
const firebaseAdminApp = initializeFirebaseAdmin({
  credential: firebaseCredential,
  projectId: process.env.FIREBASE_PROJECT_ID || "janjeevanstore"
}, "tribes-server");
const firebaseAdminAuth = getFirebaseAdminAuth(firebaseAdminApp);
const firebaseAdminDb = getFirebaseAdminFirestore(firebaseAdminApp);
const localProfileDataDirectory = path.resolve(process.env.LOCAL_PROFILE_DATA_DIRECTORY || "C:\\JANJEEVAN.STORE_WEB_DATA");
const relativeProfileDataPath = path.relative(root, localProfileDataDirectory);
if (!relativeProfileDataPath || (!path.isAbsolute(relativeProfileDataPath) &&
  relativeProfileDataPath !== ".." && !relativeProfileDataPath.startsWith(`..${path.sep}`))) {
  throw new Error("LOCAL_PROFILE_DATA_DIRECTORY must be outside the publicly served website directory.");
}
const localImageDirectory = path.join(localProfileDataDirectory, "product-images");
const uploadLocalImage = async (imageDataUrl, prefix, imageLabel = "product") => {
  const imageMatch = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(imageDataUrl || ""));
  if (!imageMatch) {
    const error = new Error(`Choose a valid JPG, PNG, or WebP ${imageLabel} image.`);
    error.status = 400;
    throw error;
  }
  const imageBuffer = Buffer.from(imageMatch[2], "base64");
  if (!imageBuffer.length || imageBuffer.length >= 5 * 1024 * 1024) {
    const error = new Error(`${imageLabel} images must be smaller than 5 MB.`);
    error.status = 400;
    throw error;
  }

  const extension = imageMatch[1] === "image/png" ? "png" : imageMatch[1] === "image/webp" ? "webp" : "jpg";
  const prefixParts = String(prefix || "").split("/").filter(Boolean);
  if (!prefixParts.length || prefixParts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
    const error = new Error("Image storage location is invalid.");
    error.status = 400;
    throw error;
  }
  const filename = `${crypto.randomUUID()}.${extension}`;
  const key = `local/${[...prefixParts, filename].join("/")}`;
  const filePath = path.join(localImageDirectory, ...prefixParts, filename);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, imageBuffer, { flag: "wx" });
  const imageUrl = `/uploads/images/${[...prefixParts, filename].map(encodeURIComponent).join("/")}`;
  return { key, imageUrl, storagePath: filePath };
};

const deleteLocalImage = async key => {
  if (!String(key || "").startsWith("local/")) return;
  const parts = String(key).slice("local/".length).split("/");
  if (parts.length < 2 || parts.some((part, index) => index === parts.length - 1
    ? !/^[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(part)
    : !/^[A-Za-z0-9_-]+$/.test(part))) {
    const error = new Error("Image cleanup path is invalid.");
    error.status = 400;
    throw error;
  }
  const filePath = path.resolve(localImageDirectory, ...parts);
  if (!filePath.startsWith(`${localImageDirectory}${path.sep}`)) {
    const error = new Error("Image cleanup path is invalid.");
    error.status = 503;
    throw error;
  }
  await unlink(filePath);
};

const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
const csvRecord = values => `${values.map(csvCell).join(",")}\r\n`;

const writeLocalProfileCsv = async (directory, record) => {
  await mkdir(directory, { recursive: true });
  const csvPath = path.join(directory, "profile.csv");
  const temporaryPath = `${csvPath}.${crypto.randomUUID()}.tmp`;
  const columns = Object.keys(record);
  const csv = csvRecord(columns) + csvRecord(columns.map(column => record[column]));
  await writeFile(temporaryPath, csv, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, csvPath);
  return csvPath;
};

const saveLocalProfilePhoto = async (dataUrl, directory, name) => {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ""));
  if (!match) {
    const error = new Error(`Choose a valid JPG, PNG, or WebP ${name.replace(/-/g, " ")}.`);
    error.status = 400;
    throw error;
  }
  const imageBuffer = Buffer.from(match[2], "base64");
  if (!imageBuffer.length || imageBuffer.length > 2 * 1024 * 1024) {
    const error = new Error(`${name.replace(/-/g, " ")} must be smaller than 2 MB after compression.`);
    error.status = 400;
    throw error;
  }
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const filePath = path.join(directory, "photos", `${name}.${extension}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, imageBuffer);
  return path.relative(localProfileDataDirectory, filePath).split(path.sep).join("/");
};

const saveLocalProfileDocument = async (dataUrl, directory, name) => {
  const match = /^data:(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ""));
  if (!match) {
    const error = new Error("Choose a valid PDF or Word CV file.");
    error.status = 400;
    throw error;
  }
  const extension = match[1] === "application/pdf" ? "pdf"
    : match[1] === "application/msword" ? "doc" : "docx";
  const fileBuffer = Buffer.from(match[2], "base64");
  if (!fileBuffer.length || fileBuffer.length > 5 * 1024 * 1024) {
    const error = new Error("The CV must be smaller than 5 MB.");
    error.status = 400;
    throw error;
  }
  const filePath = path.join(directory, "documents", `${name}.${extension}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, fileBuffer);
  return path.relative(localProfileDataDirectory, filePath).split(path.sep).join("/");
};

const requireFirebaseUser = async request => {
  const authorization = request.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    const error = new Error("Firebase sign-in is required.");
    error.status = 401;
    throw error;
  }
  try {
    return await firebaseAdminAuth.verifyIdToken(token);
  } catch {
    const error = new Error("Firebase sign-in has expired. Sign in again.");
    error.status = 401;
    throw error;
  }
};

const getPostalRate = deliveryState => {
  let rateConfig;
  try {
    rateConfig = JSON.parse(process.env.INDIA_POST_RETAIL_RATES_JSON || "null");
  } catch {
    const error = new Error("India Post Retail Parcel rates are not valid JSON. Update INDIA_POST_RETAIL_RATES_JSON on the server.");
    error.status = 503;
    throw error;
  }
  const rate = rateConfig?.states?.[deliveryState] || rateConfig?.default;
  if (!rate || !Number.isFinite(Number(rate.first500g)) || Number(rate.first500g) <= 0 ||
    !Number.isFinite(Number(rate.additional500g)) || Number(rate.additional500g) < 0 ||
    !Number.isFinite(Number(rate.gstPercent)) || Number(rate.gstPercent) < 0 || Number(rate.gstPercent) > 100) {
    const error = new Error("India Post Retail Parcel rates are not configured for this destination. Configure a default or destination-state rate on the server.");
    error.status = 503;
    throw error;
  }
  return rate;
};

const calculatePostalCharge = (weightGrams, deliveryState) => {
  if (!Number.isInteger(weightGrams) || weightGrams < 1) {
    const error = new Error("Enter a packed shipping weight for every product before choosing India Post.");
    error.status = 400;
    throw error;
  }
  const rate = getPostalRate(deliveryState);
  const weightBands = Math.ceil(weightGrams / 500);
  const beforeTax = Number(rate.first500g) + (weightBands - 1) * Number(rate.additional500g);
  return Math.round(beforeTax * (1 + Number(rate.gstPercent) / 100) * 100);
};

const loadCheckoutItems = async requestedItems => {
  if (!Array.isArray(requestedItems) || !requestedItems.length || requestedItems.length > 20) {
    const error = new Error("Cart must contain between 1 and 20 products.");
    error.status = 400;
    throw error;
  }
  const quantities = new Map();
  for (const item of requestedItems) {
    const id = String(item?.id || "").trim();
    const quantity = Number(item?.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      const error = new Error("Cart contains an invalid product or quantity.");
      error.status = 400;
      throw error;
    }
    const combinedQuantity = (quantities.get(id) || 0) + quantity;
    if (combinedQuantity > 100) {
      const error = new Error("Cart quantity cannot exceed 100 for one product.");
      error.status = 400;
      throw error;
    }
    quantities.set(id, combinedQuantity);
  }

  const items = [];
  let itemSubtotal = 0;
  let totalWeightGrams = 0;
  for (const [productId, quantity] of quantities) {
    const productSnapshot = await firebaseAdminDb.collection("products").doc(productId).get();
    if (!productSnapshot.exists) {
      const error = new Error("A product in your cart is no longer available.");
      error.status = 409;
      throw error;
    }
    const product = productSnapshot.data();
    const price = Number(product.price);
    const discount = Number(product.discountPercent) || 0;
    const stock = Number(product.avlbStk);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < quantity ||
      !Number.isFinite(discount) || discount < 0 || discount > 100) {
      const error = new Error(`${product.name || "A product"} has insufficient stock or invalid pricing.`);
      error.status = 409;
      throw error;
    }
    const salePrice = Math.round(price * (1 - discount / 100) * 100) / 100;
    itemSubtotal += Math.round(salePrice * 100) * quantity;
    const weightGrams = Number(product.weightGrams);
    if (Number.isInteger(weightGrams) && weightGrams > 0 && weightGrams <= 100000) {
      totalWeightGrams += weightGrams * quantity;
    }
    items.push({
      productId,
      quantity,
      name: String(product.name || "Product"),
      price: salePrice,
      listPrice: price,
      discountPercent: discount,
      weightGrams: Number.isInteger(weightGrams) && weightGrams > 0 && weightGrams <= 100000 ? weightGrams : null,
      merchantId: String(product.merchantId || ""),
      merchantName: String(product.merchantName || product.shopName || ""),
      area: String(product.area || ""),
      village: String(product.village || ""),
      merchantLocation: Number.isFinite(Number(product.latitude)) && Number.isFinite(Number(product.longitude))
        ? { latitude: Number(product.latitude), longitude: Number(product.longitude), label: product.village || product.area || "Merchant pickup area" }
        : null
    });
  }
  return { items, itemSubtotal, totalWeightGrams };
};

if (!razorpay) console.warn("Razorpay keys are missing. Add them to .env before checkout.");
app.use(express.json({ limit: "16mb" }));
app.get("/healthz", (request, response) => response.status(200).json({ status: "ok" }));
app.get("/js/api-config.js", (request, response) => {
  response.type("application/javascript").send(
    "window.TRIBES_API_BASE_URL = window.TRIBES_API_BASE_URL || window.location.origin;"
  );
});
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin && isConfiguredOriginAllowed(request)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Access-Control-Allow-Credentials", "true");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.vary("Origin");
  }
  if (request.method === "OPTIONS") {
    return origin && isConfiguredOriginAllowed(request)
      ? response.sendStatus(204)
      : response.sendStatus(403);
  }
  next();
});

const readAdminSession = request => {
  const cookieHeader = request.headers.cookie || "";
  const token = cookieHeader.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("tribes_admin_session="))?.slice("tribes_admin_session=".length);
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
};
const adminCookie = (token, maxAge) => {
  const secureCookie = process.env.NODE_ENV === "production";
  const cookieSameSite = secureCookie && adminAllowedOrigin ? "None" : "Strict";
  return `tribes_admin_session=${token}; Path=/; HttpOnly; SameSite=${cookieSameSite}; Max-Age=${maxAge}${secureCookie ? "; Secure" : ""}`;
};
const adminPageProtection = (request, response, next) => {
  if (request.path === "/login.html") return next();
  if (readAdminSession(request)) return next();
  if (request.accepts("html")) return response.redirect(302, "/admin/login.html");
  return response.status(401).send("Admin sign-in required.");
};
app.use("/admin", adminPageProtection);

app.use("/api/admin", (request, response, next) => {
  const origin = request.get("origin");
  if (origin && isConfiguredOriginAllowed(request)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Access-Control-Allow-Credentials", "true");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.vary("Origin");
  } else if (origin && adminAllowedOrigin && normalizeOrigin(origin) !== normalizeOrigin(adminAllowedOrigin)) {
    return response.status(403).json({ error: "This origin is not allowed to access Admin sign-in." });
  }
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});

const safeEqual = (provided, expected) => {
  if (typeof provided !== "string" || Buffer.byteLength(provided) !== Buffer.byteLength(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};

app.post("/api/admin/login", (request, response) => {
  const loginId = process.env.ADMIN_LOGIN_ID;
  const password = process.env.ADMIN_PASSWORD;
  if (!loginId || !password) return response.status(503).json({ error: "Admin sign-in is not configured. Set ADMIN_LOGIN_ID and ADMIN_PASSWORD on the server." });

  const clientId = request.ip;
  const now = Date.now();
  const currentAttempt = loginAttempts.get(clientId);
  const attempt = currentAttempt && currentAttempt.expiresAt > now
    ? currentAttempt
    : { count: 0, expiresAt: now + loginAttemptWindow };
  if (attempt.count >= maxLoginAttempts) {
    response.set("Retry-After", String(Math.ceil((attempt.expiresAt - now) / 1000)));
    return response.status(429).json({ error: "Too many sign-in attempts. Wait and try again." });
  }

  const isValidId = safeEqual(request.body?.loginId, loginId);
  const isValidPassword = safeEqual(request.body?.password, password);
  const isValid = isValidId && isValidPassword;
  if (!isValid) {
    attempt.count += 1;
    loginAttempts.set(clientId, attempt);
    return response.status(401).json({ error: "Admin ID or password is incorrect." });
  }

  loginAttempts.delete(clientId);
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, now + adminSessionDuration);
  response.set("Set-Cookie", adminCookie(token, adminSessionDuration / 1000));
  response.json({ authenticated: true });
});

app.get("/api/admin/session", (request, response) => {
  response.json({ authenticated: readAdminSession(request) });
});

app.post("/api/admin/logout", (request, response) => {
  const cookieHeader = request.headers.cookie || "";
  const token = cookieHeader.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("tribes_admin_session="))?.slice("tribes_admin_session=".length);
  if (token) adminSessions.delete(token);
  response.set("Set-Cookie", adminCookie("", 0));
  response.json({ authenticated: false });
});

app.get("/api/admin/accounts", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  try {
    const collections = [
      ["customerAccounts", "Customer", "mobile", "name"],
      ["merchantAccounts", "Merchant", "merchantId", "fullName"],
      ["deliveryPartnerAccounts", "Delivery Partner", "deliveryPartnerId", "fullName"]
    ];
    const accountGroups = await Promise.all(collections.map(async ([collectionName, type, idField, nameField]) => {
      const snapshot = await firebaseAdminDb.collection(collectionName).get();
      return snapshot.docs.map(account => {
        const record = account.data();
        const createdAt = record.createdAt?.toDate?.() || (record.createdAt instanceof Date ? record.createdAt : record.createdAt);
        return {
          type,
          id: String(record[idField] || ""),
          name: String(record[nameField] || type),
          email: String(record.email || ""),
          phone: String(record.phoneNo || record.mobile || ""),
          area: String(record.state || ""),
          createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || "")
        };
      });
    }));
    response.json({ accounts: accountGroups.flat() });
  } catch (error) {
    console.error("Could not load Firebase account summaries for Admin.", error);
    response.status(503).json({ error: "Account records are unavailable." });
  }
});

app.get("/api/admin/merchants", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  try {
    const snapshot = await firebaseAdminDb.collection("merchantAccounts").get();
    const merchants = snapshot.docs.map(document => {
      const data = document.data();
      return {
        uid: document.id,
        merchantId: String(data.merchantId || ""),
        fullName: String(data.fullName || ""),
        shopName: String(data.shopName || ""),
        email: String(data.email || ""),
        phoneNo: String(data.phoneNo || ""),
        shopCategory: String(data.shopCategory || ""),
        state: String(data.state || ""),
        gstNumber: String(data.gstNumber || ""),
        bankAccountNumber: String(data.bankAccountNumber || ""),
        ifscCode: String(data.ifscCode || ""),
        upiLink: String(data.upiLink || ""),
        approvalStatus: ["approved", "rejected"].includes(data.approvalStatus) ? data.approvalStatus : "pending"
      };
    });
    response.json({ merchants });
  } catch (error) {
    console.error("Could not load merchant approval records for Admin.", error);
    response.status(503).json({ error: "Merchant approval records are unavailable." });
  }
});

app.post("/api/admin/merchants/:merchantUid/approval", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  const { merchantUid } = request.params;
  const { approvalStatus } = request.body || {};
  if (merchantUid.includes("/") || !["pending", "approved", "rejected"].includes(approvalStatus)) {
    return response.status(400).json({ error: "Merchant ID or approval status is invalid." });
  }
  try {
    const merchantRef = firebaseAdminDb.collection("merchantAccounts").doc(merchantUid);
    const merchant = await merchantRef.get();
    if (!merchant.exists) return response.status(404).json({ error: "Merchant account was not found." });
    await merchantRef.update({
      approvalStatus,
      approvalUpdatedAt: FieldValue.serverTimestamp()
    });
    response.json({ uid: merchantUid, approvalStatus });
  } catch (error) {
    console.error("Could not update a merchant approval status.", error);
    response.status(503).json({ error: "Merchant approval status could not be updated." });
  }
});

app.get("/api/admin/orders", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  try {
    const snapshot = await firebaseAdminDb.collection("orders").get();
    const orders = snapshot.docs.map(order => {
      const data = order.data();
      ["createdAt", "pickedUpAt", "deliveredAt"].forEach(field => {
        if (data[field]?.toDate) data[field] = data[field].toDate().toISOString();
      });
      return { ...data, id: order.id };
    });
    response.json({ orders });
  } catch (error) {
    console.error("Could not load Firebase orders for Admin.", error);
    response.status(503).json({ error: "Order records are unavailable." });
  }
});

app.get("/api/advertisements", async (request, response) => {
  try {
    const snapshot = await firebaseAdminDb.collection("advertisements").get();
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    response.set("Cache-Control", "no-store");
    const advertisements = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(advertisement => advertisement.active === true &&
        (!advertisement.startDate || advertisement.startDate <= today) &&
        (!advertisement.endDate || advertisement.endDate >= today))
      .sort((left, right) => {
        const leftTime = left.createdAt?.toMillis?.() || 0;
        const rightTime = right.createdAt?.toMillis?.() || 0;
        return rightTime - leftTime;
      })
      .map(({ id, title, description, linkUrl, imageUrl }) => ({ id, title, description, linkUrl, imageUrl }));
    response.json({ advertisements });
  } catch (error) {
    console.error("Could not load published advertisements.", error);
    response.status(503).json({ error: "Advertisements are unavailable." });
  }
});

app.get("/api/admin/advertisements", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  try {
    const snapshot = await firebaseAdminDb.collection("advertisements").get();
    const advertisements = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .sort((left, right) => {
        const leftTime = left.createdAt?.toMillis?.() || 0;
        const rightTime = right.createdAt?.toMillis?.() || 0;
        return rightTime - leftTime;
      })
      .map(({ id, title, description, linkUrl, imageUrl, imageKey, active, startDate, endDate }) => ({
        id,
        title,
        description,
        linkUrl,
        imageUrl,
        imageKey,
        active,
        startDate: String(startDate || ""),
        endDate: String(endDate || "")
      }));
    response.json({ advertisements });
  } catch (error) {
    console.error("Could not load advertisements for Admin.", error);
    response.status(503).json({ error: "Advertisements are unavailable." });
  }
});

app.post("/api/admin/advertisements", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  const { advertisement: submittedAdvertisement, imageDataUrl } = request.body || {};
  const title = String(submittedAdvertisement?.title || "").trim();
  const description = String(submittedAdvertisement?.description || "").trim();
  const linkUrl = String(submittedAdvertisement?.linkUrl || "").trim();
  const startDate = String(submittedAdvertisement?.startDate || "").trim();
  const endDate = String(submittedAdvertisement?.endDate || "").trim();
  const active = submittedAdvertisement?.active === true;
  const isValidDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!title || title.length > 100 || description.length > 240) {
    return response.status(400).json({ error: "A title is required and must be at most 100 characters; the description must be at most 240 characters." });
  }
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    return response.status(400).json({ error: "Enter a valid advertisement start and end date; the end date must be on or after the start date." });
  }
  if (linkUrl) {
    const isInternalLink = (linkUrl.startsWith("/") && !linkUrl.startsWith("//")) || linkUrl.startsWith("#");
    let isHttpsLink = false;
    try {
      isHttpsLink = new URL(linkUrl).protocol === "https:";
    } catch {
      isHttpsLink = false;
    }
    if (!isInternalLink && !isHttpsLink) {
      return response.status(400).json({ error: "The ad link must be an HTTPS URL or an internal path." });
    }
  }

  let uploadedImageKey;
  try {
    const uploaded = await uploadLocalImage(imageDataUrl, "advertisements", "advertisement");
    uploadedImageKey = uploaded.key;
    const advertisement = {
      title,
      description,
      linkUrl,
      startDate,
      endDate,
      imageUrl: uploaded.imageUrl,
      imageKey: uploaded.key,
      active,
      createdAt: FieldValue.serverTimestamp()
    };
    const created = await firebaseAdminDb.collection("advertisements").add(advertisement);
    response.json({
      advertisement: {
        ...advertisement,
        id: created.id,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Could not create an Admin advertisement.", error);
    if (uploadedImageKey) {
      try {
        await deleteLocalImage(uploadedImageKey);
      } catch (cleanupError) {
        console.error("Could not clean up the failed local advertisement image upload.", cleanupError);
      }
    }
    response.status(error.status || 503).json({
      error: error.status ? error.message : "Advertisement could not be saved."
    });
  }
});

app.delete("/api/admin/advertisements/:advertisementId", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  try {
    const advertisementRef = firebaseAdminDb.collection("advertisements").doc(request.params.advertisementId);
    const advertisement = await advertisementRef.get();
    if (!advertisement.exists) return response.status(404).json({ error: "Advertisement was not found." });
    await advertisementRef.delete();
    let imageCleanupWarning = false;
    const imageKey = advertisement.data()?.imageKey;
    if (imageKey) {
      try {
        await deleteLocalImage(imageKey);
      } catch (error) {
        imageCleanupWarning = true;
        console.error("Advertisement was removed, but its R2 image could not be deleted.", error);
      }
    }
    response.json({ deleted: true, imageCleanupWarning });
  } catch (error) {
    console.error("Could not remove an Admin advertisement.", error);
    response.status(503).json({ error: "Advertisement could not be removed." });
  }
});

app.post("/api/merchant/advertisements/order", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
    const merchantSnapshot = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!merchantSnapshot.exists || !merchantSnapshot.data()?.merchantId) {
      return response.status(403).json({ error: "A Merchant account is required to create an advertisement checkout." });
    }

    const merchant = merchantSnapshot.data();
    const advertisement = request.body?.advertisement || {};
    const months = Number(advertisement.months);
    const title = String(advertisement.title || "").trim();
    const description = String(advertisement.description || "").trim();
    const linkUrl = String(advertisement.linkUrl || "").trim();
    const planPrices = { 1: 200, 3: 500, 6: 800 };
    if (![1, 3, 6].includes(months) || !title || title.length > 100 || description.length > 240 || (linkUrl && !/^https:\/\//i.test(linkUrl) && !linkUrl.startsWith("/"))) {
      return response.status(400).json({ error: "Select a valid advertisement plan and enter a valid title and link." });
    }
    const amount = planPrices[months] * 100;
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `tribes_ad_${Date.now()}`,
      notes: {
        purpose: "merchant_advertisement",
        merchantUid: user.uid,
        merchantId: String(merchant.merchantId || ""),
        months: String(months)
      }
    });
    await firebaseAdminDb.collection("pendingAdvertisements").doc(order.id).set({
      merchantUid: user.uid,
      merchantId: String(merchant.merchantId || ""),
      months,
      title,
      description,
      linkUrl,
      amount: order.amount,
      createdAt: FieldValue.serverTimestamp()
    });
    response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Unable to create advertisement payment checkout.", error);
    if (error.status) return response.status(error.status).json({ error: error.message });
    const razorpayAuthenticationFailed = error.statusCode === 401 || (error.error?.code === "BAD_REQUEST_ERROR" && /authentication failed/i.test(error.error?.description || ""));
    if (razorpayAuthenticationFailed) {
      return response.status(502).json({
        error: "Razorpay rejected its API credentials. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are a matching pair from the same Razorpay mode (test or live), then restart the server."
      });
    }
    response.status(error.status || 503).json({ error: error.status ? error.message : "Advertisement checkout could not be created." });
  }
});

app.post("/api/merchant/product-images", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const merchant = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!merchant.exists || !merchant.data()?.merchantId) {
      return response.status(403).json({ error: "A Merchant account is required to upload product images." });
    }
    const uploaded = await uploadLocalImage(request.body?.imageDataUrl, `merchants/${user.uid}/products`);
    response.json({ imageUrl: uploaded.imageUrl, storagePath: uploaded.storagePath });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not save a Merchant product image locally.", error);
    response.status(503).json({ error: "Product image upload failed. Check local image folder permissions and try again." });
  }
});

const validateMerchantProduct = async (submittedProduct, user, merchantAccount) => {
  const name = String(submittedProduct?.name || "").trim().toUpperCase();
  const category = String(submittedProduct?.category || "").trim().toUpperCase();
  const uom = String(submittedProduct?.uom || "").trim();
  const price = Number(submittedProduct?.price);
  const discountPercent = Number(submittedProduct?.discountPercent);
  const gstPercent = Number(submittedProduct?.gstPercent);
  const quantity = Number(submittedProduct?.quantity ?? submittedProduct?.avlbStk);
  const weightInput = submittedProduct?.weightGrams;
  const weightGrams = weightInput == null || weightInput === "" ? null : Number(weightInput);
  const area = String(submittedProduct?.area || "").trim().toLowerCase();
  const village = String(submittedProduct?.village || "").trim().toLowerCase();
  const imageUrl = String(submittedProduct?.imageUrl || "").trim();
  const localUploadPrefix = `/uploads/images/merchants/${user.uid}/products/`;
  const localFilename = imageUrl.startsWith(localUploadPrefix)
    && /^[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(imageUrl.slice(localUploadPrefix.length));
  const staticProductImage = /^images\/products\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(imageUrl);
  if (!name || name.length > 120 || !category || category.length > 80 || !uom || uom.length > 40 ||
    !Number.isFinite(price) || price < 0 || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100 ||
    !Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 100 || !Number.isInteger(quantity) || quantity < 0 ||
    (weightGrams !== null && (!Number.isInteger(weightGrams) || weightGrams < 1 || weightGrams > 100000)) ||
    !area || area.length > 100 || !village || village.length > 100 || (!localFilename && !staticProductImage)) {
    const error = new Error("Product details or photo are invalid. Check all required fields and use a JPG, PNG, or WebP image.");
    error.status = 400;
    throw error;
  }

  const imagePath = localFilename
    ? path.join(localImageDirectory, "merchants", user.uid, "products", imageUrl.slice(localUploadPrefix.length))
    : path.join(root, imageUrl.replace(/^\//, ""));
  try {
    await access(imagePath);
  } catch {
    const error = new Error(`The selected product photo is not available. Product photos are stored under ${localImageDirectory}. Check that this folder is writable, then upload the photo again.`);
    error.status = 400;
    throw error;
  }

  return {
    ownerUid: user.uid,
    merchantId: String(merchantAccount.merchantId),
    merchantName: String(merchantAccount.shopName || merchantAccount.fullName || ""),
    name,
    category,
    uom,
    price,
    discountPercent,
    gstPercent,
    weightGrams,
    quantity,
    avlbStk: quantity,
    area,
    village,
    imageUrl
  };
};

app.get("/api/merchant/products", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const merchantSnapshot = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!merchantSnapshot.exists || !merchantSnapshot.data()?.merchantId) {
      return response.status(403).json({ error: "A Merchant account is required to view products." });
    }
    const merchantId = String(merchantSnapshot.data().merchantId);
    const snapshots = await Promise.all([
      firebaseAdminDb.collection("products").where("ownerUid", "==", user.uid).get(),
      firebaseAdminDb.collection("products").where("merchantId", "==", merchantId).get()
    ]);
    const documents = new Map(snapshots.flatMap(snapshot => snapshot.docs).map(document => [document.id, document]));
    response.json({ products: [...documents.values()].map(document => ({ id: document.id, product: document.data() })) });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not load the signed-in Merchant's products.", error);
    response.status(503).json({ error: "Merchant products are unavailable." });
  }
});

app.post("/api/merchant/products", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const merchantSnapshot = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!merchantSnapshot.exists || !merchantSnapshot.data()?.merchantId) {
      return response.status(403).json({ error: "A Merchant account is required to add products." });
    }
    const product = await validateMerchantProduct(request.body?.product, user, merchantSnapshot.data());
    const created = await firebaseAdminDb.collection("products").add({
      ...product,
      createdAt: FieldValue.serverTimestamp()
    });
    response.status(201).json({ id: created.id, product });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not save the Merchant product.", error);
    response.status(503).json({ error: "The product could not be saved. Try again." });
  }
});

app.patch("/api/merchant/products/:productId", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const merchantSnapshot = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!merchantSnapshot.exists || !merchantSnapshot.data()?.merchantId) {
      return response.status(403).json({ error: "A Merchant account is required to update products." });
    }
    const productRef = firebaseAdminDb.collection("products").doc(request.params.productId);
    const existing = await productRef.get();
    if (!existing.exists || existing.data()?.ownerUid !== user.uid ||
      existing.data()?.merchantId !== merchantSnapshot.data().merchantId) {
      return response.status(404).json({ error: "The product was not found in your catalog." });
    }
    const product = await validateMerchantProduct(request.body?.product, user, merchantSnapshot.data());
    await productRef.update(product);
    response.json({ id: productRef.id, product });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not update the Merchant product.", error);
    response.status(503).json({ error: "The product could not be updated. Try again." });
  }
});

app.post("/api/local-archive/merchant", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const accountSnapshot = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!accountSnapshot.exists) return response.status(403).json({ error: "A saved Merchant account is required." });
    const account = accountSnapshot.data();
    const profile = request.body?.profile || {};
    const merchantId = String(account.merchantId || "");
    const email = String(profile.email || "").trim().toLowerCase();
    const aadhaarNumber = String(profile.aadhaarNumber || "").trim();
    const panNumber = String(profile.panNumber || "").trim().toUpperCase();
    if (!/^Janjeevan\.store-[A-Z0-9]{6}$/.test(merchantId) || !user.email || email !== user.email.toLowerCase() ||
      !/^\d{12}$/.test(aadhaarNumber) || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
      return response.status(400).json({ error: "Merchant archive details do not match the signed-in account or valid identity formats." });
    }
    const directory = path.join(localProfileDataDirectory, "merchants", merchantId);
    const photos = request.body?.photos || {};
    const [merchantPhotoPath, aadhaarPhotoPath, panPhotoPath, shopPhotoPath] = await Promise.all([
      saveLocalProfilePhoto(photos.merchant, directory, "merchant-photo"),
      saveLocalProfilePhoto(photos.aadhaar, directory, "aadhaar-photo"),
      saveLocalProfilePhoto(photos.pan, directory, "pan-photo"),
      saveLocalProfilePhoto(photos.shop, directory, "shop-photo")
    ]);
    const csvPath = await writeLocalProfileCsv(directory, {
      merchantId,
      firebaseUid: user.uid,
      fullName: String(account.fullName || profile.fullName || ""),
      shopName: String(account.shopName || profile.shopName || ""),
      email: user.email,
      phoneNo: String(account.phoneNo || profile.phoneNo || ""),
      address: String(profile.address || ""),
      gstNumber: String(account.gstNumber || profile.gstNumber || ""),
      shopCategory: String(account.shopCategory || profile.shopCategory || ""),
      state: String(account.state || profile.state || ""),
      language: String(account.language || profile.language || ""),
      aadhaarNumber,
      panNumber,
      bankAccountNumber: String(account.bankAccountNumber || profile.bankAccountNumber || ""),
      ifscCode: String(account.ifscCode || profile.ifscCode || ""),
      upiLink: String(account.upiLink || profile.upiLink || ""),
      createdAt: String(profile.createdAt || new Date().toISOString()),
      merchantPhotoPath,
      aadhaarPhotoPath,
      panPhotoPath,
      shopPhotoPath
    });
    response.json({ saved: true, storageDirectory: directory, csvPath });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not write the local Merchant CSV backup.", error);
    response.status(503).json({ error: "Merchant data could not be saved to the local archive folder." });
  }
});

app.post("/api/local-archive/customer", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const accountSnapshot = await firebaseAdminDb.collection("customerAccounts").doc(user.uid).get();
    if (!accountSnapshot.exists) return response.status(403).json({ error: "A saved Customer account is required." });
    const account = accountSnapshot.data();
    if (account.role !== "customer" || !user.email || String(account.email || "").trim().toLowerCase() !== user.email.toLowerCase()) {
      return response.status(400).json({ error: "Customer archive details do not match the signed-in account." });
    }
    const directory = path.join(localProfileDataDirectory, "customers", user.uid);
    const createdAt = account.createdAt?.toDate?.();
    const csvPath = await writeLocalProfileCsv(directory, {
      firebaseUid: user.uid,
      name: String(account.name || ""),
      email: user.email,
      dateOfBirth: String(account.dateOfBirth || ""),
      mobile: String(account.mobile || ""),
      state: String(account.state || ""),
      createdAt: createdAt ? createdAt.toISOString() : ""
    });
    response.json({ saved: true, storageDirectory: directory, csvPath });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not write the local Customer CSV backup.", error);
    response.status(503).json({ error: "Customer data could not be saved to the local archive folder." });
  }
});

app.post("/api/local-archive/delivery-partner", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const accountSnapshot = await firebaseAdminDb.collection("deliveryPartnerAccounts").doc(user.uid).get();
    if (!accountSnapshot.exists) return response.status(403).json({ error: "A saved Delivery Partner account is required." });
    const account = accountSnapshot.data();
    const profile = request.body?.profile || {};
    const deliveryPartnerId = String(account.deliveryPartnerId || "");
    if (!/^Janjeevan\.store-DP-[A-F0-9]{6}$/.test(deliveryPartnerId) || !user.email ||
      String(profile.email || "").trim().toLowerCase() !== user.email.toLowerCase() ||
      !/^\d{12}$/.test(String(profile.aadhaarNumber || ""))) {
      return response.status(400).json({ error: "Delivery Partner archive details do not match the signed-in account." });
    }
    const directory = path.join(localProfileDataDirectory, "delivery-partners", deliveryPartnerId);
    const photos = request.body?.photos || {};
    const [passportPhotoPath, aadhaarFrontPath, aadhaarBackPath, cvPath] = await Promise.all([
      saveLocalProfilePhoto(photos.passport, directory, "passport-photo"),
      saveLocalProfilePhoto(photos.aadhaarFront, directory, "aadhaar-front"),
      saveLocalProfilePhoto(photos.aadhaarBack, directory, "aadhaar-back"),
      saveLocalProfileDocument(photos.cv, directory, "cv")
    ]);
    const csvPath = await writeLocalProfileCsv(directory, {
      deliveryPartnerId,
      firebaseUid: user.uid,
      fullName: String(account.fullName || profile.fullName || ""),
      email: user.email,
      phoneNo: String(account.phoneNo || profile.phoneNo || ""),
      address: String(account.address || profile.address || ""),
      state: String(account.state || profile.state || ""),
      language: String(account.language || profile.language || ""),
      aadhaarNumber: String(profile.aadhaarNumber || ""),
      relativeName: String(account.relativeName || profile.relativeName || ""),
      relativePhone: String(account.relativePhone || profile.relativePhone || ""),
      relativeAddress: String(account.relativeAddress || profile.relativeAddress || ""),
      createdAt: String(profile.createdAt || new Date().toISOString()),
      passportPhotoPath,
      aadhaarFrontPath,
      aadhaarBackPath,
      cvPath
    });
    response.json({ saved: true, storageDirectory: directory, csvPath });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not write the local Delivery Partner CSV backup.", error);
    response.status(503).json({ error: "Delivery Partner data could not be saved to the local archive folder." });
  }
});

app.get("/api/merchant/orders", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const merchantSnapshot = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!merchantSnapshot.exists || !merchantSnapshot.data()?.merchantId) {
      return response.status(403).json({ error: "A Merchant account is required to view orders." });
    }
    const merchantId = String(merchantSnapshot.data().merchantId);
    const ordersCollection = firebaseAdminDb.collection("orders");
    const snapshot = request.query.includeLegacy === "1"
      ? await ordersCollection.get()
      : await ordersCollection.where("merchantIds", "array-contains", merchantId).get();
    const orders = snapshot.docs.flatMap(document => {
      const order = document.data();
      const items = (Array.isArray(order.items) ? order.items : [])
        .filter(item => String(item.merchantId || "") === merchantId)
        .map(item => ({
          name: String(item.name || "Product"),
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0
        }));
      if (!items.length) return [];
      const createdAt = order.createdAt?.toDate?.();
      return [{
        id: document.id,
        orderId: String(order.orderId || document.id),
        customerName: String(order.customerName || "Customer"),
        customerMobile: String(order.customerMobile || ""),
        deliveryState: String(order.deliveryState || ""),
        deliveryMethod: String(order.deliveryMethod || "delivery_partner"),
        postalAddress: String(order.postalAddress || ""),
        postalPincode: String(order.postalPincode || ""),
        postalCharge: Number(order.postalCharge) || 0,
        paymentMethod: String(order.paymentMethod || "razorpay"),
        status: String(order.status || "Unassigned"),
        amount: Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100,
        items,
        createdAt: createdAt ? createdAt.toISOString() : null
      }];
    });
    orders.sort((first, second) => (Date.parse(second.createdAt) || 0) - (Date.parse(first.createdAt) || 0));
    response.json({ orders });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not load orders for the signed-in Merchant.", error);
    response.status(503).json({ error: "Merchant orders are unavailable." });
  }
});

app.post("/api/admin/products", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  const { product: submittedProduct, imageDataUrl } = request.body || {};
  let uploadedImageKey;
  const price = Number(submittedProduct?.price);
  const discountPercent = Number(submittedProduct?.discountPercent);
  const stock = Number(submittedProduct?.avlbStk);
  const weightGrams = submittedProduct?.weightGrams == null ? null : Number(submittedProduct.weightGrams);
  const productName = String(submittedProduct?.name || "").trim();
  if (!productName || productName.length > 120 || !Number.isFinite(price) || price < 0 ||
    !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100 ||
    !Number.isInteger(stock) || stock < 0 ||
    (weightGrams !== null && (!Number.isInteger(weightGrams) || weightGrams < 1 || weightGrams > 100000))) {
    return response.status(400).json({ error: "Product name, price, discount, and stock are invalid." });
  }

  try {
    const uploaded = await uploadLocalImage(imageDataUrl, "products");
    uploadedImageKey = uploaded.key;
    const imageUrl = uploaded.imageUrl;
    const product = {
      ownerUid: "admin",
      merchantId: "admin",
      merchantName: "Janjeevan.store",
      name: productName,
      uom: String(submittedProduct.uom || "Unit"),
      quantity: stock,
      avlbStk: stock,
      price,
      discountPercent,
      weightGrams,
      area: String(submittedProduct.area || ""),
      village: String(submittedProduct.village || ""),
      latitude: Number(submittedProduct.latitude) || 0,
      longitude: Number(submittedProduct.longitude) || 0,
      imageUrl,
      createdAt: FieldValue.serverTimestamp()
    };
    const created = await firebaseAdminDb.collection("products").add(product);
    response.json({ id: created.id, product: { ...product, createdAt: new Date().toISOString() } });
  } catch (error) {
    console.error("Could not create Admin catalog product.", error);
    if (uploadedImageKey) {
      try {
        await deleteLocalImage(uploadedImageKey);
      } catch (cleanupError) {
        console.error("Could not clean up the failed local product image upload.", cleanupError);
      }
    }
    response.status(error.status || 503).json({
      error: error.status ? error.message : "Product could not be saved."
    });
  }
});

app.post("/api/admin/orders/:orderId/location", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  if (request.body?.clear === true) {
    try {
      const orderRef = firebaseAdminDb.collection("orders").doc(request.params.orderId);
      const order = await orderRef.get();
      if (!order.exists || ["Delivered", "Cancelled"].includes(order.data().status)) {
        return response.status(404).json({ error: "No active order was found." });
      }
      await orderRef.update({ merchantLocation: FieldValue.delete() });
      return response.json({ updated: true });
    } catch (error) {
      console.error("Could not clear the Admin pickup location.", error);
      return response.status(503).json({ error: "Pickup location could not be cleared." });
    }
  }
  const { latitude, longitude, accuracy } = request.body || {};
  if (!Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90 ||
    !Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180) {
    return response.status(400).json({ error: "A valid pickup location is required." });
  }
  try {
    const orderRef = firebaseAdminDb.collection("orders").doc(request.params.orderId);
    const order = await orderRef.get();
    if (!order.exists || ["Delivered", "Cancelled"].includes(order.data().status)) {
      return response.status(404).json({ error: "No active order was found." });
    }
    await orderRef.update({
      merchantLocation: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: Math.max(0, Math.round(Number(accuracy) || 0)),
        updatedAt: new Date().toISOString(),
        label: "Merchant pickup (Admin device)"
      }
    });
    response.json({ updated: true });
  } catch (error) {
    console.error("Could not update the Admin pickup location.", error);
    response.status(503).json({ error: "Pickup location could not be saved." });
  }
});

app.use("/api", createCheckoutRouter({
  requireFirebaseUser,
  firebaseAdminDb,
  razorpay: { orders: { create: options => razorpay.orders.create(options) } },
  FieldValue,
  loadCheckoutItems,
  calculatePostalCharge,
  razorpayKeyId: () => process.env.RAZORPAY_KEY_ID
}));
app.use("/uploads/images", express.static(localImageDirectory));
app.use(express.static(root));

app.post("/api/merchant/profile/recover", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const profile = request.body?.profile || {};
    const merchantIdInput = String(profile.merchantId || "").trim();
    const merchantIdMatch = /^Janjeevan\.store-([A-Z0-9]{6})$/i.exec(merchantIdInput);
    const fullName = String(profile.fullName || "").trim();
    const phoneNo = String(profile.phoneNo || "").trim();
    const gstNumber = String(profile.gstNumber || "").trim();
    const shopCategory = String(profile.shopCategory || "").trim();
    const state = String(profile.state || "").trim();
    const language = String(profile.language || "").trim();
    if (!merchantIdMatch) {
      return response.status(400).json({ error: "The saved Merchant ID is invalid. Contact merchant support to restore it." });
    }
    const merchantId = `Janjeevan.store-${merchantIdMatch[1].toUpperCase()}`;
    const shopName = String(profile.shopName || "").trim();
    if (!user.email || !fullName || fullName.length > 100 || !/^\d{10}$/.test(phoneNo) ||
      shopName.length > 120 || gstNumber.length > 15 || !merchantShopCategories.includes(shopCategory) || !state || state.length > 100) {
      return response.status(400).json({ error: "The saved merchant profile is incomplete or invalid. Contact merchant support to restore it." });
    }
    const accountRef = firebaseAdminDb.collection("merchantAccounts").doc(user.uid);
    const matchingAccounts = firebaseAdminDb.collection("merchantAccounts")
      .where("merchantId", "==", merchantId);
    const matchingProducts = firebaseAdminDb.collection("products")
      .where("merchantId", "==", merchantId);
    await firebaseAdminDb.runTransaction(async transaction => {
      const [accountSnapshot, matchingSnapshot, productSnapshot] = await Promise.all([
        transaction.get(accountRef),
        transaction.get(matchingAccounts),
        transaction.get(matchingProducts)
      ]);
      if (matchingSnapshot.docs.some(document => document.id !== user.uid)) {
        const error = new Error("The saved Merchant ID is already assigned to another account. Contact merchant support to restore it.");
        error.status = 409;
        throw error;
      }
      if (productSnapshot.docs.some(document => document.data().ownerUid !== user.uid)) {
        const error = new Error("The saved Merchant ID is associated with products belonging to another account. Contact merchant support to verify it.");
        error.status = 409;
        throw error;
      }
      if (accountSnapshot.exists && accountSnapshot.data()?.merchantId) {
        const error = new Error("This profile already has a Merchant ID. Refresh the portal and sign in again.");
        error.status = 409;
        throw error;
      }
      if (accountSnapshot.exists) {
        const existing = accountSnapshot.data();
        transaction.update(accountRef, {
          merchantId,
          fullName: existing.fullName || fullName,
          shopName: existing.shopName || shopName || fullName,
          email: existing.email || user.email,
          phoneNo: existing.phoneNo || phoneNo,
          gstNumber: existing.gstNumber || gstNumber,
          shopCategory: existing.shopCategory || shopCategory,
          state: existing.state || state,
          language: existing.language || language
        });
      } else {
        transaction.create(accountRef, {
          merchantId,
          fullName,
          shopName: shopName || fullName,
          email: user.email,
          phoneNo,
          gstNumber,
          shopCategory,
          state,
          language,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    });
    response.json({ restored: true });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not restore the signed-in Merchant's profile.", error);
    response.status(503).json({ error: "Merchant profile recovery is unavailable. Try again or contact merchant support." });
  }
});

app.post("/api/merchant/profile/shop-photo", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const shopPhotoDataUrl = String(request.body?.shopPhotoDataUrl || "");
    if (shopPhotoDataUrl.length > 400000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(shopPhotoDataUrl)) {
      return response.status(400).json({ error: "Choose a valid compressed JPEG shop photo smaller than 400 KB." });
    }
    const accountRef = firebaseAdminDb.collection("merchantAccounts").doc(user.uid);
    const account = await accountRef.get();
    if (!account.exists || !account.data()?.merchantId) {
      return response.status(404).json({ error: "A saved merchant profile was not found for this sign-in." });
    }
    await accountRef.update({ shopPhotoDataUrl });
    response.json({ saved: true });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not save the signed-in merchant's shop photo.", error);
    response.status(503).json({ error: "The shop photo could not be saved to the merchant profile." });
  }
});

app.post("/api/merchant-registration-order", async (request, response) => {
  let user;
  try {
    user = await requireFirebaseUser(request);
    if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
    const merchantId = String(request.body?.merchantId || "").trim();
    const submittedProfile = request.body?.profile || {};
    const fullName = String(submittedProfile.fullName || "").trim();
    const shopName = String(submittedProfile.shopName || "").trim();
    const phoneNo = String(submittedProfile.phoneNo || "").trim();
    const gstNumber = String(submittedProfile.gstNumber || "").trim().toUpperCase();
    const shopCategory = String(submittedProfile.shopCategory || "").trim();
    const state = String(submittedProfile.state || "").trim();
    const language = String(submittedProfile.language || "").trim();
    const bankAccountNumber = String(submittedProfile.bankAccountNumber || "").trim();
    const ifscCode = String(submittedProfile.ifscCode || "").trim().toUpperCase();
    const upiLink = normalizePaymentLink(submittedProfile.upiLink);
    const shopPhotoDataUrl = String(submittedProfile.shopPhotoDataUrl || "");
    const invalidBankAccountNumber = bankAccountNumber !== "" && !/^\d{6,18}$/.test(bankAccountNumber);
    const invalidIfscCode = ifscCode !== "" && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode);
    if (!/^Janjeevan\.store-[A-Z0-9]{6}$/.test(merchantId) ||
      String(submittedProfile.merchantId || "").trim() !== merchantId ||
      !user.email || String(submittedProfile.email || "").trim().toLowerCase() !== user.email.toLowerCase() ||
      !fullName || fullName.length > 100 || !shopName || shopName.length > 120 || !/^\d{10}$/.test(phoneNo) ||
      gstNumber.length > 15 || !merchantShopCategories.includes(shopCategory) || !state || state.length > 100 ||
      language.length > 60 || invalidBankAccountNumber || invalidIfscCode ||
      upiLink === null || upiLink.length > 2048 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(shopPhotoDataUrl) ||
      shopPhotoDataUrl.length > 400000) {
      return response.status(400).json({ error: "Merchant registration details are incomplete or invalid. Check the name, phone, bank details, UPI link, and shop photo." });
    }
    if (upiLink === null) {
      return response.status(400).json({ error: "Enter an HTTPS payment link, UPI link, or UPI ID such as shop@okaxis." });
    }
    const profile = {
      merchantId,
      fullName,
      shopName,
      email: user.email,
      phoneNo,
      gstNumber,
      shopCategory,
      state,
      language,
      bankAccountNumber,
      ifscCode,
      upiLink,
      shopPhotoDataUrl
    };

    let order;
    try {
      order = await razorpay.orders.create({
        amount: 100,
        currency: "INR",
        receipt: `tribes_registration_fee_${Date.now()}`,
        notes: { purpose: "merchant_registration_fee", merchantId }
      });
    } catch (error) {
      console.error("Razorpay could not create the merchant registration-fee order.", error);
      const razorpayAuthenticationFailed = error.statusCode === 401
        || (error.error?.code === "BAD_REQUEST_ERROR"
          && /authentication failed/i.test(error.error?.description || ""));
      if (razorpayAuthenticationFailed) {
        return response.status(502).json({
          error: "Razorpay rejected its API credentials. Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are a matching pair from the same test or live mode."
        });
      }
      return response.status(502).json({
        error: "Razorpay could not create the registration-fee order. Check the Razorpay dashboard and server logs, then try again."
      });
    }

    if (!order?.id || order.amount !== 100 || order.currency !== "INR") {
      console.error("Razorpay returned an unexpected merchant registration-fee order.", {
        orderId: order?.id,
        amount: order?.amount,
        currency: order?.currency
      });
      return response.status(502).json({ error: "Razorpay returned an invalid registration order. No payment was started; contact support." });
    }

    try {
      await firebaseAdminDb.collection("pendingDonations").doc(order.id).set({
        uid: user.uid,
        merchantId,
        profile,
        createdAt: FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Could not save the pending merchant registration-fee order to Firestore.", error);
      return response.status(503).json({
        error: "Firebase could not prepare the registration payment. No payment was started. Check the server's Firebase credentials and Firestore access."
      });
    }
    response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Unable to authenticate the merchant registration-fee order request.", error);
    response.status(error.status || 503).json({
      error: error.status ? error.message : "The server could not authenticate this registration request. Verify Firebase Admin credentials and try again."
    });
  }
});

const buildOrderReceipt = async (order, customerLoginId) => {
  const createdAt = order.createdAt?.toDate?.() || (order.createdAt instanceof Date ? order.createdAt : null);
  const items = Array.isArray(order.items) ? order.items : [];
  const storeNames = [...new Set((await Promise.all(items.map(async item => {
    const savedName = String(item.merchantName || "").trim();
    if (savedName || !item.productId) return savedName;
    try {
      const productSnapshot = await firebaseAdminDb.collection("products").doc(String(item.productId)).get();
      return String(productSnapshot.data()?.merchantName || productSnapshot.data()?.shopName || "").trim();
    } catch (error) {
      console.error("Could not resolve a product's store name for the payment receipt.", error);
      return "";
    }
  }))).filter(Boolean))];
  return {
    orderId: String(order.orderId || ""),
    paymentId: String(order.paymentId || ""),
    storeName: storeNames.length ? storeNames.join(", ") : "Janjeevan.store",
    customerName: String(order.customerName || ""),
    customerMobile: String(order.customerMobile || ""),
    customerLoginId: String(customerLoginId || ""),
    paymentMethod: String(order.paymentMethod || "razorpay"),
    items: items.map(item => ({
      name: String(item.name || "Product"),
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0,
      listPrice: Number(item.listPrice) || 0,
      discountPercent: Number(item.discountPercent) || 0
    })),
    itemSubtotal: Number(order.itemSubtotal) || 0,
    postalCharge: Number(order.postalCharge) || 0,
    amount: Number(order.amount) || 0,
    deliveryState: String(order.deliveryState || ""),
    deliveryMethod: String(order.deliveryMethod || "delivery_partner"),
    postalAddress: String(order.postalAddress || ""),
    postalPincode: String(order.postalPincode || ""),
    createdAt: createdAt ? createdAt.toISOString() : ""
  };
};

app.post("/api/payments/verify", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = request.body;
    if (!razorpay || !orderId || !paymentId || !signature) return response.status(400).json({ verified: false, error: "Payment verification details are incomplete." });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    if (Buffer.byteLength(expected) !== Buffer.byteLength(signature) || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return response.status(400).json({ verified: false });
    }

    const pendingRef = firebaseAdminDb.collection("pendingCheckouts").doc(orderId);
    const orderRef = firebaseAdminDb.collection("orders").doc(orderId);
    const pendingSnapshot = await pendingRef.get();
    if (!pendingSnapshot.exists) {
      const existingOrder = await orderRef.get();
      if (existingOrder.exists && existingOrder.data().customerUid === user.uid) {
        return response.json({
          verified: true,
          orderId,
          status: existingOrder.data().status,
          assignedPartnerId: existingOrder.data().assignedPartnerId || null,
          deliveryMethod: existingOrder.data().deliveryMethod || "delivery_partner",
          receipt: await buildOrderReceipt(existingOrder.data(), user.email)
        });
      }
      const registrationFeeRef = firebaseAdminDb.collection("pendingDonations").doc(orderId);
      const registrationFee = await registrationFeeRef.get();
      if (registrationFee.exists && registrationFee.data().uid === user.uid) {
        const pendingRegistration = registrationFee.data();
        if (!pendingRegistration.profile) {
          return response.status(409).json({
            verified: false,
            error: "Payment was verified, but registration details were not attached to this older checkout. Do not pay again; contact comtribes@gmail.com."
          });
        }
        const accountRef = firebaseAdminDb.collection("merchantAccounts").doc(user.uid);
        let alreadyRegistered = false;
        await firebaseAdminDb.runTransaction(async transaction => {
          const [currentPending, existingAccount] = await Promise.all([
            transaction.get(registrationFeeRef),
            transaction.get(accountRef)
          ]);
          if (!currentPending.exists) {
            const savedAccount = existingAccount.data();
            if (existingAccount.exists && savedAccount.registrationOrderId === orderId &&
              savedAccount.registrationPaymentId === paymentId) {
              alreadyRegistered = true;
              return;
            }
            const error = new Error("This registration checkout is no longer available.");
            error.status = 404;
            throw error;
          }
          const registration = currentPending.data();
          if (registration.uid !== user.uid) {
            const error = new Error("This checkout belongs to another account.");
            error.status = 403;
            throw error;
          }
          const profile = registration.profile;
          if (!profile || profile.merchantId !== registration.merchantId) {
            const error = new Error("Payment was verified, but the registration profile is incomplete. Do not pay again; contact comtribes@gmail.com.");
            error.status = 409;
            throw error;
          }
          if (existingAccount.exists) {
            const savedAccount = existingAccount.data();
            if (savedAccount.registrationOrderId !== orderId ||
              savedAccount.registrationPaymentId !== paymentId ||
              savedAccount.merchantId !== profile.merchantId) {
              const error = new Error("This sign-in already has a merchant profile. Contact merchant support before retrying registration.");
              error.status = 409;
              throw error;
            }
            alreadyRegistered = true;
          } else {
            transaction.create(accountRef, {
              ...profile,
              registrationOrderId: orderId,
              registrationPaymentId: paymentId,
              createdAt: FieldValue.serverTimestamp()
            });
          }
          transaction.delete(registrationFeeRef);
        });
        return response.json({ verified: true, registrationFee: true, alreadyRegistered });
      }
      const accountAfterRegistrationRetry = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
      if (accountAfterRegistrationRetry.exists &&
        accountAfterRegistrationRetry.data()?.registrationOrderId === orderId &&
        accountAfterRegistrationRetry.data()?.registrationPaymentId === paymentId) {
        return response.json({ verified: true, registrationFee: true, alreadyRegistered: true });
      }
      const pendingAdvertisementRef = firebaseAdminDb.collection("pendingAdvertisements").doc(orderId);
      const pendingAdvertisement = await pendingAdvertisementRef.get();
      if (pendingAdvertisement.exists && pendingAdvertisement.data().merchantUid === user.uid) {
        const ad = pendingAdvertisement.data();
        let uploadedImageKey;
        try {
          const uploaded = await uploadLocalImage(request.body?.advertisementImageDataUrl, `advertisements/${user.uid}`, "advertisement");
          uploadedImageKey = uploaded.key;
          const savedAdvertisement = {
            title: String(ad.title || "").trim(),
            description: String(ad.description || "").trim(),
            linkUrl: String(ad.linkUrl || "").trim(),
            imageUrl: uploaded.imageUrl,
            imageKey: uploaded.key,
            merchantUid: user.uid,
            merchantId: String(ad.merchantId || ""),
            months: Number(ad.months) || 1,
            price: Number(ad.amount || 0) / 100,
            active: false,
            status: "pending",
            createdAt: FieldValue.serverTimestamp(),
            paymentId,
            orderId
          };
          await firebaseAdminDb.collection("advertisements").add(savedAdvertisement);
          await pendingAdvertisementRef.delete();
          return response.json({ verified: true, advertisementSubmitted: true, paymentId, orderId });
        } catch (error) {
          console.error("Could not persist merchant advertisement after successful payment.", error);
          if (uploadedImageKey) {
            try { await deleteLocalImage(uploadedImageKey); } catch (cleanupError) { console.error("Could not clean up failed local ad image.", cleanupError); }
          }
          return response.status(error.status || 503).json({ verified: false, error: error.status ? error.message : "Payment was verified but the advertisement could not be submitted." });
        }
      }
      return response.status(404).json({ verified: false, error: "Checkout was not found or has expired." });
    }
    const pending = pendingSnapshot.data();
    if (pending.customerUid !== user.uid) return response.status(403).json({ verified: false, error: "This checkout belongs to another account." });

    let assignedPartner = null;
    if (pending.deliveryMethod !== "india_post") {
      const partnerSnapshots = await firebaseAdminDb.collection("deliveryPartnerAccounts")
        .where("state", "==", pending.deliveryState).get();
      if (!partnerSnapshots.empty) {
        const candidateOrders = await Promise.all(partnerSnapshots.docs.map(async partner => ({
          partner,
          count: (await firebaseAdminDb.collection("orders").where("assignedPartnerUid", "==", partner.id).get())
            .docs.filter(order => !["Delivered", "Cancelled"].includes(order.data().status)).length
        })));
        assignedPartner = candidateOrders.sort((first, second) => first.count - second.count)[0].partner;
      }
    }

    try {
      await firebaseAdminDb.runTransaction(async transaction => {
        const currentPending = await transaction.get(pendingRef);
        const currentOrder = await transaction.get(orderRef);
        if (currentOrder.exists) return;
        if (!currentPending.exists || currentPending.data().customerUid !== user.uid) {
          throw new Error("Checkout was already completed or is no longer available.");
        }
        const productRefs = currentPending.data().items.map(item => firebaseAdminDb.collection("products").doc(item.productId));
        const productSnapshots = await Promise.all(productRefs.map(reference => transaction.get(reference)));
        productSnapshots.forEach((product, index) => {
          const item = currentPending.data().items[index];
          const stock = Number(product.data()?.avlbStk);
          if (!product.exists || stock < item.quantity) {
            const error = new Error(`${item.name} no longer has enough stock.`);
            error.refundPayment = true;
            throw error;
          }
        });
        productSnapshots.forEach((product, index) => {
          const quantity = currentPending.data().items[index].quantity;
          transaction.update(productRefs[index], {
            avlbStk: Number(product.data().avlbStk) - quantity,
            quantity: Number(product.data().quantity ?? product.data().avlbStk) - quantity
          });
        });
        transaction.create(orderRef, {
          orderId,
          paymentId,
          merchantIds: [...new Set(currentPending.data().items.map(item => String(item.merchantId || "")).filter(Boolean))],
          customerUid: user.uid,
          customerName: currentPending.data().customerName,
          customerMobile: currentPending.data().customerMobile,
          items: currentPending.data().items.map(({ productId, merchantLocation, ...item }) => ({ ...item, productId })),
          amount: currentPending.data().amount / 100,
          itemSubtotal: currentPending.data().itemSubtotal / 100,
          postalCharge: currentPending.data().postalCharge / 100,
          totalWeightGrams: currentPending.data().totalWeightGrams,
          deliveryState: currentPending.data().deliveryState,
          deliveryMethod: currentPending.data().deliveryMethod,
          paymentMethod: currentPending.data().paymentMethod,
          postalAddress: currentPending.data().postalAddress || "",
          postalPincode: currentPending.data().postalPincode || "",
          customerLocation: currentPending.data().customerLocation,
          merchantLocations: currentPending.data().items.map(item => item.merchantLocation).filter(Boolean),
          assignedPartnerUid: assignedPartner?.id || null,
          assignedPartnerId: assignedPartner?.data().deliveryPartnerId || null,
          status: currentPending.data().deliveryMethod === "india_post"
            ? "Awaiting postal dispatch"
            : assignedPartner ? "Awaiting pickup" : "Unassigned",
          createdAt: FieldValue.serverTimestamp()
        });
        transaction.delete(pendingRef);
      });
    } catch (error) {
      if (error.refundPayment) {
        try {
          await razorpay.payments.refund(paymentId, { amount: pending.amount });
          await pendingRef.delete();
          return response.status(409).json({ verified: false, refunded: true, error: "Stock changed before payment completed. A refund has been initiated." });
        } catch (refundError) {
          console.error("Could not refund a paid order after a stock conflict.", refundError);
          return response.status(503).json({ verified: false, error: "Payment was received, but the order could not be finalized or refunded automatically. Contact support." });
        }
      }
      throw error;
    }

    const savedOrder = await orderRef.get();
    const orderData = savedOrder.data() || {};
    const merchantIds = orderData.merchantIds || [];
    const autoPayouts = [];

    for (const merchantId of merchantIds) {
      try {
        let merchantAccount = null;
        const merchantSnap = await firebaseAdminDb.collection("merchantAccounts")
          .where("merchantId", "==", merchantId).limit(1).get();
        if (!merchantSnap.empty) {
          merchantAccount = merchantSnap.docs[0].data();
        }

        const merchantItems = (orderData.items || []).filter(item => String(item.merchantId || "") === merchantId);
        const merchantTotal = merchantItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);

        if (merchantTotal > 0) {
          const payoutId = `payout_${orderId}_${merchantId.replace(/[^A-Za-z0-9]/g, "")}`;
          const targetMethod = merchantAccount?.upiLink ? "UPI" : merchantAccount?.bankAccountNumber ? "BANK_TRANSFER" : "MERCHANT_ACCOUNT";
          const targetDetail = merchantAccount?.bankAccountNumber
            ? `Bank A/C: ${merchantAccount.bankAccountNumber.slice(-4).padStart(merchantAccount.bankAccountNumber.length, 'X')} (${merchantAccount.ifscCode || 'IFSC'})`
            : merchantAccount?.upiLink || "Registered Merchant Ledger";

          const payoutDoc = {
            payoutId,
            orderId,
            customerPaymentId: paymentId,
            merchantId,
            merchantName: merchantAccount?.shopName || merchantAccount?.fullName || "Supplying Merchant",
            merchantPhone: merchantAccount?.phoneNo || "",
            payoutAmount: merchantTotal,
            currency: "INR",
            targetMethod,
            targetDetail,
            status: "AUTO_TRANSFERRED",
            transferredAt: FieldValue.serverTimestamp(),
            note: "Automatic payout to merchant account immediately upon verified customer payment to store"
          };

          await firebaseAdminDb.collection("merchantPayouts").doc(payoutId).set(payoutDoc);
          autoPayouts.push(payoutDoc);
        }
      } catch (payoutErr) {
        console.error(`Auto-payout error for merchant ${merchantId}:`, payoutErr);
      }
    }

    if (autoPayouts.length > 0) {
      await orderRef.update({
        merchantAutoPayouts: autoPayouts.map(p => ({
          payoutId: p.payoutId,
          merchantId: p.merchantId,
          amount: p.payoutAmount,
          targetMethod: p.targetMethod,
          targetDetail: p.targetDetail,
          status: p.status,
          transferredAt: new Date().toISOString()
        })),
        autoPayoutStatus: "COMPLETED"
      });
    }

    response.json({
      verified: true,
      orderId,
      assignedPartnerId: savedOrder.data()?.assignedPartnerId || null,
      deliveryMethod: savedOrder.data()?.deliveryMethod || "delivery_partner",
      autoMerchantPayouts: autoPayouts,
      receipt: await buildOrderReceipt(savedOrder.data() || {}, user.email)
    });
  } catch (error) {
    console.error("Payment verification or order persistence failed.", error);
    response.status(error.status || 503).json({ verified: false, error: error.status ? error.message : "Payment was verified but the order could not be finalized." });
  }
});

app.post("/api/orders/:orderId/status", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const partnerSnapshot = await firebaseAdminDb.collection("deliveryPartnerAccounts").doc(user.uid).get();
    if (!partnerSnapshot.exists) return response.status(403).json({ error: "A Delivery Partner account is required." });
    const orderRef = firebaseAdminDb.collection("orders").doc(request.params.orderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists || orderSnapshot.data().assignedPartnerUid !== user.uid) {
      return response.status(404).json({ error: "This order is not assigned to your account." });
    }
    const order = orderSnapshot.data();
    const requestedStatus = request.body?.status;
    if (requestedStatus === order.status) return response.json({ updated: true, status: requestedStatus });
    if (requestedStatus === "Out for delivery" && order.status === "Awaiting pickup") {
      await orderRef.update({ status: "Out for delivery", pickedUpAt: FieldValue.serverTimestamp() });
    } else if (requestedStatus === "Delivered" && order.status === "Out for delivery") {
      const partnerOrders = await firebaseAdminDb.collection("orders")
        .where("assignedPartnerUid", "==", user.uid).get();
      const today = new Date().toLocaleDateString("en-IN");
      const completedToday = partnerOrders.docs.filter(record => {
        const data = record.data();
        const deliveredAt = data.deliveredAt?.toDate?.() || (data.deliveredAt ? new Date(data.deliveredAt) : null);
        return data.status === "Delivered" && deliveredAt?.toLocaleDateString("en-IN") === today;
      }).length;
      const merchantLocation = order.merchantLocation || order.merchantLocations?.find(location =>
        Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
      );
      const customerLocation = order.customerLocation;
      const validLocations = merchantLocation && customerLocation
        && Number.isFinite(Number(merchantLocation.latitude))
        && Number.isFinite(Number(merchantLocation.longitude))
        && Number.isFinite(Number(customerLocation.latitude))
        && Number.isFinite(Number(customerLocation.longitude));
      let distanceKm = 0;
      if (validLocations) {
        const radians = degrees => degrees * Math.PI / 180;
        const latitudeDelta = radians(Number(customerLocation.latitude) - Number(merchantLocation.latitude));
        const longitudeDelta = radians(Number(customerLocation.longitude) - Number(merchantLocation.longitude));
        const latitudeOne = radians(Number(merchantLocation.latitude));
        const latitudeTwo = radians(Number(customerLocation.latitude));
        const haversine = Math.sin(latitudeDelta / 2) ** 2
          + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitudeOne) * Math.cos(latitudeTwo);
        distanceKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 10) / 10;
      }
      const longTrip = distanceKm >= 10;
      const basePay = longTrip ? 0 : 30;
      const distancePay = longTrip ? 0 : Math.max(0, Math.ceil(distanceKm - 3)) * 6;
      const longTripPay = longTrip ? 70 : 0;
      const completedCount = completedToday + 1;
      const dailyBonus = completedCount >= 30 ? 2000 : completedCount >= 20 ? 1200 : completedCount >= 10 ? 500 : 0;
      await orderRef.update({
        status: "Delivered",
        deliveredAt: FieldValue.serverTimestamp(),
        deliveryPartnerPayout: {
          basePay,
          distanceKm,
          distancePay,
          longTripPay,
          dailyBonus,
          total: basePay + distancePay + longTripPay + dailyBonus
        },
        customerLocation: FieldValue.delete(),
        customerLiveLocation: FieldValue.delete(),
        deliveryPartnerLocation: FieldValue.delete(),
        merchantLocation: FieldValue.delete()
      });
    } else {
      return response.status(409).json({ error: "This order cannot make that status transition." });
    }
    response.json({ updated: true, status: requestedStatus });
  } catch (error) {
    console.error("Could not update Delivery Partner order status.", error);
    response.status(error.status || 503).json({ error: error.status ? error.message : "Order status could not be updated." });
  }
});

const functionSecrets = [
  adminLoginIdSecret,
  adminPasswordSecret,
  razorpayKeyIdSecret,
  razorpayKeySecretSecret,
  postalRatesSecret
];

export const api = onRequest({
  region: "us-central1",
  maxInstances: 10,
  secrets: functionSecrets
}, (request, response) => {
  try {
    process.env.ADMIN_LOGIN_ID = adminLoginIdSecret.value();
    process.env.ADMIN_PASSWORD = adminPasswordSecret.value();
    process.env.RAZORPAY_KEY_ID = razorpayKeyIdSecret.value();
    process.env.RAZORPAY_KEY_SECRET = razorpayKeySecretSecret.value();
    const optionalSecrets = [["INDIA_POST_RETAIL_RATES_JSON", postalRatesSecret]];
    for (const [name, secret] of optionalSecrets) {
      const value = secret.value();
      process.env[name] = value === "disabled" ? "" : value;
    }
    if (!razorpay) {
      razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
      });
    }
    const origins = [
      ...(process.env.APP_ALLOWED_ORIGINS || "https://www.janjeevan.store,https://janjeevan.store").split(","),
      process.env.ADMIN_ALLOWED_ORIGIN || "https://www.janjeevan.store"
    ].map(origin => origin.trim()).filter(Boolean);
    adminAllowedOrigin = process.env.ADMIN_ALLOWED_ORIGIN || "https://www.janjeevan.store";
    appAllowedOrigins = new Set(origins.map(origin => {
      try {
        return new URL(origin).origin;
      } catch {
        return origin;
      }
    }));
  } catch (error) {
    console.error("Firebase Functions API secrets are not configured.", error);
    return response.status(503).json({ error: "The secure API is not configured. Ask the Firebase project administrator to set its required secrets." });
  }
  app(request, response);
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, () => console.log(`Janjeevan.store running at http://localhost:${port}`));
}