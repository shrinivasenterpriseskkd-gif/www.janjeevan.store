import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth, db } from "./firebase-config.js";
import { getCurrentLocation } from "./order-tracking.js";

const apiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");
let ids = JSON.parse(localStorage.getItem("tribesCart") || "[]");
const cart = document.querySelector("#cart");
const payButton = document.querySelector("#pay");
const status = document.querySelector("#status");
const checkoutCustomerStatus = document.querySelector("#checkout-customer-status");
const checkoutCustomerSignIn = document.querySelector("#checkout-customer-sign-in");
const deliveryState = document.querySelector("#delivery-state");
const postalAddressFields = document.querySelector("#postal-address-fields");
const postalAddress = document.querySelector("#postal-address");
const postalPincode = document.querySelector("#postal-pincode");
const postalChargeLabel = document.querySelector("#postal-charge");
const deliveryLocationField = document.querySelector("#delivery-location-field");
const cartSubtotal = document.querySelector("#cart-subtotal");
const cartPostalCharge = document.querySelector("#cart-postal-charge");
const paymentReceipt = document.querySelector("#payment-receipt");
const paymentReceiptContent = document.querySelector("#payment-receipt-content");
const shareLocationButton = document.querySelector("#share-customer-location");
const customerLocationStatus = document.querySelector("#customer-location-status");
const deliveryMethodInputs = [...document.querySelectorAll('input[name="delivery-method"]')];
let currentCustomer;
let currentUser;
let products = [];
let customerLocation = null;
let postalQuote = null;
let quoteRequestId = 0;

const money = value => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
}).format(value || 0);
const effectivePrice = product => Math.round((Number(product.price) || 0) * (1 - Math.min(100, Math.max(0, Number(product.discountPercent) || 0)) / 100) * 100) / 100;
const selectedDeliveryMethod = () => deliveryMethodInputs.find(input => input.checked)?.value || "delivery_partner";
const requestedItems = () => Array.from(products.reduce((quantities, product) =>
    quantities.set(product.id, (quantities.get(product.id) || 0) + 1), new Map()),
    ([id, quantity]) => ({ id, quantity }));

function updateTotals(itemSubtotal) {
    const postalDelivery = selectedDeliveryMethod() === "india_post";
    cartSubtotal.textContent = money(itemSubtotal);
    cartPostalCharge.textContent = postalDelivery && postalQuote ? money(postalQuote.postalCharge) : postalDelivery ? "—" : money(0);
    document.querySelector("#cart-total").textContent = postalDelivery && !postalQuote
        ? "Calculate postage"
        : money(itemSubtotal + (postalDelivery ? Number(postalQuote?.postalCharge) || 0 : 0));
}

async function refreshPostalQuote() {
    const requestId = ++quoteRequestId;
    const itemSubtotal = products.reduce((sum, product) => sum + effectivePrice(product), 0);
    if (selectedDeliveryMethod() !== "india_post") {
        postalQuote = null;
        updateTotals(itemSubtotal);
        return;
    }
    postalQuote = null;
    updateTotals(itemSubtotal);
    if (!currentUser || !deliveryState.value || !products.length) {
        postalChargeLabel.textContent = "Sign in and choose your delivery state to calculate postage.";
        return;
    }
    if (!apiBase) {
        postalChargeLabel.textContent = "Postal postage needs the deployed checkout server.";
        return;
    }

    postalChargeLabel.textContent = "Calculating India Post postage…";
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${apiBase}/api/postal/quote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ items: requestedItems(), deliveryState: deliveryState.value })
        });
        const quote = await response.json();
        if (!response.ok) throw new Error(quote.error || "Postal charges could not be calculated.");
        if (requestId !== quoteRequestId) return;
        postalQuote = quote;
        postalChargeLabel.textContent = `India Post Retail Parcel · ${quote.totalWeightGrams} g packed weight`;
        cartPostalCharge.textContent = money(quote.postalCharge);
        updateTotals(Number(quote.itemSubtotal));
    } catch (error) {
        if (requestId !== quoteRequestId) return;
        postalChargeLabel.textContent = error.message;
        cartPostalCharge.textContent = "Unavailable";
        document.querySelector("#cart-total").textContent = "Unavailable";
    }
}

function updateDeliveryFields() {
    const postalDelivery = selectedDeliveryMethod() === "india_post";
    postalAddressFields.hidden = !postalDelivery;
    postalAddress.required = postalDelivery;
    postalPincode.required = postalDelivery;
    deliveryLocationField.hidden = postalDelivery;
    shareLocationButton.disabled = postalDelivery;
    refreshPostalQuote();
}

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[char]));

function updateCheckoutCustomerIdentity() {
    const customerName = String(currentCustomer?.name || "").trim();
    const loginId = String(currentUser?.email || "").trim();
    if (!currentUser) {
        checkoutCustomerStatus.textContent = "Customer sign-in is required to place this order.";
        checkoutCustomerSignIn.hidden = false;
    } else if (!currentCustomer) {
        checkoutCustomerStatus.textContent = "A customer account is required to place this order.";
        checkoutCustomerSignIn.hidden = true;
    } else {
        checkoutCustomerStatus.textContent = `Customer: ${customerName || loginId} · Login ID: ${loginId || "Not available"}`;
        checkoutCustomerSignIn.hidden = true;
    }
    payButton.disabled = !products.length || !currentUser || !currentCustomer || (!customerName && !loginId);
}

function renderPaymentReceipt(receipt) {
    const receiptDate = receipt.createdAt ? new Date(receipt.createdAt) : new Date();
    const deliveryLabel = receipt.deliveryMethod === "india_post" ? "India Post" : "Delivery Partner";
    const itemRows = (Array.isArray(receipt.items) ? receipt.items : []).map(item => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.price) || 0;
        const discount = Number(item.discountPercent) || 0;
        return `<tr>
            <td><strong>${escapeHtml(item.name || "Product")}</strong><small>${quantity} × ${money(unitPrice)}${discount ? ` · ${discount}% off` : ""}</small></td>
            <td>${money(quantity * unitPrice)}</td>
        </tr>`;
    }).join("");
    paymentReceiptContent.innerHTML = `
        <p class="payment-receipt-brand">Janjeevan.store</p>
        <div class="payment-receipt-meta">
            <p><span>Order ID</span><strong>${escapeHtml(receipt.orderId)}</strong></p>
            <p><span>Payment ID</span><strong>${escapeHtml(receipt.paymentId)}</strong></p>
            <p><span>Paid on</span><strong>${escapeHtml(Number.isNaN(receiptDate.getTime()) ? "" : receiptDate.toLocaleString("en-IN"))}</strong></p>
            <p><span>Store</span><strong>${escapeHtml(receipt.storeName || "Janjeevan.store")}</strong></p>
            <p><span>Customer</span><strong>${escapeHtml(receipt.customerName)}</strong></p>
            <p><span>Login ID</span><strong>${escapeHtml(receipt.customerLoginId)}</strong></p>
            <p><span>Delivery</span><strong>${deliveryLabel} · ${escapeHtml(receipt.deliveryState)}</strong></p>
            ${receipt.deliveryMethod === "india_post" ? `<p><span>Address</span><strong>${escapeHtml(receipt.postalAddress)} · ${escapeHtml(receipt.postalPincode)}</strong></p>` : ""}
        </div>
        <table class="payment-receipt-items">
            <thead><tr><th>Order items</th><th>Amount</th></tr></thead>
            <tbody>${itemRows}</tbody>
        </table>
        <div class="payment-receipt-totals">
            <p><span>Items</span><strong>${money(receipt.itemSubtotal)}</strong></p>
            <p><span>Postal charge</span><strong>${money(receipt.postalCharge)}</strong></p>
            <p class="payment-receipt-total"><span>Total paid</span><strong>${money(receipt.amount)}</strong></p>
        </div>`;
    paymentReceipt.hidden = false;
    paymentReceipt.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelector("#print-payment-receipt").addEventListener("click", () => window.print());

async function loadCart() {
    try {
        const snapshot = await getDocs(collection(db, "products"));
        const productMap = new Map(snapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
        products = ids.map(id => productMap.get(id)).filter(Boolean);
        const total = products.reduce((sum, product) => sum + effectivePrice(product), 0);
        document.querySelector("#cart-count").textContent = `${products.length} item${products.length === 1 ? "" : "s"}`;
        updateTotals(total);
        cart.innerHTML = products.length
            ? products.map(product => {
                const discount = Math.min(100, Math.max(0, Number(product.discountPercent) || 0));
                return `<article class="cart-item">
                    <div class="cart-image"><img src="${escapeHtml(product.imageUrl || "https://via.placeholder.com/200x200?text=Janjeevan.store")}" alt="${escapeHtml(product.name)}"></div>
                    <div><h2>${escapeHtml(product.name || "Product")}</h2><p>${escapeHtml(product.uom || "Unit")} · ${product.avlbStk ?? 0} available</p></div>
                    <strong>${money(effectivePrice(product))}${discount ? `<small class="cart-original-price"><s>${money(product.price)}</s> · ${discount}% off</small>` : ""}</strong>
                    <button class="cart-remove" type="button" data-remove-product="${escapeHtml(product.id)}" aria-label="Remove ${escapeHtml(product.name || "product")} from cart">Remove</button>
                </article>`;
            }).join("")
            : "<div class=\"cart-empty\"><h2>Your cart is empty</h2><p>Explore the collection to find something you love.</p><a class=\"hero-button\" href=\"index.html\">Browse products <span>→</span></a></div>";
        updateCheckoutCustomerIdentity();
        if (selectedDeliveryMethod() === "india_post") refreshPostalQuote();
    } catch (error) {
        const permissionDenied = error?.code === "permission-denied";
        cart.innerHTML = `<div class="cart-empty"><h2>Cart unavailable</h2><p>${permissionDenied ? "Firestore rules are blocking product reads. Publish the project rules, then reload this page." : "We could not load your products. Please try again."}</p></div>`;
        payButton.disabled = true;
        console.error(error);
    }
}

cart.addEventListener("click", async event => {
    const removeButton = event.target.closest("[data-remove-product]");
    if (!removeButton) return;
    const productId = removeButton.dataset.removeProduct;
    const cartIndex = ids.indexOf(productId);
    if (cartIndex < 0) return;

    const removedProduct = products.find(product => product.id === productId);
    ids.splice(cartIndex, 1);
    try {
        localStorage.setItem("tribesCart", JSON.stringify(ids));
    } catch (error) {
        console.error("Could not update the saved cart.", error);
        status.textContent = "This item could not be removed. Check browser storage and try again.";
        return;
    }
    postalQuote = null;
    status.textContent = `${removedProduct?.name || "Item"} removed from your cart.`;
    await loadCart();
});

deliveryMethodInputs.forEach(input => input.addEventListener("change", updateDeliveryFields));
deliveryState.addEventListener("change", refreshPostalQuote);

shareLocationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
        customerLocationStatus.textContent = "This browser does not support location sharing.";
        return;
    }

    shareLocationButton.disabled = true;
    customerLocationStatus.textContent = "Waiting for location permission...";
    navigator.geolocation.getCurrentPosition(
        position => {
            customerLocation = getCurrentLocation(position);
            customerLocationStatus.textContent = `Delivery location saved (accuracy about ${customerLocation.accuracy} m).`;
            shareLocationButton.textContent = "Update delivery location";
            shareLocationButton.disabled = false;
        },
        error => {
            customerLocationStatus.textContent = error.code === error.PERMISSION_DENIED
                ? "Location permission was denied. Allow location access and try again."
                : "Could not get your location. Check device location settings and try again.";
            shareLocationButton.disabled = false;
            console.error("Could not capture the customer delivery location.", error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
});

payButton.addEventListener("click", async () => {
    if (!products.length) return;
    if (!currentUser || !currentCustomer) {
        status.textContent = "Sign in with a customer account to place your order.";
        window.setTimeout(() => window.location.assign("customer-login.html"), 800);
        return;
    }
    if (!deliveryState.value) {
        deliveryState.reportValidity();
        return;
    }
    const deliveryMethod = selectedDeliveryMethod();
    if (deliveryMethod === "delivery_partner" && !customerLocation) {
        customerLocationStatus.textContent = "Share your delivery location before placing this order.";
        shareLocationButton.focus();
        return;
    }
    if (deliveryMethod === "india_post") {
        if (!postalAddress.reportValidity() || !postalPincode.reportValidity()) return;
        if (!postalQuote) {
            await refreshPostalQuote();
            if (!postalQuote) {
                status.textContent = postalChargeLabel.textContent || "Postal charges could not be calculated.";
                return;
            }
        }
    }

    payButton.disabled = true;
    status.textContent = apiBase ? "Preparing secure checkout..." : "Payments need a deployed checkout server.";
    if (!apiBase) {
        payButton.disabled = false;
        return;
    }

    try {
        const response = await fetch(`${apiBase}/api/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${await currentUser.getIdToken()}`
            },
            body: JSON.stringify({
                items: requestedItems(),
                deliveryState: deliveryState.value,
                deliveryMethod,
                paymentMethod: "razorpay",
                postalAddress: deliveryMethod === "india_post" ? postalAddress.value.trim() : "",
                postalPincode: deliveryMethod === "india_post" ? postalPincode.value.trim() : "",
                customerLocation: deliveryMethod === "delivery_partner" ? customerLocation : null
            })
        });
        const order = await response.json();
        if (!response.ok) throw new Error(order.error || "Could not create order");

        const checkout = new Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency,
            name: "Janjeevan.store",
            description: "Janjeevan.store order",
            order_id: order.orderId,
            prefill: { name: currentCustomer?.name || "", contact: currentCustomer?.mobile || "" },
            theme: { color: "#ef6b3f" },
            handler: async payment => {
                try {
                    status.textContent = "Verifying payment...";
                    const verification = await fetch(`${apiBase}/api/payments/verify`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${await currentUser.getIdToken()}`
                        },
                        body: JSON.stringify(payment)
                    });
                    const result = await verification.json();
                    if (!verification.ok || !result.verified) throw new Error(result.error || "Payment verification failed");
                    if (!result.receipt) throw new Error("Payment was verified, but the receipt could not be loaded. Contact support with your payment ID.");
                    localStorage.removeItem("tribesCart");
                    renderPaymentReceipt(result.receipt);
                    status.textContent = result.deliveryMethod === "india_post"
                        ? "Payment successful. Your order is awaiting India Post dispatch."
                        : result.assignedPartnerId
                            ? "Payment successful. Your order was assigned to a Delivery Partner."
                            : "Payment successful. No Delivery Partner is registered in this state yet; your order needs assignment.";
                    payButton.textContent = "Order complete";
                    payButton.disabled = true;
                } catch (error) {
                    console.error("Could not finalize the paid order.", error);
                    status.textContent = `Payment was successful, but the order could not be saved: ${error.message}`;
                    payButton.disabled = false;
                }
            }
        });

        checkout.on("payment.failed", failure => {
            status.textContent = failure.error?.description || "Payment failed. Please try again.";
            payButton.disabled = false;
        });
        checkout.open();
    } catch (error) {
        status.textContent = error.message;
        payButton.disabled = false;
    }
});

onAuthStateChanged(auth, async user => {
    currentUser = user;
    currentCustomer = null;
    if (!user) {
        updateCheckoutCustomerIdentity();
        return;
    }
    try {
        const profile = await getDoc(doc(db, "customerAccounts", user.uid));
        if (profile.exists()) currentCustomer = profile.data();
    } catch (error) {
        console.error("Could not load the signed-in customer profile for checkout.", error);
        status.textContent = "Customer profile could not be loaded. Sign in again and retry.";
    }
    updateCheckoutCustomerIdentity();
    if (selectedDeliveryMethod() === "india_post") refreshPostalQuote();
});

loadCart();
updateDeliveryFields();
