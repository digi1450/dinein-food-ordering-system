import { Router } from "express";
import { db } from "../config/db.js";

const router = Router();

/**
 * GET /api/orders/:id
 * คืนค่าแบบ flatten:
 * { order_id, table_id, table_label, status, order_date, items[], total_amount }
 */
router.get("/:id", async (req, res) => {
  const orderId = Number(req.params.id);
  if (!orderId) return res.status(400).json({ message: "Invalid order id" });

  try {
    const [orderRows] = await db.query(
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

    if (!orderRows.length) return res.status(404).json({ message: "Order not found" });
    const order = orderRows[0];

    const [items] = await db.query(
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

    let total = null;
    if (order.total_amount != null) {
      const n = Number(order.total_amount);
      total = Number.isNaN(n) ? null : n;
    }
    if (total == null) {
      total = items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
    }

    return res.json({
      order_id: order.order_id,
      table_id: order.table_id,
      table_label: order.table_label ?? null,
      status: order.status,
      order_date: order.order_date,
      items,
      total_amount: total,
    });
  } catch (err) {
    console.error("GET /api/orders/:id error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/orders
 * Body: { table_id, customer_name?, phone?, notes?, items: [{ food_id, quantity }] }
 * - ดึงราคา food ปัจจุบัน
 * - คำนวณ subtotal/total
 * - ใช้ transaction บันทึก orders + order_item
 */
router.post("/", async (req, res) => {
  try {
    const { table_id, customer_name = null, phone = null, notes = null, items } = req.body || {};

    if (!table_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Invalid payload: table_id and items[] are required" });
    }

    const normItems = items.map((it) => ({
      food_id: Number(it.food_id),
      quantity: Math.max(1, Number(it.quantity || 1)),
    }));

    const ids = normItems
      .map((it) => it.food_id)
      .filter((v, i, a) => Number.isFinite(v) && a.indexOf(v) === i);

    if (ids.length === 0) {
      return res.status(400).json({ message: "No valid food_id in items" });
    }

    const placeholders = ids.map(() => "?").join(",");
    const [priceRows] = await db.query(
      `SELECT food_id, price FROM food WHERE food_id IN (${placeholders})`,
      ids
    );

    if (priceRows.length !== ids.length) {
      return res.status(400).json({ message: "Some food_id not found" });
    }

    const priceMap = new Map(priceRows.map((r) => [Number(r.food_id), Number(r.price)]));

    const orderItems = normItems.map((it) => {
      const unit_price = priceMap.get(it.food_id);
      if (!Number.isFinite(unit_price)) throw new Error(`Missing price for food_id ${it.food_id}`);
      const subtotal = unit_price * it.quantity;
      return { ...it, unit_price, subtotal };
    });

    const totalAmount = orderItems.reduce((sum, it) => sum + it.subtotal, 0);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [orderRes] = await conn.query(
        `INSERT INTO orders (table_id, status, customer_name, phone, notes, created_at, total_amount)
         VALUES (?, 'pending', ?, ?, ?, NOW(), ?)`,
        [table_id, customer_name, phone, notes, totalAmount]
      );
      const orderId = Number(orderRes.insertId);

      const values = orderItems.map((it) => [
        orderId,
        it.food_id,
        it.quantity,
        it.unit_price,
        it.subtotal,
      ]);

      await conn.query(
        `INSERT INTO order_item (order_id, food_id, quantity, unit_price, subtotal)
         VALUES ${values.map(() => "(?,?,?,?,?)").join(",")}`,
        values.flat()
      );

      await conn.commit();

      return res.status(201).json({
        order_id: orderId,
        table_id,
        status: "pending",
        total_amount: totalAmount,
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

export default router;