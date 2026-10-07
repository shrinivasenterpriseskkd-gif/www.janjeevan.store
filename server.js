import "dotenv/config";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Razorpay from "razorpay";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { applicationDefault, cert, initializeApp as initializeFirebaseAdmin } from "firebase-admin/app";
import { getAuth as getFirebaseAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore as getFirebaseAdminFirestore } from "firebase-admin/firestore";
const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 5500;
const root = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === "production") {
  const requiredEnvironment = ["FIREBASE_SERVICE_ACCOUNT_JSON", "ADMIN_LOGIN_ID", "ADMIN_PASSWORD", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "APP_ALLOWED_ORIGINS", "ADMIN_ALLOWED_ORIGIN"];
  const missingEnvironment = requiredEnvironment.filter(name => !process.env[name]?.trim());
  if (missingEnvironment.length) {
    throw new Error(`Missing required production environment variables: ${missingEnvironment.join(", ")}`);
  }
}
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;
const adminSessions = new Map();
const loginAttempts = new Map();
const adminSessionDuration = 8 * 60 * 60 * 1000;
const loginAttemptWindow = 15 * 60 * 1000;
const maxLoginAttempts = 5;
const adminAllowedOrigin = process.env.ADMIN_ALLOWED_ORIGIN || "";
const appAllowedOrigins = new Set([
  ...(process.env.APP_ALLOWED_ORIGINS || "").split(",").map(origin => origin.trim()),
  adminAllowedOrigin
].filter(Boolean));
const firebaseCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  : applicationDefault();
const firebaseAdminApp = initializeFirebaseAdmin({
  credential: firebaseCredential,
  projectId: process.env.FIREBASE_PROJECT_ID || "janjeevanstore"
}, "tribes-server");
const firebaseAdminAuth = getFirebaseAdminAuth(firebaseAdminApp);
const firebaseAdminDb = getFirebaseAdminFirestore(firebaseAdminApp);
const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || "";
const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "";
const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "";
const r2BucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "";
const r2PublicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/+$/, "");
const r2Client = r2AccountId && r2AccessKeyId && r2SecretAccessKey
  ? new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey
    }
  })
  : null;

const uploadR2Image = async (imageDataUrl, prefix) => {
  if (!r2Client || !r2BucketName || !r2PublicUrl) {
    const error = new Error("Cloudflare R2 is not configured. Set its account ID, bucket name, API credentials, and public URL on the server.");
    error.status = 503;
    throw error;
  }
  let publicUrl;
  try {
    publicUrl = new URL(r2PublicUrl);
  } catch {
    const error = new Error("Cloudflare R2 public URL is invalid. Set CLOUDFLARE_R2_PUBLIC_URL to the bucket's public HTTPS URL.");
    error.status = 503;
    throw error;
  }
  if (publicUrl.protocol !== "https:" || publicUrl.search || publicUrl.hash) {
    const error = new Error("Cloudflare R2 public URL must be an HTTPS base URL without a query or fragment.");
    error.status = 503;
    throw error;
  }

  const imageMatch = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(imageDataUrl || ""));
  if (!imageMatch) {
    const error = new Error("Choose a valid JPG, PNG, or WebP product image.");
    error.status = 400;
    throw error;
  }
  const imageBuffer = Buffer.from(imageMatch[2], "base64");
  if (!imageBuffer.length || imageBuffer.length >= 5 * 1024 * 1024) {
    const error = new Error("Product images must be smaller than 5 MB.");
    error.status = 400;
    throw error;
  }

  const extension = imageMatch[1] === "image/png" ? "png" : imageMatch[1] === "image/webp" ? "webp" : "jpg";
  const key = `${prefix}/${crypto.randomUUID()}.${extension}`;
  await r2Client.send(new PutObjectCommand({
    Bucket: r2BucketName,
    Key: key,
    Body: imageBuffer,
    ContentType: imageMatch[1],
    CacheControl: "public, max-age=31536000, immutable"
  }));
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return { key, imageUrl: `${r2PublicUrl}/${encodedKey}` };
};

const deleteR2Image = async key => {
  if (!r2Client || !r2BucketName) return;
  await r2Client.send(new DeleteObjectCommand({ Bucket: r2BucketName, Key: key }));
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

if (!razorpay) console.warn("Razorpay keys are missing. Add them to .env before checkout.");
app.use(express.json({ limit: "8mb" }));
app.get("/healthz", (request, response) => response.status(200).json({ status: "ok" }));
app.get("/js/api-config.js", (request, response) => {
  response.type("application/javascript").send(
    "window.TRIBES_API_BASE_URL = window.TRIBES_API_BASE_URL || window.location.origin;"
  );
});
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin && appAllowedOrigins.has(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Access-Control-Allow-Credentials", "true");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.vary("Origin");
  }
  if (request.method === "OPTIONS") {
    return origin && appAllowedOrigins.has(origin)
      ? response.sendStatus(204)
      : response.sendStatus(403);
  }
  next();
});

const secureCookie = process.env.NODE_ENV === "production";
const cookieSameSite = adminAllowedOrigin ? "None" : "Strict";
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
const adminCookie = (token, maxAge) => `tribes_admin_session=${token}; Path=/; HttpOnly; SameSite=${cookieSameSite}; Max-Age=${maxAge}${secureCookie ? "; Secure" : ""}`;
const adminPageProtection = (request, response, next) => {
  if (request.path === "/login.html") return next();
  if (readAdminSession(request)) return next();
  if (request.accepts("html")) return response.redirect(302, "/admin/login.html");
  return response.status(401).send("Admin sign-in required.");
};
app.use("/admin", adminPageProtection);

app.use("/api/admin", (request, response, next) => {
  const origin = request.get("origin");
  if (origin && adminAllowedOrigin && origin === adminAllowedOrigin) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Access-Control-Allow-Credentials", "true");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.vary("Origin");
  } else if (origin && adminAllowedOrigin && origin !== adminAllowedOrigin) {
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
        return {
          type,
          id: String(record[idField] || ""),
          name: String(record[nameField] || type),
          email: String(record.email || ""),
          phone: String(record.phoneNo || record.mobile || ""),
          area: String(record.state || "")
        };
      });
    }));
    response.json({ accounts: accountGroups.flat() });
  } catch (error) {
    console.error("Could not load Firebase account summaries for Admin.", error);
    response.status(503).json({ error: "Account records are unavailable." });
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

app.post("/api/merchant/product-images", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    const merchant = await firebaseAdminDb.collection("merchantAccounts").doc(user.uid).get();
    if (!merchant.exists || !merchant.data()?.merchantId) {
      return response.status(403).json({ error: "A Merchant account is required to upload product images." });
    }
    const uploaded = await uploadR2Image(request.body?.imageDataUrl, `merchants/${user.uid}/products`);
    response.json({ imageUrl: uploaded.imageUrl });
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Could not upload a Merchant product image to Cloudflare R2.", error);
    response.status(503).json({ error: "Product image upload failed. Verify the Cloudflare R2 server configuration and try again." });
  }
});

app.post("/api/admin/products", async (request, response) => {
  if (!readAdminSession(request)) return response.status(401).json({ error: "Admin sign-in required." });
  const { product: submittedProduct, imageDataUrl } = request.body || {};
  let uploadedImageKey;
  const price = Number(submittedProduct?.price);
  const discountPercent = Number(submittedProduct?.discountPercent);
  const stock = Number(submittedProduct?.avlbStk);
  const productName = String(submittedProduct?.name || "").trim();
  if (!productName || productName.length > 120 || !Number.isFinite(price) || price < 0 ||
    !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100 ||
    !Number.isInteger(stock) || stock < 0) {
    return response.status(400).json({ error: "Product name, price, discount, and stock are invalid." });
  }

  try {
    const uploaded = await uploadR2Image(imageDataUrl, "products");
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
        await deleteR2Image(uploadedImageKey);
      } catch (cleanupError) {
        console.error("Could not clean up the failed R2 product image upload.", cleanupError);
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

app.use(express.static(root));

app.post("/api/orders", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
    const customerSnapshot = await firebaseAdminDb.collection("customerAccounts").doc(user.uid).get();
    if (!customerSnapshot.exists) return response.status(403).json({ error: "A customer account is required to check out." });
    const customer = customerSnapshot.data();
    const requestedItems = Array.isArray(request.body.items) ? request.body.items : [];
    if (!requestedItems.length || requestedItems.length > 20) return response.status(400).json({ error: "Cart must contain between 1 and 20 products." });
    const deliveryState = String(request.body.deliveryState || "").trim();
    const location = request.body.customerLocation;
    if (!deliveryState || !location || !Number.isFinite(Number(location.latitude)) ||
      !Number.isFinite(Number(location.longitude)) || Math.abs(Number(location.latitude)) > 90 ||
      Math.abs(Number(location.longitude)) > 180) {
      return response.status(400).json({ error: "A delivery area and valid delivery location are required." });
    }

    const quantities = new Map();
    for (const item of requestedItems) {
      const id = String(item?.id || "").trim();
      const quantity = Number(item?.quantity);
      if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return response.status(400).json({ error: "Cart contains an invalid product or quantity." });
      }
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }

    const items = [];
    let amount = 0;
    for (const [productId, quantity] of quantities) {
      const productSnapshot = await firebaseAdminDb.collection("products").doc(productId).get();
      if (!productSnapshot.exists) return response.status(409).json({ error: "A product in your cart is no longer available." });
      const product = productSnapshot.data();
      const price = Number(product.price);
      const discount = Number(product.discountPercent) || 0;
      const stock = Number(product.avlbStk);
      if (!Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < quantity ||
        !Number.isFinite(discount) || discount < 0 || discount > 100) {
        return response.status(409).json({ error: `${product.name || "A product"} has insufficient stock or invalid pricing.` });
      }
      const salePrice = Math.round(price * (1 - discount / 100) * 100) / 100;
      amount += Math.round(salePrice * 100) * quantity;
      items.push({
        productId,
        quantity,
        name: String(product.name || "Product"),
        price: salePrice,
        listPrice: price,
        discountPercent: discount,
        merchantId: String(product.merchantId || ""),
        area: String(product.area || ""),
        village: String(product.village || ""),
        merchantLocation: Number.isFinite(Number(product.latitude)) && Number.isFinite(Number(product.longitude))
          ? { latitude: Number(product.latitude), longitude: Number(product.longitude), label: product.village || product.area || "Merchant pickup area" }
          : null
      });
    }
    if (amount < 100) return response.status(400).json({ error: "Order amount must be at least INR 1." });

    const order = await razorpay.orders.create({ amount, currency: "INR", receipt: `tribes_${Date.now()}`, notes: { itemCount: String(items.length), customerUid: user.uid } });
    await firebaseAdminDb.collection("pendingCheckouts").doc(order.id).set({
      customerUid: user.uid,
      customerName: String(customer.name || ""),
      customerMobile: String(customer.mobile || ""),
      items,
      amount: order.amount,
      deliveryState,
      customerLocation: {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        accuracy: Math.max(0, Math.round(Number(location.accuracy) || 0)),
        updatedAt: new Date().toISOString()
      },
      createdAt: FieldValue.serverTimestamp()
    });
    response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Unable to create authenticated checkout.", error);
    response.status(error.status || 503).json({ error: error.status ? error.message : "Firebase or Razorpay checkout is unavailable." });
  }
});

app.post("/api/merchant-registration-order", async (request, response) => {
  try {
    const user = await requireFirebaseUser(request);
    if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
    const merchantId = String(request.body.merchantId || "").trim();
    if (!merchantId) return response.status(400).json({ error: "Merchant ID is required." });
    const order = await razorpay.orders.create({ amount: 100, currency: "INR", receipt: `tribes_registration_fee_${Date.now()}`, notes: { purpose: "merchant_registration_fee", merchantId } });
    await firebaseAdminDb.collection("pendingDonations").doc(order.id).set({
      uid: user.uid,
      merchantId,
      createdAt: FieldValue.serverTimestamp()
    });
    response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Unable to create authenticated merchant registration-fee order.", error);
    const razorpayAuthenticationFailed = error.statusCode === 401
      || (error.error?.code === "BAD_REQUEST_ERROR"
        && /authentication failed/i.test(error.error?.description || ""));
    if (razorpayAuthenticationFailed) {
      return response.status(502).json({
        error: "Razorpay rejected its API credentials. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are a matching pair from the same Razorpay mode (test or live), then restart the server."
      });
    }
    response.status(error.status || 503).json({ error: error.status ? error.message : "Unable to create registration-fee order." });
  }
});

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
          assignedPartnerId: existingOrder.data().assignedPartnerId || null
        });
      }
      const registrationFeeRef = firebaseAdminDb.collection("pendingDonations").doc(orderId);
      const registrationFee = await registrationFeeRef.get();
      if (registrationFee.exists && registrationFee.data().uid === user.uid) {
        await registrationFeeRef.delete();
        return response.json({ verified: true, registrationFee: true });
      }
      return response.status(404).json({ verified: false, error: "Checkout was not found or has expired." });
    }
    const pending = pendingSnapshot.data();
    if (pending.customerUid !== user.uid) return response.status(403).json({ verified: false, error: "This checkout belongs to another account." });

    const partnerSnapshots = await firebaseAdminDb.collection("deliveryPartnerAccounts")
      .where("state", "==", pending.deliveryState).get();
    let assignedPartner = null;
    if (!partnerSnapshots.empty) {
      const candidateOrders = await Promise.all(partnerSnapshots.docs.map(async partner => ({
        partner,
        count: (await firebaseAdminDb.collection("orders").where("assignedPartnerUid", "==", partner.id).get())
          .docs.filter(order => !["Delivered", "Cancelled"].includes(order.data().status)).length
      })));
      assignedPartner = candidateOrders.sort((first, second) => first.count - second.count)[0].partner;
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
        customerUid: user.uid,
        customerName: currentPending.data().customerName,
        customerMobile: currentPending.data().customerMobile,
        items: currentPending.data().items.map(({ productId, merchantLocation, ...item }) => ({ ...item, productId })),
        amount: currentPending.data().amount / 100,
        deliveryState: currentPending.data().deliveryState,
        customerLocation: currentPending.data().customerLocation,
        merchantLocations: currentPending.data().items.map(item => item.merchantLocation).filter(Boolean),
        assignedPartnerUid: assignedPartner?.id || null,
        assignedPartnerId: assignedPartner?.data().deliveryPartnerId || null,
        status: assignedPartner ? "Awaiting pickup" : "Unassigned",
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
    response.json({ verified: true, orderId, assignedPartnerId: savedOrder.data()?.assignedPartnerId || null });
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

app.listen(port, () => console.log(`Janjeevan.store running at http://localhost:${port}`));