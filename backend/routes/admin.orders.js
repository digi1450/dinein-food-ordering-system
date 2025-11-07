import express from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";
import safeLogActivity from "../utils/safeLogActivity.js";

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

// Allowed item-level transitions for admin
const ITEM_FLOWS = {
  pending: ["preparing", "cancelled"],
  preparing: ["served", "cancelled"],
  served: ["cancelled"],
  completed: [],
  cancelled: [],
};

// Helper: allowed item statuses
const ALLOWED_ITEM_STATUS = new Set([
  "pending",
  "preparing",
  "served",
  "completed",
  "cancelled",
]);

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
 * Body: { status: 'pending|preparing|served|completed|cancelled', note? }
 */
router.patch("/items/:orderItemId", async (req, res) => {
  const { orderItemId } = req.params;
  const { status, note } = req.body || {};

  if (!status || !ALLOWED_ITEM_STATUS.has(status)) {
    return res.status(400).json({ error: "Invalid or missing status." });
  }

  try {
    // Fetch current item
    const [rows] = await pool.query(
      `
      SELECT 
        oi.order_item_id, oi.order_id, oi.status AS current_status, oi.subtotal
      FROM order_item oi
      WHERE oi.order_item_id = ?
      `,
      [orderItemId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Order item not found." });
    }
    const item = rows[0];

    // Validate allowed status transitions (admin)
    const from = String(item.current_status || "").toLowerCase();
    const to = String(status || "").toLowerCase();
    if (!ITEM_FLOWS[from]?.includes(to)) {
      return res.status(400).json({ error: `Invalid status transition from ${from} to ${to}` });
    }

    // Update item status (+ cancelled_at handling)
    if (status === "cancelled") {
      await pool.query(
        `UPDATE order_item SET status = ?, cancelled_at = NOW() WHERE order_item_id = ?`,
        [status, orderItemId]
      );
    } else {
      await pool.query(
        `UPDATE order_item SET status = ?, cancelled_at = NULL WHERE order_item_id = ?`,
        [status, orderItemId]
      );
    }

    // Insert status log
    const userId = req.user?.user_id ?? null;
    await pool.query(
      `
      INSERT INTO order_status_log (order_id, user_id, from_status, to_status, note, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [item.order_id, userId, item.current_status, status, note ?? null]
    );

    // Recalculate order total (exclude cancelled items)
    const [[{ new_total }]] = await pool.query(
      `
      SELECT COALESCE(SUM(subtotal), 0) AS new_total
      FROM order_item
      WHERE order_id = ? AND status != 'cancelled'
      `,
      [item.order_id]
    );
    await pool.query(`UPDATE orders SET total_amount = ? WHERE order_id = ?`, [
      new_total,
      item.order_id,
    ]);

    // --- Sync parent order.status based on its items ---
    const [[statusAgg]] = await pool.query(
      `
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)    AS pending_cnt,
        SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END)  AS preparing_cnt,
        SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END)     AS served_cnt,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)  AS completed_cnt,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)  AS cancelled_cnt,
        COUNT(*)                                               AS total_cnt
      FROM order_item
      WHERE order_id = ?
      `,
      [item.order_id]
    );
    
    let newOrderStatus = "pending";
    const {
      pending_cnt = 0,
      preparing_cnt = 0,
      served_cnt = 0,
      completed_cnt = 0,
      cancelled_cnt = 0,
      total_cnt = 0,
    } = statusAgg || {};
    
    if (total_cnt > 0) {
      // ถ้าทั้งหมดถูกยกเลิก → ยกเลิกทั้งออเดอร์
      if (cancelled_cnt === total_cnt) {
        newOrderStatus = "cancelled";
      }
      // ถ้ามี served หรือ completed อย่างน้อยหนึ่งรายการ → ถือว่า "served" (อย่า promote เป็น completed ที่นี่)
      else if (served_cnt > 0 || completed_cnt > 0) {
        newOrderStatus = "served";
      }
      // ถ้ามี preparing หรือ pending เหลือ → preparing
      else if (pending_cnt > 0 || preparing_cnt > 0) {
        newOrderStatus = "preparing";
      }
      // เงื่อนไขอื่น (default)
      else {
        newOrderStatus = "preparing";
      }

      await pool.query(`UPDATE orders SET status = ? WHERE order_id = ?`, [
        newOrderStatus,
        item.order_id,
      ]);
    }
    // --- end sync parent status ---

    // Activity log (best-effort)
    try {
      await safeLogActivity(
        userId,
        "order_item",
        Number(orderItemId),
        "status_change",
        { order_id: item.order_id, from: item.current_status, to: status, note: note ?? null }
      );
    } catch (e) {
      // non-blocking
      console.warn("safeLogActivity failed:", e?.message || e);
    }

    // Return updated item + snapshot of order totals
    const [[updated]] = await pool.query(
      `
      SELECT 
        oi.order_item_id, oi.order_id, oi.status, oi.cancelled_at,
        (SELECT total_amount FROM orders WHERE order_id = oi.order_id) AS order_total
      FROM order_item oi
      WHERE oi.order_item_id = ?
      `,
      [orderItemId]
    );

    return res.json({ ok: true, item: updated });
  } catch (err) {
    console.error("PATCH /api/admin/orders/items/:id error:", err);
    return res.status(500).json({ error: "Failed to update order item status." });
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
      console.warn("safeLogActivity failed:", e?.message || e);
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
