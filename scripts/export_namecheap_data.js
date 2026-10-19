import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Helper to escape SQL string values
const sqlEscape = (val) => {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isFinite(val) ? val.toString() : 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\0/g, '\\0');
  return `'${str}'`;
};

async function exportData() {
  const serviceAccountPath = './adminsdk-fbsvc.json';
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error('Service account file not found: ' + serviceAccountPath);
  }

  const cred = cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')));
  const app = initializeApp({ credential: cred, projectId: 'janjeevanstore' }, 'export-app');
  const db = getFirestore(app);

  let sql = `-- =====================================================================\n`;
  sql += `-- Janjeevan.store Live Data Export for Namecheap cPanel MySQL\n`;
  sql += `-- Generated on: ${new Date().toISOString()}\n`;
  sql += `-- Character set: utf8mb4\n`;
  sql += `-- =====================================================================\n\n`;
  sql += `SET NAMES utf8mb4;\n`;
  sql += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

  // 1. Merchants
  console.log('Fetching merchants...');
  const mSnap = await db.collection('merchantAccounts').get();
  sql += `-- ---------------------------------------------------------------------\n`;
  sql += `-- Merchants (${mSnap.size} records)\n`;
  sql += `-- ---------------------------------------------------------------------\n`;
  mSnap.forEach(doc => {
    const m = doc.data();
    const merchantId = m.merchantId || `Janjeevan.store-${doc.id.slice(0, 6).toUpperCase()}`;
    const shopName = m.shopName || m.fullName || 'Merchant Shop';
    const ownerName = m.fullName || 'Merchant';
    const email = m.email || `${merchantId.toLowerCase()}@janjeevan.store`;
    const phone = m.phoneNo || '0000000000';
    const gstNumber = m.gstNumber || null;
    const panNumber = m.panNumber || null;
    const aadharNumber = m.aadharNumber || null;
    const shopCategory = m.shopCategory || 'General Store';
    const state = m.state || 'Maharashtra';
    const language = m.language || 'English';
    const address = m.address || null;
    const bankAccountNumber = m.bankAccountNumber || null;
    const ifscCode = m.ifscCode || null;
    const upiLink = m.upiLink || null;
    const shopPhotoUrl = m.shopPhotoDataUrl || m.shopPhotoUrl || null;
    const regOrderId = m.registrationOrderId || null;
    const regPaymentId = m.registrationPaymentId || null;

    sql += `INSERT INTO \`merchants\` (\n`;
    sql += `  \`merchant_id\`, \`user_id\`, \`shop_name\`, \`owner_name\`, \`email\`, \`phone\`,\n`;
    sql += `  \`gst_number\`, \`pan_number\`, \`aadhar_number\`, \`shop_category\`, \`state\`, \`language\`,\n`;
    sql += `  \`address\`, \`bank_account_number\`, \`ifsc_code\`, \`upi_link\`, \`shop_photo_url\`,\n`;
    sql += `  \`registration_order_id\`, \`registration_payment_id\`, \`status\`\n`;
    sql += `) VALUES (\n`;
    sql += `  ${sqlEscape(merchantId)}, ${sqlEscape(doc.id)}, ${sqlEscape(shopName)}, ${sqlEscape(ownerName)}, ${sqlEscape(email)}, ${sqlEscape(phone)},\n`;
    sql += `  ${sqlEscape(gstNumber)}, ${sqlEscape(panNumber)}, ${sqlEscape(aadharNumber)}, ${sqlEscape(shopCategory)}, ${sqlEscape(state)}, ${sqlEscape(language)},\n`;
    sql += `  ${sqlEscape(address)}, ${sqlEscape(bankAccountNumber)}, ${sqlEscape(ifscCode)}, ${sqlEscape(upiLink)}, ${sqlEscape(shopPhotoUrl)},\n`;
    sql += `  ${sqlEscape(regOrderId)}, ${sqlEscape(regPaymentId)}, 'active'\n`;
    sql += `) ON DUPLICATE KEY UPDATE\n`;
    sql += `  \`shop_name\` = VALUES(\`shop_name\`), \`owner_name\` = VALUES(\`owner_name\`),\n`;
    sql += `  \`phone\` = VALUES(\`phone\`), \`updated_at\` = NOW();\n\n`;
  });

  // 2. Products
  console.log('Fetching products...');
  const pSnap = await db.collection('products').get();
  sql += `-- ---------------------------------------------------------------------\n`;
  sql += `-- Products (${pSnap.size} records)\n`;
  sql += `-- ---------------------------------------------------------------------\n`;
  pSnap.forEach(doc => {
    const p = doc.data();
    const productId = doc.id;
    const merchantId = p.merchantId || 'Janjeevan.store-4EUME8';
    const name = p.name || 'Product';
    const category = p.category || 'General';
    const description = p.description || null;
    const uom = p.uom || 'piece';
    const price = Number(p.price) || 0;
    const sellingPrice = p.sellingPrice != null ? Number(p.sellingPrice) : null;
    const discountPercent = Number(p.discountPercent) || 0;
    const gstPercent = Number(p.gstPercent) || 0;
    const stock = Number(p.avlbStk ?? p.quantity ?? 0);
    const sku = p.sku || null;
    const size = p.size || null;
    const brand = p.brand || null;
    const packCount = p.packCount != null ? Number(p.packCount) : 1;
    const color = p.color || null;
    const careInstructions = p.careInstructions || null;
    const barcode = p.barcode || null;
    const weightGrams = p.weightGrams != null ? Number(p.weightGrams) : null;
    const area = p.area || null;
    const village = p.village || null;
    const imageUrl = p.imageUrl || '';

    sql += `INSERT INTO \`products\` (\n`;
    sql += `  \`product_id\`, \`merchant_id\`, \`name\`, \`category\`, \`description\`, \`uom\`,\n`;
    sql += `  \`price\`, \`selling_price\`, \`discount_percent\`, \`gst_percent\`, \`stock\`,\n`;
    sql += `  \`sku\`, \`size\`, \`brand\`, \`pack_count\`, \`color\`, \`care_instructions\`,\n`;
    sql += `  \`barcode\`, \`weight_grams\`, \`area\`, \`village\`, \`image_url\`, \`status\`\n`;
    sql += `) VALUES (\n`;
    sql += `  ${sqlEscape(productId)}, ${sqlEscape(merchantId)}, ${sqlEscape(name)}, ${sqlEscape(category)}, ${sqlEscape(description)}, ${sqlEscape(uom)},\n`;
    sql += `  ${price}, ${sqlEscape(sellingPrice)}, ${discountPercent}, ${gstPercent}, ${stock},\n`;
    sql += `  ${sqlEscape(sku)}, ${sqlEscape(size)}, ${sqlEscape(brand)}, ${packCount}, ${sqlEscape(color)}, ${sqlEscape(careInstructions)},\n`;
    sql += `  ${sqlEscape(barcode)}, ${sqlEscape(weightGrams)}, ${sqlEscape(area)}, ${sqlEscape(village)}, ${sqlEscape(imageUrl)}, 'active'\n`;
    sql += `) ON DUPLICATE KEY UPDATE\n`;
    sql += `  \`name\` = VALUES(\`name\`), \`category\` = VALUES(\`category\`), \`price\` = VALUES(\`price\`),\n`;
    sql += `  \`selling_price\` = VALUES(\`selling_price\`), \`stock\` = VALUES(\`stock\`), \`updated_at\` = NOW();\n\n`;
  });

  // 3. Orders, Order Items, Customers, and Transactions
  console.log('Fetching orders...');
  const oSnap = await db.collection('orders').get();
  sql += `-- ---------------------------------------------------------------------\n`;
  sql += `-- Orders & Transactions (${oSnap.size} records)\n`;
  sql += `-- ---------------------------------------------------------------------\n`;
  const customerMap = new Map();

  oSnap.forEach(doc => {
    const o = doc.data();
    const orderId = o.orderId || doc.id;
    const userId = o.customerUid || 'guest_user';
    const customerName = o.customerName || 'Customer';
    const customerMobile = o.customerMobile || '0000000000';
    const deliveryState = o.deliveryState || 'Andhra Pradesh';
    const deliveryMethod = o.deliveryMethod || 'delivery_partner';
    const postalAddress = o.postalAddress || null;
    const postalPincode = o.postalPincode || null;
    const itemSubtotal = Number(o.itemSubtotal) || 0;
    const postalCharge = Number(o.postalCharge) || 0;
    const totalAmount = Number(o.amount) || (itemSubtotal + postalCharge);
    const totalWeightGrams = o.totalWeightGrams != null ? Number(o.totalWeightGrams) : null;
    const paymentMethod = o.paymentMethod || 'razorpay';
    const status = o.status || 'Awaiting pickup';
    const merchantId = (o.merchantIds && o.merchantIds[0]) ? o.merchantIds[0] : null;

    if (!customerMap.has(userId)) {
      customerMap.set(userId, {
        userId,
        name: customerName,
        phone: customerMobile,
        state: deliveryState,
        address: postalAddress,
        pincode: postalPincode
      });
    }

    // Insert Order
    sql += `INSERT INTO \`orders\` (\n`;
    sql += `  \`order_id\`, \`user_id\`, \`merchant_id\`, \`customer_name\`, \`customer_mobile\`,\n`;
    sql += `  \`delivery_state\`, \`delivery_method\`, \`postal_address\`, \`postal_pincode\`,\n`;
    sql += `  \`item_subtotal\`, \`postal_charge\`, \`total_amount\`, \`total_weight_grams\`,\n`;
    sql += `  \`payment_method\`, \`status\`\n`;
    sql += `) VALUES (\n`;
    sql += `  ${sqlEscape(orderId)}, ${sqlEscape(userId)}, ${sqlEscape(merchantId)}, ${sqlEscape(customerName)}, ${sqlEscape(customerMobile)},\n`;
    sql += `  ${sqlEscape(deliveryState)}, ${sqlEscape(deliveryMethod)}, ${sqlEscape(postalAddress)}, ${sqlEscape(postalPincode)},\n`;
    sql += `  ${itemSubtotal}, ${postalCharge}, ${totalAmount}, ${sqlEscape(totalWeightGrams)},\n`;
    sql += `  ${sqlEscape(paymentMethod)}, ${sqlEscape(status)}\n`;
    sql += `) ON DUPLICATE KEY UPDATE \`status\` = VALUES(\`status\`);\n\n`;

    // Insert Order Items
    if (Array.isArray(o.items) && o.items.length) {
      o.items.forEach(item => {
        const pId = item.productId || null;
        const mId = item.merchantId || merchantId;
        const pName = item.name || 'Product';
        const qty = Number(item.quantity) || 1;
        const itemPrice = Number(item.price) || 0;
        const subtotal = qty * itemPrice;
        const sku = item.sku || null;
        const size = item.size || null;
        const color = item.color || null;

        sql += `INSERT INTO \`order_items\` (\n`;
        sql += `  \`order_id\`, \`product_id\`, \`merchant_id\`, \`product_name\`, \`sku\`, \`size\`, \`color\`, \`quantity\`, \`price\`, \`subtotal\`\n`;
        sql += `) VALUES (\n`;
        sql += `  ${sqlEscape(orderId)}, ${sqlEscape(pId)}, ${sqlEscape(mId)}, ${sqlEscape(pName)}, ${sqlEscape(sku)}, ${sqlEscape(size)}, ${sqlEscape(color)}, ${qty}, ${itemPrice}, ${subtotal}\n`;
        sql += `);\n`;
      });
      sql += '\n';
    }

    // Insert Transaction
    if (o.paymentId) {
      sql += `INSERT INTO \`transactions\` (\n`;
      sql += `  \`txn_id\`, \`order_id\`, \`purpose\`, \`payment_mode\`, \`amount\`, \`status\`\n`;
      sql += `) VALUES (\n`;
      sql += `  ${sqlEscape(o.paymentId)}, ${sqlEscape(orderId)}, 'cart_order', ${sqlEscape(paymentMethod)}, ${totalAmount}, 'captured'\n`;
      sql += `) ON DUPLICATE KEY UPDATE \`status\` = 'captured';\n\n`;
    }
  });

  // Prepend Customers before Orders for clean foreign keys
  let userSql = `-- ---------------------------------------------------------------------\n`;
  userSql += `-- Customers (${customerMap.size} records)\n`;
  userSql += `-- ---------------------------------------------------------------------\n`;
  customerMap.forEach(c => {
    userSql += `INSERT INTO \`users\` (\n`;
    userSql += `  \`user_id\`, \`name\`, \`email\`, \`phone\`, \`state\`, \`address\`, \`pincode\`, \`status\`\n`;
    userSql += `) VALUES (\n`;
    userSql += `  ${sqlEscape(c.userId)}, ${sqlEscape(c.name)}, ${sqlEscape(`${c.userId.slice(0, 8)}@customer.janjeevan.store`)}, ${sqlEscape(c.phone)}, ${sqlEscape(c.state)}, ${sqlEscape(c.address)}, ${sqlEscape(c.pincode)}, 'active'\n`;
    userSql += `) ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`phone\` = VALUES(\`phone\`);\n\n`;
  });

  const finalSql = sql.replace('-- Orders & Transactions', userSql + '-- Orders & Transactions') + `\nSET FOREIGN_KEY_CHECKS = 1;\n`;
  
  const outputPath = path.resolve('./namecheap_data_export.sql');
  fs.writeFileSync(outputPath, finalSql, 'utf8');
  console.log(`Successfully exported data to: ${outputPath} (${finalSql.length} bytes)`);
}

exportData().catch(console.error);
