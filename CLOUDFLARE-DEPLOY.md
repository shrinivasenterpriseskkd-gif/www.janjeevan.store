# JanJeevan Store — Cloudflare Pages migration bundle

## What is prepared
- Existing static storefront pages, CSS, JavaScript and assets.
- Cloudflare Pages Function at `functions/api/[[path]].js` that proxies `/api/...`
  requests to the existing Firebase HTTPS Function.
- `.env`, Git history, and installed `node_modules` are excluded.

## Deploy
1. Extract this ZIP.
2. In Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets,
   upload the extracted project directory.
3. Ensure `index.html` is at the project root. Pages recognizes the `functions/`
   directory when deploying through Wrangler. From this directory, deploy with
   `npm run deploy:pages` (or `npx wrangler pages deploy . --project-name www-janjeevan-store`).
   The Pages project must already exist in Cloudflare.
4. If using the repository's Cloudflare build settings, set the root directory to `/`,
   leave the build command empty, and set the deploy command to `npm run deploy:pages`.
   Do not use `npx wrangler deploy`: that command deploys a Worker, but this repository is
   configured as a Pages site with Pages Functions.
5. Add `janjeevan.store` and `www.janjeevan.store` in Pages → Custom domains and follow
   Cloudflare's DNS instructions.
6. Test customer/merchant/delivery-partner login, product images, orders, payments,
   and admin endpoints after deployment.

## Important limitation
This is a Cloudflare Pages frontend + API proxy migration, NOT a full replacement of
the Firebase backend. The proxy forwards API requests to
`https://us-central1-janjeevanstore.cloudfunctions.net/api`. Firebase Admin/Firestore,
Firebase Authentication, Razorpay verification, and any server-side secrets still run
in the existing backend. To remove Firebase completely, the backend must be separately
rewritten for Cloudflare Workers and a database such as D1, and payment/auth/data flows
must be migrated and tested. Do not delete the Firebase backend until that migration is
complete.

## Security
- Never upload `.env` or service-account JSON.
- Admin API access must remain enforced server-side. Verify admin route protection before
  production. Do not rely on hiding the admin HTML as the security boundary.
