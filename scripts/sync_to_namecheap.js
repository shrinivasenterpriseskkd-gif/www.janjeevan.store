import 'dotenv/config';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

async function syncAllToNamecheap() {
  const syncUrl = process.env.NAMECHEAP_SYNC_URL;
  const apiKey = process.env.NAMECHEAP_SYNC_KEY;

  if (!syncUrl || !apiKey) {
    console.error('Error: NAMECHEAP_SYNC_URL and NAMECHEAP_SYNC_KEY must be set in .env');
    process.exit(1);
  }

  const serviceAccountPath = './adminsdk-fbsvc.json';
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error('Service account file not found: ' + serviceAccountPath);
  }

  const cred = cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')));
  const app = initializeApp({ credential: cred, projectId: 'janjeevanstore' }, 'sync-runner');
  const db = getFirestore(app);

  const postSync = async (action, payload) => {
    try {
      const res = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey
        },
        body: JSON.stringify({ action, ...payload })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn(`[FAILED] ${action}: HTTP ${res.status}`, data);
        return false;
      }
      console.log(`[SUCCESS] ${action}:`, data);
      return true;
    } catch (err) {
      console.warn(`[ERROR] ${action}:`, err.message);
      return false;
    }
  };

  console.log(`Starting Namecheap data synchronization to ${syncUrl}...`);

  // 1. Merchants
  console.log('\n--- Syncing Merchants ---');
  const mSnap = await db.collection('merchantAccounts').get();
  for (const doc of mSnap.docs) {
    const m = doc.data();
    await postSync('sync_merchant', {
      merchant: {
        merchantId: m.merchantId || `Janjeevan.store-${doc.id.slice(0, 6).toUpperCase()}`,
        userId: doc.id,
        shopName: m.shopName || m.fullName || 'Merchant Shop',
        fullName: m.fullName || 'Merchant',
        email: m.email,
        phoneNo: m.phoneNo,
        gstNumber: m.gstNumber || null,
        panNumber: m.panNumber || null,
        aadharNumber: m.aadharNumber || null,
        shopCategory: m.shopCategory || 'General Store',
        state: m.state || 'Maharashtra',
        language: m.language || 'English',
        address: m.address || null,
        bankAccountNumber: m.bankAccountNumber || null,
        ifscCode: m.ifscCode || null,
        upiLink: m.upiLink || null,
        shopPhotoUrl: m.shopPhotoDataUrl || m.shopPhotoUrl || null,
        registrationOrderId: m.registrationOrderId || null,
        registrationPaymentId: m.registrationPaymentId || null
      }
    });
  }

  // 2. Products
  console.log('\n--- Syncing Products ---');
  const pSnap = await db.collection('products').get();
  for (const doc of pSnap.docs) {
    const p = doc.data();
    await postSync('sync_product', {
      product: {
        id: doc.id,
        merchantId: p.merchantId || 'Janjeevan.store-4EUME8',
        name: p.name,
        category: p.category,
        description: p.description || null,
        uom: p.uom || 'piece',
        price: Number(p.price) || 0,
        sellingPrice: p.sellingPrice != null ? Number(p.sellingPrice) : null,
        discountPercent: Number(p.discountPercent) || 0,
        gstPercent: Number(p.gstPercent) || 0,
        stock: Number(p.avlbStk ?? p.quantity ?? 0),
        sku: p.sku || null,
        size: p.size || null,
        brand: p.brand || null,
        packCount: p.packCount != null ? Number(p.packCount) : 1,
        color: p.color || null,
        careInstructions: p.careInstructions || null,
        barcode: p.barcode || null,
        weightGrams: p.weightGrams != null ? Number(p.weightGrams) : null,
        area: p.area || null,
        village: p.village || null,
        imageUrl: p.imageUrl || ''
      }
    });
  }

  // 3. Orders
  console.log('\n--- Syncing Orders ---');
  const oSnap = await db.collection('orders').get();
  for (const doc of oSnap.docs) {
    const o = doc.data();
    await postSync('sync_order', {
      order: {
        orderId: o.orderId || doc.id,
        paymentId: o.paymentId,
        userId: o.customerUid || 'guest_user',
        merchantId: (o.merchantIds && o.merchantIds[0]) ? o.merchantIds[0] : null,
        customerName: o.customerName || 'Customer',
        customerMobile: o.customerMobile || '0000000000',
        deliveryState: o.deliveryState || 'Andhra Pradesh',
        deliveryMethod: o.deliveryMethod || 'delivery_partner',
        postalAddress: o.postalAddress || null,
        postalPincode: o.postalPincode || null,
        itemSubtotal: Number(o.itemSubtotal) || 0,
        postalCharge: Number(o.postalCharge) || 0,
        totalAmount: Number(o.amount) || 0,
        totalWeightGrams: o.totalWeightGrams != null ? Number(o.totalWeightGrams) : null,
        paymentMethod: o.paymentMethod || 'razorpay',
        status: o.status || 'Awaiting pickup',
        items: o.items || []
      }
    });
  }

  console.log('\nSynchronization run complete.');
}

syncAllToNamecheap().catch(console.error);
