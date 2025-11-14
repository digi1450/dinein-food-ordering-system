// frontend/src/lib/apiBase.js
const fromEnv = (import.meta?.env?.VITE_API_BASE || import.meta?.env?.VITE_API || "").trim();

let API_BASE = "http://127.0.0.1:5050/api"; // default for local backend
if (fromEnv) {
  const s = fromEnv.replace(/\/+$/, "");
  if (s.startsWith("http://") || s.startsWith("https://")) {
    API_BASE = s;              // e.g. https://my-host/api
  } else if (s.startsWith("/")) {
    API_BASE = s;              // e.g. /api (if you intentionally use Vite proxy)
  }
}

export default API_BASE;