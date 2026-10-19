<?php
/**
 * Janjeevan.store - Namecheap cPanel MySQL Ingestion API
 * 
 * Upload this file to your Namecheap cPanel hosting:
 * e.g., in public_html/api/sync.php
 */

header('Content-Type: application/json; charset=utf-8');

// ---------------------------------------------------------------------
// 1. Database Credentials (Configured in Namecheap cPanel -> MySQL Databases)
// ---------------------------------------------------------------------
$db_host = 'localhost';
$db_name = 'yourcpaneluser_janjeevan';   // Namecheap cPanel format: username_dbname
$db_user = 'yourcpaneluser_dbuser';     // Namecheap database user
$db_pass = 'YourStrongDBPassword123!';  // Password set in cPanel

// API Key to protect webhook calls
define('API_SECRET_KEY', 'JanJeevanSync2026_SecureKey#99');

// ---------------------------------------------------------------------
// 2. Auth & Request Validation
// ---------------------------------------------------------------------
$headers = getallheaders();
$auth_header = isset($headers['X-Api-Key']) ? $headers['X-Api-Key'] : (isset($_SERVER['HTTP_X_API_KEY']) ? $_SERVER['HTTP_X_API_KEY'] : '');

if ($auth_header !== API_SECRET_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized: Invalid or missing API key.']);
    exit;
}

$raw_input = file_get_contents('php://input');
$data = json_decode($raw_input, true);

if (!$data || !isset($data['action'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Bad Request: action is required.']);
    exit;
}

// ---------------------------------------------------------------------
// 3. PDO Connection
// ---------------------------------------------------------------------
try {
    $pdo = new PDO("mysql:host={$db_host};dbname={$db_name};charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$action = $data['action'];

try {
    switch ($action) {

        // --- SYNC MERCHANT ---
        case 'sync_merchant':
            $m = $data['merchant'];
            $stmt = $pdo->prepare("INSERT INTO merchants (
                merchant_id, user_id, shop_name, owner_name, email, phone, gst_number,
                pan_number, aadhar_number, shop_category, state, language, address,
                bank_account_number, ifsc_code, upi_link, shop_photo_url, registration_order_id,
                registration_payment_id, status
            ) VALUES (
                :merchant_id, :user_id, :shop_name, :owner_name, :email, :phone, :gst_number,
                :pan_number, :aadhar_number, :shop_category, :state, :language, :address,
                :bank_account_number, :ifsc_code, :upi_link, :shop_photo_url, :registration_order_id,
                :registration_payment_id, 'active'
            ) ON DUPLICATE KEY UPDATE
                shop_name = VALUES(shop_name),
                owner_name = VALUES(owner_name),
                phone = VALUES(phone),
                gst_number = VALUES(gst_number),
                pan_number = VALUES(pan_number),
                shop_category = VALUES(shop_category),
                state = VALUES(state),
                language = VALUES(language),
                address = VALUES(address),
                bank_account_number = VALUES(bank_account_number),
                ifsc_code = VALUES(ifsc_code),
                upi_link = VALUES(upi_link),
                shop_photo_url = VALUES(shop_photo_url),
                updated_at = NOW()");
            
            $stmt->execute([
                ':merchant_id' => $m['merchantId'],
                ':user_id' => $m['userId'] ?? null,
                ':shop_name' => $m['shopName'],
                ':owner_name' => $m['fullName'],
                ':email' => $m['email'],
                ':phone' => $m['phoneNo'],
                ':gst_number' => $m['gstNumber'] ?? null,
                ':pan_number' => $m['panNumber'] ?? null,
                ':aadhar_number' => $m['aadharNumber'] ?? null,
                ':shop_category' => $m['shopCategory'],
                ':state' => $m['state'],
                ':language' => $m['language'] ?? null,
                ':address' => $m['address'] ?? null,
                ':bank_account_number' => $m['bankAccountNumber'] ?? null,
                ':ifsc_code' => $m['ifscCode'] ?? null,
                ':upi_link' => $m['upiLink'] ?? null,
                ':shop_photo_url' => $m['shopPhotoUrl'] ?? null,
                ':registration_order_id' => $m['registrationOrderId'] ?? null,
                ':registration_payment_id' => $m['registrationPaymentId'] ?? null
            ]);
            echo json_encode(['success' => true, 'synced' => 'merchant', 'id' => $m['merchantId']]);
            break;

        // --- SYNC PRODUCT (Includes Cloth Fields) ---
        case 'sync_product':
            $p = $data['product'];
            $stmt = $pdo->prepare("INSERT INTO products (
                product_id, merchant_id, name, category, description, uom, price,
                selling_price, discount_percent, gst_percent, stock, sku, size, brand,
                pack_count, color, care_instructions, barcode, weight_grams, area, village, image_url, status
            ) VALUES (
                :product_id, :merchant_id, :name, :category, :description, :uom, :price,
                :selling_price, :discount_percent, :gst_percent, :stock, :sku, :size, :brand,
                :pack_count, :color, :care_instructions, :barcode, :weight_grams, :area, :village, :image_url, 'active'
            ) ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                category = VALUES(category),
                description = VALUES(description),
                uom = VALUES(uom),
                price = VALUES(price),
                selling_price = VALUES(selling_price),
                discount_percent = VALUES(discount_percent),
                gst_percent = VALUES(gst_percent),
                stock = VALUES(stock),
                sku = VALUES(sku),
                size = VALUES(size),
                brand = VALUES(brand),
                pack_count = VALUES(pack_count),
                color = VALUES(color),
                care_instructions = VALUES(care_instructions),
                barcode = VALUES(barcode),
                weight_grams = VALUES(weight_grams),
                area = VALUES(area),
                village = VALUES(village),
                image_url = VALUES(image_url),
                updated_at = NOW()");
            
            $stmt->execute([
                ':product_id' => $p['id'],
                ':merchant_id' => $p['merchantId'],
                ':name' => $p['name'],
                ':category' => $p['category'],
                ':description' => $p['description'] ?? null,
                ':uom' => $p['uom'] ?? 'piece',
                ':price' => $p['price'],
                ':selling_price' => $p['sellingPrice'] ?? null,
                ':discount_percent' => $p['discountPercent'] ?? 0,
                ':gst_percent' => $p['gstPercent'] ?? 0,
                ':stock' => $p['stock'] ?? $p['avlbStk'] ?? 0,
                ':sku' => $p['sku'] ?? null,
                ':size' => $p['size'] ?? null,
                ':brand' => $p['brand'] ?? null,
                ':pack_count' => $p['packCount'] ?? 1,
                ':color' => $p['color'] ?? null,
                ':care_instructions' => $p['careInstructions'] ?? null,
                ':barcode' => $p['barcode'] ?? null,
                ':weight_grams' => $p['weightGrams'] ?? null,
                ':area' => $p['area'] ?? null,
                ':village' => $p['village'] ?? null,
                ':image_url' => $p['imageUrl'] ?? ''
            ]);
            echo json_encode(['success' => true, 'synced' => 'product', 'id' => $p['id']]);
            break;

        // --- SYNC ORDER + ITEMS + TRANSACTION ---
        case 'sync_order':
            $o = $data['order'];
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("INSERT INTO orders (
                order_id, user_id, merchant_id, customer_name, customer_mobile, delivery_state,
                delivery_method, postal_address, postal_pincode, item_subtotal, postal_charge,
                total_amount, total_weight_grams, payment_method, status
            ) VALUES (
                :order_id, :user_id, :merchant_id, :customer_name, :customer_mobile, :delivery_state,
                :delivery_method, :postal_address, :postal_pincode, :item_subtotal, :postal_charge,
                :total_amount, :total_weight_grams, :payment_method, :status
            ) ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                total_amount = VALUES(total_amount)");

            $stmt->execute([
                ':order_id' => $o['orderId'],
                ':user_id' => $o['userId'] ?? 'guest',
                ':merchant_id' => $o['merchantId'] ?? null,
                ':customer_name' => $o['customerName'],
                ':customer_mobile' => $o['customerMobile'],
                ':delivery_state' => $o['deliveryState'],
                ':delivery_method' => $o['deliveryMethod'] ?? 'delivery_partner',
                ':postal_address' => $o['postalAddress'] ?? null,
                ':postal_pincode' => $o['postalPincode'] ?? null,
                ':item_subtotal' => $o['itemSubtotal'] ?? 0,
                ':postal_charge' => $o['postalCharge'] ?? 0,
                ':total_amount' => $o['totalAmount'],
                ':total_weight_grams' => $o['totalWeightGrams'] ?? null,
                ':payment_method' => $o['paymentMethod'] ?? 'razorpay',
                ':status' => $o['status'] ?? 'Awaiting pickup'
            ]);

            // Insert Order Items
            if (!empty($o['items']) && is_array($o['items'])) {
                $item_stmt = $pdo->prepare("INSERT INTO order_items (
                    order_id, product_id, merchant_id, product_name, sku, size, color, quantity, price, subtotal
                ) VALUES (
                    :order_id, :product_id, :merchant_id, :product_name, :sku, :size, :color, :quantity, :price, :subtotal
                )");
                foreach ($o['items'] as $item) {
                    $item_stmt->execute([
                        ':order_id' => $o['orderId'],
                        ':product_id' => $item['productId'] ?? null,
                        ':merchant_id' => $item['merchantId'] ?? null,
                        ':product_name' => $item['name'] ?? 'Product',
                        ':sku' => $item['sku'] ?? null,
                        ':size' => $item['size'] ?? null,
                        ':color' => $item['color'] ?? null,
                        ':quantity' => $item['quantity'] ?? 1,
                        ':price' => $item['price'] ?? 0,
                        ':subtotal' => ($item['quantity'] ?? 1) * ($item['price'] ?? 0)
                    ]);
                }
            }

            // Record Transaction
            if (!empty($o['paymentId'])) {
                $txn_stmt = $pdo->prepare("INSERT INTO transactions (
                    txn_id, order_id, purpose, payment_mode, amount, status
                ) VALUES (
                    :txn_id, :order_id, 'cart_order', :payment_mode, :amount, 'captured'
                ) ON DUPLICATE KEY UPDATE status = 'captured'");
                $txn_stmt->execute([
                    ':txn_id' => $o['paymentId'],
                    ':order_id' => $o['orderId'],
                    ':payment_mode' => $o['paymentMethod'] ?? 'razorpay',
                    ':amount' => $o['totalAmount']
                ]);
            }

            $pdo->commit();
            echo json_encode(['success' => true, 'synced' => 'order', 'id' => $o['orderId']]);
            break;

        // --- SYNC IMAGE ---
        case 'sync_image':
            $img = $data['image'];
            $stmt = $pdo->prepare("INSERT INTO images (
                merchant_id, category, file_name, file_path, mime_type, file_size_bytes
            ) VALUES (
                :merchant_id, :category, :file_name, :file_path, :mime_type, :file_size_bytes
            )");
            $stmt->execute([
                ':merchant_id' => $img['merchantId'] ?? null,
                ':category' => $img['category'] ?? 'product',
                ':file_name' => $img['fileName'],
                ':file_path' => $img['filePath'],
                ':mime_type' => $img['mimeType'] ?? 'image/jpeg',
                ':file_size_bytes' => $img['fileSizeBytes'] ?? null
            ]);
            echo json_encode(['success' => true, 'synced' => 'image', 'id' => $pdo->lastInsertId()]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => "Unknown action: {$action}"]);
            break;
    }
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Database operation error: ' . $e->getMessage()]);
}
