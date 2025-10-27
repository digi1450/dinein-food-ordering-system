import { Router } from "express";
import { db } from "../config/db.js";
const r = Router();
r.get("/", async (_req,res)=>{
  try{
    const [rows] = await db.query(`SELECT table_id, table_label, status FROM table_info ORDER BY table_label`);
    res.json(rows);
  }catch(e){ res.status(500).json({message:"tables error"}); }
});
export default r;