# TRIBES GitHub + Firebase Starter

## Local checkout setup

1. Copy `.env.example` to `.env`.
2. Add your Razorpay **Test** API key ID and secret to `.env`.
3. Run `npm start` and open `http://localhost:5500/cart.html`.
4. Use Razorpay test payment details while testing. Never commit `.env` or production secrets.

## Free GitHub Pages hosting

1. Create or open a GitHub repository and upload this project.
2. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Push to `master` or `main`; `.github/workflows/pages.yml` deploys the static storefront automatically.
4. Your free URL will be `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

GitHub Pages cannot run the Node/Razorpay server. Deploy `server.js` separately, then put its public HTTPS URL in `js/api-config.js` as `window.TRIBES_API_BASE_URL`. Leave it empty for a static catalog without checkout payments.

The checkout uses `/api/orders` to create an order and `/api/payments/verify` to verify the payment signature. Before production, validate cart prices and quantities against a trusted server-side catalog and add webhook handling for final payment status.
1. Create Firebase project, Firestore and Storage.
2. Put Firebase Web App configuration in js/firebase-config.js.
3. Configure Authentication and Firebase Security Rules before production.
4. Upload this folder to GitHub and enable GitHub Pages.
5. Connect your owned www.tribes.com domain in GitHub Pages.
6. Razorpay secret keys must NEVER be placed in frontend/GitHub. Use a secure backend (Cloud Functions/Cloud Run/server) to create Razorpay orders and verify signatures/webhooks.
Fields: Product Name, UOM, Quantity, AVLB Stk, Price, Image URL.
