import jwt from "jsonwebtoken";

export function requireAdmin(req, res, next) {
  const raw = req.headers.authorization || "";
  const token = raw.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!["admin", "staff"].includes(payload.role))
      return res.status(403).json({ message: "Forbidden" });

    req.user = payload; // { user_id, username, role }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}