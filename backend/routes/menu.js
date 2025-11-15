// backend/routes/menu.js
import express from "express";
import pool from "../config/db.js";

// ===== SSE: Realtime Menu Stream =====
const menuClients = [];
function menuBroadcast(payload) {
  const data = JSON.stringify(payload);
  menuClients.forEach((res) => res.write(`data: ${data}\n\n`));
}

const router = express.Router();

// GET /api/menu  (optional ?cat=)
router.get("/", async (req, res) => {
  try {
    const { cat } = req.query;
    if (cat) {
      const [rows] = await pool.query(
        `SELECT f.food_id, f.food_name, f.price, f.category_id, c.category_name, f.description
         FROM food f
         LEFT JOIN category c ON c.category_id = f.category_id
         WHERE f.is_active = 1 AND f.category_id = ? 
         ORDER BY f.food_name ASC`,
        [cat]
      );
      menuBroadcast({ type: "menu_updated" });
      return res.json(rows);
    } else {
      const [rows] = await pool.query(
        `SELECT f.food_id, f.food_name, f.price, f.category_id, c.category_name, f.description
         FROM food f
         LEFT JOIN category c ON c.category_id = f.category_id
         WHERE f.is_active = 1
         ORDER BY c.category_name, f.food_name ASC`
      );
      menuBroadcast({ type: "menu_updated" });
      return res.json(rows);
    }
  } catch (e) {
    console.error(e);
    res.status(500).send("Menu error");
  }
});

// GET /api/menu/categories
router.get("/categories", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.category_id, c.category_name,
              COUNT(f.food_id) AS item_count
       FROM category c
       LEFT JOIN food f ON f.category_id = c.category_id AND f.is_active = 1
       GROUP BY c.category_id, c.category_name
       ORDER BY c.category_name ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).send("Categories error");
  }
});

// SSE stream for realtime menu updates
router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write("retry: 1000\n\n");

  menuClients.push(res);

  req.on("close", () => {
    const idx = menuClients.indexOf(res);
    if (idx >= 0) menuClients.splice(idx, 1);
  });
});

export default router;