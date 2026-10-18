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
    response.json({
      itemSubtotal: 0,
      postalCharge: 0,
      total: 0,
      totalWeightGrams: 0
    });
  });

  router.post("/orders", async (request, response) => {
    try {
      const user = await requireFirebaseUser(request);
      if (!razorpay) return response.status(503).json({ error: "Razorpay is not configured. Add keys to .env." });
      let customerSnapshot = await firebaseAdminDb.collection("customerAccounts").doc(user.uid).get();
      const body = request.body || {};
      const deliveryState = String(body.deliveryState || "Local").trim();
      let customer = customerSnapshot.exists ? customerSnapshot.data() : null;
      if (!customer) {
        customer = {
          role: "customer",
          name: String(body.customerName || user.email?.split("@")[0] || "Customer"),
          mobile: String(body.customerMobile || "9876543210"),
          email: user.email || body.customerEmail || "",
          state: deliveryState,
          createdAt: FieldValue.serverTimestamp()
        };
        try {
          await firebaseAdminDb.collection("customerAccounts").doc(user.uid).set(customer);
        } catch (setErr) {
          console.warn("Could not save customer profile in background:", setErr);
        }
      }
      const customerName = String(body.customerName || customer.name || "Customer").trim();
      const customerMobile = String(body.customerMobile || customer.mobile || "").trim();
      const customerEmail = String(body.customerEmail || customer.email || user.email || "").trim();
      const deliveryMethod = "delivery_partner";
      const paymentMethod = String(body.paymentMethod || "razorpay");
      const location = body.customerLocation;
      if (!location || !Number.isFinite(Number(location.latitude)) ||
        !Number.isFinite(Number(location.longitude)) || Math.abs(Number(location.latitude)) > 90 ||
        Math.abs(Number(location.longitude)) > 180) {
        return response.status(400).json({ error: "A valid delivery location is required for Delivery Partner service." });
      }
      const { items, itemSubtotal, totalWeightGrams } = await loadCheckoutItems(body.items);
      const postalCharge = 0;
      const amount = itemSubtotal;
      if (amount < 100) return response.status(400).json({ error: "Order amount must be at least INR 1." });

      const order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: `tribes_${Date.now()}`,
        notes: {
          itemCount: String(items.length),
          customerUid: user.uid,
          deliveryMethod,
          paymentMethod,
          customerName,
          customerMobile
        }
      });
      await firebaseAdminDb.collection("pendingCheckouts").doc(order.id).set({
        customerUid: user.uid,
        customerName,
        customerMobile,
        customerEmail,
        items,
        amount: order.amount,
        itemSubtotal,
        postalCharge: 0,
        totalWeightGrams,
        deliveryState,
        deliveryMethod,
        paymentMethod,
        postalAddress: "",
        postalPincode: "",
        customerLocation: {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracy: Math.max(0, Math.round(Number(location.accuracy) || 0)),
          updatedAt: new Date().toISOString()
        },
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
