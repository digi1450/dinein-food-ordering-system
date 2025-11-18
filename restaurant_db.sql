-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:8889
-- Generation Time: Nov 18, 2025 at 04:05 PM
-- Server version: 8.0.40
-- PHP Version: 8.3.14

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `restaurant_db`
--
CREATE DATABASE IF NOT EXISTS `restaurant_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `restaurant_db`;

DELIMITER $$
--
-- Procedures
--
DROP PROCEDURE IF EXISTS `sp_get_bill_summary`$$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_get_bill_summary` (IN `p_bill_id` INT)   BEGIN
    -- แสดงข้อมูลบิล
    SELECT 
        b.bill_id,
        b.bill_code,
        b.table_id,
        t.table_label,
        b.status,
        b.created_at AS bill_created_at,
        b.updated_at AS bill_updated_at
    FROM bill b
    LEFT JOIN table_info t ON t.table_id = b.table_id
    WHERE b.bill_id = p_bill_id;

    -- แสดงรายการสั่งอาหารทั้งหมดที่รวมในบิลนี้
    SELECT 
        o.order_id,
        o.order_code,
        oi.order_item_id,
        oi.food_id,
        f.food_name,
        oi.quantity,
        oi.unit_price,
        oi.subtotal,
        oi.status AS item_status
    FROM bill_order bo
    JOIN orders o ON o.order_id = bo.order_id
    JOIN order_item oi ON oi.order_id = o.order_id
    LEFT JOIN food f ON f.food_id = oi.food_id
    WHERE bo.bill_id = p_bill_id
    ORDER BY o.order_id, oi.order_item_id;

    -- รวมยอดเงินทั้งหมดในบิล
    SELECT 
        SUM(oi.subtotal) AS total_amount
    FROM bill_order bo
    JOIN orders o ON o.order_id = bo.order_id
    JOIN order_item oi ON oi.order_id = o.order_id
    WHERE bo.bill_id = p_bill_id;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `admin_activity`
--

DROP TABLE IF EXISTS `admin_activity`;
CREATE TABLE IF NOT EXISTS `admin_activity` (
  `activity_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `entity_type` enum('food','category','order','order_item','table','bill','login') NOT NULL,
  `entity_id` int DEFAULT NULL,
  `action` enum('create','update','delete','status_change','login') NOT NULL,
  `details` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`activity_id`),
  KEY `idx_admin_activity_entity` (`entity_type`,`entity_id`),
  KEY `idx_admin_activity_action` (`action`),
  KEY `idx_admin_activity_user` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bill`
--

DROP TABLE IF EXISTS `bill`;
CREATE TABLE IF NOT EXISTS `bill` (
  `bill_id` int NOT NULL AUTO_INCREMENT,
  `table_id` int NOT NULL,
  `bill_code` varchar(32) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open',
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`bill_id`),
  UNIQUE KEY `bill_code` (`bill_code`),
  UNIQUE KEY `uq_bill_code` (`bill_code`),
  KEY `idx_bill_table` (`table_id`),
  KEY `idx_bill_status` (`status`),
  KEY `idx_bill_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bill_order`
--

DROP TABLE IF EXISTS `bill_order`;
CREATE TABLE IF NOT EXISTS `bill_order` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bill_id` int NOT NULL,
  `order_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bill_order` (`bill_id`,`order_id`),
  KEY `idx_bo_bill` (`bill_id`),
  KEY `idx_bo_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `category`
--

DROP TABLE IF EXISTS `category`;
CREATE TABLE IF NOT EXISTS `category` (
  `category_id` int NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) NOT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `category`
--

INSERT INTO `category` (`category_id`, `category_name`, `created_by`, `updated_by`, `created_at`, `updated_at`) VALUES
(1, 'Appetizers', NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30'),
(2, 'Mains', NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30'),
(3, 'Desserts', NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30'),
(4, 'Drinks', NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30');

-- --------------------------------------------------------

--
-- Table structure for table `food`
--

DROP TABLE IF EXISTS `food`;
CREATE TABLE IF NOT EXISTS `food` (
  `food_id` int NOT NULL AUTO_INCREMENT,
  `category_id` int DEFAULT NULL,
  `food_name` varchar(100) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `description` text,
  `image` varchar(255) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`food_id`),
  KEY `fk_food_created_by` (`created_by`),
  KEY `fk_food_updated_by` (`updated_by`),
  KEY `idx_food_category` (`category_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `food`
--

INSERT INTO `food` (`food_id`, `category_id`, `food_name`, `price`, `description`, `image`, `created_by`, `updated_by`, `created_at`, `updated_at`, `is_active`) VALUES
(1, 1, 'Spring Rolls', 59.00, NULL, NULL, NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30', 1),
(2, 2, 'Pad Thai', 89.00, NULL, NULL, NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30', 1),
(3, 2, 'Fried Rice', 79.00, NULL, NULL, NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30', 1),
(4, 3, 'Mango Sticky Rice', 69.00, NULL, NULL, NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30', 1),
(5, 4, 'Iced Tea', 39.00, NULL, NULL, NULL, NULL, '2025-10-28 20:10:30', '2025-10-28 20:10:30', 1),
(9, 2, 'Test Burger03', 123.00, 'test', NULL, 1, 1, '2025-10-28 21:15:56', '2025-11-15 21:17:57', 1),
(12, 4, 'test drink', 199.00, '123', NULL, 1, 1, '2025-11-08 03:24:55', '2025-11-13 15:36:09', 1),
(13, 3, 'test 2', 99.00, NULL, NULL, 1, 1, '2025-11-13 13:46:20', '2025-11-16 00:11:53', 1),
(14, 4, 'test 3.1', 100.00, NULL, NULL, 1, 1, '2025-11-13 13:48:30', '2025-11-15 22:46:52', 1),
(15, 4, 'testt', 100.00, NULL, NULL, 1, 2, '2025-11-15 23:17:01', '2025-11-16 01:30:35', 1),
(17, 1, 'TestAP', 10000.00, 'brabra', NULL, 1, 2, '2025-11-16 02:19:25', '2025-11-17 19:54:38', 1),
(18, 2, 'tt234', 125.00, NULL, NULL, 1, 1, '2025-11-16 04:23:05', '2025-11-16 04:58:07', 1),
(19, 2, 'aaa', 123.00, NULL, NULL, 1, 1, '2025-11-16 20:10:04', '2025-11-16 20:10:04', 1),
(20, 2, 'menu01', 50.00, 'don\'t order this', NULL, 1, 1, '2025-11-17 19:49:51', '2025-11-17 19:49:51', 1);

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `order_code` char(6) DEFAULT NULL,
  `table_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `customer_name` varchar(80) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `notes` text,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `status` enum('pending','preparing','served','completed','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `order_code` (`order_code`),
  KEY `user_id` (`user_id`),
  KEY `idx_orders_table` (`table_id`),
  KEY `idx_orders_table_status` (`table_id`,`status`,`updated_at`),
  KEY `idx_o_table_status` (`table_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `order_item`
--

DROP TABLE IF EXISTS `order_item`;
CREATE TABLE IF NOT EXISTS `order_item` (
  `order_item_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int DEFAULT NULL,
  `food_id` int DEFAULT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `status` enum('pending','preparing','served','completed','cancelled') NOT NULL DEFAULT 'pending',
  `cancelled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`order_item_id`),
  KEY `food_id` (`food_id`),
  KEY `idx_order_item_order` (`order_id`),
  KEY `idx_order_item_order_status` (`order_id`,`status`),
  KEY `idx_oi_order_status` (`order_id`,`status`),
  KEY `idx_order_item_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `order_status_log`
--

DROP TABLE IF EXISTS `order_status_log`;
CREATE TABLE IF NOT EXISTS `order_status_log` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `user_id` int NOT NULL,
  `from_status` enum('pending','accepted','preparing','served','completed','cancelled') DEFAULT NULL,
  `to_status` enum('pending','accepted','preparing','served','completed','cancelled') NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_order_status_log_order` (`order_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `order_status_log`
--
DROP TRIGGER IF EXISTS `trg_order_log_update`;
DELIMITER $$
CREATE TRIGGER `trg_order_log_update` AFTER INSERT ON `order_status_log` FOR EACH ROW BEGIN
    UPDATE orders
    SET updated_at = NEW.created_at
    WHERE order_id = NEW.order_id;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `payment`
--

DROP TABLE IF EXISTS `payment`;
CREATE TABLE IF NOT EXISTS `payment` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `bill_id` int DEFAULT NULL,
  `method` enum('cash','QR','card') DEFAULT 'cash',
  `amount` decimal(10,2) NOT NULL,
  `status` enum('unpaid','paid') DEFAULT 'unpaid',
  `paid_time` datetime DEFAULT NULL,
  PRIMARY KEY (`payment_id`),
  KEY `order_id` (`order_id`),
  KEY `idx_payment_bill` (`bill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `table_info`
--

DROP TABLE IF EXISTS `table_info`;
CREATE TABLE IF NOT EXISTS `table_info` (
  `table_id` int NOT NULL AUTO_INCREMENT,
  `table_label` varchar(10) NOT NULL,
  `status` enum('available','occupied') DEFAULT 'available',
  `token` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`table_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `table_info`
--

INSERT INTO `table_info` (`table_id`, `table_label`, `status`, `token`) VALUES
(1, 'T1', 'available', NULL),
(2, 'T2', 'available', NULL),
(3, 'T3', 'available', NULL),
(4, 'T4', 'available', NULL),
(5, 'T5', 'available', NULL),
(6, 'T6', 'available', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
CREATE TABLE IF NOT EXISTS `user` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) DEFAULT NULL,
  `name` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','staff') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'admin',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`user_id`, `username`, `name`, `password`, `role`) VALUES
(1, 'admin', 'admin', '$2b$10$zV08QUeSE7DjoRVhJSrnjeggE1j5JCmbuPw3dXRDfTFnnmRQYJUAy', 'admin'),
(2, 'admin2', 'admin2', '$2b$10$xbsic3WH3TDZZTQMlmcVMeCcDwmuWR87Hjw8FmgCl659uv3W4lx2e', 'admin');

--
-- Constraints for dumped tables
--

--
-- Constraints for table `food`
--
ALTER TABLE `food`
  ADD CONSTRAINT `fk_food_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_food_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `user` (`user_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `food_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `category` (`category_id`);

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`table_id`) REFERENCES `table_info` (`table_id`),
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`);

--
-- Constraints for table `order_item`
--
ALTER TABLE `order_item`
  ADD CONSTRAINT `fk_order_item_food` FOREIGN KEY (`food_id`) REFERENCES `food` (`food_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `order_item_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`);

--
-- Constraints for table `payment`
--
ALTER TABLE `payment`
  ADD CONSTRAINT `payment_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
