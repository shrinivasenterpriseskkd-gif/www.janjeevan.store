-- =====================================================================
-- Janjeevan.store Database Schema for Namecheap cPanel MySQL / MariaDB
-- =====================================================================
-- Character set: utf8mb4, Collation: utf8mb4_unicode_ci
-- Import this file using Namecheap cPanel -> phpMyAdmin -> Import

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `images`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `merchants`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `admins`;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. Admins Table
-- ---------------------------------------------------------------------
CREATE TABLE `admins` (
    `admin_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(60) NOT NULL UNIQUE,
    `email` VARCHAR(120) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('super_admin', 'admin', 'moderator') NOT NULL DEFAULT 'admin',
    `last_login` DATETIME NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_admin_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Users (Customers) Table
-- ---------------------------------------------------------------------
CREATE TABLE `users` (
    `user_id` VARCHAR(128) PRIMARY KEY COMMENT 'Matches Firebase Auth UID or generated customer ID',
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(120) NOT NULL UNIQUE,
    `phone` VARCHAR(15) NOT NULL,
    `date_of_birth` DATE NULL,
    `state` VARCHAR(100) NOT NULL,
    `address` TEXT NULL,
    `pincode` VARCHAR(10) NULL,
    `status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_users_email` (`email`),
    INDEX `idx_users_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. Merchants Table
-- ---------------------------------------------------------------------
CREATE TABLE `merchants` (
    `merchant_id` VARCHAR(60) PRIMARY KEY COMMENT 'e.g. Janjeevan.store-XXXXXX',
    `user_id` VARCHAR(128) NULL COMMENT 'Associated Firebase Auth UID',
    `shop_name` VARCHAR(120) NOT NULL,
    `owner_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(120) NOT NULL UNIQUE,
    `phone` VARCHAR(15) NOT NULL,
    `gst_number` VARCHAR(20) NULL,
    `pan_number` VARCHAR(15) NULL,
    `aadhar_number` VARCHAR(16) NULL,
    `shop_category` VARCHAR(80) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `language` VARCHAR(60) NULL,
    `address` TEXT NULL,
    `bank_account_number` VARCHAR(30) NULL,
    `ifsc_code` VARCHAR(20) NULL,
    `upi_link` VARCHAR(255) NULL,
    `shop_photo_url` VARCHAR(500) NULL,
    `registration_order_id` VARCHAR(60) NULL,
    `registration_payment_id` VARCHAR(60) NULL,
    `status` ENUM('active', 'pending_approval', 'suspended') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_merchants_email` (`email`),
    INDEX `idx_merchants_phone` (`phone`),
    INDEX `idx_merchants_category` (`shop_category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. Products Table (Includes Apparel/Cloth Attributes)
-- ---------------------------------------------------------------------
CREATE TABLE `products` (
    `product_id` VARCHAR(64) PRIMARY KEY,
    `merchant_id` VARCHAR(60) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `description` TEXT NULL COMMENT 'Detailed fabric, fit, design, specifications',
    `uom` VARCHAR(40) NOT NULL DEFAULT 'piece' COMMENT 'Unit of measure: piece, kg, box, etc.',
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'List price / MRP',
    `selling_price` DECIMAL(10, 2) NULL COMMENT 'Discounted selling price',
    `discount_percent` INT UNSIGNED NOT NULL DEFAULT 0,
    `gst_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `stock` INT NOT NULL DEFAULT 0,
    `sku` VARCHAR(60) NULL,
    `size` VARCHAR(40) NULL COMMENT 'S, M, L, XL, XXL, Free Size, etc.',
    `brand` VARCHAR(80) NULL,
    `pack_count` INT UNSIGNED NULL DEFAULT 1,
    `color` VARCHAR(50) NULL,
    `care_instructions` VARCHAR(255) NULL COMMENT 'Washing, ironing instructions',
    `barcode` VARCHAR(60) NULL COMMENT 'UPC / EAN barcode',
    `weight_grams` INT UNSIGNED NULL COMMENT 'Packed weight for shipping',
    `area` VARCHAR(100) NULL,
    `village` VARCHAR(100) NULL,
    `image_url` VARCHAR(500) NOT NULL,
    `status` ENUM('active', 'out_of_stock', 'archived') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_products_merchant` (`merchant_id`),
    INDEX `idx_products_category` (`category`),
    INDEX `idx_products_sku` (`sku`),
    INDEX `idx_products_barcode` (`barcode`),
    CONSTRAINT `fk_products_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Orders Table
-- ---------------------------------------------------------------------
CREATE TABLE `orders` (
    `order_id` VARCHAR(64) PRIMARY KEY COMMENT 'Razorpay order ID or internal order ID',
    `user_id` VARCHAR(128) NOT NULL,
    `merchant_id` VARCHAR(60) NULL COMMENT 'Primary merchant ID (or multi-merchant link)',
    `customer_name` VARCHAR(100) NOT NULL,
    `customer_mobile` VARCHAR(15) NOT NULL,
    `delivery_state` VARCHAR(100) NOT NULL,
    `delivery_method` ENUM('delivery_partner', 'india_post') NOT NULL DEFAULT 'delivery_partner',
    `postal_address` TEXT NULL,
    `postal_pincode` VARCHAR(10) NULL,
    `item_subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `postal_charge` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_weight_grams` INT UNSIGNED NULL,
    `payment_method` VARCHAR(30) NOT NULL DEFAULT 'razorpay',
    `status` VARCHAR(50) NOT NULL DEFAULT 'Unassigned' COMMENT 'Unassigned, Awaiting pickup, Out for delivery, Delivered, Cancelled',
    `assigned_partner_uid` VARCHAR(128) NULL,
    `assigned_partner_id` VARCHAR(60) NULL,
    `order_date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `delivered_at` DATETIME NULL,
    INDEX `idx_orders_user` (`user_id`),
    INDEX `idx_orders_status` (`status`),
    INDEX `idx_orders_partner` (`assigned_partner_uid`),
    CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. Order_Items Table
-- ---------------------------------------------------------------------
CREATE TABLE `order_items` (
    `order_item_id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `order_id` VARCHAR(64) NOT NULL,
    `product_id` VARCHAR(64) NULL,
    `merchant_id` VARCHAR(60) NULL,
    `product_name` VARCHAR(140) NOT NULL,
    `sku` VARCHAR(60) NULL,
    `size` VARCHAR(40) NULL,
    `color` VARCHAR(50) NULL,
    `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discount_percent` INT UNSIGNED NOT NULL DEFAULT 0,
    `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    INDEX `idx_order_items_order` (`order_id`),
    INDEX `idx_order_items_product` (`product_id`),
    CONSTRAINT `fk_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. Transactions Table (Payment Gateway / Billing Records)
-- ---------------------------------------------------------------------
CREATE TABLE `transactions` (
    `txn_id` VARCHAR(100) PRIMARY KEY COMMENT 'Razorpay payment ID (e.g. pay_XXXXX) or Gateway Ref',
    `order_id` VARCHAR(64) NOT NULL,
    `purpose` ENUM('cart_order', 'merchant_registration_fee', 'advertisement') NOT NULL DEFAULT 'cart_order',
    `payment_mode` VARCHAR(40) NOT NULL DEFAULT 'razorpay' COMMENT 'razorpay, upi, card, netbanking',
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(6) NOT NULL DEFAULT 'INR',
    `signature` VARCHAR(255) NULL,
    `status` ENUM('captured', 'failed', 'refunded', 'pending') NOT NULL DEFAULT 'captured',
    `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_txn_order` (`order_id`),
    INDEX `idx_txn_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. Images Table (Products, Merchant Documents, Ads & Banners)
-- ---------------------------------------------------------------------
CREATE TABLE `images` (
    `image_id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `merchant_id` VARCHAR(60) NULL,
    `category` ENUM('product', 'merchant_photo', 'aadhar_photo', 'pan_photo', 'shop_photo', 'banner_advertisement') NOT NULL DEFAULT 'product',
    `file_name` VARCHAR(180) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(50) NULL DEFAULT 'image/jpeg',
    `file_size_bytes` INT UNSIGNED NULL,
    `uploaded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_images_merchant` (`merchant_id`),
    INDEX `idx_images_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
