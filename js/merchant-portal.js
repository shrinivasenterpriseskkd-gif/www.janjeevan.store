import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth, db } from "./firebase-config.js";

const apiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");
const merchantList = document.querySelector("#merchant-product-list");
const catalogStatus = document.querySelector("#merchant-catalog-status");
const productForm = document.querySelector("#merchant-product-form");
const productStatus = document.querySelector("#merchant-product-status");
const imageInput = document.querySelector("#merchant-product-image");
const imagePreview = document.querySelector("#merchant-product-preview");
const submitButton = document.querySelector("#merchant-product-submit");
const productCategoryInput = document.querySelector("#merchant-product-category");
const bulkProductForm = document.querySelector("#merchant-bulk-product-form");
const bulkWorkbookInput = document.querySelector("#merchant-bulk-workbook");
const bulkImagesInput = document.querySelector("#merchant-bulk-images");
const bulkSubmitButton = document.querySelector("#merchant-bulk-submit");
const bulkStatus = document.querySelector("#merchant-bulk-status");
const signOutButton = document.querySelector("#merchant-sign-out");
const shopPhotoForm = document.querySelector("#merchant-shop-photo-form");
const shopPhotoInput = document.querySelector("#merchant-shop-photo-input");
const shopPhotoImage = document.querySelector("#merchant-shop-photo");
const shopPhotoEmpty = document.querySelector("#merchant-shop-photo-empty");
const shopPhotoStatus = document.querySelector("#merchant-shop-photo-status");
const shopPhotoSaveButton = document.querySelector("#merchant-shop-photo-save");
const gstinForm = document.querySelector("#merchant-gstin-form");
const gstinInput = document.querySelector("#merchant-gstin-input");
const gstinStatus = document.querySelector("#merchant-gstin-status");
const gstinSaveButton = document.querySelector("#merchant-gstin-save");
const paymentDetailsForm = document.querySelector("#merchant-payment-details-form");
const bankAccountInput = document.querySelector("#merchant-bank-account-input");
const ifscCodeInput = document.querySelector("#merchant-ifsc-code-input");
const upiLinkInput = document.querySelector("#merchant-upi-link-input");
const paymentDetailsStatus = document.querySelector("#merchant-payment-details-status");
const paymentDetailsSaveButton = document.querySelector("#merchant-payment-details-save");
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
const fileToDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The selected product photo could not be read."));
    reader.readAsDataURL(file);
});
const workbookColumns = [
    "Product Name",
    "Category",
    "Unit",
    "Price",
    "Discount Percent",
    "GST Percent",
    "Available Stock",
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
            ["Select the image files with the matching names from the Image Filename column."],
            ["Accepted image types: JPG, PNG, WebP; each file must be smaller than 5 MB."],
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
                Area: product.area || "",
                "Village / Town": product.village || "",
                "Image URL": product.imageUrl || ""
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

const uploadProductImage = async file => {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Your sign-in has expired. Sign in again and retry.");
    const uploadResponse = await fetch(`${apiBase}/api/merchant/product-images`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ imageDataUrl: await fileToDataUrl(file) })
    });
    const uploadResult = await uploadResponse.json();
    if (!uploadResponse.ok || !uploadResult.imageUrl) {
        throw new Error(uploadResult.error || "Cloudflare R2 could not save the product photo.");
    }
    return uploadResult.imageUrl;
};

const parseProductWorkbook = async (workbookFile, imageFiles) => {
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

    const imageMap = new Map();
    for (const file of imageFiles) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size >= 5 * 1024 * 1024) {
            throw new Error(`${file.name} is not a supported image smaller than 5 MB. Use JPG, PNG, or WebP images.`);
        }
        const key = file.name.trim().toLocaleLowerCase();
        if (imageMap.has(key)) throw new Error(`More than one selected image is named "${file.name}". Rename files so each name is unique.`);
        imageMap.set(key, file);
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
        const image = imageMap.get(imageFilename.toLocaleLowerCase());
        const priceValue = value("Price");
        const discountValue = value("Discount Percent");
        const gstValue = value("GST Percent");
        const stockValue = value("Available Stock");
        const price = Number(priceValue);
        const discountPercent = discountValue == null || discountValue === "" ? 0 : Number(discountValue);
        const gstPercent = gstValue == null || gstValue === "" ? 0 : Number(gstValue);
        const avlbStk = Number(stockValue);
        const rowErrors = [];

        if (!name || name.length > 120) rowErrors.push("Product Name is required (max 120 characters)");
        if (!category || category.length > 80) rowErrors.push("Category is required (max 80 characters)");
        if (!uom || uom.length > 40) rowErrors.push("Unit is required");
        if (priceValue == null || priceValue === "" || !Number.isFinite(price) || price < 0) rowErrors.push("Price must be a non-negative number");
        if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) rowErrors.push("Discount Percent must be a whole number from 0 to 100");
        if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 100) rowErrors.push("GST Percent must be from 0 to 100");
        if (stockValue == null || stockValue === "" || !Number.isInteger(avlbStk) || avlbStk < 0) rowErrors.push("Available Stock must be a non-negative whole number");
        if (!area || area.length > 100) rowErrors.push("Area is required (max 100 characters)");
        if (!village || village.length > 100) rowErrors.push("Village / Town is required (max 100 characters)");
        if (!imageFilename || !image) rowErrors.push(`No selected image matches "${imageFilename || "(empty)"}"`);

        if (rowErrors.length) {
            errors.push(`Row ${rowNumber}: ${rowErrors.join("; ")}`);
            continue;
        }
        products.push({
            rowNumber,
            image,
            product: {
                name,
                category,
                uom,
                price,
                discountPercent,
                gstPercent,
                quantity: avlbStk,
                avlbStk,
                area,
                village
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
    const imageFiles = Array.from(bulkImagesInput.files || []);
    if (!workbookFile || !imageFiles.length) {
        bulkStatus.textContent = "Select a workbook and the matching product image files.";
        bulkStatus.className = "merchant-portal-status error";
        return;
    }
    bulkSubmitButton.disabled = true;
    bulkStatus.textContent = "Checking workbook rows and matching image filenames…";
    bulkStatus.className = "merchant-portal-status";

    let products;
    try {
        products = await parseProductWorkbook(workbookFile, imageFiles);
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
        for (const [index, { rowNumber, image, product }] of products.entries()) {
            bulkStatus.textContent = `Importing product ${index + 1} of ${products.length} (workbook row ${rowNumber})…`;
            try {
                const imageUrl = await uploadProductImage(image);
                await addDoc(collection(db, "products"), {
                    ownerUid: currentMerchant.uid,
                    merchantId: merchantAccount.merchantId,
                    merchantName: merchantAccount.fullName || "",
                    ...product,
                    imageUrl,
                    createdAt: serverTimestamp()
                });
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
        bulkStatus.textContent = `${imported} product${imported === 1 ? "" : "s"} imported. Import stopped at workbook row ${failedRow.rowNumber}: ${errorCode === "permission-denied"
            ? "Firestore denied the product save. The project's firestore.rules must allow the category field."
            : failedRow.error?.message || "Image upload or product save failed."} Select an edited workbook containing only the products that were not imported to retry.`;
        bulkStatus.className = "merchant-portal-status error";
        return;
    }

    bulkStatus.textContent = `${imported} product${imported === 1 ? "" : "s"} imported successfully with their category and image.`;
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
let shopPhotoPreviewUrl;
let editingProductId = null;

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
            <p class="merchant-product-price-detail">Status: ${escapeHtml(order.status || "Unassigned")}</p>
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
        const response = await fetch(`${apiBase}/api/merchant/orders${includeLegacy}`, {
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
        return;
    }

    merchantList.innerHTML = merchantProducts.map(({ id, product }) => {
        const discount = Number(product.discountPercent) || 0;
        const gstPercent = Number(product.gstPercent) || 0;
        return `<article class="merchant-product-card">
            <img class="merchant-product-card-image" src="${escapeHtml(product.imageUrl || "")}" alt="${escapeHtml(product.name || "Product")}">
            <div class="merchant-product-card-content">
                <h3>${escapeHtml(product.name || "Untitled product")}</h3>
                <p>Category: ${escapeHtml(product.category || "Uncategorized")}</p>
                <p>${escapeHtml(product.area || "Area not set")} · ${escapeHtml(product.village || "Village not set")}</p>
                <p class="merchant-product-sale-price">${money(effectivePrice(product.price, discount))}<span> / ${escapeHtml(product.uom || "unit")}</span></p>
                <p class="merchant-product-price-detail">Price: ${money(product.price)} · Discount: ${discount}% · GST: ${formatPercent(gstPercent)}%</p>
                <button class="secondary-btn merchant-product-save" type="button" data-product-id="${escapeHtml(id)}">Edit product</button>
            </div>
        </article>`;
    }).join("");
};

const resetProductForm = () => {
    editingProductId = null;
    productForm.reset();
    imageInput.required = true;
    productCategoryInput.required = true;
    imagePreview.hidden = true;
    imagePreview.removeAttribute("src");
    document.querySelector("#merchant-product-image-help").textContent = "Choose a JPG, PNG, or WebP image up to 5 MB.";
    document.querySelector("#merchant-add-product-heading").textContent = "Add a product";
    submitButton.textContent = "Upload product";
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
    document.querySelector("#merchant-product-area").value = product.area || "";
    document.querySelector("#merchant-product-village").value = product.village || "";
    imageInput.value = "";
    imageInput.required = false;
    imagePreview.src = product.imageUrl || "";
    imagePreview.hidden = !product.imageUrl;
    document.querySelector("#merchant-product-image-help").textContent = "Optional: choose a new JPG, PNG, or WebP image up to 5 MB to replace the current photo.";
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
        const productsCollection = collection(db, "products");
        const productQueries = [
            getDocs(query(productsCollection, where("ownerUid", "==", currentMerchant.uid)))
        ];
        if (currentMerchant.merchantId) {
            productQueries.push(getDocs(query(productsCollection, where("merchantId", "==", currentMerchant.merchantId))));
        }
        const productSnapshots = await Promise.all(productQueries);
        const productDocuments = new Map([
            ...productSnapshots.flatMap(snapshot => snapshot.docs)
        ].map(productDocument => [productDocument.id, productDocument]));
        merchantProducts = [...productDocuments.values()].map(productDocument => ({
            id: productDocument.id,
            product: productDocument.data()
        }));
        renderProducts();
        showStatus(`${merchantProducts.length} product${merchantProducts.length === 1 ? "" : "s"} in your catalog.`);
        return true;
    } catch (error) {
        console.error("Could not load this merchant's product catalog.", error);
        merchantList.innerHTML = '<p class="merchant-product-empty">Your catalog could not be loaded. Check your Firebase permissions and try again.</p>';
        const errorCode = String(error?.code || "");
        showStatus(errorCode === "permission-denied"
            ? "Firestore denied the catalog read. Publish firestore.rules for this Firebase project, then refresh the catalog."
            : `Catalog loading failed${errorCode ? ` (${errorCode})` : ""}. Check the browser console and try again.`,
        "error");
        return false;
    }
};

imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) {
        imagePreview.hidden = true;
        imagePreview.removeAttribute("src");
        return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size >= 5 * 1024 * 1024) {
        imageInput.value = "";
        imagePreview.hidden = true;
        showStatus("Choose a JPG, PNG, or WebP image smaller than 5 MB.", "error");
        return;
    }

    imagePreview.src = URL.createObjectURL(file);
    imagePreview.hidden = false;
    showStatus("");
});

const compressShopPhoto = async file => {
    const image = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 900 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Unable to prepare the shop photo for display.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.78);
    } finally {
        image.close();
    }
};

shopPhotoInput.addEventListener("change", () => {
    const file = shopPhotoInput.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size >= 5 * 1024 * 1024) {
        shopPhotoInput.value = "";
        shopPhotoStatus.textContent = "Choose a JPG, PNG, or WebP shop photo smaller than 5 MB.";
        return;
    }
    if (shopPhotoPreviewUrl) URL.revokeObjectURL(shopPhotoPreviewUrl);
    shopPhotoPreviewUrl = URL.createObjectURL(file);
    shopPhotoImage.src = shopPhotoPreviewUrl;
    shopPhotoImage.hidden = false;
    shopPhotoEmpty.hidden = true;
    shopPhotoStatus.textContent = "";
});

gstinInput.addEventListener("input", () => {
    gstinInput.value = gstinInput.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15);
});

gstinForm.addEventListener("submit", async event => {
    event.preventDefault();
    const gstNumber = gstinInput.value.trim().toUpperCase();
    if (!gstinForm.reportValidity()) return;
    if (!merchantAccount) {
        gstinStatus.textContent = "No saved merchant registration was found in this browser.";
        return;
    }

    gstinSaveButton.disabled = true;
    try {
        await updateDoc(doc(db, "merchantAccounts", currentMerchant.uid), { gstNumber });
        merchantAccount.gstNumber = gstNumber;
        document.querySelector("#merchant-gstin").textContent = gstNumber || "Not provided";
        gstinStatus.textContent = "GSTIN updated.";
    } catch (error) {
        console.error("Could not update the merchant GSTIN.", error);
        gstinStatus.textContent = error.code === "permission-denied"
            ? "Firestore denied the profile update. Publish the project's firestore.rules and try again."
            : error.message || "Could not update GSTIN. Check your connection and try again.";
    } finally {
        gstinSaveButton.disabled = false;
    }
});

ifscCodeInput.addEventListener("input", () => {
    ifscCodeInput.value = ifscCodeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 11);
});

paymentDetailsForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!paymentDetailsForm.reportValidity()) return;
    if (!merchantAccount) {
        paymentDetailsStatus.textContent = "No saved merchant registration was found in this browser.";
        return;
    }

    const bankAccountNumber = bankAccountInput.value.trim();
    const ifscCode = ifscCodeInput.value.trim().toUpperCase();
    const upiLink = upiLinkInput.value.trim();
    if (upiLink) {
        let parsedUpiLink;
        try {
            parsedUpiLink = new URL(upiLink);
        } catch {
            paymentDetailsStatus.textContent = "Enter a valid https:// or upi:// payment link.";
            return;
        }
        if (!["https:", "upi:"].includes(parsedUpiLink.protocol) || !parsedUpiLink.hostname) {
            paymentDetailsStatus.textContent = "Enter a valid https:// or upi:// payment link.";
            return;
        }
    }

    paymentDetailsSaveButton.disabled = true;
    try {
        await updateDoc(doc(db, "merchantAccounts", currentMerchant.uid), {
            bankAccountNumber,
            ifscCode,
            upiLink
        });
        merchantAccount.bankAccountNumber = bankAccountNumber;
        merchantAccount.ifscCode = ifscCode;
        merchantAccount.upiLink = upiLink;
        document.querySelector("#merchant-bank-account").textContent = bankAccountNumber || "Not provided";
        document.querySelector("#merchant-ifsc-code").textContent = ifscCode || "Not provided";
        document.querySelector("#merchant-upi-link").textContent = upiLink || "Not provided";
        paymentDetailsStatus.textContent = "Payment details updated.";
    } catch (error) {
        console.error("Could not update the merchant payment details.", error);
        paymentDetailsStatus.textContent = error.code === "permission-denied"
            ? "Firestore denied the profile update. Publish the project's firestore.rules and try again."
            : error.message || "Could not update payment details. Check your connection and try again.";
    } finally {
        paymentDetailsSaveButton.disabled = false;
    }
});

shopPhotoForm.addEventListener("submit", async event => {
    event.preventDefault();
    const file = shopPhotoInput.files?.[0];
    if (!file) {
        shopPhotoStatus.textContent = "Choose a shop photo first.";
        return;
    }
    if (!merchantAccount) {
        shopPhotoStatus.textContent = "No saved merchant registration was found in this browser.";
        return;
    }
    shopPhotoSaveButton.disabled = true;
    try {
        merchantAccount.shopPhotoDataUrl = await compressShopPhoto(file);
        localStorage.setItem(`tribesMerchantShopPhoto:${currentMerchant.uid}`, merchantAccount.shopPhotoDataUrl);
        if (shopPhotoPreviewUrl) URL.revokeObjectURL(shopPhotoPreviewUrl);
        shopPhotoPreviewUrl = undefined;
        shopPhotoImage.src = merchantAccount.shopPhotoDataUrl;
        shopPhotoImage.hidden = false;
        shopPhotoEmpty.hidden = true;
        shopPhotoForm.reset();
        shopPhotoStatus.textContent = "Shop photo saved and will appear when you sign in again.";
    } catch (error) {
        console.error("Could not save the merchant shop photo.", error);
        shopPhotoStatus.textContent = error.message || "Could not save the shop photo. Check browser storage and try again.";
    } finally {
        shopPhotoSaveButton.disabled = false;
    }
});

productForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentMerchant?.merchantId || !merchantAccount) {
        showProductStatus("Product upload is unavailable because this signed-in account has no merchant profile and Merchant ID in Firestore. Contact comtribes@gmail.com to restore the merchant profile.", "error");
        return;
    }
    if (!productForm.reportValidity()) return;

    const file = imageInput.files?.[0];
    if (!editingProductId && !file) {
        showProductStatus("Choose a product photo before uploading.", "error");
        return;
    }
    const price = Number(document.querySelector("#merchant-product-price").value);
    const discountPercent = Number(document.querySelector("#merchant-product-discount").value);
    const gstPercent = Number(document.querySelector("#merchant-product-gst").value);
    const avlbStk = Number(document.querySelector("#merchant-product-stock").value);
    const productName = document.querySelector("#merchant-product-name").value.trim();
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

    submitButton.disabled = true;
    showProductStatus(file ? "Uploading your product photo and saving the listing…" : "Saving your product changes…");
    let saveStage = "product listing";
    try {
        const existingProduct = editingProductId
            ? merchantProducts.find(({ id }) => id === editingProductId)?.product
            : null;
        let imageUrl = existingProduct?.imageUrl || "";
        if (file) {
            saveStage = "product photo";
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) throw new Error("Your sign-in has expired. Sign in again and retry.");
            const uploadResponse = await fetch(`${apiBase}/api/merchant/product-images`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`
                },
                body: JSON.stringify({ imageDataUrl: await fileToDataUrl(file) })
            });
            const uploadResult = await uploadResponse.json();
            if (!uploadResponse.ok) {
                throw new Error(uploadResult.error || "Cloudflare R2 could not save the product photo.");
            }
            imageUrl = uploadResult.imageUrl;
        }
        saveStage = "product listing";
        const productFields = {
            name: productName,
            category: productCategoryInput.value.trim(),
            uom: document.querySelector("#merchant-product-unit").value,
            price,
            discountPercent,
            gstPercent,
            quantity: avlbStk,
            avlbStk,
            area: document.querySelector("#merchant-product-area").value.trim(),
            village: document.querySelector("#merchant-product-village").value.trim(),
            imageUrl
        };
        if (editingProductId) {
            await updateDoc(doc(db, "products", editingProductId), productFields);
        } else {
            await addDoc(collection(db, "products"), {
                ownerUid: currentMerchant.uid,
                merchantId: merchantAccount.merchantId,
                merchantName: merchantAccount.fullName || "",
                ...productFields,
                createdAt: serverTimestamp()
            });
        }
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
        console.error(`Could not save the merchant ${saveStage}.`, error);
        const errorCode = String(error?.code || "");
        const message = errorCode === "permission-denied"
            ? `Firebase Firestore denied the product ${editingProductId ? "update" : "listing"}. Verify the products collection permissions.`
            : error.message || `Could not save the ${saveStage}${errorCode ? ` (${errorCode})` : ""}. Check the browser console and try again.`;
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

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.replace("merchant-login.html");
        return;
    }

    try {
        const merchantSnapshot = await getDoc(doc(db, "merchantAccounts", user.uid));
        if (!merchantSnapshot.exists()) {
            disableCatalogSubmission("Your sign-in succeeded, but this account has no merchant profile saved in Firestore. Product uploads are disabled until the merchant profile and Merchant ID are restored. Contact comtribes@gmail.com.");
            merchantList.innerHTML = '<p class="merchant-product-empty">Your merchant profile is missing, so the catalog cannot be loaded yet.</p>';
            return;
        }

        merchantAccount = merchantSnapshot.data();
        currentMerchant = { uid: user.uid, merchantId: merchantAccount.merchantId };
        if (!currentMerchant.merchantId) {
            disableCatalogSubmission("This merchant profile has no Merchant ID. Product uploads are disabled until the profile is corrected. Contact comtribes@gmail.com.");
            merchantList.innerHTML = '<p class="merchant-product-empty">Your Merchant ID is missing, so the catalog cannot be loaded yet.</p>';
            return;
        }
        document.querySelector("#merchant-welcome-name").textContent = merchantAccount.fullName || "Merchant";
        document.querySelector("#merchant-gstin").textContent = merchantAccount.gstNumber || "Not provided";
        document.querySelector("#merchant-proprietor-name").textContent = merchantAccount.fullName || "Merchant";
        document.querySelector("#merchant-phone").textContent = merchantAccount.phoneNo || "Not provided";
        document.querySelector("#merchant-shop-category").textContent = merchantAccount.shopCategory || "Not provided";
        gstinInput.value = merchantAccount.gstNumber || "";
        bankAccountInput.value = merchantAccount.bankAccountNumber || "";
        ifscCodeInput.value = merchantAccount.ifscCode || "";
        upiLinkInput.value = merchantAccount.upiLink || "";
        document.querySelector("#merchant-bank-account").textContent = merchantAccount.bankAccountNumber || "Not provided";
        document.querySelector("#merchant-ifsc-code").textContent = merchantAccount.ifscCode || "Not provided";
        document.querySelector("#merchant-upi-link").textContent = merchantAccount.upiLink || "Not provided";
        let shopPhoto = localStorage.getItem(`tribesMerchantShopPhoto:${user.uid}`);
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
            shopPhotoImage.src = shopPhoto;
            shopPhotoImage.hidden = false;
            shopPhotoEmpty.hidden = true;
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
        showStatus("Your merchant profile could not be loaded. Check Firebase permissions and try again.", "error");
        merchantList.innerHTML = '<p class="merchant-product-empty">Your catalog could not be loaded.</p>';
    }
});
