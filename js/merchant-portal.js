import {
    doc,
    getDoc,
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth, db } from "./firebase-config.js";

const apiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");
const merchantList = document.querySelector("#merchant-product-list");
const catalogStatus = document.querySelector("#merchant-catalog-status");
const productForm = document.querySelector("#merchant-product-form");
const productStatus = document.querySelector("#merchant-product-status");
const profileRecoverySection = document.querySelector("#merchant-profile-recovery");
const profileRecoveryForm = document.querySelector("#merchant-profile-recovery-form");
const profileRecoveryStatus = document.querySelector("#merchant-profile-recovery-status");
const profileRecoverySubmit = document.querySelector("#merchant-profile-recovery-submit");
const profileRecoveryEmail = document.querySelector("#merchant-recovery-email");
const productPhotoInput = document.querySelector("#merchant-product-photo");
const submitButton = document.querySelector("#merchant-product-submit");
const productNameInput = document.querySelector("#merchant-product-name");
const productCategoryInput = document.querySelector("#merchant-product-category");
const searchProductsButton = document.querySelector("#merchant-search-products");
const bulkProductForm = document.querySelector("#merchant-bulk-product-form");
const bulkWorkbookInput = document.querySelector("#merchant-bulk-workbook");
const bulkSubmitButton = document.querySelector("#merchant-bulk-submit");
const bulkStatus = document.querySelector("#merchant-bulk-status");
const signOutButton = document.querySelector("#merchant-sign-out");
const merchantPortalHeading = document.querySelector(".merchant-portal-heading");
const merchantOrderList = document.querySelector("#merchant-order-list");
const merchantOrdersStatus = document.querySelector("#merchant-orders-status");
const merchantOrderNotificationsButton = document.querySelector("#enable-merchant-order-notifications");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[character]));
const money = value => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
}).format(Number(value) || 0);
const formatPercent = value => Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
});
const merchantOrderMoney = value => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
}).format(Number(value) || 0);
const effectivePrice = (price, discount) =>
    Math.round((Number(price) || 0) * (1 - Math.min(100, Math.max(0, Number(discount) || 0)) / 100) * 100) / 100;
const workbookColumns = [
    "Product Name",
    "Category",
    "Unit",
    "Price",
    "Discount Percent",
    "GST Percent",
    "Available Stock",
    "Shipping Weight (g)",
    "Area",
    "Village / Town",
    "Image Filename"
];
const excel = () => {
    if (!window.XLSX) throw new Error("Excel support could not load. Refresh the page and try again.");
    return window.XLSX;
};
const downloadWorkbook = (workbook, filename) => {
    excel().writeFile(workbook, filename);
};
const setShopPhotoBackground = photo => {
    if (typeof photo !== "string" || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
        merchantPortalHeading.classList.remove("has-shop-photo");
        merchantPortalHeading.style.removeProperty("--merchant-shop-photo");
        return;
    }
    merchantPortalHeading.style.setProperty("--merchant-shop-photo", `url("${photo}")`);
    merchantPortalHeading.classList.add("has-shop-photo");
};

document.querySelector("#download-product-template").addEventListener("click", () => {
    try {
        const XLSX = excel();
        const workbook = XLSX.utils.book_new();
        const example = {
            "Product Name": "Sample basket",
            Category: "Handicrafts",
            Unit: "piece",
            Price: 250,
            "Discount Percent": 0,
            "GST Percent": 0,
            "Available Stock": 10,
            "Shipping Weight (g)": 250,
            Area: "Araku Valley",
            "Village / Town": "Araku",
            "Image Filename": "sample-basket.jpg"
        };
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([example], { header: workbookColumns }), "Products");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ["Bulk product upload instructions"],
            ["Enter one product per row on the Products sheet. Keep the column headings unchanged."],
            ["Required: Product Name, Category, Unit, Price, Available Stock, Area, Village / Town, Image Filename."],
            ["Optional: Discount Percent and GST Percent. Leave blank to use 0."],
            ["Shipping Weight (g) is the packed weight of one sale unit; enter it for India Post parcel orders."],
            ["Add each image file to the website's images/products/ folder."],
            ["Enter only the image filename in the Image Filename column, for example sample-basket.jpg."],
            ["Supported units: piece, kg, g, litre, ml, box, pack, dozen, meter."],
            ["Delete the sample row before uploading your real product list."]
        ]), "Instructions");
        downloadWorkbook(workbook, "merchant-products-sample.xlsx");
        bulkStatus.textContent = "Sample Excel workbook downloaded.";
        bulkStatus.className = "merchant-portal-status";
    } catch (error) {
        console.error("Could not create the sample product workbook.", error);
        bulkStatus.textContent = error.message || "Could not create the sample workbook.";
        bulkStatus.className = "merchant-portal-status error";
    }
});

document.querySelector("#export-merchant-products").addEventListener("click", () => {
    try {
        if (!merchantProducts.length) {
            bulkStatus.textContent = "There are no products to export yet.";
            bulkStatus.className = "merchant-portal-status";
            return;
        }
        const XLSX = excel();
        const workbook = XLSX.utils.book_new();
        const groups = new Map();
        merchantProducts.forEach(({ product }) => {
            const category = String(product.category || "Uncategorized").trim() || "Uncategorized";
            const key = category.toLocaleLowerCase();
            if (!groups.has(key)) groups.set(key, { category, products: [] });
            groups.get(key).products.push({
                "Product Name": product.name || "",
                Category: category,
                Unit: product.uom || "",
                Price: Number(product.price) || 0,
                "Discount Percent": Number(product.discountPercent) || 0,
                "GST Percent": Number(product.gstPercent) || 0,
                "Available Stock": Number(product.avlbStk ?? product.quantity) || 0,
                "Shipping Weight (g)": Number(product.weightGrams) || "",
                Area: product.area || "",
                "Village / Town": product.village || "",
                "Image Filename": String(product.imageUrl || "").split(/[\\/]/).pop()
            });
        });
        const usedSheetNames = new Set();
        [...groups.values()]
            .sort((first, second) => first.category.localeCompare(second.category))
            .forEach(({ category, products }) => {
                const baseName = category.replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31) || "Products";
                let sheetName = baseName;
                let suffix = 2;
                while (usedSheetNames.has(sheetName.toLocaleLowerCase())) {
                    const suffixText = ` ${suffix++}`;
                    sheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
                }
                usedSheetNames.add(sheetName.toLocaleLowerCase());
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(products), sheetName);
            });
        downloadWorkbook(workbook, "merchant-products-by-category.xlsx");
        bulkStatus.textContent = "Product workbook downloaded with one sheet per category. Image URLs are included.";
        bulkStatus.className = "merchant-portal-status";
    } catch (error) {
        console.error("Could not export the merchant product catalog.", error);
        bulkStatus.textContent = error.message || "Could not export products.";
        bulkStatus.className = "merchant-portal-status error";
    }
});

const isStaticProductImagePath = imageUrl =>
    /^images\/products\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(imageUrl);

const parseProductWorkbook = async workbookFile => {
    if (workbookFile.size > 10 * 1024 * 1024) throw new Error("Choose a workbook smaller than 10 MB.");
    const XLSX = excel();
    const workbook = XLSX.read(await workbookFile.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets.Products || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The workbook does not contain a product sheet.");

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    if (!rows.length) throw new Error("The product sheet has no product rows.");
    const normalizedRows = rows.map((row, index) => ({
        rowNumber: index + 2,
        values: Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]))
    })).filter(({ values }) => Object.values(values).some(value => String(value).trim() !== ""));
    if (!normalizedRows.length) throw new Error("The product sheet has no product rows.");

    const requiredColumns = [
        "Product Name",
        "Category",
        "Unit",
        "Price",
        "Available Stock",
        "Area",
        "Village / Town",
        "Image Filename"
    ].map(column => column.toLowerCase());
    const availableColumns = new Set(Object.keys(normalizedRows[0].values));
    const missingColumns = requiredColumns.filter(column => !availableColumns.has(column));
    if (missingColumns.length) {
        throw new Error(`Missing workbook columns: ${missingColumns.join(", ")}. Download the sample workbook for the required format.`);
    }

    const products = [];
    const errors = [];
    for (const { rowNumber, values } of normalizedRows) {
        const value = column => values[column.toLowerCase()];
        const name = String(value("Product Name") ?? "").trim();
        const category = String(value("Category") ?? "").trim();
        const uom = String(value("Unit") ?? "").trim();
        const area = String(value("Area") ?? "").trim();
        const village = String(value("Village / Town") ?? "").trim();
        const imageFilename = String(value("Image Filename") ?? "").trim().split(/[\\/]/).pop();
        const imageUrl = `images/products/${imageFilename}`;
        const priceValue = value("Price");
        const discountValue = value("Discount Percent");
        const gstValue = value("GST Percent");
        const stockValue = value("Available Stock");
        const weightValue = value("Shipping Weight (g)");
        const price = Number(priceValue);
        const discountPercent = discountValue == null || discountValue === "" ? 0 : Number(discountValue);
        const gstPercent = gstValue == null || gstValue === "" ? 0 : Number(gstValue);
        const avlbStk = Number(stockValue);
        const weightGrams = weightValue == null || weightValue === "" ? null : Number(weightValue);
        const rowErrors = [];

        if (!name || name.length > 120) rowErrors.push("Product Name is required (max 120 characters)");
        if (!category || category.length > 80) rowErrors.push("Category is required (max 80 characters)");
        if (!uom || uom.length > 40) rowErrors.push("Unit is required");
        if (priceValue == null || priceValue === "" || !Number.isFinite(price) || price < 0) rowErrors.push("Price must be a non-negative number");
        if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) rowErrors.push("Discount Percent must be a whole number from 0 to 100");
        if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 100) rowErrors.push("GST Percent must be from 0 to 100");
        if (stockValue == null || stockValue === "" || !Number.isInteger(avlbStk) || avlbStk < 0) rowErrors.push("Available Stock must be a non-negative whole number");
        if (weightGrams !== null && (!Number.isInteger(weightGrams) || weightGrams < 1 || weightGrams > 100000)) rowErrors.push("Shipping Weight (g) must be a whole number from 1 to 100000");
        if (!area || area.length > 100) rowErrors.push("Area is required (max 100 characters)");
        if (!village || village.length > 100) rowErrors.push("Village / Town is required (max 100 characters)");
        if (!isStaticProductImagePath(imageUrl)) rowErrors.push(`Use a JPG, PNG, or WebP filename (without folders) for "${imageFilename || "(empty)"}"`);

        if (rowErrors.length) {
            errors.push(`Row ${rowNumber}: ${rowErrors.join("; ")}`);
            continue;
        }
        products.push({
            rowNumber,
            product: {
                name,
                category,
                uom,
                price,
                discountPercent,
                gstPercent,
                weightGrams,
                quantity: avlbStk,
                avlbStk,
                area,
                village,
                imageUrl
            }
        });
    }

    if (errors.length) {
        throw new Error(`Fix these workbook errors before importing:\n${errors.slice(0, 10).join("\n")}${errors.length > 10 ? `\n…and ${errors.length - 10} more.` : ""}`);
    }
    return products;
};

bulkProductForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentMerchant?.merchantId || !merchantAccount) {
        bulkStatus.textContent = "Products cannot be imported because this signed-in account has no merchant profile and Merchant ID in Firestore. Contact comtribes@gmail.com to restore the merchant profile.";
        bulkStatus.className = "merchant-portal-status error";
        return;
    }
    if (!bulkProductForm.reportValidity()) return;

    const workbookFile = bulkWorkbookInput.files?.[0];
    if (!workbookFile) {
        bulkStatus.textContent = "Select a product workbook.";
        bulkStatus.className = "merchant-portal-status error";
        return;
    }
    bulkSubmitButton.disabled = true;
    bulkStatus.textContent = "Checking workbook rows and static image filenames…";
    bulkStatus.className = "merchant-portal-status";

    let products;
    try {
        products = await parseProductWorkbook(workbookFile);
    } catch (error) {
        console.error("Could not validate the merchant bulk product workbook.", error);
        bulkStatus.textContent = error.message || "Could not read the product workbook.";
        bulkStatus.className = "merchant-portal-status error";
        bulkSubmitButton.disabled = false;
        return;
    }

    let imported = 0;
    let failedRow;
    try {
        for (const [index, { rowNumber, product }] of products.entries()) {
            bulkStatus.textContent = `Importing product ${index + 1} of ${products.length} (workbook row ${rowNumber})…`;
            try {
                await saveMerchantProduct(product);
                imported += 1;
            } catch (error) {
                console.error(`Could not import workbook row ${rowNumber}.`, error);
                failedRow = { rowNumber, error };
                break;
            }
        }
    } finally {
        bulkSubmitButton.disabled = false;
    }

    bulkProductForm.reset();
    await loadProducts();
    if (failedRow) {
        const errorCode = String(failedRow.error?.code || "");
        bulkStatus.textContent = `${imported} product${imported === 1 ? "" : "s"} imported. Import stopped at workbook row ${failedRow.rowNumber}: ${failedRow.error?.message || "The product could not be saved."} Select an edited workbook containing only the products that were not imported to retry.`;
        bulkStatus.className = "merchant-portal-status error";
        return;
    }

    bulkStatus.textContent = `${imported} product${imported === 1 ? "" : "s"} imported successfully with their category and static image path.`;
    bulkStatus.className = "merchant-portal-status";
});

let currentMerchant;
let merchantAccount;
let merchantProducts = [];
let merchantOrders = [];
let knownMerchantOrderIds = null;
let orderNotificationPermission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
let merchantOrdersLoadInProgress = false;
let merchantOrdersStatusTimeout;
let editingProductId = null;

const findSavedMerchantProfile = user => {
    try {
        const savedMerchants = JSON.parse(localStorage.getItem("tribesMerchants") || "[]");
        if (!Array.isArray(savedMerchants)) return null;
        return savedMerchants.find(merchant =>
            String(merchant.email || "").trim().toLowerCase() === String(user.email || "").trim().toLowerCase() &&
            typeof merchant.merchantId === "string" && merchant.merchantId.trim()
        ) || null;
    } catch (error) {
        console.warn("Could not read the saved merchant registration for profile recovery.", error);
        return null;
    }
};

const recoverMerchantProfile = async (user, savedMerchant) => {
    if (!savedMerchant || !user.email) return false;
    const idToken = await user.getIdToken();
    const response = await fetch(`${apiBase}/merchant/profile/recover`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
            profile: {
                merchantId: savedMerchant.merchantId.trim(),
                fullName: String(savedMerchant.fullName || "").trim(),
                shopName: String(savedMerchant.shopName || savedMerchant.fullName || "").trim(),
                email: user.email,
                phoneNo: String(savedMerchant.phoneNo || "").trim(),
                gstNumber: String(savedMerchant.gstNumber || "").trim(),
                shopCategory: String(savedMerchant.shopCategory || "").trim(),
                state: String(savedMerchant.state || "").trim(),
                language: String(savedMerchant.language || "").trim()
            }
        })
    });
    const result = await readMerchantApiResponse(response);
    if (!response.ok || !result.restored) {
        throw new Error(result.error || "Merchant profile recovery failed.");
    }
    return true;
};

const submitMerchantProfileRecovery = async (user, profile) => {
    const idToken = await user.getIdToken();
    const response = await fetch(`${apiBase}/merchant/profile/recover`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ profile })
    });
    const result = await readMerchantApiResponse(response);
    if (!response.ok || !result.restored) {
        throw new Error(result.error || "Merchant profile recovery failed.");
    }
};

const readMerchantApiResponse = async response => {
    if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The merchant API returned a web page instead of JSON. Check the API URL configuration and confirm the latest backend version is deployed.");
    }
    return response.json();
};

const saveMerchantProduct = async (product, productId = "") => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Your sign-in has expired. Sign in again and retry.");
    const url = productId
        ? `${apiBase}/merchant/products/${encodeURIComponent(productId)}`
        : `${apiBase}/merchant/products`;
    const response = await fetch(url, {
        method: productId ? "PATCH" : "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ product })
    });
    const result = await readMerchantApiResponse(response);
    if (!response.ok) throw new Error(result.error || "The product could not be saved.");
    return result;
};

const renderMerchantOrders = () => {
    if (!merchantOrders.length) {
        merchantOrderList.innerHTML = '<p class="merchant-product-empty">No customer orders for your products yet.</p>';
        return;
    }
    merchantOrderList.innerHTML = merchantOrders.map(order => `<article class="merchant-product-card">
        <div class="merchant-product-card-content">
            <h3>Order ${escapeHtml(order.orderId)}</h3>
            <p>${escapeHtml(order.customerName || "Customer")}${order.customerMobile ? ` · ${escapeHtml(order.customerMobile)}` : ""}</p>
            <p>${escapeHtml(order.deliveryState || "Delivery area not provided")} · ${escapeHtml(order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : "Date unavailable")}</p>
            <p>Delivery: ${escapeHtml(order.deliveryMethod === "india_post" ? `India Post Retail Parcel · ${order.postalAddress || ""} ${order.postalPincode || ""}` : "Delivery Partner")}</p>
            <p>Payment: ${escapeHtml(order.paymentMethod === "upi" ? "Instant UPI" : order.paymentMethod === "phonepe" ? "PhonePe UPI" : order.paymentMethod === "googlepay" ? "Google Pay UPI" : "Razorpay Online")}</p>
            <p class="merchant-product-price-detail">Status: ${escapeHtml(order.status || "Unassigned")}</p>
            <p style="color: #1a7848; font-weight: 700; margin: 6px 0; display: inline-flex; align-items: center; gap: 4px; background: #eaf6ee; padding: 3px 8px; border-radius: 6px; font-size: 0.85rem;">⚡ Auto-Paid to your Merchant Bank/UPI Account</p>
            <ul>${order.items.map(item => `<li>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)} · ${merchantOrderMoney(item.price * item.quantity)}</li>`).join("")}</ul>
            <p class="merchant-product-sale-price">Your products subtotal: ${merchantOrderMoney(order.amount)}</p>
        </div>
    </article>`).join("");
};

const loadMerchantOrders = async () => {
    if (!currentMerchant?.merchantId || merchantOrdersLoadInProgress) return;
    merchantOrdersLoadInProgress = true;
    try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("Your sign-in has expired. Sign in again to receive order alerts.");
        const includeLegacy = knownMerchantOrderIds === null ? "?includeLegacy=1" : "";
        const response = await fetch(`${apiBase}/merchant/orders${includeLegacy}`, {
            headers: { Authorization: `Bearer ${idToken}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Your orders could not be loaded.");
        const nextOrders = Array.isArray(result.orders) ? result.orders : [];
        if (knownMerchantOrderIds === null) {
            merchantOrdersStatus.textContent = `${nextOrders.length} order${nextOrders.length === 1 ? "" : "s"} for your products.`;
            merchantOrdersStatus.className = "merchant-portal-status";
        } else {
            const newOrders = nextOrders.filter(order => !knownMerchantOrderIds.has(order.id));
            if (newOrders.length) {
                window.clearTimeout(merchantOrdersStatusTimeout);
                merchantOrdersStatus.textContent = `${newOrders.length} new order${newOrders.length === 1 ? "" : "s"} received!`;
                merchantOrdersStatus.className = "merchant-portal-status success";
                if (orderNotificationPermission === "granted") {
                    newOrders.forEach(order => {
                        try {
                            const notification = new Notification("New customer order", {
                                body: `Order ${order.orderId}: ${order.items.map(item => `${item.name} × ${item.quantity}`).join(", ")}`,
                                tag: `merchant-order-${order.id}`
                            });
                            notification.onclick = () => {
                                window.focus();
                                merchantOrderList.scrollIntoView({ behavior: "smooth", block: "start" });
                                notification.close();
                            };
                        } catch (error) {
                            console.error("Could not show a browser notification for a new merchant order.", error);
                            merchantOrdersStatus.textContent += " Browser notification could not be shown.";
                        }
                    });
                }
                merchantOrdersStatusTimeout = window.setTimeout(() => {
                    merchantOrdersStatus.textContent = `${merchantOrders.length} order${merchantOrders.length === 1 ? "" : "s"} for your products.`;
                    merchantOrdersStatus.className = "merchant-portal-status";
                }, 10000);
            } else {
                window.clearTimeout(merchantOrdersStatusTimeout);
                merchantOrdersStatus.textContent = `${nextOrders.length} order${nextOrders.length === 1 ? "" : "s"} for your products.`;
                merchantOrdersStatus.className = "merchant-portal-status";
            }
        }
        knownMerchantOrderIds = new Set(nextOrders.map(order => order.id));
        merchantOrders = nextOrders;
        renderMerchantOrders();
    } catch (error) {
        console.error("Could not refresh orders for the signed-in Merchant.", error);
        window.clearTimeout(merchantOrdersStatusTimeout);
        merchantOrdersStatus.textContent = error instanceof TypeError && /fetch/i.test(error.message)
            ? "The order service could not be reached. Check the backend URL and try again."
            : error.message || "Your orders could not be loaded. Check your connection and try again.";
        merchantOrdersStatus.className = "merchant-portal-status error";
        if (!merchantOrders.length) merchantOrderList.innerHTML = '<p class="merchant-product-empty">Your orders could not be loaded. Refresh the page to try again.</p>';
    } finally {
        merchantOrdersLoadInProgress = false;
    }
};

if (orderNotificationPermission === "granted") {
    merchantOrderNotificationsButton.textContent = "Browser alerts enabled";
    merchantOrderNotificationsButton.disabled = true;
}

merchantOrderNotificationsButton.addEventListener("click", async () => {
    if (typeof Notification === "undefined") {
        merchantOrdersStatus.textContent = "Browser notifications are not supported here. In-page order alerts will still appear while the portal is open.";
        merchantOrdersStatus.className = "merchant-portal-status error";
        return;
    }
    try {
        orderNotificationPermission = await Notification.requestPermission();
        if (orderNotificationPermission === "granted") {
            merchantOrdersStatus.textContent = "Browser alerts are enabled for new orders while this page is open.";
            merchantOrdersStatus.className = "merchant-portal-status success";
            merchantOrderNotificationsButton.textContent = "Browser alerts enabled";
            merchantOrderNotificationsButton.disabled = true;
        } else {
            merchantOrdersStatus.textContent = orderNotificationPermission === "denied"
                ? "Browser notifications are blocked. Allow them in your browser settings; in-page order alerts will still work."
                : "Browser alerts were not enabled. In-page order alerts will still work.";
            merchantOrdersStatus.className = "merchant-portal-status";
        }
    } catch (error) {
        console.error("Could not request browser notification permission.", error);
        merchantOrdersStatus.textContent = "Could not enable browser alerts. In-page order alerts will still work.";
        merchantOrdersStatus.className = "merchant-portal-status error";
    }
});

const showStatus = (message, type = "") => {
    catalogStatus.textContent = message;
    catalogStatus.className = `merchant-portal-status ${type}`.trim();
};

const showProductStatus = (message, type = "") => {
    productStatus.textContent = message;
    productStatus.className = `merchant-portal-status ${type}`.trim();
};

const renderProducts = () => {
    if (!merchantProducts.length) {
        merchantList.innerHTML = '<p class="merchant-product-empty">No products in your catalog yet. Add your first product below.</p>';
        return 0;
    }

    const nameQuery = productNameInput.value.trim().toLocaleLowerCase();
    const categoryQuery = productCategoryInput.value.trim().toLocaleLowerCase();
    const filteredProducts = merchantProducts.filter(({ product }) =>
        String(product.name || "").toLocaleLowerCase().includes(nameQuery) &&
        String(product.category || "").toLocaleLowerCase().includes(categoryQuery)
    );
    if (!filteredProducts.length) {
        merchantList.innerHTML = '<p class="merchant-product-empty">No products match that name and category.</p>';
        return 0;
    }

    merchantList.innerHTML = filteredProducts.map(({ id, product }) => {
        const discount = Number(product.discountPercent) || 0;
        const gstPercent = Number(product.gstPercent) || 0;
        const stock = Number(product.avlbStk);
        const inStock = Number.isFinite(stock) && stock > 0;
        return `<article class="merchant-product-card">
            <img class="merchant-product-card-image" src="${escapeHtml(product.imageUrl || "")}" alt="${escapeHtml(product.name || "Product")}">
            <div class="merchant-product-card-content">
                <h3>${escapeHtml(product.name || "Untitled product")}</h3>
                <p>Category: ${escapeHtml(product.category || "Uncategorized")}</p>
                <p>${escapeHtml(product.area || "Area not set")} · ${escapeHtml(product.village || "Village not set")}</p>
                <p class="merchant-product-stock-status ${inStock ? "in-stock" : "out-of-stock"}">${inStock ? `Stock: ${stock} available` : "Out of stock"}</p>
                <p class="merchant-product-sale-price">${money(effectivePrice(product.price, discount))}<span> / ${escapeHtml(product.uom || "unit")}</span></p>
                <p class="merchant-product-price-detail">Price: ${money(product.price)} · Discount: ${discount}% · GST: ${formatPercent(gstPercent)}%</p>
                <p class="merchant-product-price-detail">Packed weight: ${product.weightGrams ? `${escapeHtml(product.weightGrams)} g` : "Not set"}</p>
                <button class="secondary-btn merchant-product-save" type="button" data-product-id="${escapeHtml(id)}">Edit product</button>
            </div>
        </article>`;
    }).join("");
    return filteredProducts.length;
};

searchProductsButton.addEventListener("click", () => {
    const matchCount = renderProducts();
    catalogStatus.textContent = `${matchCount} matching product${matchCount === 1 ? "" : "s"}.`;
    catalogStatus.className = "merchant-portal-status";
    merchantList.scrollIntoView({ behavior: "smooth", block: "start" });
});

const resetProductForm = () => {
    editingProductId = null;
    productForm.reset();
    productPhotoInput.required = true;
    productCategoryInput.required = true;
    document.querySelector("#merchant-add-product-heading").textContent = "Add a product";
    submitButton.textContent = "Save product";
    document.querySelector("#merchant-product-cancel").hidden = true;
};

const disableCatalogSubmission = message => {
    submitButton.disabled = true;
    bulkSubmitButton.disabled = true;
    showStatus(message, "error");
    showProductStatus(message, "error");
};

const editProduct = ({ id, product }) => {
    editingProductId = id;
    document.querySelector("#merchant-product-name").value = product.name || "";
    productCategoryInput.value = product.category || "";
    document.querySelector("#merchant-product-unit").value = product.uom || "";
    document.querySelector("#merchant-product-price").value = product.price ?? "";
    document.querySelector("#merchant-product-discount").value = product.discountPercent ?? 0;
    document.querySelector("#merchant-product-gst").value = product.gstPercent ?? 0;
    document.querySelector("#merchant-product-stock").value = product.avlbStk ?? 0;
    document.querySelector("#merchant-product-weight").value = product.weightGrams ?? "";
    document.querySelector("#merchant-product-area").value = product.area || "";
    document.querySelector("#merchant-product-village").value = product.village || "";
    productPhotoInput.value = "";
    productPhotoInput.required = false;
    document.querySelector("#merchant-add-product-heading").textContent = "Update a product";
    submitButton.textContent = "Save product changes";
    document.querySelector("#merchant-product-cancel").hidden = false;
    showStatus("Edit the product details below. Choose a new photo only if you want to replace the current one.");
    productForm.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector("#merchant-product-name").focus({ preventScroll: true });
};

const loadProducts = async () => {
    if (!currentMerchant?.uid) return;

    merchantList.innerHTML = '<p class="merchant-product-empty">Loading your catalog…</p>';
    showStatus("");
    try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("Your sign-in has expired. Sign in again and retry.");
        const response = await fetch(`${apiBase}/merchant/products`, {
            headers: { Authorization: `Bearer ${idToken}` }
        });
        const result = await readMerchantApiResponse(response);
        if (!response.ok) throw new Error(result.error || "Merchant products are unavailable.");
        merchantProducts = Array.isArray(result.products) ? result.products : [];
        renderProducts();
        const outOfStock = merchantProducts.filter(({ product }) => {
            const stock = Number(product?.avlbStk);
            return !Number.isFinite(stock) || stock <= 0;
        });
        if (outOfStock.length) {
            const names = outOfStock.slice(0, 3).map(({ product }) => product?.name || "Untitled product").join(", ");
            const more = outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more` : "";
            showStatus(`Stock alert: ${names}${more} ${outOfStock.length === 1 ? "is" : "are"} out of stock. Update available stock to restock.`, "warning");
        } else {
            showStatus(`${merchantProducts.length} product${merchantProducts.length === 1 ? "" : "s"} in your catalog.`);
        }
        return true;
    } catch (error) {
        console.error("Could not load this merchant's product catalog.", error);
        merchantList.innerHTML = '<p class="merchant-product-empty">Your catalog could not be loaded. Check the local merchant API and try again.</p>';
        showStatus(error.message || "Catalog loading failed. Check the browser console and try again.", "error");
        return false;
    }
};

productForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentMerchant?.merchantId || !merchantAccount) {
        showProductStatus("Product upload is unavailable because this signed-in account has no merchant profile and Merchant ID in Firestore. Contact comtribes@gmail.com to restore the merchant profile.", "error");
        return;
    }
    if (!productForm.reportValidity()) return;

    const existingImageUrl = editingProductId
        ? merchantProducts.find(({ id }) => id === editingProductId)?.product.imageUrl || ""
        : "";
    const imageFile = productPhotoInput.files?.[0];
    if (imageFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type) || imageFile.size >= 5 * 1024 * 1024)) {
        showProductStatus("Choose a JPG, JPEG, PNG, or WebP image smaller than 5 MB.", "error");
        return;
    }
    if (!imageFile && !existingImageUrl) {
        showProductStatus("Choose a product photo before saving.", "error");
        return;
    }
    const price = Number(document.querySelector("#merchant-product-price").value);
    const discountPercent = Number(document.querySelector("#merchant-product-discount").value);
    const gstPercent = Number(document.querySelector("#merchant-product-gst").value);
    const avlbStk = Number(document.querySelector("#merchant-product-stock").value);
    const weightInput = document.querySelector("#merchant-product-weight").value.trim();
    const weightGrams = weightInput ? Number(weightInput) : null;
    const productName = productNameInput.value.trim().toUpperCase();
    if (!productName) {
        showProductStatus("Enter a product name.", "error");
        return;
    }
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(discountPercent) ||
        discountPercent < 0 || discountPercent > 100 || !Number.isFinite(gstPercent) ||
        gstPercent < 0 || gstPercent > 100 || !Number.isInteger(avlbStk) || avlbStk < 0) {
        showProductStatus("Enter a valid price, discount (0–100), GST percentage (0–100), and non-negative stock.", "error");
        return;
    }
    if (weightGrams !== null && (!Number.isInteger(weightGrams) || weightGrams < 1 || weightGrams > 100000)) {
        showProductStatus("Shipping weight must be a whole number from 1 to 100000 grams, or left blank.", "error");
        return;
    }

    submitButton.disabled = true;
    showProductStatus("Saving product details…");
    try {
        let imageUrl = existingImageUrl;
        if (imageFile) {
            const imageDataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error("Could not read the selected product photo."));
                reader.readAsDataURL(imageFile);
            });
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) throw new Error("Your sign-in has expired. Sign in again and retry.");
            const response = await fetch(`${apiBase}/merchant/product-images`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`
                },
                body: JSON.stringify({ imageDataUrl })
            });
            const result = await readMerchantApiResponse(response);
            if (!response.ok || !result.imageUrl) {
                throw new Error(result.error || "The product photo could not be uploaded.");
            }
            imageUrl = result.imageUrl;
        }
        const productFields = {
            name: productName,
            category: productCategoryInput.value.trim().toUpperCase(),
            uom: document.querySelector("#merchant-product-unit").value,
            price,
            discountPercent,
            gstPercent,
            weightGrams,
            quantity: avlbStk,
            avlbStk,
            area: document.querySelector("#merchant-product-area").value.trim().toLowerCase(),
            village: document.querySelector("#merchant-product-village").value.trim().toLowerCase(),
            imageUrl
        };
        await saveMerchantProduct(productFields, editingProductId);
        const wasEditing = Boolean(editingProductId);
        resetProductForm();
        const refreshed = await loadProducts();
        const successMessage = wasEditing
            ? "Product updated in your catalog."
            : "Product photo, price, discount, and GST rate added to your catalog.";
        showProductStatus(refreshed
            ? successMessage
            : "Product was saved, but the catalog could not refresh. Use Refresh catalog to try again.",
            refreshed ? "" : "error");
    } catch (error) {
        console.error("Could not save the merchant product listing.", error);
        const message = error.message || "Could not save the product listing. Check the local merchant API and try again.";
        showProductStatus(message, "error");
    } finally {
        submitButton.disabled = false;
    }
});

merchantList.addEventListener("click", event => {
    const button = event.target.closest("[data-product-id]");
    if (!button) return;
    const selectedProduct = merchantProducts.find(({ id }) => id === button.dataset.productId);
    if (selectedProduct) editProduct(selectedProduct);
});

document.querySelector("#merchant-product-cancel").addEventListener("click", () => {
    resetProductForm();
    showStatus("Product update cancelled.");
});

document.querySelector("#refresh-merchant-products").addEventListener("click", loadProducts);
signOutButton.addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("merchant-login.html");
});

profileRecoveryForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!profileRecoveryForm.reportValidity()) return;
    const user = auth.currentUser;
    if (!user) {
        profileRecoveryStatus.textContent = "Your sign-in has expired. Sign in again before restoring the profile.";
        profileRecoveryStatus.className = "merchant-portal-status error";
        return;
    }
    profileRecoverySubmit.disabled = true;
    profileRecoveryStatus.textContent = "Verifying your Merchant ID and restoring the profile…";
    profileRecoveryStatus.className = "merchant-portal-status";
    try {
        await submitMerchantProfileRecovery(user, {
            merchantId: document.querySelector("#recovery-merchant-id").value.trim(),
            fullName: document.querySelector("#recovery-full-name").value.trim(),
            shopName: document.querySelector("#recovery-shop-name").value.trim(),
            phoneNo: document.querySelector("#recovery-phone").value.trim(),
            shopCategory: document.querySelector("#recovery-shop-category").value,
            state: document.querySelector("#recovery-state").value.trim(),
            gstNumber: document.querySelector("#recovery-gstin").value.trim().toUpperCase()
        });
        profileRecoveryStatus.textContent = "Merchant profile restored. Reloading your portal…";
        profileRecoveryStatus.className = "merchant-portal-status success";
        window.location.reload();
    } catch (error) {
        console.error("Could not restore the merchant profile from entered registration details.", error);
        profileRecoveryStatus.textContent = error instanceof TypeError && /fetch/i.test(error.message)
            ? `Could not reach the merchant API at ${apiBase}. Confirm the Render API is deployed and its /healthz endpoint responds, then try again.`
            : error.message || "Merchant profile recovery failed. Try again or contact merchant support.";
        profileRecoveryStatus.className = "merchant-portal-status error";
        profileRecoverySubmit.disabled = false;
    }
});

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.replace("merchant-login.html");
        return;
    }
    let profileRecoveryAttempted = false;
    try {
        let merchantSnapshot = await getDoc(doc(db, "merchantAccounts", user.uid));
        const savedMerchant = findSavedMerchantProfile(user);
        if (!merchantSnapshot.exists()) {
            if (savedMerchant) {
                profileRecoveryAttempted = true;
                await recoverMerchantProfile(user, savedMerchant);
                merchantSnapshot = await getDoc(doc(db, "merchantAccounts", user.uid));
            }
        }
        if (!merchantSnapshot.exists()) {
            disableCatalogSubmission("No merchant profile was found for this sign-in. Use the recovery form below with the details from your registration PDF.");
            merchantList.innerHTML = '<p class="merchant-product-empty">Your merchant profile is missing, so the catalog cannot be loaded yet.</p>';
            profileRecoveryEmail.textContent = user.email || "Unavailable";
            profileRecoverySection.hidden = false;
            return;
        }

        merchantAccount = merchantSnapshot.data();
        if (!merchantAccount.merchantId && savedMerchant?.merchantId) {
            profileRecoveryAttempted = true;
            await recoverMerchantProfile(user, savedMerchant);
            merchantAccount.merchantId = savedMerchant.merchantId.trim();
        }
        currentMerchant = { uid: user.uid, merchantId: merchantAccount.merchantId };
        if (!currentMerchant.merchantId) {
            disableCatalogSubmission("Your merchant profile needs a Merchant ID. Use the recovery form below and enter the details from your registration PDF.");
            merchantList.innerHTML = '<p class="merchant-product-empty">Your Merchant ID is missing, so the catalog cannot be loaded yet.</p>';
            profileRecoveryEmail.textContent = user.email || "Unavailable";
            document.querySelector("#recovery-full-name").value = merchantAccount.fullName || "";
            document.querySelector("#recovery-shop-name").value = merchantAccount.shopName || "";
            document.querySelector("#recovery-phone").value = merchantAccount.phoneNo || "";
            document.querySelector("#recovery-shop-category").value = merchantAccount.shopCategory || "";
            document.querySelector("#recovery-state").value = merchantAccount.state || "";
            document.querySelector("#recovery-gstin").value = merchantAccount.gstNumber || "";
            profileRecoverySection.hidden = false;
            return;
        }
        document.querySelector("#merchant-welcome-name").textContent = merchantAccount.fullName || "Merchant";
        document.querySelector("#merchant-gstin").textContent = merchantAccount.gstNumber || "Not provided";
        document.querySelector("#merchant-proprietor-name").textContent = merchantAccount.fullName || "Merchant";
        document.querySelector("#merchant-shop-name").textContent = merchantAccount.shopName || merchantAccount.fullName || "Not provided";
        document.querySelector("#merchant-phone").textContent = merchantAccount.phoneNo || "Not provided";
        document.querySelector("#merchant-shop-category").textContent = merchantAccount.shopCategory || "Not provided";
        document.querySelector("#merchant-bank-account").textContent = merchantAccount.bankAccountNumber || "Not provided";
        document.querySelector("#merchant-ifsc-code").textContent = merchantAccount.ifscCode || "Not provided";
        document.querySelector("#merchant-upi-link").textContent = merchantAccount.upiLink || "Not provided";
        let shopPhoto = merchantAccount.shopPhotoDataUrl || localStorage.getItem(`tribesMerchantShopPhoto:${user.uid}`);
        if (!shopPhoto) {
            try {
                const localMerchants = JSON.parse(localStorage.getItem("tribesMerchants") || "[]");
                if (Array.isArray(localMerchants)) {
                    shopPhoto = localMerchants.find(merchant => merchant.merchantId === merchantAccount.merchantId)?.shopPhotoDataUrl;
                }
            } catch (error) {
                console.warn("Could not read the optional local shop photo.", error);
            }
        }
        if (shopPhoto) {
            setShopPhotoBackground(shopPhoto);
        }
        const initialLoads = await Promise.allSettled([
            loadMerchantOrders(),
            loadProducts()
        ]);
        initialLoads.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(index === 0
                    ? "Initial merchant order loading failed."
                    : "Initial merchant catalog loading failed.", result.reason);
            }
        });
        window.setInterval(loadMerchantOrders, 15000);
    } catch (error) {
        console.error("Could not load the authenticated merchant profile.", error);
        profileRecoverySection.hidden = false;
        profileRecoveryEmail.textContent = user.email || "Unavailable";
        showStatus(profileRecoveryAttempted
            ? error.message || "Merchant profile recovery failed. Contact merchant support."
            : "Your merchant profile could not be loaded. Check Firebase permissions and try again.", "error");
        merchantList.innerHTML = '<p class="merchant-product-empty">Your catalog could not be loaded.</p>';
    }
});
