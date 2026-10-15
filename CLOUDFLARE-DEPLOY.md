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
   directory when deploying the project through a supported Pages deployment workflow.
   For reliable Functions deployment, connect the Git repository to Pages or use Wrangler:
   `npx wrangler pages deploy . --project-name janjeevan-store`
   (run from this directory; create the Pages project in Cloudflare first).
4. Add `janjeevan.store` and `www.janjeevan.store` in Pages → Custom domains and follow
   Cloudflare's DNS instructions.
5. Test customer/merchant/delivery-partner login, product images, orders, payments,
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
