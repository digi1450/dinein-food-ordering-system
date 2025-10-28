const API_BASE = import.meta.env.VITE_API || "http://127.0.0.1:5050";

function getToken() {
  return localStorage.getItem("token") || "";
}

/**
 * apiFetch: หุ้ม fetch ให้รวม baseURL, JSON, error handling, และ auth header
 * @param {string} path - เช่น "/api/admin/menu"
 * @param {object} options - { method, body, headers, auth }
 */
export async function apiFetch(
  path,
  { method = "GET", body, headers = {}, auth = true, ...rest } = {}
) {
  const url = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const h = { ...headers };
  // default เป็น JSON (ถ้ามี body)
  if (body !== undefined && h["Content-Type"] === undefined) {
    h["Content-Type"] = "application/json";
  }
  // แนบ token อัตโนมัติ (สำหรับ admin routes)
  if (auth) {
    const t = getToken();
    if (t) h.Authorization = `Bearer ${t}`;
  }

  const resp = await fetch(url, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  // ถ้า token หมดอายุ/ไม่มีสิทธิ์ → ล้าง token แล้วเด้งหน้า login
  if (resp.status === 401 || resp.status === 403) {
    localStorage.removeItem("token");
    localStorage.removeItem("isAdmin");
    // ใช้ replace กัน loop back
    window.location.replace("/admin/login");
    throw new Error("Unauthorized");
  }

  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json() : await resp.text();

  if (!resp.ok) {
    const msg = (data && data.message) || resp.statusText || "Request failed";
    const err = new Error(msg);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ช็อตคัตแบบ method
export const api = {
  get: (p, o) => apiFetch(p, { ...o, method: "GET" }),
  post: (p, body, o) => apiFetch(p, { ...o, method: "POST", body }),
  patch: (p, body, o) => apiFetch(p, { ...o, method: "PATCH", body }),
  put: (p, body, o) => apiFetch(p, { ...o, method: "PUT", body }),
  del: (p, o) => apiFetch(p, { ...o, method: "DELETE" }),
};


