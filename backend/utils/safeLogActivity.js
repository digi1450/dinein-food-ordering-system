import {pool} from "../config/db.js";

export default async function safeLogActivity(user_id, entity_type, entity_id, action, details = null) {
  try {
    await pool.query(
      `
      INSERT INTO admin_activity (user_id, entity_type, entity_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      `,
      [user_id, entity_type, entity_id, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.warn("safeLogActivity failed:", err.message);
  }
}