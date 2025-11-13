import pool from "../config/db.js";

export default async function safeLogActivity(user_id, entity_type, entity_id, action, details = null) {
  try {
    const payload = details == null ? null : JSON.stringify(details);
    await pool.query(
      `
      INSERT INTO admin_activity (user_id, entity_type, entity_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [user_id, entity_type, entity_id, action, payload]
    );
  } catch (err) {
    console.warn("[admin_activity] safeLogActivity skipped:", err?.message || err);
  }
}