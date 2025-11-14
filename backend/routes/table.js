// backend/routes/table.js
import express from "express";
import pool from "../config/db.js";

const router = express.Router();

// ✅ GET /api/tables
router.get("/", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    const [rows] = await pool.query(`
      SELECT
        t.table_id,
        t.table_label,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM orders o
            WHERE o.table_id = t.table_id
              AND o.status NOT IN ('completed','cancelled')
          ) THEN 'occupied'
          ELSE 'available'
        END AS status
      FROM table_info t
      ORDER BY t.table_label ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch tables");
  }
});

export default router;