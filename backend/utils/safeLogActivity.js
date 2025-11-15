// backend/utils/safeLogActivity.js
import pool from "../config/db.js";
import { pushActivityEvent } from "../routes/admin.activity.js";

export default async function safeLogActivity(
  user_id,
  entity_type,
  entity_id,
  action,
  details = null
) {
  try {
    const payload = details == null ? null : JSON.stringify(details);

    // Insert activity log
    const [result] = await pool.query(
      `
      INSERT INTO admin_activity (user_id, entity_type, entity_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [user_id, entity_type, entity_id, action, payload]
    );

    // Broadcast SSE to all connected admin clients
    try {
      pushActivityEvent({
        type: "activity_updated",
        activity_id: result?.insertId ?? null,
        entity_type,
        entity_id,
        action,
      });
    } catch (e) {
      console.warn("[admin_activity] pushActivityEvent failed:", e?.message || e);
    }

  } catch (err) {
    console.warn("[admin_activity] safeLogActivity skipped:", err?.message || err);
  }
}