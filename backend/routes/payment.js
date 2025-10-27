import { Router } from "express";
import { db } from "../config/db.js";
const r = Router();

r.post("/mark-paid/:orderId", async (req,res)=>{
  try{
    const { orderId } = req.params;
    const [[o]] = await db.query(`SELECT total_amount FROM orders WHERE order_id=?`, [orderId]);
    if(!o) return res.status(404).json({message:"order not found"});
    await db.query(
      `INSERT INTO payment (order_id, method, amount, status, paid_time)
       VALUES (?,?,?,?,NOW())`,
      [orderId, req.body.method || 'cash', o.total_amount, 'paid']
    );
    res.json({ order_id: Number(orderId), status: 'paid' });
  }catch(e){ res.status(500).json({message:"mark paid error"}); }
});

r.get("/summary/daily", async (_req,res)=>{
  try{
    const [rows] = await db.query(
      `SELECT DATE(paid_time) as day, SUM(amount) as total
       FROM payment WHERE status='paid'
       GROUP BY DATE(paid_time) ORDER BY day DESC`
    );
    res.json(rows);
  }catch(e){ res.status(500).json({message:"summary error"}); }
});

export default r;