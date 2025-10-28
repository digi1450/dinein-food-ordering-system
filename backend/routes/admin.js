import { Router } from "express";
import { db } from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

// สร้างเมนู
router.post("/", requireAdmin, async (req, res) => {
  const { category_id, food_name, price, description = null } = req.body || {};
  if (!category_id || !food_name || price == null)
    return res.status(400).json({ message: "Missing fields" });

  const [r] = await db.query(
    `INSERT INTO food (category_id, food_name, price, description, created_by, updated_by)
     VALUES (?,?,?,?,?,?)`,
    [category_id, food_name, price, description, req.user.user_id, req.user.user_id]
  );

  await db.query(
    `INSERT INTO admin_activity (user_id, entity_type, entity_id, action, details)
     VALUES (?, 'food', ?, 'create', JSON_OBJECT('food_name', ?, 'price', ?))`,
    [req.user.user_id, r.insertId, food_name, price]
  );

  res.status(201).json({ food_id: r.insertId });
});
export default router;