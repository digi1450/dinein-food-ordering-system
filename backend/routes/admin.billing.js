// backend/routes/admin.billing.js
import { Router } from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";
import safeLogActivity from "../utils/safeLogActivity.js";

const router = Router();

// -----------------------------
// GET /api/admin/billing
// List bills with computed totals, hide placeholder OPEN bills with no items
// -----------------------------
router.get("/", requireAdmin, async (req, res) => {
  const status = (req.query.status || "").trim();
  const tableId = Number(req.query.table_id) || null;
  const q = (req.query.q || "").trim();
  const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 50;

  // base filter: only show pending_payment or paid bills
  const where = ["b.status IN ('pending_payment','paid')"]; 
  const params = [];

  if (status) {
    where.push("b.status = ?");
    params.push(status);
  }
  if (tableId) {
    where.push("b.table_id = ?");
    params.push(tableId);
  }
  if (q) {
    where.push("b.bill_code LIKE ?");
    params.push(`%${q}%`);
  }

  const whereSql = "WHERE " + where.join(" AND ");

  const sql = `
    SELECT
      b.bill_id,
      b.bill_code,
      b.table_id,
      b.status,
      b.subtotal,
      b.discount,
      b.total_amount,
      b.updated_at,
      t.table_label,
      SUM(CASE WHEN (oi.status IS NULL OR oi.status <> 'cancelled') THEN 1 ELSE 0 END) AS items_count,
      COALESCE(SUM(
        CASE WHEN (oi.status IS NULL OR oi.status <> 'cancelled') THEN
          (CASE WHEN oi.subtotal IS NULL OR oi.subtotal = 0 THEN oi.unit_price * oi.quantity ELSE oi.subtotal END)
        ELSE 0 END
      ), 0) AS computed_total
    FROM bill b
    LEFT JOIN table_info  t  ON t.table_id = b.table_id
    LEFT JOIN bill_order  bo ON bo.bill_id = b.bill_id
    LEFT JOIN orders      o  ON o.order_id = bo.order_id
    LEFT JOIN order_item  oi ON oi.order_id = bo.order_id
    ${whereSql}
    GROUP BY b.bill_id, b.bill_code, b.table_id, b.status, b.subtotal, b.discount, b.total_amount, b.updated_at, t.table_label
    HAVING (items_count > 0 OR computed_total > 0 OR b.total_amount > 0)
    ORDER BY b.updated_at DESC, b.bill_id DESC
    LIMIT ?`;

  try {
    const [rows] = await pool.query(sql, [...params, limit]);
    return res.json({ list: rows });
  } catch (e) {
    console.error("[ADMIN/BILLING] list bills error:", e);
    return res.status(500).json({ error: "Failed to fetch bills." });
  }
});

// -----------------------------
// GET /api/admin/billing/current
// Return 1 row per table with its latest pending_payment bill (if any)
// -----------------------------
router.get("/current", requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        t.table_id,
        t.table_label,
        b.bill_id,
        b.bill_code,
        b.status,
        b.subtotal,
        b.discount,
        b.total_amount,
        b.updated_at
      FROM table_info AS t
      LEFT JOIN bill AS b
        ON b.table_id = t.table_id
        AND b.status = 'pending_payment'
        AND b.bill_id = (
          SELECT b2.bill_id
          FROM bill AS b2
          WHERE b2.table_id = t.table_id
            AND b2.status = 'pending_payment'
          ORDER BY b2.updated_at DESC, b2.bill_id DESC
          LIMIT 1
        )
      ORDER BY t.table_id ASC
    `);
    res.json({ list: rows });
  } catch (e) {
    console.error("GET /admin/billing/current error:", e);
    res.status(500).json({ error: "Failed to fetch current bills." });
  }
});

// -----------------------------
// GET /api/admin/billing/past
// List only paid bills (most recent first)
// -----------------------------
router.get("/past", requireAdmin, async (req, res) => {
  const tableId = Number(req.query.table_id) || null;
  const q = (req.query.q || "").trim();
  const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 50;

  const where = ["b.status = 'paid'"];
  const params = [];
  if (tableId) { where.push("b.table_id = ?"); params.push(tableId); }
  if (q) { where.push("b.bill_code LIKE ?"); params.push(`%${q}%`); }

  const sql = `
    SELECT
      b.bill_id, b.bill_code, b.table_id, b.status, b.subtotal, b.discount, b.total_amount, b.updated_at,
      t.table_label
    FROM bill b
    LEFT JOIN table_info t ON t.table_id = b.table_id
    WHERE ${where.join(" AND ")}
    ORDER BY b.updated_at DESC, b.bill_id DESC
    LIMIT ?`;
  try {
    const [rows] = await pool.query(sql, [...params, limit]);
    res.json({ list: rows });
  } catch (e) {
    console.error("GET /admin/billing/past error:", e);
    res.status(500).json({ error: "Failed to fetch past bills." });
  }
});

// -----------------------------
// GET /api/admin/billing/by-table/:tableId/latest
// Latest pending_payment bill for a table (or null)
// -----------------------------
router.get("/by-table/:tableId/latest", requireAdmin, async (req, res) => {
  const tableId = Number(req.params.tableId);
  if (!Number.isFinite(tableId) || tableId <= 0) {
    return res.status(400).json({ error: "Invalid table id" });
  }
  try {
    const [[row]] = await pool.query(
      `SELECT bill_id, bill_code, table_id, status, subtotal, discount, total_amount, updated_at
       FROM bill
       WHERE table_id = ? AND status = 'pending_payment'
       ORDER BY updated_at DESC, bill_id DESC
       LIMIT 1`,
      [tableId]
    );
    res.json({ bill: row || null });
  } catch (e) {
    console.error("GET /admin/billing/by-table/:tableId/latest error:", e);
    res.status(500).json({ error: "Failed to fetch latest bill for table." });
  }
});

// -----------------------------
// GET /api/admin/billing/:billId/summary
// -----------------------------
router.get("/:billId/summary", requireAdmin, async (req, res) => {
  const billId = Number(req.params.billId);
  if (!Number.isFinite(billId) || billId <= 0) {
    return res.status(400).json({ error: "Invalid bill id" });
  }

  const [[bill]] = await pool.query(
    `SELECT bill_id,bill_code,table_id,status,subtotal,discount,total_amount,created_at,updated_at
       FROM bill WHERE bill_id=?`,
    [billId]
  );
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const [items] = await pool.query(
    `SELECT 
        oi.food_id,
        f.food_name,
        COALESCE(o.customer_name, '') AS customer_name,
        COALESCE(o.phone, '') AS customer_phone,
        COALESCE(o.notes, '') AS notes,
        SUM(oi.quantity) AS qty,
        ROUND(
          SUM(CASE WHEN oi.subtotal IS NULL OR oi.subtotal = 0 THEN oi.unit_price * oi.quantity ELSE oi.subtotal END)
          / NULLIF(SUM(oi.quantity), 0), 2
        ) AS unit_price,
        SUM(CASE WHEN oi.subtotal IS NULL OR oi.subtotal = 0 THEN oi.unit_price * oi.quantity ELSE oi.subtotal END) AS line_total
     FROM bill_order bo
     JOIN orders o      ON o.order_id = bo.order_id AND o.status = 'completed'
     JOIN order_item oi ON oi.order_id = bo.order_id AND (oi.status IS NULL OR oi.status <> 'cancelled')
     JOIN food f        ON f.food_id = oi.food_id
     WHERE bo.bill_id = ?
     GROUP BY oi.food_id, f.food_name, customer_name, customer_phone, notes
     ORDER BY f.food_name, customer_name`,
    [billId]
  );

  return res.json({
    bill,
    items,
    totals: {
      subtotal: Number(bill.subtotal || 0),
      discount: Number(bill.discount || 0),
      total: Number(bill.total_amount || 0),
    },
  });
});

// -----------------------------
// Shared confirm/mark-paid handler
// -----------------------------
async function confirmPaidHandler(req, res) {
  const billId = Number(req.params.billId);
  const method = String(req.body?.method || "cash");

  if (!Number.isFinite(billId) || billId <= 0) {
    return res.status(400).json({ error: "Invalid bill id" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[bill]] = await conn.query(
      `SELECT bill_id, table_id, status, total_amount FROM bill WHERE bill_id=? FOR UPDATE`,
      [billId]
    );
    if (!bill) { await conn.rollback(); return res.status(404).json({ error: "Bill not found" }); }
    const st = String(bill.status || "");
    if (st !== "pending_payment") {
      await conn.rollback();
      return res.status(409).json({ error: "Bill must be pending_payment to mark as paid." });
    }

    const [rows] = await conn.query(`SELECT order_id FROM bill_order WHERE bill_id=? ORDER BY order_id ASC`, [billId]);
    const firstOrderId = rows[0]?.order_id ?? null;

    const [p] = await conn.query(
      `INSERT INTO payment (order_id, bill_id, method, amount, status, paid_time)
       VALUES (?,?,?,?, 'paid', NOW())`,
      [firstOrderId, billId, method, bill.total_amount]
    );

    await conn.query(`UPDATE bill SET status='paid', updated_at=NOW() WHERE bill_id=?`, [billId]);

    // best-effort: make sure table is free for the next session
    await conn.query(`UPDATE table_info SET status = 'available' WHERE table_id = ?`, [bill.table_id]);

    // log admin activity (best-effort)
    await safeLogActivity(
      (req.user && req.user.user_id) || (req.admin && req.admin.user_id) || null,
      "bill",
      billId,
      "status_change",
      {
        action: "mark_paid",
        method,
        amount: bill.total_amount,
        table_id: bill.table_id,
        payment_id: p.insertId
      }
    );

    await conn.commit();
    return res.json({ ok: true, payment_id: p.insertId });
  } catch (e) {
    await conn.rollback();
    console.error("[ADMIN/BILLING] confirm/mark-paid error:", e);
    return res.status(500).json({ error: "Failed to mark bill as paid." });
  } finally {
    conn.release();
  }
}

// Register both endpoints so either URL works
router.post("/:billId/mark-paid", requireAdmin, confirmPaidHandler);
router.post("/:billId/confirm", requireAdmin, confirmPaidHandler);

export default router;