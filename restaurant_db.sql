-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:8889
-- Generation Time: Nov 18, 2025 at 01:04 PM
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

DELIMITER $$
--
-- Procedures
--
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

CREATE TABLE `admin_activity` (
  `activity_id` int NOT NULL,
  `user_id` int NOT NULL,
  `entity_type` enum('food','category','order','order_item','table','bill','login') NOT NULL,
  `entity_id` int DEFAULT NULL,
  `action` enum('create','update','delete','status_change','login') NOT NULL,
  `details` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `admin_activity`
--

INSERT INTO `admin_activity` (`activity_id`, `user_id`, `entity_type`, `entity_id`, `action`, `details`, `created_at`) VALUES
(1, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-15 19:40:18'),
(2, 1, 'order_item', 1, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 1}', '2025-11-15 19:40:37'),
(3, 1, 'order', 3, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 19:45:14'),
(4, 1, 'order_item', 7, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 5}', '2025-11-15 19:45:40'),
(5, 1, 'order', 12, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 20:01:39'),
(6, 1, 'bill', 1, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"168.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 1}', '2025-11-15 20:04:11'),
(7, 1, 'bill', 4, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"493.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 2}', '2025-11-15 20:07:59'),
(8, 1, 'bill', 7, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"216.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 3}', '2025-11-15 20:08:49'),
(9, 1, 'order', 19, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-15 20:08:54'),
(10, 1, 'order', 19, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-15 20:08:58'),
(11, 1, 'bill', 10, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"69.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 4}', '2025-11-15 20:13:38'),
(12, 1, 'bill', 13, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"39.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 5}', '2025-11-15 20:14:26'),
(13, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger01\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:15:06'),
(14, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger02\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:25:42'),
(15, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger01\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:26:06'),
(16, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger03\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:26:19'),
(17, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger03\", \"is_active\": 0, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:26:30'),
(18, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger03\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:26:45'),
(19, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger01\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:26:59'),
(20, 1, 'order', 22, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 20:28:05'),
(21, 1, 'order', 23, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 20:28:19'),
(22, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 3\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 20:29:05'),
(23, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 5\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 20:45:46'),
(24, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 5121\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 20:46:28'),
(25, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 20:46:36'),
(26, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 5\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 20:47:56'),
(27, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger02\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 20:55:39'),
(28, 1, 'order', 24, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 20:56:04'),
(29, 1, 'order', 25, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 20:58:50'),
(30, 1, 'order', 26, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 20:59:22'),
(31, 1, 'order', 27, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 20:59:32'),
(32, 1, 'bill', 16, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"79.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 6}', '2025-11-15 21:08:41'),
(33, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 6\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 21:08:54'),
(34, 1, 'order', 28, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 21:09:10'),
(35, 1, 'food', 9, 'update', '{\"price\": 123, \"food_name\": \"Test Burger03\", \"is_active\": 1, \"category_id\": 2, \"description\": \"test\"}', '2025-11-15 21:17:57'),
(36, 1, 'order', 29, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-15 21:19:54'),
(37, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-15 21:23:13'),
(38, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 21:24:34'),
(39, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.1\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 21:25:10'),
(40, 1, 'food', 14, 'update', '{\"price\": 100, \"food_name\": \"test 3\", \"is_active\": 0, \"category_id\": 4, \"description\": null}', '2025-11-15 21:26:28'),
(41, 1, 'food', 14, 'update', '{\"price\": 100, \"food_name\": \"test 3\", \"is_active\": 1, \"category_id\": 4, \"description\": null}', '2025-11-15 21:26:33'),
(42, 1, 'bill', 20, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"39.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 7}', '2025-11-15 21:28:13'),
(43, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.2\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 21:52:32'),
(44, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.1\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 21:52:40'),
(45, 1, 'order', 31, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-15 21:53:11'),
(46, 1, 'order', 31, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-15 22:19:54'),
(47, 1, 'order', 31, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\"}', '2025-11-15 22:20:07'),
(48, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.2\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 22:42:24'),
(49, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.3\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 22:42:40'),
(50, 1, 'food', 14, 'update', '{\"price\": 100, \"food_name\": \"test 3.1\", \"is_active\": 1, \"category_id\": 4, \"description\": null}', '2025-11-15 22:46:52'),
(51, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.4\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 22:52:17'),
(52, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.5\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 22:53:07'),
(53, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.6\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 22:56:13'),
(54, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2.7\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-15 23:12:10'),
(55, 1, 'food', 15, 'create', '{\"price\": 100, \"food_name\": \"testtt\", \"category_id\": 4}', '2025-11-15 23:17:01'),
(56, 1, 'food', 13, 'update', '{\"price\": 99, \"food_name\": \"test 2\", \"is_active\": 1, \"category_id\": 3, \"description\": null}', '2025-11-16 00:11:53'),
(57, 1, 'order', 32, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-16 00:12:31'),
(58, 1, 'order', 32, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-16 00:12:40'),
(59, 1, 'order', 32, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\"}', '2025-11-16 00:18:20'),
(60, 1, 'order', 33, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-16 00:18:38'),
(61, 1, 'order', 34, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-16 00:19:01'),
(62, 1, 'order', 34, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-16 00:19:07'),
(63, 1, 'order', 34, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\"}', '2025-11-16 00:29:53'),
(64, 1, 'order', 35, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-16 00:35:41'),
(65, 1, 'food', 15, 'update', '{\"price\": 100, \"food_name\": \"testt\", \"is_active\": 1, \"category_id\": 4, \"description\": null}', '2025-11-16 00:35:55'),
(66, 1, 'order_item', 42, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 36}', '2025-11-16 00:36:37'),
(67, 1, 'order_item', 40, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 36}', '2025-11-16 00:36:40'),
(68, 1, 'order', 36, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-16 00:36:47'),
(69, 1, 'order', 36, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-16 00:36:50'),
(70, 1, 'bill', 23, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"267.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 8}', '2025-11-16 00:37:29'),
(71, 1, 'order', 37, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-16 00:38:14'),
(72, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 00:38:50'),
(73, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 00:38:59'),
(74, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 00:58:33'),
(75, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 00:58:44'),
(76, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 00:59:16'),
(77, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 01:18:43'),
(78, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 01:19:16'),
(79, 1, 'food', 15, 'update', '{\"price\": 100, \"food_name\": \"testtt\", \"is_active\": 1, \"category_id\": 4, \"description\": null}', '2025-11-16 01:20:11'),
(80, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 01:21:18'),
(81, 2, 'login', 2, 'login', '{\"username\": \"admin2\"}', '2025-11-16 01:25:49'),
(82, 2, 'login', 2, 'login', '{\"username\": \"admin2\"}', '2025-11-16 01:26:10'),
(83, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 01:27:47'),
(84, 2, 'login', 2, 'login', '{\"username\": \"admin2\"}', '2025-11-16 01:27:56'),
(85, 2, 'food', 15, 'update', '{\"price\": 100, \"food_name\": \"testt\", \"is_active\": 1, \"category_id\": 4, \"description\": null}', '2025-11-16 01:30:35'),
(86, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 02:00:08'),
(87, 1, 'bill', 25, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"404.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 9}', '2025-11-16 02:01:56'),
(88, 1, 'order_item', 54, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 42}', '2025-11-16 02:03:18'),
(89, 1, 'order', 43, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-16 02:03:29'),
(90, 1, 'order', 42, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-16 02:03:44'),
(91, 1, 'order', 42, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-16 02:03:52'),
(92, 1, 'order', 44, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-16 02:04:28'),
(93, 1, 'order', 44, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"preparing\"}', '2025-11-16 02:04:44'),
(94, 1, 'bill', 28, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"350.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 10}', '2025-11-16 02:06:20'),
(95, 1, 'bill', 31, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"79.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 11}', '2025-11-16 02:08:27'),
(96, 1, 'bill', 34, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"79.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 12}', '2025-11-16 02:09:20'),
(97, 1, 'food', 16, 'create', '{\"price\": 1000, \"food_name\": \"TestAp\", \"category_id\": 1}', '2025-11-16 02:10:28'),
(98, 1, 'food', 16, 'delete', NULL, '2025-11-16 02:18:53'),
(99, 1, 'food', 17, 'create', '{\"price\": 1000, \"food_name\": \"TestAP\", \"category_id\": 1}', '2025-11-16 02:19:25'),
(100, 1, 'bill', 37, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"3118.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 13}', '2025-11-16 02:20:57'),
(101, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 04:22:26'),
(102, 1, 'food', 18, 'create', '{\"price\": 123, \"food_name\": \"tt\", \"category_id\": 2}', '2025-11-16 04:23:05'),
(103, 1, 'food', 18, 'update', '{\"price\": 125, \"food_name\": \"tt\", \"is_active\": 1, \"category_id\": 2, \"description\": null}', '2025-11-16 04:23:24'),
(104, 1, 'food', 18, 'update', '{\"price\": 125, \"food_name\": \"ttt\", \"is_active\": 1, \"category_id\": 2, \"description\": null}', '2025-11-16 04:45:33'),
(105, 1, 'food', 18, 'update', '{\"price\": 125, \"food_name\": \"tt2\", \"is_active\": 1, \"category_id\": 2, \"description\": null}', '2025-11-16 04:52:50'),
(106, 1, 'food', 18, 'update', '{\"price\": 125, \"food_name\": \"tt2//\", \"is_active\": 1, \"category_id\": 2, \"description\": null}', '2025-11-16 04:57:55'),
(107, 1, 'food', 18, 'update', '{\"price\": 125, \"food_name\": \"tt234\", \"is_active\": 1, \"category_id\": 2, \"description\": null}', '2025-11-16 04:58:07'),
(108, 1, 'order', 53, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\"}', '2025-11-16 05:08:41'),
(109, 1, 'bill', 43, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"99.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 14}', '2025-11-16 05:11:01'),
(110, 1, 'bill', 40, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"69.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 15}', '2025-11-16 05:11:04'),
(111, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 20:08:04'),
(112, 1, 'bill', 47, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"39.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 16}', '2025-11-16 20:09:48'),
(113, 1, 'food', 19, 'create', '{\"price\": 123, \"food_name\": \"aaa\", \"category_id\": 2}', '2025-11-16 20:10:04'),
(114, 1, 'bill', 49, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"69.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 17}', '2025-11-16 20:11:20'),
(115, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 20:20:01'),
(116, 1, 'order', 59, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-16 20:34:13'),
(117, 1, 'order', 59, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-16 20:34:16'),
(118, 1, 'order', 59, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\"}', '2025-11-16 20:36:03'),
(119, 1, 'bill', 55, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"168.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 18}', '2025-11-16 20:36:54'),
(120, 1, 'bill', 52, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"69.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 19}', '2025-11-16 20:36:57'),
(121, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 20:39:56'),
(122, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 20:44:44'),
(123, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-16 22:55:09'),
(124, 1, 'bill', 70, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"69.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 20}', '2025-11-16 22:55:15'),
(125, 1, 'bill', 67, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"59.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 21}', '2025-11-16 22:55:18'),
(126, 1, 'bill', 64, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"158.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 22}', '2025-11-16 22:55:21'),
(127, 1, 'bill', 61, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"69.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 23}', '2025-11-16 22:55:24'),
(128, 1, 'bill', 58, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"108.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 24}', '2025-11-16 22:55:26'),
(129, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-17 19:46:21'),
(130, 1, 'bill', 73, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"456.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 25}', '2025-11-17 19:47:44'),
(131, 1, 'food', 17, 'update', '{\"price\": 50, \"food_name\": \"TestAP\", \"is_active\": 1, \"category_id\": 1, \"description\": \"brabra\"}', '2025-11-17 19:48:39'),
(132, 1, 'food', 17, 'update', '{\"price\": 50, \"food_name\": \"TestAP\", \"is_active\": 0, \"category_id\": 1, \"description\": \"brabra\"}', '2025-11-17 19:49:01'),
(133, 1, 'food', 17, 'update', '{\"price\": 50, \"food_name\": \"TestAP\", \"is_active\": 1, \"category_id\": 1, \"description\": \"brabra\"}', '2025-11-17 19:49:21'),
(134, 1, 'food', 20, 'create', '{\"price\": 50, \"food_name\": \"menu01\", \"category_id\": 2}', '2025-11-17 19:49:51'),
(135, 1, 'order', 71, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-17 19:50:39'),
(136, 1, 'order', 71, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-17 19:50:44'),
(137, 1, 'order', 71, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\"}', '2025-11-17 19:50:50'),
(138, 1, 'order', 72, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-17 19:51:21'),
(139, 1, 'order_item', 95, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 72}', '2025-11-17 19:51:35'),
(140, 1, 'order_item', 96, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 72}', '2025-11-17 19:51:38'),
(141, 1, 'order_item', 97, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"pending\", \"note\": null, \"order_id\": 72}', '2025-11-17 19:51:40'),
(142, 1, 'bill', 76, 'status_change', '{\"action\": \"mark_paid\", \"amount\": \"100.00\", \"method\": \"cash\", \"table_id\": 1, \"payment_id\": 26}', '2025-11-17 19:52:56'),
(143, 2, 'login', 2, 'login', '{\"username\": \"admin2\"}', '2025-11-17 19:54:22'),
(144, 2, 'food', 17, 'update', '{\"price\": 10000, \"food_name\": \"TestAP\", \"is_active\": 1, \"category_id\": 1, \"description\": \"brabra\"}', '2025-11-17 19:54:38'),
(145, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-17 21:05:04'),
(146, 1, 'order', 73, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-17 21:05:19'),
(147, 1, 'order', 73, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-17 21:19:56'),
(148, 1, 'order', 73, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\"}', '2025-11-17 21:20:00'),
(149, 1, 'order', 74, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-17 21:20:12'),
(150, 1, 'order', 75, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-17 21:20:32'),
(151, 1, 'order', 75, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-17 21:20:34'),
(152, 1, 'order_item', 101, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\", \"note\": null, \"order_id\": 75}', '2025-11-17 21:23:13'),
(153, 1, 'order', 75, 'status_change', '{\"by\": \"admin\", \"to\": \"cancelled\", \"from\": \"served\"}', '2025-11-17 21:23:15'),
(154, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-17 21:23:47'),
(155, 1, 'order', 76, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-17 21:24:02'),
(156, 1, 'order', 78, 'status_change', '{\"by\": \"admin\", \"to\": \"preparing\", \"from\": \"pending\"}', '2025-11-17 21:24:36'),
(157, 1, 'order', 78, 'status_change', '{\"by\": \"admin\", \"to\": \"served\", \"from\": \"preparing\"}', '2025-11-17 21:24:38'),
(158, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-18 19:58:31'),
(159, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-18 19:59:04'),
(160, 1, 'login', 1, 'login', '{\"username\": \"admin\"}', '2025-11-18 20:01:59'),
(161, 2, 'login', 2, 'login', '{\"username\": \"admin2\"}', '2025-11-18 20:02:38');

-- --------------------------------------------------------

--
-- Table structure for table `bill`
--

CREATE TABLE `bill` (
  `bill_id` int NOT NULL,
  `table_id` int NOT NULL,
  `bill_code` varchar(32) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open',
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `bill`
--

INSERT INTO `bill` (`bill_id`, `table_id`, `bill_code`, `status`, `subtotal`, `discount`, `total_amount`, `note`, `created_at`, `updated_at`) VALUES
(1, 1, 'T1-20251115-001', 'paid', 168.00, 0.00, 168.00, NULL, '2025-11-15 12:44:57', '2025-11-15 13:04:11'),
(4, 1, 'T1-20251115-002', 'paid', 493.00, 0.00, 493.00, NULL, '2025-11-15 13:04:16', '2025-11-15 13:07:59'),
(7, 1, 'T1-20251115-003', 'paid', 216.00, 0.00, 216.00, NULL, '2025-11-15 13:08:07', '2025-11-15 13:08:49'),
(10, 1, 'T1-20251115-004', 'paid', 69.00, 0.00, 69.00, NULL, '2025-11-15 13:09:11', '2025-11-15 13:13:38'),
(13, 1, 'T1-20251115-005', 'paid', 39.00, 0.00, 39.00, NULL, '2025-11-15 13:13:45', '2025-11-15 13:14:26'),
(16, 1, 'T1-20251115-006', 'paid', 79.00, 0.00, 79.00, NULL, '2025-11-15 13:14:31', '2025-11-15 14:08:41'),
(20, 1, 'T1-20251115-007', 'paid', 39.00, 0.00, 39.00, NULL, '2025-11-15 14:28:00', '2025-11-15 14:28:13'),
(23, 1, 'T1-20251116-001', 'paid', 267.00, 0.00, 267.00, NULL, '2025-11-15 17:36:54', '2025-11-15 17:37:29'),
(25, 1, 'T1-20251116-002', 'paid', 404.00, 0.00, 404.00, NULL, '2025-11-15 19:01:51', '2025-11-15 19:01:56'),
(28, 1, 'T1-20251116-003', 'paid', 350.00, 0.00, 350.00, NULL, '2025-11-15 19:04:59', '2025-11-15 19:06:20'),
(31, 1, 'T1-20251116-004', 'paid', 79.00, 0.00, 79.00, NULL, '2025-11-15 19:08:03', '2025-11-15 19:08:27'),
(34, 1, 'T1-20251116-005', 'paid', 79.00, 0.00, 79.00, NULL, '2025-11-15 19:09:01', '2025-11-15 19:09:20'),
(37, 1, 'T1-20251116-006', 'paid', 3118.00, 0.00, 3118.00, NULL, '2025-11-15 19:20:20', '2025-11-15 19:20:57'),
(40, 1, 'T1-20251116-007', 'paid', 69.00, 0.00, 69.00, NULL, '2025-11-15 21:21:58', '2025-11-15 22:11:04'),
(43, 1, 'T1-20251116-008', 'paid', 99.00, 0.00, 99.00, NULL, '2025-11-15 22:10:53', '2025-11-15 22:11:01'),
(47, 1, 'T1-20251116-009', 'paid', 39.00, 0.00, 39.00, NULL, '2025-11-16 13:09:37', '2025-11-16 13:09:48'),
(49, 1, 'T1-20251116-010', 'paid', 69.00, 0.00, 69.00, NULL, '2025-11-16 13:10:24', '2025-11-16 13:11:20'),
(52, 1, 'T1-20251116-011', 'paid', 69.00, 0.00, 69.00, NULL, '2025-11-16 13:13:58', '2025-11-16 13:36:57'),
(55, 1, 'T1-20251116-012', 'paid', 168.00, 0.00, 168.00, NULL, '2025-11-16 13:36:15', '2025-11-16 13:36:54'),
(58, 1, 'T1-20251116-013', 'paid', 108.00, 0.00, 108.00, NULL, '2025-11-16 14:56:48', '2025-11-16 15:55:26'),
(61, 1, 'T1-20251116-014', 'paid', 69.00, 0.00, 69.00, NULL, '2025-11-16 15:14:17', '2025-11-16 15:55:24'),
(64, 1, 'T1-20251116-015', 'paid', 158.00, 0.00, 158.00, NULL, '2025-11-16 15:18:40', '2025-11-16 15:55:21'),
(67, 1, 'T1-20251116-016', 'paid', 59.00, 0.00, 59.00, NULL, '2025-11-16 15:43:23', '2025-11-16 15:55:18'),
(70, 1, 'T1-20251116-017', 'paid', 69.00, 0.00, 69.00, NULL, '2025-11-16 15:46:50', '2025-11-16 15:55:15'),
(73, 1, 'T1-20251117-001', 'paid', 456.00, 0.00, 456.00, NULL, '2025-11-17 12:44:40', '2025-11-17 12:47:44'),
(76, 1, 'T1-20251117-002', 'paid', 100.00, 0.00, 100.00, NULL, '2025-11-17 12:51:44', '2025-11-17 12:52:56'),
(80, 1, 'T1-20251117-003', 'pending_payment', 207.00, 0.00, 207.00, NULL, '2025-11-17 14:24:19', '2025-11-17 14:24:23'),
(82, 1, 'T1-20251117-004', 'pending_payment', 69.00, 0.00, 69.00, NULL, '2025-11-17 14:24:40', '2025-11-17 14:24:41');

-- --------------------------------------------------------

--
-- Table structure for table `bill_order`
--

CREATE TABLE `bill_order` (
  `id` int NOT NULL,
  `bill_id` int NOT NULL,
  `order_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `bill_order`
--

INSERT INTO `bill_order` (`id`, `bill_id`, `order_id`) VALUES
(1, 1, 1),
(2, 1, 2),
(3, 4, 4),
(4, 4, 5),
(5, 4, 6),
(6, 4, 8),
(7, 4, 9),
(8, 4, 10),
(9, 4, 13),
(10, 7, 14),
(11, 7, 15),
(12, 7, 16),
(14, 7, 18),
(15, 10, 19),
(16, 13, 20),
(17, 16, 21),
(18, 20, 30),
(19, 23, 35),
(20, 23, 36),
(21, 25, 39),
(22, 25, 40),
(23, 25, 41),
(24, 28, 42),
(25, 28, 45),
(26, 31, 46),
(27, 34, 47),
(28, 37, 48),
(29, 37, 49),
(30, 37, 50),
(31, 37, 51),
(32, 40, 52),
(33, 43, 54),
(34, 47, 56),
(35, 49, 57),
(36, 52, 58),
(37, 55, 60),
(38, 58, 61),
(39, 58, 62),
(40, 61, 63),
(41, 64, 64),
(42, 64, 65),
(43, 67, 66),
(44, 70, 67),
(45, 73, 68),
(46, 73, 69),
(47, 73, 70),
(48, 76, 72),
(49, 80, 74),
(50, 80, 76),
(51, 80, 77),
(52, 82, 78);

-- --------------------------------------------------------

--
-- Table structure for table `category`
--

CREATE TABLE `category` (
  `category_id` int NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

CREATE TABLE `food` (
  `food_id` int NOT NULL,
  `category_id` int DEFAULT NULL,
  `food_name` varchar(100) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `description` text,
  `image` varchar(255) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

CREATE TABLE `orders` (
  `order_id` int NOT NULL,
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
  `updated_by` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`order_id`, `order_code`, `table_id`, `user_id`, `customer_name`, `phone`, `notes`, `total_amount`, `status`, `created_at`, `updated_at`, `updated_by`) VALUES
(1, NULL, 1, NULL, NULL, NULL, NULL, 99.00, 'completed', '2025-11-15 19:40:10', '2025-11-15 19:44:59', NULL),
(2, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-15 19:44:43', '2025-11-15 19:44:59', NULL),
(3, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 19:45:02', '2025-11-15 19:45:14', NULL),
(4, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-15 19:45:22', '2025-11-15 20:04:18', NULL),
(5, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-15 19:45:29', '2025-11-15 20:04:18', NULL),
(6, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-15 19:45:53', '2025-11-15 20:04:18', NULL),
(7, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 19:55:53', '2025-11-15 19:56:55', NULL),
(8, NULL, 1, NULL, NULL, NULL, NULL, 99.00, 'completed', '2025-11-15 19:57:11', '2025-11-15 20:04:18', NULL),
(9, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-15 19:57:19', '2025-11-15 20:04:18', NULL),
(10, NULL, 1, NULL, NULL, NULL, NULL, 99.00, 'completed', '2025-11-15 19:57:36', '2025-11-15 20:04:18', NULL),
(11, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:01:22', '2025-11-15 20:01:29', NULL),
(12, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:01:35', '2025-11-15 20:01:39', NULL),
(13, NULL, 1, NULL, NULL, NULL, NULL, 79.00, 'completed', '2025-11-15 20:04:01', '2025-11-15 20:04:18', NULL),
(14, NULL, 1, NULL, NULL, NULL, NULL, 79.00, 'completed', '2025-11-15 20:04:52', '2025-11-15 20:08:37', NULL),
(15, NULL, 1, NULL, NULL, NULL, NULL, 59.00, 'completed', '2025-11-15 20:05:30', '2025-11-15 20:08:37', NULL),
(16, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-15 20:05:40', '2025-11-15 20:08:37', NULL),
(17, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:07:44', '2025-11-15 20:08:21', NULL),
(18, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-15 20:07:51', '2025-11-15 20:08:37', NULL),
(19, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-15 20:08:45', '2025-11-15 20:09:13', NULL),
(20, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-15 20:13:44', '2025-11-15 20:13:47', NULL),
(21, NULL, 1, NULL, NULL, NULL, NULL, 79.00, 'completed', '2025-11-15 20:14:30', '2025-11-15 20:14:34', NULL),
(22, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:27:55', '2025-11-15 20:28:05', NULL),
(23, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:28:13', '2025-11-15 20:28:19', NULL),
(24, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:55:56', '2025-11-15 20:56:04', NULL),
(25, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:58:44', '2025-11-15 20:58:50', NULL),
(26, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:59:17', '2025-11-15 20:59:22', NULL),
(27, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 20:59:27', '2025-11-15 20:59:32', NULL),
(28, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 21:09:00', '2025-11-15 21:09:10', NULL),
(29, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 21:19:42', '2025-11-15 21:19:54', NULL),
(30, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-15 21:27:59', '2025-11-15 21:28:02', NULL),
(31, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-15 21:52:58', '2025-11-15 22:20:07', NULL),
(32, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 00:12:22', '2025-11-16 00:18:20', NULL),
(33, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 00:18:33', '2025-11-16 00:18:38', NULL),
(34, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 00:18:44', '2025-11-16 00:29:53', NULL),
(35, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 00:35:29', '2025-11-16 00:36:59', NULL),
(36, NULL, 1, NULL, NULL, NULL, NULL, 198.00, 'completed', '2025-11-16 00:36:31', '2025-11-16 00:36:59', NULL),
(37, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 00:38:04', '2025-11-16 00:38:14', NULL),
(38, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 01:40:31', '2025-11-16 01:42:58', NULL),
(39, NULL, 1, NULL, 'dg', '12312312', 'asdasdasdasd', 266.00, 'completed', '2025-11-16 02:00:28', '2025-11-16 02:01:52', NULL),
(40, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 02:01:08', '2025-11-16 02:01:52', NULL),
(41, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 02:01:22', '2025-11-16 02:01:52', NULL),
(42, NULL, 1, NULL, 'dsdsd', '1312312312', 'sdsds', 123.00, 'completed', '2025-11-16 02:02:29', '2025-11-16 02:05:52', NULL),
(43, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 02:03:25', '2025-11-16 02:03:29', NULL),
(44, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 02:04:23', '2025-11-16 02:04:44', NULL),
(45, NULL, 1, NULL, 'sdsd', 'sdsd', 'sdsd', 227.00, 'completed', '2025-11-16 02:05:37', '2025-11-16 02:05:52', NULL),
(46, NULL, 1, NULL, NULL, NULL, NULL, 79.00, 'completed', '2025-11-16 02:08:02', '2025-11-16 02:08:06', NULL),
(47, NULL, 1, NULL, NULL, NULL, NULL, 79.00, 'completed', '2025-11-16 02:09:00', '2025-11-16 02:09:02', NULL),
(48, NULL, 1, NULL, NULL, NULL, NULL, 59.00, 'completed', '2025-11-16 02:20:13', '2025-11-16 02:20:41', NULL),
(49, NULL, 1, NULL, NULL, NULL, NULL, 1000.00, 'completed', '2025-11-16 02:20:17', '2025-11-16 02:20:41', NULL),
(50, NULL, 1, NULL, NULL, NULL, NULL, 1059.00, 'completed', '2025-11-16 02:20:28', '2025-11-16 02:20:41', NULL),
(51, NULL, 1, NULL, NULL, NULL, NULL, 1000.00, 'completed', '2025-11-16 02:20:38', '2025-11-16 02:20:41', NULL),
(52, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 04:21:57', '2025-11-16 04:22:00', NULL),
(53, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 05:08:09', '2025-11-16 05:08:41', NULL),
(54, NULL, 1, NULL, NULL, NULL, NULL, 99.00, 'completed', '2025-11-16 05:10:51', '2025-11-16 05:10:56', NULL),
(55, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 20:09:22', '2025-11-16 20:09:30', NULL),
(56, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-16 20:09:34', '2025-11-16 20:09:39', NULL),
(57, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 20:10:23', '2025-11-16 20:10:26', NULL),
(58, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 20:13:48', '2025-11-16 20:14:01', NULL),
(59, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-16 20:32:00', '2025-11-16 20:36:03', NULL),
(60, NULL, 1, NULL, NULL, NULL, NULL, 168.00, 'completed', '2025-11-16 20:36:09', '2025-11-16 20:36:32', NULL),
(61, NULL, 1, NULL, NULL, NULL, NULL, 39.00, 'completed', '2025-11-16 21:56:32', '2025-11-16 22:10:41', NULL),
(62, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 21:56:47', '2025-11-16 22:10:41', NULL),
(63, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 22:14:16', '2025-11-16 22:14:24', NULL),
(64, NULL, 1, NULL, NULL, NULL, NULL, 59.00, 'completed', '2025-11-16 22:15:01', '2025-11-16 22:18:41', NULL),
(65, NULL, 1, NULL, NULL, NULL, NULL, 99.00, 'completed', '2025-11-16 22:15:06', '2025-11-16 22:18:41', NULL),
(66, NULL, 1, NULL, NULL, NULL, NULL, 59.00, 'completed', '2025-11-16 22:40:13', '2025-11-16 22:45:07', NULL),
(67, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-16 22:46:49', '2025-11-16 22:46:52', NULL),
(68, NULL, 1, NULL, NULL, NULL, NULL, 59.00, 'completed', '2025-11-17 19:42:53', '2025-11-17 19:46:04', NULL),
(69, NULL, 1, NULL, NULL, NULL, NULL, 338.00, 'completed', '2025-11-17 19:43:13', '2025-11-17 19:46:04', NULL),
(70, NULL, 1, NULL, NULL, NULL, NULL, 59.00, 'completed', '2025-11-17 19:45:44', '2025-11-17 19:46:04', NULL),
(71, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-17 19:50:07', '2025-11-17 19:50:50', NULL),
(72, NULL, 1, NULL, NULL, NULL, NULL, 100.00, 'completed', '2025-11-17 19:51:03', '2025-11-17 19:52:13', NULL),
(73, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-17 19:55:36', '2025-11-17 21:20:00', NULL),
(74, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-17 21:20:05', '2025-11-17 21:24:23', NULL),
(75, NULL, 1, NULL, NULL, NULL, NULL, 0.00, 'cancelled', '2025-11-17 21:20:24', '2025-11-17 21:23:15', NULL),
(76, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-17 21:23:54', '2025-11-17 21:24:23', NULL),
(77, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-17 21:24:13', '2025-11-17 21:24:23', NULL),
(78, NULL, 1, NULL, NULL, NULL, NULL, 69.00, 'completed', '2025-11-17 21:24:32', '2025-11-17 21:24:41', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `order_item`
--

CREATE TABLE `order_item` (
  `order_item_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `food_id` int DEFAULT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `status` enum('pending','preparing','served','completed','cancelled') NOT NULL DEFAULT 'pending',
  `cancelled_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `order_item`
--

INSERT INTO `order_item` (`order_item_id`, `order_id`, `food_id`, `quantity`, `unit_price`, `subtotal`, `status`, `cancelled_at`) VALUES
(1, 1, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 19:40:37'),
(2, 1, 13, 1, 99.00, 99.00, 'pending', NULL),
(3, 2, 4, 1, 69.00, 69.00, 'pending', NULL),
(4, 3, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 19:45:14'),
(5, 4, 4, 1, 69.00, 69.00, 'pending', NULL),
(6, 5, 5, 1, 39.00, 39.00, 'pending', NULL),
(7, 5, 14, 1, 100.00, 100.00, 'cancelled', '2025-11-15 19:45:40'),
(8, 6, 4, 1, 69.00, 69.00, 'pending', NULL),
(9, 7, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 19:56:55'),
(10, 8, 13, 1, 99.00, 99.00, 'pending', NULL),
(11, 9, 5, 1, 39.00, 39.00, 'pending', NULL),
(12, 10, 13, 1, 99.00, 99.00, 'pending', NULL),
(13, 11, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 20:01:29'),
(14, 12, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-15 20:01:39'),
(15, 13, 3, 1, 79.00, 79.00, 'pending', NULL),
(16, 14, 3, 1, 79.00, 79.00, 'pending', NULL),
(17, 15, 1, 1, 59.00, 59.00, 'pending', NULL),
(18, 16, 5, 1, 39.00, 39.00, 'pending', NULL),
(19, 17, 5, 1, 39.00, 39.00, 'cancelled', '2025-11-15 20:08:21'),
(20, 18, 5, 1, 39.00, 39.00, 'pending', NULL),
(21, 18, 14, 1, 100.00, 100.00, 'cancelled', '2025-11-15 20:08:12'),
(22, 18, 12, 1, 199.00, 199.00, 'cancelled', '2025-11-15 20:08:17'),
(23, 19, 4, 1, 69.00, 69.00, 'pending', NULL),
(24, 20, 5, 1, 39.00, 39.00, 'pending', NULL),
(25, 21, 3, 1, 79.00, 79.00, 'pending', NULL),
(26, 22, 1, 1, 59.00, 59.00, 'cancelled', '2025-11-15 20:28:05'),
(27, 23, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 20:28:19'),
(28, 24, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 20:56:04'),
(29, 25, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-15 20:58:50'),
(30, 26, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 20:59:22'),
(31, 27, 1, 1, 59.00, 59.00, 'cancelled', '2025-11-15 20:59:32'),
(32, 28, 13, 1, 99.00, 99.00, 'cancelled', '2025-11-15 21:09:10'),
(33, 29, 5, 1, 39.00, 39.00, 'cancelled', '2025-11-15 21:19:54'),
(34, 30, 5, 1, 39.00, 39.00, 'pending', NULL),
(35, 31, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-15 22:20:07'),
(36, 32, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-16 00:18:20'),
(37, 33, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-16 00:18:38'),
(38, 34, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-16 00:29:53'),
(39, 35, 4, 1, 69.00, 69.00, 'pending', NULL),
(40, 36, 4, 2, 69.00, 138.00, 'cancelled', '2025-11-16 00:36:40'),
(41, 36, 13, 2, 99.00, 198.00, 'pending', NULL),
(42, 36, 5, 1, 39.00, 39.00, 'cancelled', '2025-11-16 00:36:37'),
(43, 37, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-16 00:38:14'),
(44, 37, 2, 1, 89.00, 89.00, 'cancelled', '2025-11-16 00:38:14'),
(45, 37, 9, 1, 123.00, 123.00, 'cancelled', '2025-11-16 00:38:14'),
(46, 38, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-16 01:42:58'),
(47, 39, 1, 1, 59.00, 59.00, 'pending', NULL),
(48, 39, 4, 1, 69.00, 69.00, 'pending', NULL),
(49, 39, 13, 1, 99.00, 99.00, 'pending', NULL),
(50, 39, 5, 1, 39.00, 39.00, 'pending', NULL),
(51, 40, 4, 1, 69.00, 69.00, 'pending', NULL),
(52, 41, 4, 1, 69.00, 69.00, 'pending', NULL),
(53, 42, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-16 02:02:53'),
(54, 42, 2, 1, 89.00, 89.00, 'cancelled', '2025-11-16 02:03:18'),
(55, 42, 9, 1, 123.00, 123.00, 'pending', NULL),
(56, 43, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-16 02:03:29'),
(57, 43, 2, 1, 89.00, 89.00, 'cancelled', '2025-11-16 02:03:29'),
(58, 43, 9, 1, 123.00, 123.00, 'cancelled', '2025-11-16 02:03:29'),
(59, 44, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-16 02:04:44'),
(60, 45, 1, 1, 59.00, 59.00, 'pending', NULL),
(61, 45, 4, 1, 69.00, 69.00, 'pending', NULL),
(62, 45, 13, 1, 99.00, 99.00, 'pending', NULL),
(63, 46, 3, 1, 79.00, 79.00, 'pending', NULL),
(64, 47, 3, 1, 79.00, 79.00, 'pending', NULL),
(65, 48, 1, 1, 59.00, 59.00, 'pending', NULL),
(66, 49, 17, 1, 1000.00, 1000.00, 'pending', NULL),
(67, 50, 17, 1, 1000.00, 1000.00, 'pending', NULL),
(68, 50, 1, 1, 59.00, 59.00, 'pending', NULL),
(69, 51, 17, 1, 1000.00, 1000.00, 'pending', NULL),
(70, 52, 4, 1, 69.00, 69.00, 'pending', NULL),
(71, 53, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-16 05:08:41'),
(72, 54, 13, 1, 99.00, 99.00, 'pending', NULL),
(73, 55, 3, 1, 79.00, 79.00, 'cancelled', '2025-11-16 20:09:30'),
(74, 56, 5, 1, 39.00, 39.00, 'pending', NULL),
(75, 57, 4, 1, 69.00, 69.00, 'pending', NULL),
(76, 58, 4, 1, 69.00, 69.00, 'pending', NULL),
(77, 59, 19, 1, 123.00, 123.00, 'cancelled', '2025-11-16 20:36:03'),
(78, 60, 4, 1, 69.00, 69.00, 'pending', NULL),
(79, 60, 13, 1, 99.00, 99.00, 'pending', NULL),
(80, 61, 5, 1, 39.00, 39.00, 'pending', NULL),
(81, 62, 4, 1, 69.00, 69.00, 'pending', NULL),
(82, 63, 4, 1, 69.00, 69.00, 'pending', NULL),
(83, 64, 1, 1, 59.00, 59.00, 'pending', NULL),
(84, 65, 13, 1, 99.00, 99.00, 'pending', NULL),
(85, 66, 1, 1, 59.00, 59.00, 'pending', NULL),
(86, 67, 4, 1, 69.00, 69.00, 'pending', NULL),
(87, 68, 1, 1, 59.00, 59.00, 'pending', NULL),
(88, 68, 17, 1, 1000.00, 1000.00, 'cancelled', '2025-11-17 19:43:04'),
(89, 68, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-17 19:43:07'),
(90, 69, 5, 1, 39.00, 39.00, 'pending', NULL),
(91, 69, 14, 1, 100.00, 100.00, 'pending', NULL),
(92, 69, 12, 1, 199.00, 199.00, 'pending', NULL),
(93, 70, 1, 1, 59.00, 59.00, 'pending', NULL),
(94, 71, 20, 1, 50.00, 50.00, 'cancelled', '2025-11-17 19:50:50'),
(95, 72, 4, 1, 69.00, 69.00, 'cancelled', '2025-11-17 19:51:35'),
(96, 72, 13, 1, 99.00, 99.00, 'cancelled', '2025-11-17 19:51:38'),
(97, 72, 5, 1, 39.00, 39.00, 'cancelled', '2025-11-17 19:51:40'),
(98, 72, 14, 1, 100.00, 100.00, 'pending', NULL),
(99, 73, 19, 1, 123.00, 123.00, 'cancelled', '2025-11-17 21:20:00'),
(100, 74, 4, 1, 69.00, 69.00, 'preparing', NULL),
(101, 75, 4, 2, 69.00, 138.00, 'cancelled', '2025-11-17 21:23:13'),
(102, 75, 13, 2, 99.00, 198.00, 'cancelled', '2025-11-17 21:23:15'),
(103, 75, 17, 1, 10000.00, 10000.00, 'cancelled', '2025-11-17 21:23:15'),
(104, 75, 1, 1, 59.00, 59.00, 'cancelled', '2025-11-17 21:23:15'),
(105, 76, 4, 1, 69.00, 69.00, 'preparing', NULL),
(106, 77, 4, 1, 69.00, 69.00, 'pending', NULL),
(107, 78, 4, 1, 69.00, 69.00, 'served', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `order_status_log`
--

CREATE TABLE `order_status_log` (
  `log_id` int NOT NULL,
  `order_id` int NOT NULL,
  `user_id` int NOT NULL,
  `from_status` enum('pending','accepted','preparing','served','completed','cancelled') DEFAULT NULL,
  `to_status` enum('pending','accepted','preparing','served','completed','cancelled') NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `order_status_log`
--

INSERT INTO `order_status_log` (`log_id`, `order_id`, `user_id`, `from_status`, `to_status`, `note`, `created_at`) VALUES
(1, 1, 1, 'pending', 'cancelled', NULL, '2025-11-15 19:40:37'),
(2, 3, 1, 'pending', 'cancelled', NULL, '2025-11-15 19:45:14'),
(3, 3, 1, 'pending', 'cancelled', NULL, '2025-11-15 19:45:14'),
(4, 5, 1, 'pending', 'cancelled', NULL, '2025-11-15 19:45:40'),
(5, 12, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:01:39'),
(6, 19, 1, 'pending', 'preparing', NULL, '2025-11-15 20:08:54'),
(7, 19, 1, 'preparing', 'served', NULL, '2025-11-15 20:08:58'),
(8, 22, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:28:05'),
(9, 23, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:28:19'),
(10, 24, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:56:04'),
(11, 24, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:56:04'),
(12, 25, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:58:50'),
(13, 25, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:58:50'),
(14, 26, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:59:22'),
(15, 27, 1, 'pending', 'cancelled', NULL, '2025-11-15 20:59:32'),
(16, 28, 1, 'pending', 'cancelled', NULL, '2025-11-15 21:09:10'),
(17, 29, 1, 'pending', 'cancelled', NULL, '2025-11-15 21:19:54'),
(18, 31, 1, 'pending', 'preparing', NULL, '2025-11-15 21:53:11'),
(19, 31, 1, 'preparing', 'served', NULL, '2025-11-15 22:19:54'),
(20, 31, 1, 'pending', 'cancelled', NULL, '2025-11-15 22:20:07'),
(21, 31, 1, 'served', 'cancelled', NULL, '2025-11-15 22:20:07'),
(22, 32, 1, 'pending', 'preparing', NULL, '2025-11-16 00:12:31'),
(23, 32, 1, 'preparing', 'served', NULL, '2025-11-16 00:12:40'),
(24, 32, 1, 'pending', 'cancelled', NULL, '2025-11-16 00:18:20'),
(25, 32, 1, 'served', 'cancelled', NULL, '2025-11-16 00:18:20'),
(26, 33, 1, 'pending', 'cancelled', NULL, '2025-11-16 00:18:38'),
(27, 33, 1, 'pending', 'cancelled', NULL, '2025-11-16 00:18:38'),
(28, 34, 1, 'pending', 'preparing', NULL, '2025-11-16 00:19:01'),
(29, 34, 1, 'preparing', 'served', NULL, '2025-11-16 00:19:07'),
(30, 34, 1, 'served', 'cancelled', NULL, '2025-11-16 00:29:53'),
(31, 35, 1, 'pending', 'preparing', NULL, '2025-11-16 00:35:41'),
(32, 36, 1, 'pending', 'cancelled', NULL, '2025-11-16 00:36:37'),
(33, 36, 1, 'pending', 'cancelled', NULL, '2025-11-16 00:36:40'),
(34, 36, 1, 'pending', 'preparing', NULL, '2025-11-16 00:36:47'),
(35, 36, 1, 'preparing', 'served', NULL, '2025-11-16 00:36:50'),
(36, 37, 1, 'pending', 'cancelled', NULL, '2025-11-16 00:38:14'),
(37, 42, 1, 'pending', 'cancelled', NULL, '2025-11-16 02:03:18'),
(38, 43, 1, 'pending', 'cancelled', NULL, '2025-11-16 02:03:29'),
(39, 42, 1, 'pending', 'preparing', NULL, '2025-11-16 02:03:44'),
(40, 42, 1, 'preparing', 'served', NULL, '2025-11-16 02:03:52'),
(41, 44, 1, 'pending', 'preparing', NULL, '2025-11-16 02:04:28'),
(42, 44, 1, 'preparing', 'cancelled', NULL, '2025-11-16 02:04:44'),
(43, 53, 1, 'pending', 'cancelled', NULL, '2025-11-16 05:08:41'),
(44, 53, 1, 'pending', 'cancelled', NULL, '2025-11-16 05:08:41'),
(45, 59, 1, 'pending', 'preparing', NULL, '2025-11-16 20:34:13'),
(46, 59, 1, 'preparing', 'served', NULL, '2025-11-16 20:34:16'),
(47, 59, 1, 'served', 'cancelled', NULL, '2025-11-16 20:36:03'),
(48, 71, 1, 'pending', 'preparing', NULL, '2025-11-17 19:50:39'),
(49, 71, 1, 'preparing', 'served', NULL, '2025-11-17 19:50:44'),
(50, 71, 1, 'served', 'cancelled', NULL, '2025-11-17 19:50:50'),
(51, 72, 1, 'pending', 'preparing', NULL, '2025-11-17 19:51:21'),
(52, 72, 1, 'pending', 'cancelled', NULL, '2025-11-17 19:51:35'),
(53, 72, 1, 'pending', 'cancelled', NULL, '2025-11-17 19:51:38'),
(54, 72, 1, 'pending', 'cancelled', NULL, '2025-11-17 19:51:40'),
(55, 73, 1, 'pending', 'preparing', NULL, '2025-11-17 21:05:19'),
(56, 73, 1, 'preparing', 'served', NULL, '2025-11-17 21:19:56'),
(57, 73, 1, 'served', 'cancelled', NULL, '2025-11-17 21:20:00'),
(58, 73, 1, 'served', 'cancelled', NULL, '2025-11-17 21:20:00'),
(59, 74, 1, 'pending', 'preparing', NULL, '2025-11-17 21:20:12'),
(60, 75, 1, 'pending', 'preparing', NULL, '2025-11-17 21:20:32'),
(61, 75, 1, 'preparing', 'served', NULL, '2025-11-17 21:20:34'),
(62, 75, 1, 'served', 'cancelled', NULL, '2025-11-17 21:23:13'),
(63, 75, 1, 'served', 'cancelled', NULL, '2025-11-17 21:23:15'),
(64, 76, 1, 'pending', 'preparing', NULL, '2025-11-17 21:24:02'),
(65, 78, 1, 'pending', 'preparing', NULL, '2025-11-17 21:24:36'),
(66, 78, 1, 'preparing', 'served', NULL, '2025-11-17 21:24:38');

-- --------------------------------------------------------

--
-- Table structure for table `payment`
--

CREATE TABLE `payment` (
  `payment_id` int NOT NULL,
  `order_id` int NOT NULL,
  `bill_id` int DEFAULT NULL,
  `method` enum('cash','QR','card') DEFAULT 'cash',
  `amount` decimal(10,2) NOT NULL,
  `status` enum('unpaid','paid') DEFAULT 'unpaid',
  `paid_time` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `payment`
--

INSERT INTO `payment` (`payment_id`, `order_id`, `bill_id`, `method`, `amount`, `status`, `paid_time`) VALUES
(1, 1, 1, 'cash', 168.00, 'paid', '2025-11-15 20:04:11'),
(2, 4, 4, 'cash', 493.00, 'paid', '2025-11-15 20:07:59'),
(3, 14, 7, 'cash', 216.00, 'paid', '2025-11-15 20:08:49'),
(4, 19, 10, 'cash', 69.00, 'paid', '2025-11-15 20:13:38'),
(5, 20, 13, 'cash', 39.00, 'paid', '2025-11-15 20:14:26'),
(6, 21, 16, 'cash', 79.00, 'paid', '2025-11-15 21:08:41'),
(7, 30, 20, 'cash', 39.00, 'paid', '2025-11-15 21:28:13'),
(8, 35, 23, 'cash', 267.00, 'paid', '2025-11-16 00:37:29'),
(9, 39, 25, 'cash', 404.00, 'paid', '2025-11-16 02:01:56'),
(10, 42, 28, 'cash', 350.00, 'paid', '2025-11-16 02:06:20'),
(11, 46, 31, 'cash', 79.00, 'paid', '2025-11-16 02:08:27'),
(12, 47, 34, 'cash', 79.00, 'paid', '2025-11-16 02:09:20'),
(13, 48, 37, 'cash', 3118.00, 'paid', '2025-11-16 02:20:57'),
(14, 54, 43, 'cash', 99.00, 'paid', '2025-11-16 05:11:01'),
(15, 52, 40, 'cash', 69.00, 'paid', '2025-11-16 05:11:04'),
(16, 56, 47, 'cash', 39.00, 'paid', '2025-11-16 20:09:48'),
(17, 57, 49, 'cash', 69.00, 'paid', '2025-11-16 20:11:20'),
(18, 60, 55, 'cash', 168.00, 'paid', '2025-11-16 20:36:54'),
(19, 58, 52, 'cash', 69.00, 'paid', '2025-11-16 20:36:57'),
(20, 67, 70, 'cash', 69.00, 'paid', '2025-11-16 22:55:15'),
(21, 66, 67, 'cash', 59.00, 'paid', '2025-11-16 22:55:18'),
(22, 64, 64, 'cash', 158.00, 'paid', '2025-11-16 22:55:21'),
(23, 63, 61, 'cash', 69.00, 'paid', '2025-11-16 22:55:24'),
(24, 61, 58, 'cash', 108.00, 'paid', '2025-11-16 22:55:26'),
(25, 68, 73, 'cash', 456.00, 'paid', '2025-11-17 19:47:44'),
(26, 72, 76, 'cash', 100.00, 'paid', '2025-11-17 19:52:56');

-- --------------------------------------------------------

--
-- Table structure for table `table_info`
--

CREATE TABLE `table_info` (
  `table_id` int NOT NULL,
  `table_label` varchar(10) NOT NULL,
  `status` enum('available','occupied') DEFAULT 'available',
  `token` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

CREATE TABLE `user` (
  `user_id` int NOT NULL,
  `username` varchar(50) DEFAULT NULL,
  `name` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','staff') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'admin'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`user_id`, `username`, `name`, `password`, `role`) VALUES
(1, 'admin', 'admin', '$2b$10$zV08QUeSE7DjoRVhJSrnjeggE1j5JCmbuPw3dXRDfTFnnmRQYJUAy', 'admin'),
(2, 'admin2', 'admin2', '$2b$10$xbsic3WH3TDZZTQMlmcVMeCcDwmuWR87Hjw8FmgCl659uv3W4lx2e', 'admin');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin_activity`
--
ALTER TABLE `admin_activity`
  ADD PRIMARY KEY (`activity_id`),
  ADD KEY `idx_admin_activity_user` (`user_id`),
  ADD KEY `idx_admin_activity_created_at` (`created_at`),
  ADD KEY `idx_admin_activity_entity` (`entity_type`,`entity_id`),
  ADD KEY `idx_admin_activity_action` (`action`);

--
-- Indexes for table `bill`
--
ALTER TABLE `bill`
  ADD PRIMARY KEY (`bill_id`),
  ADD UNIQUE KEY `bill_code` (`bill_code`),
  ADD UNIQUE KEY `uq_bill_code` (`bill_code`),
  ADD KEY `idx_bill_table` (`table_id`),
  ADD KEY `idx_bill_status` (`status`),
  ADD KEY `idx_bill_created` (`created_at`);

--
-- Indexes for table `bill_order`
--
ALTER TABLE `bill_order`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bill_order` (`bill_id`,`order_id`),
  ADD KEY `idx_bo_bill` (`bill_id`),
  ADD KEY `idx_bo_order` (`order_id`);

--
-- Indexes for table `category`
--
ALTER TABLE `category`
  ADD PRIMARY KEY (`category_id`),
  ADD UNIQUE KEY `category_name` (`category_name`);

--
-- Indexes for table `food`
--
ALTER TABLE `food`
  ADD PRIMARY KEY (`food_id`),
  ADD KEY `fk_food_created_by` (`created_by`),
  ADD KEY `fk_food_updated_by` (`updated_by`),
  ADD KEY `idx_food_category` (`category_id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`order_id`),
  ADD UNIQUE KEY `order_code` (`order_code`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_orders_table` (`table_id`),
  ADD KEY `idx_orders_table_status` (`table_id`,`status`,`updated_at`),
  ADD KEY `idx_o_table_status` (`table_id`,`status`);

--
-- Indexes for table `order_item`
--
ALTER TABLE `order_item`
  ADD PRIMARY KEY (`order_item_id`),
  ADD KEY `food_id` (`food_id`),
  ADD KEY `idx_order_item_order` (`order_id`),
  ADD KEY `idx_order_item_order_status` (`order_id`,`status`),
  ADD KEY `idx_oi_order_status` (`order_id`,`status`),
  ADD KEY `idx_order_item_status` (`status`);

--
-- Indexes for table `order_status_log`
--
ALTER TABLE `order_status_log`
  ADD PRIMARY KEY (`log_id`);

--
-- Indexes for table `payment`
--
ALTER TABLE `payment`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `idx_payment_bill` (`bill_id`);

--
-- Indexes for table `table_info`
--
ALTER TABLE `table_info`
  ADD PRIMARY KEY (`table_id`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admin_activity`
--
ALTER TABLE `admin_activity`
  MODIFY `activity_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=162;

--
-- AUTO_INCREMENT for table `bill`
--
ALTER TABLE `bill`
  MODIFY `bill_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=85;

--
-- AUTO_INCREMENT for table `bill_order`
--
ALTER TABLE `bill_order`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=53;

--
-- AUTO_INCREMENT for table `category`
--
ALTER TABLE `category`
  MODIFY `category_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `food`
--
ALTER TABLE `food`
  MODIFY `food_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `order_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=79;

--
-- AUTO_INCREMENT for table `order_item`
--
ALTER TABLE `order_item`
  MODIFY `order_item_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=108;

--
-- AUTO_INCREMENT for table `order_status_log`
--
ALTER TABLE `order_status_log`
  MODIFY `log_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=67;

--
-- AUTO_INCREMENT for table `payment`
--
ALTER TABLE `payment`
  MODIFY `payment_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `table_info`
--
ALTER TABLE `table_info`
  MODIFY `table_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `user`
--
ALTER TABLE `user`
  MODIFY `user_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

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
