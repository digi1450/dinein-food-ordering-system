// backend/routes/order.js
import { Router } from "express";
import { db } from "../config/db.js";

const router = Router();

/* ---------------------------------------------
   Helper: ดึงออเดอร์แบบ flatten + items
---------------------------------------------- */
async function getOrderFlat(orderId) {
  // ข้อมูลหัวออเดอร์
  const [orderRows] = await db.execute(
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
  const [itemRows] = await db.execute(
    `SELECT 
       oi.food_id,
       f.food_name,
       oi.quantity,
       oi.unit_price,
       oi.subtotal
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
  const [rows] = await db.execute(
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
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5173");

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

    if (status) {
      where.push("o.status = ?");
      args.push(status);
    }
    if (table_id) {
      where.push("o.table_id = ?");
      args.push(Number(table_id));
    }
    // แสดงเฉพาะออเดอร์ที่ยังดำเนินอยู่เท่านั้น
    where.push("o.status NOT IN ('completed', 'cancelled')");


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
    const [rows] = await db.execute(sql, args);
    return res.json(rows);
  } catch (err) {
    console.error("GET /api/orders error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ---------------------------------------------
   GET /api/orders/stream-all  → SSE for admin feed
---------------------------------------------- */
router.get("/stream-all", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5173");

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
    const [priceRows] = await db.execute(
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

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // บันทึกหัวออเดอร์
      const [orderRes] = await conn.execute(
        `INSERT INTO orders 
           (table_id, status, customer_name, phone, notes, created_at, total_amount)
         VALUES (?, 'pending', ?, ?, ?, NOW(), ?)`,
        [table_id, customer_name, phone, notes, totalAmount]
      );
      const orderId = Number(orderRes.insertId);
      
      // หลังได้ orderId แล้ว
      await conn.execute(
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
      ]);
      const placeholdersRow = orderItems.map(() => "(?,?,?,?,?)").join(",");
      await conn.execute(
        `INSERT INTO order_item (order_id, food_id, quantity, unit_price, subtotal)
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
   Body: { status: "accepted" | "preparing" | "served" | "completed" | "cancelled", note? }
---------------------------------------------- */
router.patch("/:id/status", async (req, res) => {
  const orderId = Number(req.params.id);
  const { status, note = null } = req.body || {};

  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }
  const ALLOWED = new Set([
    "pending", "accepted", "preparing", "served", "completed", "cancelled",
  ]);
  if (!ALLOWED.has(String(status))) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    // 1) อ่านสถานะก่อนหน้า (และ user_id ถ้าผูกผู้สั่งงานไว้)
    const [[prev]] = await db.execute(
      `SELECT status, user_id FROM orders WHERE order_id=?`,
      [orderId]
    );
    if (!prev) return res.status(404).json({ message: "Order not found" });

    // 2) อัปเดตสถานะใหม่
    const [r] = await db.execute(
      `UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?`,
      [status, orderId]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 3) บันทึกลง order_status_log
    //    - ถ้ายังไม่มีระบบ auth ให้ใช้ user_id = prev.user_id || 1 ชั่วคราว
    await db.execute(
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


export default router;