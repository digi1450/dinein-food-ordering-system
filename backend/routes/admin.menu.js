import { Router } from "express";
import { db } from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/admin/menu
 * ดึงเมนูทั้งหมด (รวมชื่อหมวด)
 */
router.get("/", /*requireAdmin,*/ async (_req, res) => {
  const [rows] = await db.query(
    `SELECT f.food_id, f.food_name, f.price, f.is_active, f.category_id, c.category_name
     FROM food f
     LEFT JOIN category c ON c.category_id = f.category_id
     ORDER BY c.category_name, f.food_name`
  );
  res.json(rows);
});

/**
 * POST /api/admin/menu
 * สร้างเมนูใหม่
 * body: { category_id, food_name, price, description? }
 */
router.post("/", requireAdmin, async (req, res) => {
  const { category_id, food_name, price, description = null, image = null, is_active = 1 } = req.body || {};
  if (!category_id || !food_name || price == null) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const [r] = await db.query(
    `INSERT INTO food (category_id, food_name, price, description, image, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [category_id, food_name, price, description, image, is_active, req.user.user_id, req.user.user_id]
  );

  await db.query(
    `INSERT INTO admin_activity (user_id, entity_type, entity_id, action, details)
     VALUES (?, 'food', ?, 'create', JSON_OBJECT('food_name', ?, 'price', ?, 'category_id', ?))`,
    [req.user.user_id, r.insertId, food_name, price, category_id]
  );

  res.status(201).json({ food_id: r.insertId });
});

/**
 * PATCH /api/admin/menu/:food_id
 * อัปเดตเมนู
 */
router.patch("/:food_id", requireAdmin, async (req, res) => {
  const { food_id } = req.params;
  const { category_id, food_name, price, description, image, is_active } = req.body || {};

  await db.query(
    `UPDATE food SET
       category_id = COALESCE(?, category_id),
       food_name   = COALESCE(?, food_name),
       price       = COALESCE(?, price),
       description = COALESCE(?, description),
       image       = COALESCE(?, image),
       is_active   = COALESCE(?, is_active),
       updated_by  = ?
     WHERE food_id = ?`,
    [category_id, food_name, price, description, image, is_active, req.user.user_id, food_id]
  );

  await db.query(
    `INSERT INTO admin_activity (user_id, entity_type, entity_id, action, details)
     VALUES (?, 'food', ?, 'update', JSON_OBJECT('food_name', ?, 'price', ?, 'category_id', ?))`,
    [req.user.user_id, food_id, food_name, price, category_id]
  );

  res.json({ ok: true });
});

/**
 * DELETE /api/admin/menu/:food_id
 * ลบเมนู
 */
router.delete("/:food_id", requireAdmin, async (req, res) => {
  const { food_id } = req.params;
  await db.query(`DELETE FROM food WHERE food_id=?`, [food_id]);
  await db.query(
    `INSERT INTO admin_activity (user_id, entity_type, entity_id, action)
     VALUES (?, 'food', ?, 'delete')`,
    [req.user.user_id, food_id]
  );
  res.json({ ok: true });
});

export default router;