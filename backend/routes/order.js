// backend/routes/order.js
import { Router } from "express";
import pool from "../config/db.js";

const router = Router();
function allowDevOrigin(res, req) {
  const origin = req.headers.origin;
  if (origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
}
/* ---------------------------------------------
   Helper: ดึงออเดอร์แบบ flatten + items
---------------------------------------------- */
async function getOrderFlat(orderId) {
  // ข้อมูลหัวออเดอร์
  const [orderRows] = await pool.query(
    `SELECT 
       o.order_id,
       o.table_id,
       t.table_label,
       o.status,
       o.customer_name,
       o.phone,
       o.notes,
       o.created_at AS order_date,
       o.total_amount
     FROM orders o
     LEFT JOIN table_info t ON t.table_id = o.table_id
     WHERE o.order_id = ?`,
    [orderId]
  );
  if (!orderRows.length) return null;

  // รายการอาหารในออเดอร์
  const [itemRows] = await pool.query(
    `SELECT 
       oi.order_item_id,
       oi.food_id,
       f.food_name,
       oi.quantity,
       oi.unit_price,
       oi.subtotal,
       oi.status
     FROM order_item oi
     JOIN food f ON f.food_id = oi.food_id
     WHERE oi.order_id = ?`,
    [orderId]
  );

  // รวมยอด (fallback ถ้า total_amount ยังเป็น null)
  let total = orderRows[0].total_amount;
  if (total == null) {
    total = itemRows.reduce((s, it) => s + Number(it.subtotal || 0), 0);
  }

  return {
    order_id: orderRows[0].order_id,
    table_id: orderRows[0].table_id,
    table_label: orderRows[0].table_label ?? null,
    customer_name: orderRows[0].customer_name ?? null,
    phone: orderRows[0].phone ?? null,
    notes: orderRows[0].notes ?? null,
    status: orderRows[0].status,
    order_date: orderRows[0].order_date,
    items: itemRows,
    total_amount: Number(total || 0),
  };
}

/* ---------------------------------------------
   Realtime (SSE): per-order + admin feed
---------------------------------------------- */
const orderSubscribers = new Map();      // Map<orderId:number, Set<res>>
const adminFeedSubscribers = new Set();  // Set<res>

function subscribeOrder(orderId, res) {
  let set = orderSubscribers.get(orderId);
  if (!set) {
    set = new Set();
    orderSubscribers.set(orderId, set);
  }
  set.add(res);
  res.on("close", () => {
    set.delete(res);
    if (set.size === 0) orderSubscribers.delete(orderId);
  });
}

function subscribeAdminFeed(res) {
  adminFeedSubscribers.add(res);
  res.on("close", () => adminFeedSubscribers.delete(res));
}

async function getRecentOrders(limit = 30) {
  const [rows] = await pool.query(
    `SELECT 
       o.order_id,
       o.table_id,
       t.table_label,
       o.status,
       o.total_amount,
       o.created_at,
       o.updated_at
     FROM orders o
     LEFT JOIN table_info t ON t.table_id = o.table_id
     ORDER BY o.updated_at DESC, o.created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

async function publish(orderId) {
  // push snapshot to per-order listeners
  const subs = orderSubscribers.get(orderId);
  if (subs && subs.size) {
    try {
      const snapshot = await getOrderFlat(orderId);
      const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
      for (const res of subs) res.write(payload);
    } catch (e) {
      // ignore
    }
  }
  // push feed to admin listeners
  if (adminFeedSubscribers.size) {
    try {
      const feed = await getRecentOrders();
      const payload = `data: ${JSON.stringify(feed)}\n\n`;
      for (const res of adminFeedSubscribers) res.write(payload);
    } catch (e) {
      // ignore
    }
  }
}

/* ---------------------------------------------
   GET /api/orders/stream-all  → SSE for admin feed
   (ต้องมาก่อน /:id)
---------------------------------------------- */
router.get("/stream-all", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  allowDevOrigin(res, req);

  if (typeof res.flushHeaders === "function") res.flushHeaders();

  // initial feed
  try {
    const feed = await getRecentOrders();
    res.write(`data: ${JSON.stringify(feed)}\n\n`);
  } catch (e) {}

  // subscribe
  subscribeAdminFeed(res);
  // heartbeat กันหลุด
  const interval = setInterval(() => {
    res.write(":keep-alive\n\n");
  }, 15000);
  res.on("close", () => {
    clearInterval(interval);
  });
});

/* ---------------------------------------------
   GET /api/orders/:id   → flatten response
---------------------------------------------- */
router.get("/:id", async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }

  try {
    const result = await getOrderFlat(orderId);
    if (!result) return res.status(404).json({ message: "Order not found" });
    return res.json(result);
  } catch (err) {
    console.error("GET /api/orders/:id error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------------
   GET /api/orders/:id/stream  → SSE per order
---------------------------------------------- */
router.get("/:id/stream", async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId)) {
    return res.status(400).end();
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  allowDevOrigin(res, req);

  if (typeof res.flushHeaders === "function") res.flushHeaders();

  // send first snapshot
  try {
    const snapshot = await getOrderFlat(orderId);
    if (snapshot) res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  } catch (e) {}

  // subscribe
  subscribeOrder(orderId, res);

  // ส่ง heartbeat ทุก 15 วิ เพื่อกัน timeout
  const interval = setInterval(() => {
    res.write(":keep-alive\n\n");
  }, 15000);

  res.on("close", () => {
    clearInterval(interval);
  });
});

/* ---------------------------------------------
   GET /api/orders
   (optional) ?status=pending&table_id=1
   สำหรับหน้า Admin list orders
---------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const { status, table_id } = req.query;
    const where = [];
    const args = [];

    // include_closed = 1,true → เอาทุกสถานะใน "รอบปัจจุบัน"
    const include_closed = String(req.query?.include_closed || "").toLowerCase();
    const wantClosed = include_closed === "1" || include_closed === "true";

    let lastCompletedAt = null;

    // ถ้ามี table_id → หาว่า "โต๊ะนี้ checkout ครั้งล่าสุดเมื่อไหร่"
    if (table_id) {
      const tableIdNum = Number(table_id);
      if (Number.isFinite(tableIdNum) && tableIdNum > 0) {
        // filter ตามโต๊ะก่อน
        where.push("o.table_id = ?");
        args.push(tableIdNum);

        // ดู log ว่าออเดอร์ไหนของโต๊ะนี้เคยถูกเปลี่ยนเป็น completed ล่าสุดเมื่อไหร่
        const [boundaryRows] = await pool.query(
          `
          SELECT MAX(l.created_at) AS last_completed_at
          FROM orders o
          JOIN order_status_log l ON l.order_id = o.order_id
          WHERE o.table_id = ? AND l.to_status = 'completed'
          `,
          [tableIdNum]
        );
        if (boundaryRows && boundaryRows[0] && boundaryRows[0].last_completed_at) {
          lastCompletedAt = boundaryRows[0].last_completed_at;
        }
      }
    }

    // filter ตาม status ถ้าระบุมาแบบตรง ๆ
    if (status) {
      where.push("o.status = ?");
      args.push(status);
    }

    // จำกัดให้เห็นเฉพาะ "ออเดอร์ในรอบปัจจุบันของโต๊ะนี้"
    // คือออเดอร์ที่ถูกสร้างหลังจากที่มีการ checkout (completed) ครั้งล่าสุด
    if (lastCompletedAt) {
      where.push("o.created_at > ?");
      args.push(lastCompletedAt);
    }

    // ถ้าไม่ได้ขอ include_closed → ไม่เอา completed / cancelled (ถือว่าอันนี้คือหน้าลูกค้าใช้เช็คว่า
    // ยังมีออเดอร์ค้างอยู่ไหม)
    if (!wantClosed && !status) {
      where.push("o.status NOT IN ('completed','cancelled')");
    }

    // กรองออเดอร์ที่มียอด (total_amount) เท่านั้น
    where.push("o.total_amount IS NOT NULL");

    const sql = `
      SELECT 
        o.order_id,
        o.table_id,
        t.table_label,
        o.status,
        o.total_amount,
        o.created_at
      FROM orders o
      LEFT JOIN table_info t ON t.table_id = o.table_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY o.created_at DESC, o.order_id DESC
      LIMIT 200
    `;
    const [rows] = await pool.query(sql, args);
    return res.json(rows);
  } catch (err) {
    console.error("GET /api/orders error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------------
   POST /api/orders
   Body:
   {
     table_id, customer_name?, phone?, notes?,
     items: [{ food_id, quantity }]
   }
   - คำนวนราคาจาก food ปัจจุบัน
   - เขียน orders + order_item ใน transaction
---------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const { table_id, customer_name = null, phone = null, notes = null, items } =
      req.body || {};

    if (!table_id || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid payload: table_id and items[] are required" });
    }

    // normalize
    const normItems = items.map((it) => ({
      food_id: Number(it.food_id),
      quantity: Math.max(1, Number(it.quantity || 1)),
    }));

    const ids = [
      ...new Set(normItems.map((it) => it.food_id).filter(Number.isFinite)),
    ];
    if (ids.length === 0) {
      return res.status(400).json({ message: "No valid food_id in items" });
    }

    // ดึงราคาอาหาร
    const placeholders = ids.map(() => "?").join(",");
    const [priceRows] = await pool.query(
      `SELECT food_id, price FROM food WHERE food_id IN (${placeholders})`,
      ids
    );
    
    if (priceRows.length !== ids.length) {
      return res.status(400).json({ message: "Some food_id not found" });
    }
    const priceMap = new Map(
      priceRows.map((r) => [Number(r.food_id), Number(r.price)])
    );

    // คำนวนรายการ
    const orderItems = normItems.map((it) => {
      const unit_price = priceMap.get(it.food_id);
      if (!Number.isFinite(unit_price)) {
        throw new Error(`Missing price for food_id ${it.food_id}`);
      }
      const subtotal = unit_price * it.quantity;
      return { ...it, unit_price, subtotal };
    });

    const totalAmount = orderItems.reduce((sum, it) => sum + it.subtotal, 0);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // บันทึกหัวออเดอร์
      const [orderRes] = await conn.query(
        `INSERT INTO orders 
           (table_id, status, customer_name, phone, notes, created_at, total_amount)
         VALUES (?, 'pending', ?, ?, ?, NOW(), ?)`,
        [table_id, customer_name, phone, notes, totalAmount]
      );
      const orderId = Number(orderRes.insertId);
      
      // หลังได้ orderId แล้ว
      await conn.query(
        `UPDATE table_info SET status='occupied' WHERE table_id=?`,
        [table_id]
      );
      // บันทึกรายการ
      const values = orderItems.flatMap((it) => [
        orderId,
        it.food_id,
        it.quantity,
        it.unit_price,
        it.subtotal,
        "pending",
      ]);
      const placeholdersRow = orderItems.map(() => "(?,?,?,?,?,?)").join(",");
      await conn.query(
        `INSERT INTO order_item (order_id, food_id, quantity, unit_price, subtotal, status)
         VALUES ${placeholdersRow}`,
        values
      );
      


      await conn.commit();

      // notify realtime listeners (fire-and-forget)
      publish(orderId).catch(() => {});

      // ส่งกลับแบบ flatten เพื่อให้ frontend ใช้ต่อได้เลย
      return res.status(201).json({
        order_id: orderId,
        table_id,
        status: "pending",
        total_amount: Number(totalAmount.toFixed(2)),
      });
    } catch (txErr) {
      await conn.rollback();
      console.error("POST /api/orders tx error:", txErr);
      return res.status(500).json({ message: "Failed to create order" });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("POST /api/orders error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------------
   PATCH /api/orders/:id/status
   Body: { status: "pending" | "preparing" | "served" | "completed" | "cancelled", note? }
---------------------------------------------- */
router.patch("/:id/status", async (req, res) => {
  const orderId = Number(req.params.id);
  const { status, note = null } = req.body || {};

  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }
  const ALLOWED = new Set([
    "pending", "preparing", "served", "completed", "cancelled",
  ]);
  if (!ALLOWED.has(String(status))) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    // 1) อ่านสถานะก่อนหน้า (และ user_id ถ้าผูกผู้สั่งงานไว้)
    const [[prev]] = await pool.query(
      `SELECT status, user_id FROM orders WHERE order_id=?`,
      [orderId]
    );
    if (!prev) return res.status(404).json({ message: "Order not found" });

    // 2) อัปเดตสถานะใหม่
    const [r] = await pool.query(
      `UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?`,
      [status, orderId]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 3) บันทึกลง order_status_log
    //    - ถ้ายังไม่มีระบบ auth ให้ใช้ user_id = prev.user_id || 1 ชั่วคราว
    await pool.query(
      `INSERT INTO order_status_log (order_id, user_id, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [orderId, prev?.user_id ?? 1, prev.status, status, note]
    );

    // 4) โหลด snapshot ปัจจุบันส่งกลับ + แจ้ง SSE
    const result = await getOrderFlat(orderId);
    publish(orderId).catch(() => {});
    return res.json(result);

  } catch (err) {
    console.error("PATCH /api/orders/:id/status error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});



/* ---------------------------------------------
   PATCH /api/order-items/:itemId/cancel
   ยกเลิกรายการอาหารเฉพาะรายการ (ได้เฉพาะสถานะ pending)
---------------------------------------------- */
router.patch("/order-items/:itemId/cancel", async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return res.status(400).json({ message: "invalid itemId" });
    }

    // 1) ดึงข้อมูลรายการ
    const [[row]] = await pool.query(
      `SELECT order_item_id, order_id, status
       FROM order_item
       WHERE order_item_id = ?`,
      [itemId]
    );
    if (!row) return res.status(404).json({ message: "item not found" });

    // ลูกค้าจะยกเลิกได้เฉพาะสถานะ pending; แอดมินยกเลิกได้ทุกสถานะ
    const role = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : 'customer';
    const isAdmin = role === 'admin';
    if (!isAdmin && String(row.status || '').toLowerCase() !== 'pending') {
      return res.status(409).json({ message: 'Only pending items can be cancelled by customer.' });
    }

    // 2) ยกเลิกรายการ
    await pool.query(
      `UPDATE order_item
       SET status='cancelled', cancelled_at = NOW()
       WHERE order_item_id = ?`,
      [itemId]
    );

    // 3) คำนวณยอดคงเหลือของออเดอร์ และอัปเดตหัวออเดอร์
    const [[sumRow]] = await pool.query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN subtotal IS NOT NULL THEN subtotal
           ELSE COALESCE(unit_price, 0) * COALESCE(quantity, 0)
         END
       ),0) AS total
       FROM order_item
       WHERE order_id=? AND (status IS NULL OR status != 'cancelled')`,
      [row.order_id]
    );

    const remainingTotal = Number(sumRow.total || 0);

    // มีรายการที่ยังไม่ถูกยกเลิกเหลืออยู่ไหม
    const [[left]] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM order_item
       WHERE order_id=? AND (status IS NULL OR status != 'cancelled')`,
      [row.order_id]
    );

    if (Number(left.cnt) === 0) {
      // ไม่มีรายการเหลือ → ปิดออเดอร์นี้เป็น cancelled และตั้งยอดเป็น 0
      await pool.query(
        `UPDATE orders
         SET status='cancelled', total_amount=0, updated_at=NOW()
         WHERE order_id=?`,
        [row.order_id]
      );
    } else {
      // ยังมีรายการเหลือ → อัปเดตยอดรวมใหม่
      await pool.query(
        `UPDATE orders SET total_amount=?, updated_at=NOW() WHERE order_id=?`,
        [remainingTotal, row.order_id]
      );
    }

    // แจ้งผู้ติดตาม SSE ของออเดอร์นี้
    publish(row.order_id).catch(() => {});

    return res.json({ ok: true, order_item_id: itemId, order_id: row.order_id, remaining_total: remainingTotal });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "cancel item error" });
  }
});

export default router;