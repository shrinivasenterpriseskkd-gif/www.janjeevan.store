import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const apiBase = (window.TRIBES_API_BASE_URL || "").replace(/\/$/, "");
const form = document.querySelector("#advertisement-registration-form");
const imageInput = document.querySelector("#advertisement-registration-image");
const imagePreview = document.querySelector("#advertisement-registration-preview");
const status = document.querySelector("#advertisement-registration-status");
const submitButton = document.querySelector("#advertisement-registration-submit");
const totalLabel = document.querySelector("#advertisement-registration-total");
const planPrices = { 1: 200, 3: 500, 6: 800 };
let merchant;
let previewUrl;

const showStatus = (message, type = "") => {
    status.textContent = message;
    status.className = `merchant-portal-status ${type}`.trim();
};

const fileToDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected advertisement image."));
    reader.readAsDataURL(file);
});

const updatePlan = () => {
    const months = Number(form.querySelector('[name="advertisement-months"]:checked').value);
    const price = planPrices[months];
    const saving = months * 200 - price;
    totalLabel.textContent = `Total: ₹${price} for ${months} month${months === 1 ? "" : "s"}${saving ? ` — you save ₹${saving}` : ""}.`;
    submitButton.textContent = `Pay ₹${price} & submit advertisement`;
};

form.querySelectorAll('[name="advertisement-months"]').forEach(input => input.addEventListener("change", updatePlan));
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    imagePreview.src = previewUrl;
    imagePreview.hidden = false;
    showStatus("");
});

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.replace("merchant-login.html");
        return;
    }
    try {
        const snapshot = await getDoc(doc(db, "merchantAccounts", user.uid));
        if (!snapshot.exists()) throw new Error("Sign in with a registered merchant account to submit an advertisement.");
        merchant = { uid: user.uid, ...snapshot.data() };
    } catch (error) {
        console.error("Could not verify the signed-in merchant for ad registration.", error);
        showStatus(error.message || "Could not load your merchant account. Sign in again and retry.", "error");
    }
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!merchant) {
        showStatus("A signed-in merchant account is required. Sign in and try again.", "error");
        return;
    }
    const file = imageInput.files?.[0];
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size >= 5 * 1024 * 1024) {
        showStatus("Choose a JPG, PNG, or WebP image smaller than 5 MB.", "error");
        return;
    }
    if (typeof window.Razorpay !== "function") {
        showStatus("Secure payment checkout is unavailable. Refresh the page and try again.", "error");
        return;
    }

    const months = Number(form.querySelector('[name="advertisement-months"]:checked').value);
    const advertisement = {
        months,
        title: document.querySelector("#advertisement-registration-title").value.trim(),
        description: document.querySelector("#advertisement-registration-description").value.trim(),
        linkUrl: document.querySelector("#advertisement-registration-link").value.trim()
    };
    submitButton.disabled = true;
    showStatus("Creating your secure advertisement checkout…");
    try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("Your sign-in has expired. Sign in again and retry.");
        const orderResponse = await fetch(`${apiBase}/api/merchant/advertisements/order`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ advertisement })
        });
        const order = await orderResponse.json();
        if (!orderResponse.ok) throw new Error(order.error || "Could not create advertisement checkout.");
        if (order.amount !== planPrices[months] * 100 || order.currency !== "INR") {
            throw new Error("The checkout total did not match your selected plan. No payment was started.");
        }
        await new Promise((resolve, reject) => {
            const checkout = new window.Razorpay({
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: "Janjeevan.store",
                description: `Storefront advertisement · ${months} month${months === 1 ? "" : "s"}`,
                order_id: order.orderId,
                prefill: { name: merchant.fullName, email: merchant.email, contact: merchant.phoneNo },
                theme: { color: "#ef6b3f" },
                config: {
                    display: {
                        blocks: {
                            upiApps: {
                                name: "Google Pay / PhonePe",
                                instruments: [{ method: "upi", flows: ["intent"] }]
                            }
                        },
                        sequence: ["block.upiApps"],
                        preferences: { show_default_blocks: true }
                    }
                },
                modal: { ondismiss: () => reject(new Error("Payment was cancelled. Your advertisement was not submitted.")) },
                handler: async payment => {
                    try {
                        showStatus("Payment received. Submitting your advertisement for Admin review…");
                        const paymentResponse = await fetch(`${apiBase}/api/payments/verify`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                            body: JSON.stringify({
                                ...payment,
                                advertisementImageDataUrl: await fileToDataUrl(file)
                            })
                        });
                        const result = await paymentResponse.json();
                        if (!paymentResponse.ok || !result.verified || !result.advertisementSubmitted) {
                            throw new Error(result.error || "Payment was received, but the advertisement submission could not be confirmed. Contact support with your payment ID.");
                        }
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }
            });
            checkout.on("payment.failed", failure =>
                reject(new Error(failure.error?.description || "Advertisement payment failed.")));
            checkout.open();
        });
        form.reset();
        imagePreview.hidden = true;
        imagePreview.removeAttribute("src");
        updatePlan();
        showStatus("Payment successful. Your advertisement is awaiting Admin approval; the campaign starts once approved.", "success");
    } catch (error) {
        console.error("Could not submit the paid merchant advertisement.", error);
        showStatus(error.message || "Could not submit your advertisement. Check your connection and try again.", "error");
    } finally {
        submitButton.disabled = false;
    }
});

updatePlan();
