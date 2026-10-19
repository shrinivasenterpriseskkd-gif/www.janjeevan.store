# Namecheap cPanel & MySQL Deployment Guide

This guide details how to deploy your Janjeevan.store database schema, live exported data, and sync API to your Namecheap cPanel hosting account.

---

## 1. Quick Summary of Files

| File | Purpose | Target Destination |
| :--- | :--- | :--- |
| `namecheap_database_schema.sql` | Complete MySQL schema (tables, indices, foreign keys) | Namecheap cPanel -> phpMyAdmin |
| `namecheap_data_export.sql` | Live data export (Merchants, Products with Cloth fields, Orders, Items, Transactions) | Namecheap cPanel -> phpMyAdmin |
| `namecheap_sync_api.php` | Real-time webhook ingestion API in PHP | Namecheap cPanel File Manager -> `public_html/api/sync.php` (or `public_html/janjeevan/sync.php`) |
| `scripts/export_namecheap_data.js` | Exports current Firestore live data to SQL | Local node utility (`npm run export:namecheap`) |
| `scripts/sync_to_namecheap.js` | Pushes Firestore data via HTTP POST to Namecheap sync API | Local node utility (`npm run sync:namecheap`) |

---

## 2. Step 1: Create MySQL Database in Namecheap cPanel

1. Log in to your **Namecheap cPanel** dashboard (usually at `https://your-domain.com:2083` or from your Namecheap Account -> Hosting List -> Go to cPanel).
2. In the **Databases** section, click on **MySQL® Databases**.
3. **Create New Database**:
   - Enter database name (e.g., `janjeevan` -> full name will be `yourcpaneluser_janjeevan`).
   - Click **Create Database**.
4. **Create Database User**:
   - Scroll down to **MySQL Users -> Add New User**.
   - Username: `dbuser` (full username will be `yourcpaneluser_dbuser`).
   - Password: Generate a strong password (save this password securely).
   - Click **Create User**.
5. **Add User to Database**:
   - In **Add User To Database**, select your user and database.
   - Click **Add**.
   - Check **ALL PRIVILEGES**.
   - Click **Make Changes**.

---

## 3. Step 2: Import Schema and Data via phpMyAdmin

1. In cPanel, navigate to **Databases -> phpMyAdmin**.
2. From the left sidebar, click on your newly created database (`yourcpaneluser_janjeevan`).
3. Click the **Import** tab in the top navigation bar.
4. Under **File to import**, click **Choose File** and select:
   - `namecheap_database_schema.sql`
   - Click **Import** (or **Go** at the bottom).
5. Once the schema tables are created, click the **Import** tab again:
   - Click **Choose File** and select `namecheap_data_export.sql`.
   - Click **Import** (or **Go**).
6. Verify your tables:
   - `admins`
   - `users` (contains customer records)
   - `merchants` (contains registered merchants)
   - `products` (contains 6 live products, including apparel/clothing attributes)
   - `orders` (contains 2 live orders)
   - `order_items`
   - `transactions`

---

## 4. Step 3: Deploy the Sync API Endpoint (`namecheap_sync_api.php`)

1. Open your cPanel **File Manager**.
2. Navigate to `public_html/`.
3. Create a folder named `api` (or `janjeevan`).
4. Upload `namecheap_sync_api.php` into that directory, and rename it to `sync.php`.
5. Right-click `sync.php` in File Manager and select **Edit**:
   - Update `$db_name` with your cPanel database name: `yourcpaneluser_janjeevan`.
   - Update `$db_user` with your cPanel database user: `yourcpaneluser_dbuser`.
   - Update `$db_pass` with your cPanel database password.
   - Verify `API_SECRET_KEY`: `JanJeevanSync2026_SecureKey#99` (or set a custom key).
   - Click **Save Changes**.

---

## 5. Step 4: Configure Live Sync in Your Node.js Backend

In your local `.env` file (or production environment variables):

```env
NAMECHEAP_SYNC_URL=https://your-hosting-domain.com/api/sync.php
NAMECHEAP_SYNC_KEY=JanJeevanSync2026_SecureKey#99
```

When new merchants register, new products are added, or orders are paid via Razorpay, `server.js` automatically triggers `syncToNamecheap` to write directly to your Namecheap MySQL database.

---

## 6. Step 5: Run Batch Sync Anytime

To push all live Firestore data to your Namecheap sync endpoint at any time:

```bash
npm run sync:namecheap
```
