// src/lib/apiBase.js
const RAW_BASE =
  (import.meta.env && (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API)) || "";

let API_BASE = "/api"; // dev: ผ่าน Vite proxy ไป 5050
if (typeof RAW_BASE === "string" && RAW_BASE.trim()) {
  const s = RAW_BASE.trim().replace(/\/+$/, "");
  if (s.startsWith("http://") || s.startsWith("https://")) API_BASE = s;
  else if (s.startsWith("/")) API_BASE = s; // e.g. "/api"
}

export default API_BASE;