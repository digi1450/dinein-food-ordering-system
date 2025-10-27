import { Router } from "express";
import { db } from "../config/db.js";
const r = Router();

r.post("/login", async (req,res)=>{
  try{
    const { name, password } = req.body;
    const [[u]] = await db.query(`SELECT * FROM user WHERE name=? LIMIT 1`, [name]);
    if(!u || u.password !== password) return res.status(401).json({message:"invalid"});
    res.json({ user_id: u.user_id, name: u.name, role: u.role });
  }catch(e){ res.status(500).json({message:"login error"}); }
});

export default r;