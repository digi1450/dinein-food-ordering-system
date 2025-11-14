//backend/routes/admin.js
import { Router } from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";
import safeLogActivity from "../utils/safeLogActivity.js";

const router = Router();

// สร้างเมนู
router.post("/", requireAdmin, async (req, res) => {
  const { category_id, food_name, price, description = null } = req.body || {};
  if (!category_id || !food_name || price == null)
    return res.status(400).json({ message: "Missing fields" });

  const [r] = await pool.query(
    `INSERT INTO food (category_id, food_name, price, description, created_by, updated_by)
     VALUES (?,?,?,?,?,?)`,
    [category_id, food_name, price, description, req.user.user_id, req.user.user_id]
  );

  await safeLogActivity(
    req.user.user_id,
    "food",
    r.insertId,
    "create",
    { food_name, price }
  );

  res.status(201).json({ food_id: r.insertId });
});
export default router;