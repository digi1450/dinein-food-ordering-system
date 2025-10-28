import { Router } from "express";
import { db } from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

/* =============== helpers =============== */

// บันทึก activity แบบไม่ให้พังงานหลัก (เงียบถ้าไม่มีตาราง/คอลัมน์)
async function safeLogActivity(userId, entityId, action, details = null) {
  try {
    await db.query(
      `INSERT INTO admin_activity (user_id, entity_type, entity_id, action, details)
       VALUES (?, 'food', ?, ?, ?)`,
      [userId, entityId, action, details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    // ไม่ throw: กันงานหลักล้มเพราะตาราง audit ยังไม่พร้อม
    console.warn("[admin_activity] skipped:", e?.message || e);
  }
}

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

    await safeLogActivity(req.user.user_id, r.insertId, "create", {
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

    // แยกค่าที่ส่งมา
    const payload = {
      category_id: req.body?.category_id !== undefined ? toNumber(req.body.category_id) : undefined,
      food_name: req.body?.food_name,
      price: req.body?.price !== undefined ? toNumber(req.body.price) : undefined,
      description: req.body?.description,
      image: req.body?.image,
      is_active: req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : undefined,
    };

    if (!ensureAtLeastOneField(payload)) {
      return res.status(400).json({ message: "No fields to update" });
    }

    // (optional) ถ้ามี category_id ใหม่ → ตรวจว่ามีจริง
    if (payload.category_id !== undefined && payload.category_id !== null) {
      const [cat] = await db.query(`SELECT 1 FROM category WHERE category_id=?`, [payload.category_id]);
      if (!cat.length) return res.status(400).json({ message: "category_id not found" });
    }

    const [result] = await db.query(
      `UPDATE food SET
         category_id = COALESCE(?, category_id),
         food_name   = COALESCE(?, food_name),
         price       = COALESCE(?, price),
         description = COALESCE(?, description),
         image       = COALESCE(?, image),
         is_active   = COALESCE(?, is_active),
         updated_by  = ?
       WHERE food_id = ?`,
      [
        payload.category_id ?? null,
        payload.food_name ?? null,
        payload.price ?? null,
        payload.description ?? null,
        payload.image ?? null,
        payload.is_active ?? null,
        req.user.user_id,
        foodId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Food not found" });
    }

    await safeLogActivity(req.user.user_id, foodId, "update", payload);
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /admin/menu/:food_id error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/* =============== DELETE: remove =============== */
/**
 * DELETE /api/admin/menu/:food_id
 */
router.delete("/:food_id", requireAdmin, async (req, res) => {
  try {
    const foodId = toNumber(req.params.food_id);
    if (!foodId) return res.status(400).json({ message: "Invalid food_id" });

    const [result] = await db.query(`DELETE FROM food WHERE food_id=?`, [foodId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Food not found" });
    }

    await safeLogActivity(req.user.user_id, foodId, "delete");
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /admin/menu/:food_id error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;