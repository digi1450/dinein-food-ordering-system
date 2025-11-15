// backend/routes/menu.js
import express from "express";
import pool from "../config/db.js";

// ===== SSE: Realtime Menu Stream =====
const menuSubscribers = new Set();

/**
 * Broadcast a menu change event to all connected SSE clients.
 * This is imported and called from admin.menu.js after create/update/delete.
 */
export function pushMenuEvent(payload = { type: "menu_changed", ts: Date.now() }) {
  const data = JSON.stringify(payload);
  for (const res of menuSubscribers) {
    try {
      // Named event so frontend can listen specifically for "menu"
      res.write(`event: menu\n`);
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      console.error("pushMenuEvent write error:", err);
    }
  }
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
      return res.json(rows);
    } else {
      const [rows] = await pool.query(
        `SELECT f.food_id, f.food_name, f.price, f.category_id, c.category_name, f.description
         FROM food f
         LEFT JOIN category c ON c.category_id = f.category_id
         WHERE f.is_active = 1
         ORDER BY c.category_name, f.food_name ASC`
      );
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

  // Optional: hint to browser how often to retry on disconnect
  res.write("retry: 1000\n\n");

  // Flush headers immediately if supported
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  // Register this connection
  menuSubscribers.add(res);

  // Initial comment to confirm connection
  res.write(`: connected to /api/menu/stream at ${new Date().toISOString()}\n\n`);

  // Heartbeat every 15s to keep proxies from closing idle connections
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      menuSubscribers.delete(res);
      return;
    }
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15000);

  // Cleanup when client disconnects
  req.on("close", () => {
    clearInterval(heartbeat);
    menuSubscribers.delete(res);
  });
});

export default router;