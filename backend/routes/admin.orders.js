// backend/routes/admin.orders.js
import express from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";
import safeLogActivity from "../utils/safeLogActivity.js";
import { publish } from "./order.js";

const router = express.Router();

// Apply admin guard to all routes in this file
router.use(requireAdmin);

// Allowed order-level transitions
const ORDER_FLOWS = {
  pending: ["preparing", "cancelled"],
  preparing: ["served", "cancelled"],
  served: ["cancelled"],
  completed: [],
  cancelled: [],
};


/**
 * GET /api/admin/orders
 * Optional query params:
 *  - status: filter by order.status
 *  - item_status: filter items by status (orders still returned, but items filtered)
 *  - table_id: filter by table
 *  - q: search by order_code (LIKE)
 */
router.get("/", async (req, res) => {
  const { status, item_status, table_id, q } = req.query || {};

  try {
    // Build WHERE for orders
    const where = [];
    const params = [];

    if (status) {
      where.push("o.status = ?");
      params.push(status);
    }
    if (table_id) {
      where.push("o.table_id = ?");
      params.push(Number(table_id));
    }
    if (q) {
      where.push("o.order_code LIKE ?");
      params.push(`%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [orders] = await pool.query(
      `
      SELECT 
        o.order_id, o.order_code, o.table_id, o.user_id, o.total_amount, o.status, o.created_at, o.updated_at,
        t.table_label
      FROM orders o
      LEFT JOIN table_info t ON t.table_id = o.table_id
      ${whereSql}
      ORDER BY o.created_at DESC
      `,
      params
    );

    if (orders.length === 0) {
      return res.json({ orders: [], items: [], list: [] });
    }

    const orderIds = orders.map((o) => o.order_id);
    const itemsParams = [orderIds];
    let itemsWhere = "oi.order_id IN (?)";
    if (item_status) {
      itemsWhere += " AND oi.status = ?";
      itemsParams.push(item_status);
    }

    const [items] = await pool.query(
      `
      SELECT 
        oi.order_item_id, oi.order_id, oi.food_id, oi.quantity, oi.unit_price, oi.subtotal, oi.status, oi.cancelled_at,
        f.food_name
      FROM order_item oi
      LEFT JOIN food f ON f.food_id = oi.food_id
      WHERE ${itemsWhere}
      ORDER BY oi.order_item_id ASC
      `,
      itemsParams
    );

    // Group items by order_id
    const byOrder = new Map();
    for (const o of orders) byOrder.set(o.order_id, { ...o, items: [] });
    for (const it of items) {
      const bucket = byOrder.get(it.order_id);
      if (bucket) bucket.items.push(it);
    }

    // Produce list for UI
    const list = orders.map((o) => byOrder.get(o.order_id));
    return res.json({ orders, items, list });
  } catch (err) {
    console.error("GET /api/admin/orders error:", err);
    return res.status(500).json({ error: "Failed to fetch orders." });
  }
});

/**
 * PATCH /api/admin/orders/items/:orderItemId
 * ใช้สำหรับ "ยกเลิกเมนูเดียว" ในออเดอร์เท่านั้น
 * Body: { note?: string }
 */
router.patch("/items/:orderItemId", async (req, res) => {
  const { orderItemId } = req.params;
  const { note } = req.body || {};
  const userId = req.user?.user_id ?? null;

  try {
    // ดึงข้อมูล item + order status
    const [rows] = await pool.query(
      `
      SELECT 
        oi.order_item_id,
        oi.order_id,
        oi.status       AS current_status,
        oi.subtotal,
        o.status        AS order_status
      FROM order_item oi
      JOIN orders o ON o.order_id = oi.order_id
      WHERE oi.order_item_id = ?
      `,
      [orderItemId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Order item not found." });
    }

    const item = rows[0];
    const fromStatus = String(item.current_status || "").toLowerCase();
    const orderStatus = String(item.order_status || "").toLowerCase();

    // 1) กันไม่ให้แก้ item ของออเดอร์ที่ปิดไปแล้ว
    if (orderStatus === "completed" || orderStatus === "cancelled") {
      return res.status(409).json({ error: "Order already closed." });
    }

    // 2) ถ้า item ถูกยกเลิกไปแล้ว ไม่ต้องทำอะไร
    if (fromStatus === "cancelled") {
      return res.status(409).json({ error: "Item already cancelled." });
    }

    const toStatus = "cancelled";

    // 3) อัปเดต item → cancelled + cancelled_at
    await pool.query(
      `
      UPDATE order_item
      SET status = ?, cancelled_at = NOW()
      WHERE order_item_id = ?
      `,
      [toStatus, orderItemId]
    );

    // 4) log ลง order_status_log (ผูกกับ order นี้)
    try {
      await pool.query(
        `
        INSERT INTO order_status_log (order_id, user_id, from_status, to_status, note, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
        `,
        [item.order_id, userId, fromStatus, toStatus, note ?? null]
      );
    } catch (e) {
      console.warn("order_status_log insert failed (item cancel):", e?.message || e);
    }

    // 5) ดูว่าทุกเมนูถูก cancel หมดหรือยัง (เช็คจากทุกแถวจริง ๆ กัน bug เรื่อง case/สะกด)
    const [allItems] = await pool.query(
      `
      SELECT status
      FROM order_item
      WHERE order_id = ?
      `,
      [item.order_id]
    );

    const allCancelled =
      Array.isArray(allItems) &&
      allItems.length > 0 &&
      allItems.every((row) => {
        const s = String(row.status || "").toLowerCase();
        return s === "cancelled" || s === "canceled";
      });

    if (allCancelled) {
      // reuse flow เดียวกับการยกเลิกทั้งออเดอร์
      req.params.orderId = String(item.order_id);
      req.body.status = "cancelled";
      return updateOrderStatusHandler(req, res);
    }

    // 6) ถ้ามีเมนูที่ยัง active เหลือ → แค่อัปเดตยอดรวม + updated_at (นับเฉพาะรายการที่ไม่ถูก cancel)
    const [[{ new_total }]] = await pool.query(
      `
      SELECT COALESCE(SUM(subtotal), 0) AS new_total
      FROM order_item
      WHERE order_id = ? AND status != 'cancelled'
      `,
      [item.order_id]
    );

    await pool.query(
      `
      UPDATE orders
      SET total_amount = ?, updated_at = NOW()
      WHERE order_id = ?
      `,
      [new_total, item.order_id]
    );

    // 7) admin activity log (best-effort)
    try {
      await safeLogActivity(
        userId,
        "order_item",
        Number(orderItemId),
        "status_change",
        {
          order_id: item.order_id,
          from: fromStatus,
          to: toStatus,
          note: note ?? null,
          by: "admin",
        }
      );
    } catch (e) {
      console.warn("safeLogActivity failed (item cancel):", e?.message || e);
    }

    // 8) แจ้งลูกค้าผ่าน SSE (realtime update)
    try {
      await publish(item.order_id);
    } catch (e) {
      console.warn("publish failed (admin item cancel):", e?.message || e);
    }

    // 9) ส่งข้อมูลกลับ (ให้ frontend เอาไปใช้ refresh UI ถ้าต้องการ)
    const [[updated]] = await pool.query(
      `
      SELECT 
        oi.order_item_id,
        oi.order_id,
        oi.status,
        oi.cancelled_at,
        (SELECT total_amount FROM orders WHERE order_id = oi.order_id) AS order_total
      FROM order_item oi
      WHERE oi.order_item_id = ?
      `,
      [orderItemId]
    );

    return res.json({ ok: true, item: updated });
  } catch (err) {
    console.error("PATCH /api/admin/orders/items/:orderItemId error:", err);
    return res.status(500).json({ error: "Failed to cancel order item." });
  }
});


const updateOrderStatusHandler = async (req, res) => {
  const { orderId } = req.params;
  const { status, note } = req.body || {};
  const next = String(status || "").toLowerCase();
  const id = Number(orderId);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid order id." });
  }
  if (
    !next ||
    !ORDER_FLOWS.pending
      .concat(ORDER_FLOWS.preparing, ORDER_FLOWS.served)
      .concat(["completed", "cancelled"])
      .includes(next)
  ) {
    return res.status(400).json({ error: "Invalid or missing status." });
  }
  // Admin cannot mark completed; must come from checkout
  if (next === "completed") {
    return res.status(409).json({ error: "Completed is only set by customer checkout." });
  }

  try {
    // read current order
    const [rows] = await pool.query(
      "SELECT order_id, status FROM orders WHERE order_id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found." });
    }
    const current = String(rows[0].status || "").toLowerCase();

    // block closed orders
    if (current === "completed" || current === "cancelled") {
      return res.status(409).json({ error: "Order already closed." });
    }

    // validate transition
    const allowedNext = ORDER_FLOWS[current] || [];
    if (!allowedNext.includes(next)) {
      return res
        .status(409)
        .json({ error: `Invalid transition from ${current} to ${next}` });
    }

    // update order status (with cascade on full cancellation)
    if (next === "cancelled") {
      // 1) cancel all order items that are not yet cancelled
      await pool.query(
        "UPDATE order_item SET status = 'cancelled', cancelled_at = NOW() WHERE order_id = ? AND (status IS NULL OR status != 'cancelled')",
        [id]
      );
      // 2) set order to cancelled and zero out total
      await pool.query(
        "UPDATE orders SET status = 'cancelled', total_amount = 0, updated_at = NOW() WHERE order_id = ?",
        [id]
      );
    } else {
      await pool.query(
        "UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?",
        [next, id]
      );
    }

    // log to order_status_log (best-effort)
    const userId = req.user?.user_id ?? null;
    try {
      await pool.query(
        `INSERT INTO order_status_log (order_id, user_id, from_status, to_status, note, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [id, userId, current, next, note ?? null]
      );
    } catch (e) {
      console.warn("order_status_log insert failed:", e?.message || e);
    }

    // admin activity log (best-effort)
    try {
      await safeLogActivity(
        userId,
        "order",
        id,
        "status_change",
        { from: current, to: next, by: "admin" }
      );
    } catch (e) {
      console.warn("safeLogActivity failed (best-effort):", e?.message || e);
    }

    // แจ้งลูกค้าผ่าน SSE ว่ามีการเปลี่ยนสถานะออเดอร์
    try {
      await publish(id);
    } catch (e) {
      console.warn("publish failed (admin order status change):", e?.message || e);
    }

    return res.json({ ok: true, order_id: id, from: current, to: next });
  } catch (err) {
    console.error("PATCH updateOrderStatusHandler error:", err);
    return res.status(500).json({ error: "Failed to update order status." });
  }
};

// Register both paths to be safe regardless of how this router is mounted
router.patch("/orders/:orderId/status", updateOrderStatusHandler);
router.patch("/:orderId/status", updateOrderStatusHandler);

export default router;
