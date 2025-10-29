import { Router } from "express";
import { db } from "../config/db.js";
const r = Router();

r.post("/mark-paid/:orderId", async (req,res)=>{
  try{
    const { orderId } = req.params;
    const [[o]] = await db.query(
      `SELECT table_id, total_amount FROM orders WHERE order_id=?`,
      [orderId]
    );
    if(!o) return res.status(404).json({message:"order not found"});

    await db.query(
      `INSERT INTO payment (order_id, method, amount, status, paid_time)
       VALUES (?,?,?,?,NOW())`,
      [orderId, req.body.method || 'cash', o.total_amount, 'paid']
    );

    // อัปเดตสถานะออเดอร์
    await db.query(`UPDATE orders SET status='completed', updated_at=NOW() WHERE order_id=?`, [orderId]);

    // ถ้าไม่มีออเดอร์ที่ยังไม่ปิดอยู่ ให้คืนโต๊ะเป็น available
    await db.query(
      `UPDATE table_info t
       SET t.status='available'
       WHERE t.table_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM orders x
           WHERE x.table_id = t.table_id
             AND x.status NOT IN ('completed','cancelled')
         )`,
      [o.table_id]
    );

    res.json({ order_id: Number(orderId), status: 'paid' });
  }catch(e){
    console.error(e);
    res.status(500).json({message:"mark paid error"});
  }
});

export default r;