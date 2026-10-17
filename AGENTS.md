# AGENTS

This repo is a storefront and admin app with a static frontend plus a Node/Express server used for protected admin flows, payment verification, and Firebase-backed data access.

## Project layout

- Static storefront and admin pages live at the repo root (`*.html`, `js/*.js`, `css/*.css`).
- Server logic lives in `server.js` and `routes.js`; this is the source of truth for admin auth, checkout, Razorpay verification, and image uploads.
- Firebase configuration and environment-specific setup are documented in [README.md](README.md).
- Deployment is centered on the Firebase/Express backend and static hosting, not a Cloudflare Pages workflow.

## Key conventions

- Keep secrets and credentials server-side only. Never add production keys, Firebase service account material, or `.env` values to frontend files or commits.
- The admin portal must stay on the same origin as the protected Express server; GitHub Pages is only for the static storefront and cannot secure `/admin`.
- If a change affects payment flows, checkout totals, or order creation, validate it against the server-side API logic in `routes.js` and `server.js`, not only the browser JS.
- R2-backed image uploads are optional; when not configured, the app should degrade gracefully and surface the backend configuration issue rather than silently breaking product or ad uploads.
- For merchant catalog demos without R2, product image paths may reference files under `images/products/` in the published site; this does not remove the server-side registration/order/payment requirements.

## Validation and commands

Use the repo’s documented commands when validating changes:

- `npm install`
- `npm start` to run the local Express app
- Firebase CLI deployment commands when modifying backend APIs or Firestore rules

## Working style for agents

- Prefer small, targeted changes in the existing server/front-end structure.
- When adding or changing API routes, keep the same auth, CORS, and origin validation patterns already used in `server.js`.
- If a change impacts the storefront UI or data model, check the matching browser script in `js/` and keep the frontend contract aligned with the backend.
- Link back to [README.md](README.md) for deployment, secrets, and production guidance instead of re-documenting that material here.

## Important project-specific notes

- The app uses Firebase Authentication, Firestore, and Cloud Functions/HTTPS API patterns.
- Razorpay is used for order creation and payment verification; do not bypass signature checks.
- Postal shipping logic and rate configuration are server-side only and must remain validated before shipping-related changes are considered complete.
- Admin and customer flows are split by ownership and auth rules; keep those boundaries intact when editing data access.

## When in doubt

Check [README.md](README.md) first for deployment and environment requirements, then inspect the nearest matching implementation in `server.js`, `routes.js`, or the related file in `js/`.
