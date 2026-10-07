# TRIBES GitHub + Firebase Starter

## Local checkout setup

1. Copy `.env.example` to `.env`.
2. Set a unique `ADMIN_LOGIN_ID` and a strong `ADMIN_PASSWORD` in `.env`; these are server-only credentials and are not committed to the frontend.
3. Set `FIREBASE_PROJECT_ID` and configure Firebase Admin SDK Application Default Credentials for the Node server. Locally, set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account key path outside the repository; in production, use the host's managed identity or workload identity. The server needs Firebase Authentication verification plus Firestore read/write access. Never commit a service-account key.
4. Add your Razorpay **Test** API key ID and secret to `.env`.
5. Run `npm start` and open `http://localhost:5500/cart.html`.
6. Open `http://localhost:5500/admin/index.html`; unauthenticated requests are sent to the Admin sign-in page.
7. Use Razorpay test payment details while testing. Never commit `.env` or production secrets.

The Admin session is held in an HTTP-only cookie and expires after eight hours. The Express server protects `/admin` and provides Admin sign-in, session, and sign-out endpoints. Host the Admin pages and server on the same origin for server-enforced route protection. GitHub Pages is static hosting and cannot protect the Admin route; do not use it to host a production Admin portal. If hosting the frontend separately, set `APP_ALLOWED_ORIGINS` to the exact comma-separated customer/delivery origins and `ADMIN_ALLOWED_ORIGIN` to the exact Admin origin, set `window.TRIBES_API_BASE_URL` in `js/api-config.js` to the backend HTTPS URL, and run the backend with `NODE_ENV=production`.

Enable the Email/Password provider in Firebase Authentication, add each production site hostname to its authorized domains, then publish `firestore.rules` for the `janjeevanstore` project. Customer, Merchant, and Delivery Partner profiles are keyed by Auth UID and readable only by their owner. Paid orders are created by the server after payment-signature verification; customers and their assigned Delivery Partner can read them, and each participant can update only their own live-location field. Product reads remain public; Merchant product writes require an authenticated owner. Product images are stored in Cloudflare R2 and limited to JPG, PNG, and WebP files smaller than 5 MB.

## Merchant portal

Customers and Merchants use email/password sign-in; Delivery Partners also receive a generated Delivery Partner ID, but sign in with their registered email. Passwords are handled by Firebase Authentication and reset through Firebase email links. Profile and order data are stored in Firestore under Auth UID ownership. Customer, assigned-partner, and Admin order views sync across devices. Checkout totals are recalculated from Firestore products by the server, and stock is decremented only after verified payment. Precise GPS fields are cleared when an order is delivered; sharing is opt-in. Aadhaar details are used only in the locally generated Delivery Partner registration PDF and are not uploaded to Firebase.

Accounts and orders previously stored only in browser `localStorage` cannot be safely assigned to a Firebase UID, so existing users must register again and old local orders are not imported automatically. The Admin account directory and tracking views now use the server-protected Firebase APIs; passwords are never returned to Admin. Run the app at one stable origin such as `http://localhost:5500` (or the same HTTPS host), not from `file://` URLs.

## Free GitHub Pages hosting

1. Create or open a GitHub repository and upload this project.
2. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Push to `master` or `main`; `.github/workflows/pages.yml` deploys the static storefront automatically.
4. Your free URL will be `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

The storefront market-photo carousel uses photographs from Wikimedia Commons of weekly markets in Araku Valley, Andhra Pradesh. Each photo links to its source and lists its artist and Creative Commons license.

GitHub Pages cannot run the Node/Razorpay server. The frontend uses `https://api.janjeevan.store` for its backend; merchant registration, checkout, Admin, and Delivery Partner APIs require that service to be deployed.

## Backend deployment with Render

`render.yaml` defines the Node API service. Create a Render Blueprint from this repository and set the prompted `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET` values privately in Render. Use a newly rotated Razorpay key pair from one mode (test or live) and a new, strong Admin password. Never put credentials in GitHub, frontend files, or chat.

After the service is healthy at `/healthz`, add `api.janjeevan.store` as a custom domain on the Render service and create the DNS record Render provides. Keep `www.janjeevan.store` pointed at GitHub Pages. Add `www.janjeevan.store` to Firebase Authentication's authorized domains and publish `firestore.rules` for `janjeevanstore`. Product photos require a Cloudflare R2 bucket and the `CLOUDFLARE_R2_*` environment variables; add these privately in Render before enabling image uploads. The Render free plan may sleep when idle; use an always-on plan for production checkout and Admin availability.

The checkout uses `/api/orders` to create a server-priced Razorpay order and `/api/payments/verify` to verify its signature and persist the paid order. Add Razorpay webhook handling and reconciliation before production deployment.

## Local GPS order tracking

Customer and Delivery Partner GPS sharing is opt-in from their order pages. Admins can share the Admin device's GPS as the Merchant pickup point from **Live Tracking**. Active order updates sync through Firestore, with owner/assignment rules restricting access; Admin reads and pickup updates use the server's authenticated session. Sharing stops when the user stops it or an order is delivered. The route graphic is a straight-line preview, not road navigation. Browser geolocation requires permission and a secure context such as `localhost` or HTTPS.

## Firebase deployment checklist

1. Create the Firebase project, Firestore database, and web app; update `js/firebase-config.js` with its web configuration.
2. Enable Email/Password in Firebase Authentication and authorize each deployed frontend hostname.
3. Publish `firestore.rules`.
4. Give the Node server Firebase Admin credentials through Application Default Credentials with Firestore access; keep the credential file outside the repository.
5. Create and configure Cloudflare R2, then set `FIREBASE_PROJECT_ID`, `APP_ALLOWED_ORIGINS`, `ADMIN_ALLOWED_ORIGIN`, R2 credentials/public URL, Razorpay keys, and the Admin password on the server.
6. Keep Razorpay secrets, R2 credentials, and Firebase Admin credentials out of frontend files, GitHub, and static hosting.
