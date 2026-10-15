import { Router } from "express";

export const createCheckoutRouter = ({
  requireFirebaseUser,
  firebaseAdminDb,
  razorpay,
  FieldValue,
  loadCheckoutItems,
  calculatePostalCharge,
  razorpayKeyId
}) => {
  const router = Router();

  router.post("/postal/quote", async (request, response) => {
    try {
      const user = await requireFirebaseUser(request);
      const customerSnapshot = await firebaseAdminDb.collection("customerAccounts").doc(user.uid).get();
      if (!customerSnapshot.exists) return response.status(403).json({ error: "A customer account is required to check out." });
      const deliveryState = String(request.body?.deliveryState || "").trim();
      if (!deliveryState) return response.status(400).json({ error: "Choose a delivery state to calculate postage." });
      const { items, itemSubtotal, totalWeightGrams } = await loadCheckoutItems(request.body?.items);
      if (items.some(item => !item.weightGrams)) {
        return response.status(400).json({ error: "Add a packed shipping weight to every cart product before using India Post." });
      }
      const postalCharge = calculatePostalCharge(totalWeightGrams, deliveryState);
      response.json({
        itemSubtotal: itemSubtotal / 100,
        postalCharge: postalCharge / 100,
        total: (itemSubtotal + postalCharge) / 100,
        totalWeightGrams
      });
    } catch (error) {
      if (error.status) return response.status(error.status).json({ error: error.message });
      console.error("Could not calculate India Post Retail Parcel charges.", error);
      response.status(503).json({ error: "India Post postage could not be calculated. Try again or contact support." });
    }
  });

  router.post("/orders", async (request, response) => {
    try {
      const user = await requireFirebaseUser(request);
      if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
      const customerSnapshot = await firebaseAdminDb.collection("customerAccounts").doc(user.uid).get();
      if (!customerSnapshot.exists) return response.status(403).json({ error: "A customer account is required to check out." });
      const customer = customerSnapshot.data();
      const body = request.body || {};
      const deliveryState = String(body.deliveryState || "").trim();
      const deliveryMethod = String(body.deliveryMethod || "");
      const paymentMethod = String(body.paymentMethod || "");
      const location = body.customerLocation;
      const postalAddress = String(body.postalAddress || "").trim();
      const postalPincode = String(body.postalPincode || "").trim();
      if (!deliveryState || !["delivery_partner", "india_post"].includes(deliveryMethod) ||
        !["phonepe", "googlepay", "razorpay"].includes(paymentMethod)) {
        return response.status(400).json({ error: "Choose a valid delivery and payment method." });
      }
      if (deliveryMethod === "delivery_partner" && (!location || !Number.isFinite(Number(location.latitude)) ||
        !Number.isFinite(Number(location.longitude)) || Math.abs(Number(location.latitude)) > 90 ||
        Math.abs(Number(location.longitude)) > 180)) {
        return response.status(400).json({ error: "A delivery area and valid delivery location are required for Delivery Partner service." });
      }
      if (deliveryMethod === "india_post" && (!postalAddress || postalAddress.length > 500 || !/^[1-9][0-9]{5}$/.test(postalPincode))) {
        return response.status(400).json({ error: "Enter a postal address and a valid 6-digit Indian PIN code." });
      }
      const { items, itemSubtotal, totalWeightGrams } = await loadCheckoutItems(body.items);
      if (deliveryMethod === "india_post" && items.some(item => !item.weightGrams)) {
        return response.status(400).json({ error: "Add a packed shipping weight to every cart product before using India Post." });
      }
      const postalCharge = deliveryMethod === "india_post"
        ? calculatePostalCharge(totalWeightGrams, deliveryState)
        : 0;
      const amount = itemSubtotal + postalCharge;
      if (amount < 100) return response.status(400).json({ error: "Order amount must be at least INR 1." });

      const order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: `tribes_${Date.now()}`,
        notes: {
          itemCount: String(items.length),
          customerUid: user.uid,
          deliveryMethod,
          paymentMethod
        }
      });
      await firebaseAdminDb.collection("pendingCheckouts").doc(order.id).set({
        customerUid: user.uid,
        customerName: String(customer.name || ""),
        customerMobile: String(customer.mobile || ""),
        items,
        amount: order.amount,
        itemSubtotal,
        postalCharge,
        totalWeightGrams,
        deliveryState,
        deliveryMethod,
        paymentMethod,
        postalAddress: deliveryMethod === "india_post" ? postalAddress : "",
        postalPincode: deliveryMethod === "india_post" ? postalPincode : "",
        customerLocation: deliveryMethod === "delivery_partner" ? {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracy: Math.max(0, Math.round(Number(location.accuracy) || 0)),
          updatedAt: new Date().toISOString()
        } : null,
        createdAt: FieldValue.serverTimestamp()
      });
      response.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: typeof razorpayKeyId === "function" ? razorpayKeyId() : razorpayKeyId,
        itemSubtotal: itemSubtotal / 100,
        postalCharge: postalCharge / 100
      });
    } catch (error) {
      console.error("Unable to create authenticated checkout.", error);
      response.status(error.status || 503).json({ error: error.status ? error.message : "Firebase or Razorpay checkout is unavailable." });
    }
  });

  return router;
};
