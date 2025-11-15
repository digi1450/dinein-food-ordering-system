// backend/routes/billing.js
import express from "express";
import pool from "../config/db.js";
import { publish } from "./order.js";

const router = express.Router();

/**
 * Helper: resolve table from request (supports: table_id, table, table_label)
 * Accepts number (1), string "1", "T1", or explicit label in DB.
 */
async function resolveTableIdAndLabel(req) {
  const raw =
    req.body?.table_id ??
    req.body?.table ??
    req.body?.table_label ??
    req.query?.table_id ??
    req.query?.table ??
    req.query?.table_label;

  let tableId = null;
  let tableLabel = null;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    tableId = raw;
    tableLabel = `T${raw}`;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    const m = s.match(/^t?(\d+)$/i);
    if (m) {
      tableId = Number(m[1]);
      tableLabel = `T${tableId}`;
    } else {
      tableLabel = s.toUpperCase();
    }
  }

  if ((!Number.isFinite(tableId) || tableId <= 0) && tableLabel) {
    const [r] = await pool.query(
      `SELECT table_id FROM table_info WHERE UPPER(table_label) = ? LIMIT 1`,
      [tableLabel]
    );
    if (r && r[0]) tableId = Number(r[0].table_id);
  }

  return { tableId, tableLabel };
}

/**
 * Helper: build a bill code like T{table}-{yyyymmdd}-{nnn}
 */
async function makeBillCode(tableId) {
  const [[last]] = await pool.query(
    `SELECT IFNULL(MAX(CAST(RIGHT(bill_code, 3) AS UNSIGNED)), 0) AS last_seq
       FROM bill
      WHERE table_id = ? AND DATE(created_at) = CURDATE()`,
    [tableId]
  );
  const baseSeq = Number(last?.last_seq || 0) + 1;
  const [[d]] = await pool.query(`SELECT DATE_FORMAT(CURDATE(), '%Y%m%d') AS ymd`);
  const ymd = d?.ymd || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return { ymd, nextSeq: baseSeq };
}

/**
 * Helper: check if there are active orders with at least one non-cancelled item
 * Optionally uses a connection object for transaction consistency.
 */
async function hasActiveNonEmptyOrders(tableId, conn = null) {
  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.table_id = ?
        AND o.status IN ('pending','preparing','served')
        AND EXISTS (
          SELECT 1
          FROM order_item oi
          WHERE oi.order_id = o.order_id
            AND (oi.status IS NULL OR oi.status <> 'cancelled')
        )
      LIMIT 1
    ) AS has_active_nonempty
  `;
  const executor = conn || pool;
  const [[result]] = await executor.query(query, [tableId]);
  return !!result.has_active_nonempty;
}

/**
 * Helper: remove OPEN bills that have no active, non-empty orders attached.
 * Keeps data tidy and prevents "ghost" empty bills from showing up.
 */
async function cleanupEmptyOpenBills(tableId, conn = null) {
  const executor = conn || pool;
  // delete OPEN bills with no bill_order rows at all
  await executor.query(
    `DELETE b FROM bill b
      LEFT JOIN bill_order bo ON bo.bill_id = b.bill_id
     WHERE b.table_id = ?
       AND b.status = 'open'
       AND bo.bill_id IS NULL`,
    [tableId]
  );
  // delete OPEN bills whose attached orders do not contain any active non-cancelled items
  await executor.query(
    `DELETE b FROM bill b
      WHERE b.table_id = ?
        AND b.status = 'open'
        AND NOT EXISTS (
          SELECT 1
            FROM bill_order bo2
            JOIN orders o2 ON o2.order_id = bo2.order_id
            JOIN order_item oi2 ON oi2.order_id = o2.order_id
           WHERE bo2.bill_id = b.bill_id
             AND o2.status IN ('pending','preparing','served')
             AND (oi2.status IS NULL OR oi2.status <> 'cancelled')
        )`,
    [tableId]
  );
}

/**
 * Helper: ensure there is an OPEN bill if there are active non-empty orders
 * Returns null if no active non-empty orders.
 * Otherwise returns { billId, billCode } for the existing or newly created open bill.
 */
async function ensureOpenBillIfActive(tableId) {
  await cleanupEmptyOpenBills(tableId);
  const hasActive = await hasActiveNonEmptyOrders(tableId);
  if (!hasActive) return null;

  const [candidates] = await pool.query(
    `SELECT b.bill_id, b.bill_code
       FROM bill b
      WHERE b.table_id = ? 
        AND b.status = 'open'
        AND EXISTS (
          SELECT 1
            FROM bill_order bo
            JOIN orders o ON o.order_id = bo.order_id
            JOIN order_item oi ON oi.order_id = o.order_id
           WHERE bo.bill_id = b.bill_id
             AND o.status IN ('pending','preparing','served')
             AND (oi.status IS NULL OR oi.status <> 'cancelled')
           LIMIT 1
        )
      ORDER BY b.bill_id ASC
      LIMIT 1`,
    [tableId]
  );

  if (candidates.length) {
    return { billId: candidates[0].bill_id, billCode: candidates[0].bill_code };
  }

  // create a fresh open bill
  const { ymd, nextSeq } = await makeBillCode(tableId);
  let seq = nextSeq;
  for (let i = 0; i < 40; i++) {
    const code = `T${tableId}-${ymd}-${String(seq).padStart(3, "0")}`;
    try {
      const [ins] = await pool.query(
        `INSERT INTO bill (table_id, bill_code, status, subtotal, discount, total_amount, note)
         VALUES (?, ?, 'open', 0, 0, 0, NULL)`,
        [tableId, code]
      );
      return { billId: ins.insertId, billCode: code };
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') { seq += 1; continue; }
      throw e;
    }
  }
  throw new Error('ALLOCATE_BILL_CODE_FAILED');
}

/**
 * POST /api/billing/checkout/start
 * Ensure there is exactly one OPEN bill for this table, attach all active orders not yet attached,
 * recalc totals (from non-cancelled items), and return bill info.
 */
router.post("/checkout/start", async (req, res) => {
  let conn;
  try {
    const { tableId } = await resolveTableIdAndLabel(req);
    if (!Number.isFinite(tableId) || tableId <= 0) {
      return res.status(400).json({ error: "Invalid table_id." });
    }

    // Defensive clean-up before making/using an OPEN bill
    await cleanupEmptyOpenBills(tableId);

    const bill = await ensureOpenBillIfActive(tableId);
    if (!bill) {
      return res.status(200).json({ bill: null, billId: null, orders: [], totals: { subtotal: 0, total: 0 } });
    }
    const { billId, billCode } = bill;

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // cancel "ghost" active orders that have no non-cancelled items
    await conn.query(
      `UPDATE orders o
          SET o.status = 'cancelled', o.updated_at = NOW()
        WHERE o.table_id = ?
          AND o.status IN ('pending','preparing','served')
          AND NOT EXISTS (
            SELECT 1
              FROM order_item oi
             WHERE oi.order_id = o.order_id
               AND (oi.status IS NULL OR oi.status <> 'cancelled')
          )`,
      [tableId]
    );

    // detach non-active orders from this open bill (safety cleanup)
    await conn.query(
      `DELETE bo FROM bill_order bo
         JOIN orders o ON o.order_id = bo.order_id
       WHERE bo.bill_id = ?
         AND o.status NOT IN ('pending','preparing','served')`,
      [billId]
    );

    // attach active orders that are not yet attached anywhere
    const [active] = await conn.query(
      `SELECT o.order_id
         FROM orders o
    LEFT JOIN bill_order x ON x.order_id = o.order_id
        WHERE o.table_id = ?
          AND o.status IN ('pending','preparing','served')
          AND x.order_id IS NULL
          AND EXISTS (
            SELECT 1
              FROM order_item oi
             WHERE oi.order_id = o.order_id
               AND (oi.status IS NULL OR oi.status <> 'cancelled')
          )
        ORDER BY o.order_id ASC`,
      [tableId]
    );
    if (active.length) {
      const placeholders = active.map(() => "(?, ?)").join(",");
      const params = [];
      for (const r of active) params.push(billId, r.order_id);
      await conn.query(`INSERT IGNORE INTO bill_order (bill_id, order_id) VALUES ${placeholders}`, params);
    }

    // recalc totals
    const [[sum]] = await conn.query(
      `SELECT IFNULL(SUM(
           CASE WHEN oi.subtotal IS NULL OR oi.subtotal=0
                THEN oi.unit_price*oi.quantity
                ELSE oi.subtotal
           END),0) AS subtotal
         FROM bill_order bo
         JOIN orders o ON o.order_id = bo.order_id
         JOIN order_item oi ON oi.order_id = bo.order_id
        WHERE bo.bill_id = ?
          AND o.status IN ('pending','preparing','served')
          AND (oi.status IS NULL OR oi.status <> 'cancelled')`,
      [billId]
    );
    const subtotal = Number(sum?.subtotal || 0);
    await conn.query(
      `UPDATE bill SET subtotal=?, discount=0, total_amount=?, updated_at=NOW() WHERE bill_id=?`,
      [subtotal, subtotal, billId]
    );

    const [[billRow]] = await conn.query(
      `SELECT bill_id, bill_code, table_id, status, subtotal, discount, total_amount, created_at, updated_at
         FROM bill WHERE bill_id = ?`,
      [billId]
    );

    await conn.commit();
    conn.release();

    return res.json({ billId: billRow.bill_id, billCode, totals: { subtotal, total: subtotal }, bill: billRow });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
        conn.release();
      } catch {}
    }
    console.error("[BILLING] /checkout/start error:", e);
    return res.status(500).json({ error: "Could not open bill for this table." });
  }
});

/**
 * GET /api/billing/open-orders?table=T1
 * Ensure open bill, attach any active orders, and return orders+items for merging on the client.
 */
router.get("/open-orders", async (req, res) => {
  try {
    const { tableId } = await resolveTableIdAndLabel(req);
    if (!Number.isFinite(tableId) || tableId <= 0) {
      return res.status(400).json({ error: "Invalid table_id." });
    }

    // Defensive clean-up to avoid showing ghost OPEN bills
    await cleanupEmptyOpenBills(tableId);

    const hasActive = await hasActiveNonEmptyOrders(tableId);
    if (!hasActive) {
      return res.json({ bill_id: null, orders: [] });
    }

    const bill = await ensureOpenBillIfActive(tableId);
    if (!bill) {
      return res.json({ bill_id: null, orders: [] });
    }
    const { billId } = bill;

    // cancel "ghost" active orders that have no non-cancelled items
    await pool.query(
      `UPDATE orders o
          SET o.status = 'cancelled', o.updated_at = NOW()
        WHERE o.table_id = ?
          AND o.status IN ('pending','preparing','served')
          AND NOT EXISTS (
            SELECT 1
              FROM order_item oi
             WHERE oi.order_id = o.order_id
               AND (oi.status IS NULL OR oi.status <> 'cancelled')
          )`,
      [tableId]
    );

    // cleanup & attach (same rules as /checkout/start)
    await pool.query(
      `DELETE bo FROM bill_order bo
         JOIN orders o ON o.order_id = bo.order_id
       WHERE bo.bill_id = ?
         AND o.status NOT IN ('pending','preparing','served')`,
      [billId]
    );

    const [active] = await pool.query(
      `SELECT o.order_id
         FROM orders o
    LEFT JOIN bill_order x ON x.order_id = o.order_id
        WHERE o.table_id = ?
          AND o.status IN ('pending','preparing','served')
          AND x.order_id IS NULL
          AND EXISTS (
            SELECT 1
              FROM order_item oi
             WHERE oi.order_id = o.order_id
               AND (oi.status IS NULL OR oi.status <> 'cancelled')
          )
        ORDER BY o.order_id ASC`,
      [tableId]
    );
    if (active.length) {
      const placeholders = active.map(() => "(?, ?)").join(",");
      const params = [];
      for (const r of active) params.push(billId, r.order_id);
      await pool.query(`INSERT IGNORE INTO bill_order (bill_id, order_id) VALUES ${placeholders}`, params);
    }

    // Load orders attached to this open bill (active only, non-empty)
    const [orders] = await pool.query(
      `SELECT o.order_id, o.table_id, o.status, o.total_amount,
              COALESCE(o.customer_name, '') AS customer_name,
              COALESCE(o.phone, '') AS customer_phone,
              COALESCE(o.notes, '') AS description
         FROM bill_order bo
         JOIN orders o ON o.order_id = bo.order_id
        WHERE bo.bill_id = ?
          AND o.status IN ('pending','preparing','served')
          AND EXISTS (
            SELECT 1
              FROM order_item oi
             WHERE oi.order_id = o.order_id
               AND (oi.status IS NULL OR oi.status <> 'cancelled')
          )
        ORDER BY o.order_id ASC`,
      [billId]
    );

    for (const o of orders) {
      const [items] = await pool.query(
        `SELECT 
            oi.order_item_id,
            oi.food_id,
            f.food_name,
            oi.quantity,
            oi.unit_price,
            oi.subtotal,
            COALESCE(ord.notes, '')  AS note,
            COALESCE(oi.status,'')   AS status
         FROM order_item oi
         JOIN orders ord ON ord.order_id = oi.order_id
         JOIN food   f   ON f.food_id   = oi.food_id
         WHERE oi.order_id = ?
           AND (oi.status IS NULL OR oi.status <> 'cancelled')
         ORDER BY oi.order_item_id ASC`,
        [o.order_id]
      );
      o.items = items.map(it => ({
        order_item_id: it.order_item_id,
        food_id: it.food_id,
        food_name: it.food_name,
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        subtotal: Number(it.subtotal || 0),
        note: it.note
      }));
    }

    return res.json({ bill_id: billId, orders });
  } catch (e) {
    console.error("[BILLING] /open-orders error:", e);
    return res.status(500).json({ error: "Failed to load open orders for this table." });
  }
});

// --------- Confirm (ลูกค้ากด Checkout) → รอชำระเงินโดยแอดมิน ---------
router.post("/checkout/confirm", async (req, res) => {
  const billId = Number(req.body?.bill_id);
  const method = String(req.body?.method || "cash"); // keep method for later (admin confirm)
  if (!Number.isFinite(billId) || billId <= 0) {
    return res.status(400).json({ error: "Invalid bill_id." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // lock bill
    const [[bill]] = await conn.query(
      `SELECT bill_id, table_id, status FROM bill WHERE bill_id = ? FOR UPDATE`,
      [billId]
    );
    if (!bill) { await conn.rollback(); return res.status(404).json({ error:"Bill not found."}); }
    if (bill.status !== "open") {
      await conn.rollback();
      return res.status(409).json({ error: "Bill must be OPEN to confirm checkout." });
    }

    // cleanup non-active
    await conn.query(
      `DELETE bo FROM bill_order bo
         JOIN orders o ON o.order_id = bo.order_id
       WHERE bo.bill_id = ? AND o.status NOT IN ('pending','preparing','served')`,
      [billId]
    );

    // defensive: cancel any attached orders that somehow have no non-cancelled items
    await conn.query(
      `UPDATE orders o
          JOIN bill_order bo ON bo.order_id = o.order_id
         SET o.status = 'cancelled', o.updated_at = NOW()
       WHERE bo.bill_id = ?
         AND o.status IN ('pending','preparing','served')
         AND NOT EXISTS (
           SELECT 1
             FROM order_item oi
            WHERE oi.order_id = o.order_id
              AND (oi.status IS NULL OR oi.status <> 'cancelled')
         )`,
      [billId]
    );

    // recalc latest totals
    const [[sum]] = await conn.query(
      `SELECT IFNULL(SUM(
         CASE WHEN oi.subtotal IS NULL OR oi.subtotal=0
              THEN oi.unit_price*oi.quantity
              ELSE oi.subtotal
         END),0) AS subtotal
       FROM bill_order bo
       JOIN orders o ON o.order_id = bo.order_id
       JOIN order_item oi ON oi.order_id = bo.order_id
      WHERE bo.bill_id = ?
        AND o.status IN ('pending','preparing','served')
        AND (oi.status IS NULL OR oi.status <> 'cancelled')`,
      [billId]
    );

    const subtotal = Number(sum?.subtotal || 0);
    if (subtotal <= 0) { await conn.rollback(); return res.status(409).json({ error: "Nothing to checkout." }); }

    // 1) set bill to pending_payment (WAITING cashier)
    await conn.query(
      `UPDATE bill
         SET status='pending_payment', subtotal=?, discount=0, total_amount=?, updated_at=NOW()
       WHERE bill_id=?`,
      [subtotal, subtotal, billId]
    );

    // remove any other stale OPEN bills for this table (if any were left by race conditions)
    await conn.query(
      `DELETE FROM bill 
        WHERE table_id = ? 
          AND status = 'open' 
          AND bill_id <> ?`,
      [bill.table_id, billId]
    );

    // 2) close orders -> completed
    const [rows] = await conn.query(`SELECT order_id FROM bill_order WHERE bill_id=?`, [billId]);
    const orderIds = rows.map(r => r.order_id);
    if (orderIds.length) {
      await conn.query(
        `UPDATE orders
            SET status='completed', updated_at=NOW()
          WHERE order_id IN (${orderIds.map(()=>'?').join(',')})
            AND status IN ('pending','preparing','served')`,
        orderIds
      );
    }

    // 3) free table
    await conn.query(`UPDATE table_info SET status='available' WHERE table_id=?`, [bill.table_id]);

    const [[finalBill]] = await conn.query(
      `SELECT bill_id,bill_code,table_id,status,subtotal,discount,total_amount,created_at,updated_at
       FROM bill WHERE bill_id=?`,
      [billId]
    );

    await conn.commit();

    // After successful checkout, publish realtime updates for each completed order
    if (Array.isArray(orderIds) && orderIds.length) {
      for (const oid of orderIds) {
        try {
          await publish(oid);
        } catch (pubErr) {
          console.error("[BILLING] publish error for order", oid, pubErr);
        }
      }
    }

    return res.json({ ok:true, bill: finalBill, completed_order_ids: orderIds });
  } catch (e) {
    await conn.rollback();
    console.error("[BILLING] confirm error:", e);
    return res.status(500).json({ error: "Failed to confirm checkout." });
  } finally {
    conn.release();
  }
});

export default router;