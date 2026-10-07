import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth, db } from "./firebase-config.js";
import { getCurrentLocation } from "./order-tracking.js";

const apiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");
const ids = JSON.parse(localStorage.getItem("tribesCart") || "[]");
const cart = document.querySelector("#cart");
const payButton = document.querySelector("#pay");
const status = document.querySelector("#status");
const deliveryState = document.querySelector("#delivery-state");
const shareLocationButton = document.querySelector("#share-customer-location");
const customerLocationStatus = document.querySelector("#customer-location-status");
let currentCustomer;
let currentUser;
let products = [];
let customerLocation = null;

const money = value => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
}).format(value || 0);
const effectivePrice = product => Math.round((Number(product.price) || 0) * (1 - Math.min(100, Math.max(0, Number(product.discountPercent) || 0)) / 100) * 100) / 100;

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
}[char]));

async function loadCart() {
    try {
        const snapshot = await getDocs(collection(db, "products"));
        const productMap = new Map(snapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
        products = ids.map(id => productMap.get(id)).filter(Boolean);
        const total = products.reduce((sum, product) => sum + effectivePrice(product), 0);
        document.querySelector("#cart-count").textContent = `${products.length} item${products.length === 1 ? "" : "s"}`;
        document.querySelector("#cart-total").textContent = money(total);
        cart.innerHTML = products.length
            ? products.map(product => {const discount=Math.min(100,Math.max(0,Number(product.discountPercent)||0));return `<article class="cart-item"><div class="cart-image"><img src="${escapeHtml(product.imageUrl || "https://via.placeholder.com/200x200?text=Janjeevan.store")}" alt="${escapeHtml(product.name)}"></div><div><h2>${escapeHtml(product.name || "Product")}</h2><p>${escapeHtml(product.uom || "Unit")} · ${product.avlbStk ?? 0} available</p></div><strong>${money(effectivePrice(product))}${discount?`<small class="cart-original-price"><s>${money(product.price)}</s> · ${discount}% off</small>`:""}</strong></article>`}).join("")
            : "<div class=\"cart-empty\"><h2>Your cart is empty</h2><p>Explore the collection to find something you love.</p><a class=\"hero-button\" href=\"index.html\">Browse products <span>→</span></a></div>";
        payButton.disabled = !products.length;
    } catch (error) {
        const permissionDenied = error?.code === "permission-denied";
        cart.innerHTML = `<div class="cart-empty"><h2>Cart unavailable</h2><p>${permissionDenied ? "Firestore rules are blocking product reads. Publish the project rules, then reload this page." : "We could not load your products. Please try again."}</p></div>`;
        payButton.disabled = true;
        console.error(error);
    }
}

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
    if (!customerLocation) {
        customerLocationStatus.textContent = "Share your delivery location before placing this order.";
        shareLocationButton.focus();
        return;
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
                items: Array.from(products.reduce((quantities, product) =>
                    quantities.set(product.id, (quantities.get(product.id) || 0) + 1), new Map()),
                ([id, quantity]) => ({ id, quantity })),
                deliveryState: deliveryState.value,
                customerLocation
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
                    localStorage.removeItem("tribesCart");
                    status.textContent = result.assignedPartnerId
                        ? "Payment successful. Your order was assigned to a Delivery Partner."
                        : "Payment successful. No Delivery Partner is registered in this state yet; your order needs assignment.";
                    payButton.textContent = "Order complete";
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
    if (!user) return;
    try {
        const profile = await getDoc(doc(db, "customerAccounts", user.uid));
        if (profile.exists()) currentCustomer = profile.data();
    } catch (error) {
        console.error("Could not load the signed-in customer profile for checkout.", error);
        status.textContent = "Customer profile could not be loaded. Sign in again and retry.";
    }
});

loadCart();
