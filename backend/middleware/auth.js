// backend/middleware/auth.js
import jwt from "jsonwebtoken";

// Middleware: require admin role, supports token from either
// - Authorization: Bearer &lt;token&gt;  (normal fetch/XHR)
// - ?token=&lt;token&gt;                 (used by SSE/EventSource)
export function requireAdmin(req, res, next) {
  try {
    let token = null;

    // 1) Try Authorization header first
    const authHeader =
      req.headers["authorization"] ||
      req.headers["Authorization"] ||
      "";

    if (typeof authHeader === "string" && authHeader.trim() !== "") {
      const parts = authHeader.trim().split(" ");
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        token = parts[1].trim();
      }
    }

    // 2) Fallback: token in query string (for SSE)
    if (!token && typeof req.query?.token === "string" && req.query.token.trim() !== "") {
      token = req.query.token.trim();
    }

    // 3) No token at all
    if (!token) {
      return res.status(401).json({ message: "Missing token" });
    }

    // 4) Verify &amp; check role
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || payload.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // 5) Attach decoded payload for downstream handlers
    req.user = payload; // { user_id, username, role, ... }
    return next();
  } catch (e) {
    console.warn("[requireAdmin] JWT verify failed:", e?.message || e);
    return res.status(401).json({ message: "Invalid token" });
  }
}