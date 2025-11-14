// backend/middleware/auth.js
import jwt from "jsonwebtoken";

export function requireAdmin(req, res, next) {
  try {
    const h = req.headers["authorization"] || "";
    const parts = h.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ message: "Missing token" });
    }
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET);
    if (payload?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    req.user = payload; // { user_id, username, role, ... }
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}