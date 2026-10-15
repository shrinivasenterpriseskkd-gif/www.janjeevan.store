# TRIBES GitHub + Firebase Starter

## Local checkout setup

1. Copy `.env.example` to `.env`.
2. Set a unique `ADMIN_LOGIN_ID` and a strong `ADMIN_PASSWORD` in `.env`; these are server-only credentials and are not committed to the frontend.
3. Set `FIREBASE_PROJECT_ID` and configure Firebase Admin SDK Application Default Credentials for the Node server. Locally, set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account key path outside the repository; in production, use the host's managed identity or workload identity. The server needs Firebase Authentication verification plus Firestore read/write access. Never commit a service-account key.
4. Add your Razorpay **Test** API key ID and secret to `.env`.
5. To enable India Post Retail Parcel checkout, set `INDIA_POST_RETAIL_RATES_JSON` to the current verified pre-GST tariff in INR (first 500 g, each additional 500 g, and GST percent); optional `states` entries override `default` for destination states. Leave it unset to disable postal checkout until rates are configured.
6. Run `npm start` and open `http://localhost:5500/cart.html`.
7. Open `http://localhost:5500/admin/index.html`; unauthenticated requests are sent to the Admin sign-in page.
8. Use Razorpay test payment details while testing. Never commit `.env` or production secrets.

The Admin session is held in an HTTP-only cookie and expires after eight hours. The Express server protects `/admin` and provides Admin sign-in, session, and sign-out endpoints. Host the Admin pages and server on the same origin for server-enforced route protection. GitHub Pages is static hosting and cannot protect the Admin route; do not use it to host a production Admin portal. The API can run locally with the Express server or be deployed as a Firebase HTTPS Function. The production frontend uses the Firebase Function URL from `js/api-config.js`.

Use **Advertisements** in the Admin sidebar to upload a banner, add a headline and optional message/link, and choose whether to publish it immediately or save it as a draft. Published advertisements appear below the storefront hero; remove an advertisement in Admin to take it down.

Enable the Email/Password provider in Firebase Authentication, add each production site hostname to its authorized domains, then publish `firestore.rules` for the `janjeevanstore` project. Customer, Merchant, and Delivery Partner profiles are keyed by Auth UID and readable only by their owner. Paid orders are created by the server after payment-signature verification; customers and their assigned Delivery Partner can read them, and each participant can update only their own live-location field. Product reads remain public; Merchant product writes require an authenticated owner. Product images and Admin-managed advertisement images are stored in Cloudflare R2 and limited to JPG, PNG, and WebP files smaller than 5 MB. Admin advertisements are saved in Firestore; published ads are read from the public `/api/advertisements` endpoint and displayed on the storefront.

## Merchant portal

Customers and Merchants use email/password sign-in; Delivery Partners also receive a generated Delivery Partner ID, but sign in with their registered email. Passwords are handled by Firebase Authentication and reset through Firebase email links. Profile and order data are stored in Firestore under Auth UID ownership. Customer, assigned-partner, and Admin order views sync across devices. The Merchant portal polls the authenticated server API for orders containing that merchant's products, displays merchant-specific item subtotals, and can show in-page and opt-in browser notifications while open. New orders include a merchant ID index; the initial merchant order load also includes legacy orders. Checkout totals are recalculated from Firestore products by the server, and stock is decremented only after verified payment. Precise GPS fields are cleared when an order is delivered; sharing is opt-in. Aadhaar details are used only in the locally generated Delivery Partner registration PDF and are not uploaded to Firebase.

Accounts and orders previously stored only in browser `localStorage` cannot be safely assigned to a Firebase UID, so existing users must register again and old local orders are not imported automatically. The Admin account directory and tracking views now use the server-protected Firebase APIs; passwords are never returned to Admin. Run the app at one stable origin such as `http://localhost:5500` (or the same HTTPS host), not from `file://` URLs.

## Free GitHub Pages hosting

1. Create or open a GitHub repository and upload this project.
2. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Push to `master` or `main`; `.github/workflows/pages.yml` deploys the static storefront automatically.
4. Your free URL will be `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

The storefront market-photo carousel uses photographs from Wikimedia Commons of weekly markets in Araku Valley, Andhra Pradesh. Each photo links to its source and lists its artist and Creative Commons license.

GitHub Pages cannot run the Node/Razorpay server. The backend API is deployed as the `api` HTTPS function in the `janjeevanstore` Firebase project.

## Firebase Functions API deployment

Run `npm install` to synchronize dependencies and the lockfile, install the Firebase CLI, then sign in with an account that has access to the `janjeevanstore` Firebase project. Enable billing plus the Cloud Functions, Cloud Build, Artifact Registry, and Secret Manager APIs. The project default is recorded in `.firebaserc`; `firebase.json` deploys the Express API from the repository root as a Node.js 24 HTTPS Function in `us-central1`.

Set the required secrets without putting their values in Git:

```sh
firebase functions:secrets:set ADMIN_LOGIN_ID
firebase functions:secrets:set ADMIN_PASSWORD
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set INDIA_POST_RETAIL_RATES_JSON
firebase functions:secrets:set CLOUDFLARE_R2_ACCOUNT_ID
firebase functions:secrets:set CLOUDFLARE_R2_ACCESS_KEY_ID
firebase functions:secrets:set CLOUDFLARE_R2_SECRET_ACCESS_KEY
firebase functions:secrets:set CLOUDFLARE_R2_BUCKET_NAME
firebase functions:secrets:set CLOUDFLARE_R2_PUBLIC_URL
```

Use a newly rotated Razorpay key pair from one mode (test or live) and a strong Admin password. If India Post or R2 is not configured yet, set the postal-rates secret to the literal JSON value `null` and each R2 secret to `disabled`; those backend features remain unavailable until real values are configured. Then deploy the API and Firestore rules:

```sh
firebase deploy --only functions:api,firestore:rules
```

The API health check is `https://us-central1-janjeevanstore.cloudfunctions.net/api/healthz`; it must return `{"status":"ok"}` before relying on registration or checkout. Add `www.janjeevan.store` and `janjeevan.store` to Firebase Authentication's authorized domains. GitHub Pages remains the static frontend host; Firebase Functions supplies the server-side Razorpay and Firebase Admin API. The function binds the Admin, Razorpay, postal-rate, and R2 secrets listed above.

The checkout uses `/api/orders` to create a server-priced Razorpay order and `/api/payments/verify` to verify its signature and persist the paid order. PhonePe and Google Pay are UPI-app choices presented through Razorpay Checkout; the selected app is chosen in the Razorpay UPI flow. Postal orders require a packed product weight in grams, a postal address, a 6-digit PIN code, and configured India Post rates. The server calculates postage from the total packed weight in 500 g bands and the destination state's configured tariff, then includes it in the Razorpay amount. Postal parcels are saved as awaiting postal dispatch and are not assigned to a Delivery Partner. Add Razorpay webhook handling and reconciliation before production deployment.

## Local GPS order tracking

Customer and Delivery Partner GPS sharing is opt-in from their order pages. Admins can share the Admin device's GPS as the Merchant pickup point from **Live Tracking**. Active order updates sync through Firestore, with owner/assignment rules restricting access; Admin reads and pickup updates use the server's authenticated session. Sharing stops when the user stops it or an order is delivered. The route graphic is a straight-line preview, not road navigation. Browser geolocation requires permission and a secure context such as `localhost` or HTTPS.

## Firebase deployment checklist

1. Create the Firebase project, Firestore database, and web app; update `js/firebase-config.js` with its web configuration.
2. Enable Email/Password in Firebase Authentication and authorize each deployed frontend hostname.
3. Publish `firestore.rules`.
4. Deploy the Node API as the Firebase HTTPS Function using the Firebase CLI. Its runtime service account must have Firebase Authentication and Firestore access; do not upload a service-account key.
5. Set all function secrets listed in the deployment section above, then deploy `functions:api` and `firestore:rules`.
6. Keep Razorpay secrets, R2 credentials, and Firebase Admin credentials out of frontend files, GitHub, and static hosting.
