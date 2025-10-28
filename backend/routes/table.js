import express from "express";
import { db } from "../config/db.js";

const router = express.Router();

// ✅ GET /api/tables
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT table_id, table_label, status FROM table_info ORDER BY table_label ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch tables");
  }
});

export default router;