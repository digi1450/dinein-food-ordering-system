import { Router } from "express";
import { db } from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";
import safeLogActivity from "../utils/safeLogActivity.js";

const router = Router();

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ensureAtLeastOneField(obj) {
  return Object.values(obj).some((v) => v !== undefined);
}

/* =============== GET: list all foods =============== */
/**
 * GET /api/admin/menu
 * ดึงเมนูทั้งหมด (รวมชื่อหมวด)
 * (ล็อกหลังบ้านด้วย requireAdmin)
 */
router.get("/", requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
         f.food_id, f.food_name, f.price, f.is_active, 
         f.category_id, c.category_name,
         f.description, f.image,
         f.created_by, f.updated_by
       FROM food f
       LEFT JOIN category c ON c.category_id = f.category_id
       ORDER BY c.category_name, f.food_name`
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /admin/menu error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* =============== GET: single food =============== */
/**
 * GET /api/admin/menu/:food_id
 * ดึงเมนูเดี่ยว (เพื่อใช้ตอนแก้ไข)
 */
router.get("/:food_id", requireAdmin, async (req, res) => {
  try {
    const foodId = toNumber(req.params.food_id);
    if (!foodId) return res.status(400).json({ message: "Invalid food_id" });

    const [rows] = await db.query(
      `SELECT 
         f.food_id, f.food_name, f.price, f.is_active, 
         f.category_id, c.category_name,
         f.description, f.image
       FROM food f
       LEFT JOIN category c ON c.category_id = f.category_id
       WHERE f.food_id = ?`,
      [foodId]
    );

    if (!rows.length) return res.status(404).json({ message: "Food not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("GET /admin/menu/:food_id error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* =============== POST: create =============== */
/**
 * POST /api/admin/menu
 * body: { category_id, food_name, price, description?, image?, is_active? }
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const {
      category_id,
      food_name,
      price,
      description = null,
      image = null,
      is_active = 1,
    } = req.body || {};

    const catId = toNumber(category_id);
    const prc = toNumber(price);

    if (!catId || !food_name || prc == null) {
      return res.status(400).json({ message: "Missing fields: category_id, food_name, price" });
    }

    // (optional) ตรวจว่าหมวดมีจริงไหม
    const [cat] = await db.query(`SELECT 1 FROM category WHERE category_id=?`, [catId]);
    if (!cat.length) return res.status(400).json({ message: "category_id not found" });

    const [r] = await db.query(
      `INSERT INTO food 
         (category_id, food_name, price, description, image, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [catId, food_name, prc, description, image, is_active ? 1 : 0, req.user.user_id, req.user.user_id]
    );

    await safeLogActivity(req.user.user_id, "food", r.insertId, "create", {
      food_name,
      price: prc,
      category_id: catId,
    });

    res.status(201).json({ food_id: r.insertId });
  } catch (e) {
    console.error("POST /admin/menu error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* =============== PATCH: update =============== */
/**
 * PATCH /api/admin/menu/:food_id
 * body: { category_id?, food_name?, price?, description?, image?, is_active? }
 */
router.patch("/:food_id", requireAdmin, async (req, res) => {
  try {
    const foodId = toNumber(req.params.food_id);
    if (!foodId) return res.status(400).json({ message: "Invalid food_id" });

    // --- normalize incoming fields (allow clearing description/image by sending "" or null) ---
    const normalizeNullable = (v) => (v === "" ? null : v);
    const payload = {
      category_id: req.body?.category_id !== undefined ? toNumber(req.body.category_id) : undefined,
      food_name: req.body?.food_name,
      price: req.body?.price !== undefined ? toNumber(req.body.price) : undefined,
      description: req.body?.description !== undefined ? normalizeNullable(req.body.description) : undefined,
      image: req.body?.image !== undefined ? normalizeNullable(req.body.image) : undefined,
      is_active: req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : undefined,
    };

    // at least one field must be present (including null for clearing)
    if (!ensureAtLeastOneField(payload)) {
      return res.status(400).json({ message: "No fields to update" });
    }

    // validate category_id only when provided (and not null)
    if (payload.category_id !== undefined && payload.category_id !== null) {
      const [cat] = await db.query(`SELECT 1 FROM category WHERE category_id=?`, [payload.category_id]);
      if (!cat.length) return res.status(400).json({ message: "category_id not found" });
    }

    // build dynamic SET list; include a field only when it is provided (even if null)
    const setClauses = [];
    const params = [];

    if (payload.category_id !== undefined) {
      setClauses.push(`category_id = ?`);
      params.push(payload.category_id);
    }
    if (payload.food_name !== undefined) {
      setClauses.push(`food_name = ?`);
      params.push(payload.food_name);
    }
    if (payload.price !== undefined) {
      if (payload.price === null || !Number.isFinite(payload.price)) {
        return res.status(400).json({ message: "Invalid price" });
      }
      setClauses.push(`price = ?`);
      params.push(payload.price);
    }
    if (payload.description !== undefined) {
      // allow NULL to clear description
      setClauses.push(`description = ?`);
      params.push(payload.description);
    }
    if (payload.image !== undefined) {
      // allow NULL to clear image
      setClauses.push(`image = ?`);
      params.push(payload.image);
    }
    if (payload.is_active !== undefined) {
      setClauses.push(`is_active = ?`);
      params.push(payload.is_active);
    }

    // always update 'updated_by'
    setClauses.push(`updated_by = ?`);
    params.push(req.user.user_id);

    // finalize query
    const sql = `UPDATE food SET ${setClauses.join(", ")} WHERE food_id = ?`;
    params.push(foodId);

    const [result] = await db.query(sql, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Food not found" });
    }

    await safeLogActivity(req.user.user_id, "food", foodId, "update", payload);
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /admin/menu/:food_id error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* =============== DELETE: hard remove with FK fallback =============== */
/**
 * DELETE /api/admin/menu/:food_id
 * พยายามลบจริง (hard delete) ก่อน
 * ถ้าติด FK (เช่น ถูกอ้างอิงโดย order_item) → fallback เป็น soft delete (is_active = 0)
 */
router.delete("/:food_id", requireAdmin, async (req, res) => {
  try {
    const foodId = toNumber(req.params.food_id);
    if (!foodId) return res.status(400).json({ message: "Invalid food_id" });

    let result;
    try {
      [result] = await db.query(`DELETE FROM food WHERE food_id = ?`, [foodId]);
    } catch (err) {
      // FK protected: 1451 (Row is referenced), 1217 (Cannot delete or update a parent row)
      const mysqlErr = err?.errno || err?.code;
      if (mysqlErr === 1451 || mysqlErr === 1217) {
        // Fallback: soft delete instead of hard delete
        const [upd] = await db.query(
          `UPDATE food SET is_active = 0, updated_by = ? WHERE food_id = ?`,
          [req.user.user_id, foodId]
        );
        if (upd.affectedRows > 0) {
          await safeLogActivity(req.user.user_id, "food", foodId, "soft_delete", { reason: "FK protected" });
          return res.json({ ok: true, softDeleted: true });
        }
        // if cannot soft delete for some reason, return conflict
        return res.status(409).json({
          message: "Cannot delete this menu item because it is referenced by existing orders.",
          code: "ROW_REFERENCED",
        });
      }
      throw err;
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Food not found" });
    }

    await safeLogActivity(req.user.user_id, "food", foodId, "delete");
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /admin/menu/:food_id error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;