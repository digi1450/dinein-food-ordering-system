// backend/routes/auth.js
import { Router } from "express";
import pool from "../config/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import safeLogActivity from "../utils/safeLogActivity.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ message: "Missing credentials" });

  const [rows] = await pool.query(
    "SELECT user_id, username, password, role FROM user WHERE username=?",
    [username]
  );
  if (!rows.length)
    return res.status(401).json({ message: "Invalid credentials" });

  const u = rows[0];
  // Temporary: allow both plaintext and bcrypt passwords during development
  const ok =
    u.password === password ||
    (await bcrypt.compare(password, u.password).catch(() => false));
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { user_id: u.user_id, username: u.username, role: u.role },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
  await safeLogActivity(
    u.user_id,
    "login",
    u.user_id,
    "login",
    { username: u.username }
  );
  res.json({ token });
});

export default router;