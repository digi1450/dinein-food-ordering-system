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
    status: orderRows[0].status,
    order_date: orderRows[0].order_date,
    items: itemRows,
    total_amount: Number(total || 0),
  };
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
   Body: { status: "accepted" | "preparing" | "served" | "completed" | "cancelled" }
---------------------------------------------- */
router.patch("/:id/status", async (req, res) => {
  const orderId = Number(req.params.id);
  const { status } = req.body || {};

  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ message: "Invalid order id" });
  }
  const ALLOWED = new Set([
    "pending",
    "accepted",
    "preparing",
    "served",
    "completed",
    "cancelled",
  ]);
  if (!ALLOWED.has(String(status))) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    const [r] = await db.execute(
      `UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?`,
      [status, orderId]
    );
    if (r.affectedRows === 0) return res.status(404).json({ message: "Order not found" });
    const result = await getOrderFlat(orderId);
    return res.json(result);
  } catch (err) {
    console.error("PATCH /api/orders/:id/status error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;