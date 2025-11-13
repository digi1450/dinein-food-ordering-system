// backend/routes/admin.activity.js
import { Router } from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

// helper แปลงเป็น number แบบปลอดภัย
function toNumber(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * GET /api/admin/activity
 * query:
 *  - page (default 1)
 *  - pageSize (default 50, max 200)
 *  - user_id
 *  - entity_type
 *  - action
 *  - q (search ใน details / note / meta)
 *  - date_from (YYYY-MM-DD)
 *  - date_to (YYYY-MM-DD)
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toNumber(req.query.page, 1));
    const pageSizeRaw = toNumber(req.query.pageSize, 50);
    const pageSize = Math.min(Math.max(pageSizeRaw || 50, 1), 200); // 1–200
    const offset = (page - 1) * pageSize;

    const userId = toNumber(req.query.user_id, null);
    const entityType = (req.query.entity_type || "").trim();
    const action = (req.query.action || "").trim();
    const q = (req.query.q || "").trim();
    const dateFrom = (req.query.date_from || "").trim();
    const dateTo = (req.query.date_to || "").trim();

    const where = [];
    const params = [];

    if (userId) {
      where.push("a.user_id = ?");
      params.push(userId);
    }
    if (entityType) {
      where.push("a.entity_type = ?");
      params.push(entityType);
    }
    if (action) {
      where.push("a.action = ?");
      params.push(action);
    }
    if (q) {
      // ค้นหาแบบ text ใน details (JSON string) หรือเพิ่มคอลัมน์ note ภายหลังได้
      where.push("a.details LIKE ?");
      params.push(`%${q}%`);
    }
    if (dateFrom) {
      where.push("a.created_at >= ?");
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      where.push("a.created_at <= ?");
      params.push(`${dateTo} 23:59:59`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // --- ดึงรวมจำนวนทั้งหมดเพื่อทำ pagination ---
    const [[countRow]] = await pool.query(
      `
      SELECT COUNT(*) AS total_rows
      FROM admin_activity a
      ${whereSql}
      `,
      params
    );
    const totalRows = Number(countRow.total_rows || 0);
    const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);

    // --- ดึงรายการจริง (เฉพาะหน้าที่ขอ) ---
    const [rows] = await pool.query(
      `
      SELECT 
        a.activity_id,
        a.user_id,
        u.username,
        a.entity_type,
        a.entity_id,
        a.action,
        a.details,
        a.created_at
      FROM admin_activity a
      LEFT JOIN user u ON u.user_id = a.user_id
      ${whereSql}
      ORDER BY a.created_at DESC, a.activity_id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );

    // แปลง details JSON → object (ถ้า parse ไม่ได้ก็ส่ง string กลับไป)
    const list = rows.map((row) => {
      let parsedDetails = null;
      if (row.details != null) {
        try {
          parsedDetails = JSON.parse(row.details);
        } catch {
          parsedDetails = row.details;
        }
      }
      return {
        activity_id: row.activity_id,
        user_id: row.user_id,
        username: row.username,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        details: parsedDetails,
        created_at: row.created_at,
      };
    });

    return res.json({
      page,
      pageSize,
      totalRows,
      totalPages,
      list,
    });
  } catch (e) {
    console.error("GET /api/admin/activity error:", e);
    return res.status(500).json({ message: "Failed to fetch activity log." });
  }
});

export default router;