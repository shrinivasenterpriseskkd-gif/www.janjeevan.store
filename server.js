import "dotenv/config";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Razorpay from "razorpay";
const app = express();
const port = process.env.PORT || 5500;
const root = path.dirname(fileURLToPath(import.meta.url));
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;

if (!razorpay) console.warn("Razorpay keys are missing. Add them to .env before checkout.");
app.use(express.json());
app.use(express.static(root));

app.post("/api/orders", async (request, response) => {
  try {
    if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
    const items = Array.isArray(request.body.items) ? request.body.items : [];
    if (!items.length) return response.status(400).json({ error: "Cart is empty." });
    const amount = Number(request.body.amount);
    if (!Number.isInteger(amount) || amount < 100) return response.status(400).json({ error: "Order amount must be at least INR 1." });
    const order = await razorpay.orders.create({ amount, currency: "INR", receipt: `tribes_${Date.now()}`, notes: { itemCount: String(items.length) } });
    response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) { console.error(error); response.status(500).json({ error: "Unable to create payment order." }); }
});

app.post("/api/merchant-registration-order", async (request, response) => {
  try {
    if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
    const merchantId = String(request.body.merchantId || "").trim();
    if (!merchantId) return response.status(400).json({ error: "Merchant ID is required." });
    const order = await razorpay.orders.create({ amount: 100, currency: "INR", receipt: `tribes_donation_${Date.now()}`, notes: { purpose: "merchant_registration_donation", merchantId } });
    response.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) { console.error(error); response.status(500).json({ error: "Unable to create donation order." }); }
});

app.post("/api/payments/verify", (request, response) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = request.body;
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  if (!signature || Buffer.byteLength(expected) !== Buffer.byteLength(signature) || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return response.status(400).json({ verified: false });
  response.json({ verified: true });
});

app.listen(port, () => console.log(`TRIBES running at http://localhost:${port}`));