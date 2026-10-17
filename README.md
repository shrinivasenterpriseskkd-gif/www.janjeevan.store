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

Enable the Email/Password provider in Firebase Authentication, add each production site hostname to its authorized domains, then publish `firestore.rules` for the `janjeevanstore` project. Customer, Merchant, and Delivery Partner profiles are keyed by Auth UID and readable only by their owner. Paid orders are created by the server after payment-signature verification; customers and their assigned Delivery Partner can read them, and each participant can update only their own live-location field. Product reads remain public; Merchant product writes use authenticated server API routes. Customer, Merchant, and Delivery Partner registration backups are written as per-account `profile.csv` files under `C:\JANJEEVAN.STORE_WEB_DATA\customers\`, `C:\JANJEEVAN.STORE_WEB_DATA\merchants\`, and `C:\JANJEEVAN.STORE_WEB_DATA\delivery-partners\`; Merchant and Delivery Partner photos and documents are stored in private sibling folders. Passwords are never written to these CSV files. These archives contain sensitive identity and contact information: keep the directory private, restrict Windows account access, and include it in your secure backup plan. Uploaded catalog/ad images are saved under `C:\JANJEEVAN.STORE_WEB_DATA\product-images\` and served from `/uploads/images/`. The configured directory must be writable and persistent; local disk storage is for a server running on this PC, not an ephemeral serverless filesystem. Admin advertisements are saved in Firestore; published ads are read from the public `/api/advertisements` endpoint and displayed on the storefront.

## Merchant portal

Customers and Merchants use email/password sign-in; Delivery Partners also receive a generated Delivery Partner ID, but sign in with their registered email. Passwords are handled by Firebase Authentication and reset through Firebase email links. Profile and order data are stored in Firestore under Auth UID ownership. Customer, assigned-partner, and Admin order views sync across devices. The Merchant portal polls the authenticated server API for orders containing that merchant's products, displays merchant-specific item subtotals, and can show in-page and opt-in browser notifications while open. New orders include a merchant ID index; the initial merchant order load also includes legacy orders. Checkout totals are recalculated from Firestore products by the server, and stock is decremented only after verified payment. Precise GPS fields are cleared when an order is delivered; sharing is opt-in. Aadhaar details are used only in the locally generated Delivery Partner registration PDF and are not uploaded to Firebase.

Merchant product photos can be uploaded from the Merchant portal and are saved on the server's local disk. Bulk import still uses image filenames from the workbook; add those bulk-import images to `images/products/` in the published site. Set `LOCAL_PROFILE_DATA_DIRECTORY` in `.env` to change the default `C:\JANJEEVAN.STORE_WEB_DATA` location. Local uploaded images and profile archives require a writable, persistent server disk and are not suitable for ephemeral serverless storage.

Accounts and orders previously stored only in browser `localStorage` cannot be safely assigned to a Firebase UID, so existing users must register again and old local orders are not imported automatically. The Admin account directory and tracking views now use the server-protected Firebase APIs; passwords are never returned to Admin. Run the app at one stable origin such as `http://localhost:5500` (or the same HTTPS host), not from `file://` URLs.

## Free GitHub Pages hosting

1. Create or open a GitHub repository and upload this project.
2. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Push to `master` or `main`; `.github/workflows/pages.yml` deploys the static storefront automatically.
4. Your free URL will be `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

The storefront market-photo carousel uses photographs from Wikimedia Commons of weekly markets in Araku Valley, Andhra Pradesh. Each photo links to its source and lists its artist and Creative Commons license.

This project is intended to run locally with the Express server and static browser pages. Deployment configuration has been removed from the repository so development stays focused on local checkout and admin workflows.

## Local GPS order tracking

Customer and Delivery Partner GPS sharing is opt-in from their order pages. Admins can share the Admin device's GPS as the Merchant pickup point from **Live Tracking**. Active order updates sync through Firestore, with owner/assignment rules restricting access; Admin reads and pickup updates use the server's authenticated session. Sharing stops when the user stops it or an order is delivered. The route graphic is a straight-line preview, not road navigation. Browser geolocation requires permission and a secure context such as `localhost` or HTTPS.

## Local-only setup notes

1. Keep Firebase and Razorpay credentials in local environment variables or a `.env` file that is not committed.
2. Enable Email/Password in Firebase Authentication for the local development project and authorize the local origin you use for testing.
3. Keep backend secrets out of frontend files, GitHub, and browser storage.
