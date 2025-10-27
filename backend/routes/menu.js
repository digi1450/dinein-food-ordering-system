import { Router } from "express";
import { db } from "../config/db.js";
const r = Router();

r.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT f.food_id, f.food_name, f.price, f.description, f.image, f.is_active,
              c.category_name, f.category_id
       FROM food f LEFT JOIN category c ON f.category_id=c.category_id
       WHERE f.is_active=1 ORDER BY c.category_name, f.food_name`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({message:"menu error"}); }
});

r.post("/", async (req, res) => {
  try {
    const { category_id, food_name, price, description, image, is_active=1 } = req.body;
    const [rs] = await db.query(
      `INSERT INTO food (category_id,food_name,price,description,image,is_active) VALUES (?,?,?,?,?,?)`,
      [category_id || null, food_name, price, description || null, image || null, is_active]
    );
    res.status(201).json({ food_id: rs.insertId });
  } catch (e) { res.status(500).json({message:"create food error"}); }
});

export default r;