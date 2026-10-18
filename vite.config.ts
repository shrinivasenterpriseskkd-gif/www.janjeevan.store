import { resolve } from 'path';
import { defineConfig } from 'vite';

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export default defineConfig({
  plugins: [
    {
      name: 'api-routes',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/advertisements' || req.url?.startsWith('/api/advertisements?')) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify({ advertisements: [] }));
            return;
          }
          if (req.url === '/api/orders' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const items = Array.isArray(body?.items) ? body.items : [];
            const orderId = `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
            const orderAmount = Number(body?.amount) || (items.length * 100) || 100;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              orderId,
              amount: orderAmount,
              currency: 'INR',
              keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_janjeevan',
              itemSubtotal: orderAmount,
              postalCharge: 0
            }));
            return;
          }
          if (req.url === '/api/payments/verify' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const orderId = body?.razorpay_order_id || body?.orderId || `order_${Date.now().toString(36)}`;
            const paymentId = body?.razorpay_payment_id || body?.paymentId || `pay_${Date.now().toString(36)}`;
            const paymentMethod = body?.paymentMethod || 'upi';
            const totalAmount = body?.amount || 0;
            const autoMerchantPayout = {
              status: 'AUTO_TRANSFERRED',
              payoutId: `payout_${orderId}_m1`,
              amount: totalAmount,
              currency: 'INR',
              settlementMethod: 'BANK_UPI_DIRECT',
              target: 'Registered Merchant Verified Account',
              transferredAt: new Date().toISOString(),
              note: 'Auto payout executed immediately upon customer payment receipt'
            };
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              verified: true,
              orderId,
              paymentId,
              assignedPartnerId: 'DP-ARAKU-01',
              deliveryMethod: 'delivery_partner',
              paymentMethod,
              autoMerchantPayout,
              receipt: {
                orderId,
                paymentId,
                storeName: 'Janjeevan.store',
                customerName: body?.customerName || 'Customer',
                customerMobile: body?.customerMobile || '',
                customerLoginId: body?.customerEmail || '',
                deliveryMethod: 'Local Delivery Partner',
                paymentMethod,
                items: body?.items || [],
                itemSubtotal: totalAmount,
                postalCharge: 0,
                amount: totalAmount,
                autoMerchantPayout,
                createdAt: new Date().toISOString()
              }
            }));
            return;
          }
          next();
        });
      },
    },
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cart: resolve(__dirname, 'cart.html'),
        customerLogin: resolve(__dirname, 'customer-login.html'),
        customerPortal: resolve(__dirname, 'customer-portal.html'),
        customerRegistration: resolve(__dirname, 'customer-registration.html'),
        merchantLogin: resolve(__dirname, 'merchant-login.html'),
        merchantPortal: resolve(__dirname, 'merchant-portal.html'),
        merchantRegistration: resolve(__dirname, 'merchant-registration.html'),
        advertisementRegistration: resolve(__dirname, 'advertisement-registration.html'),
        deliveryPartnerOrders: resolve(__dirname, 'delivery-partner-orders.html'),
        deliveryPartnerLogin: resolve(__dirname, 'Delivery Partner-login.html'),
        deliveryPartnerRegistration: resolve(__dirname, 'Delivery Partner-registration.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        adminLogin: resolve(__dirname, 'admin/login.html'),
      },
    },
  },
  esbuild: {
    supported: {
      'top-level-await': true,
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
