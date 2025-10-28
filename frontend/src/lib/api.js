// frontend/src/lib/api.js
const API_BASE = import.meta.env.VITE_API || "http://127.0.0.1:5050";
const DEFAULT_TIMEOUT = 10000; // 10s

export function getToken() {
  try { return localStorage.getItem("token") || ""; } catch { return ""; }
}
export function setToken(token) {
  if (!token) return;
  localStorage.setItem("token", token);
  localStorage.setItem("isAdmin", "true");
}
export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("isAdmin");
}

export function buildQuery(params = {}) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((it) => s.append(k, String(it)));
    else s.append(k, String(v));
  });
  const q = s.toString();
  return q ? `?${q}` : "";
}

function isFormData(body) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * apiFetch – fetch helper
 * options:
 *  - method
 *  - body (object | FormData)
 *  - headers
 *  - auth: true | false | 'auto' (default 'auto')
 *  - timeout: ms (default 10s)
 *  - retry: number (เฉพาะ GET)
 */
export async function apiFetch(
  path,
  {
    method = "GET",
    body,
    headers = {},
    auth = "auto",
    timeout = DEFAULT_TIMEOUT,
    retry = 0,
    ...rest
  } = {}
) {
  const url = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  // สร้าง headers
  const h = { ...headers };
  if (body !== undefined && !isFormData(body) && !h["Content-Type"]) {
    h["Content-Type"] = "application/json";
  }

  // แนบ token อัตโนมัติเมื่อ:
  // - auth === true หรือ
  // - auth === 'auto' และ path เริ่มด้วย /api/admin
  const shouldAuth =
    auth === true || (auth === "auto" && path.replace(API_BASE, "").startsWith("/api/admin"));
  if (shouldAuth) {
    const token = getToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }

  // timeout + abort
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);

  const doFetch = async () => {
    let resp;
    try {
      resp = await fetch(url, {
        method,
        headers: h,
        body: body === undefined ? undefined : isFormData(body) ? body : JSON.stringify(body),
        signal: ctrl.signal,
        ...rest,
      });
    } catch (err) {
      if (err?.name === "AbortError") throw new Error("Request timeout");
      throw err;
    } finally {
      clearTimeout(t);
    }

    // auth fail → เคลียร์ token และเด้ง login
    if (resp.status === 401 || resp.status === 403) {
      clearToken();
      window.location.replace("/admin/login");
      throw new Error("Unauthorized");
    }

    const contentType = resp.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await resp.json().catch(() => null)
                                                          : await resp.text().catch(() => null);

    if (!resp.ok) {
      const msg = data?.message || resp.statusText || "Request failed";
      const err = new Error(msg);
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  // retry แบบเบาๆ เฉพาะ GET
  let lastErr;
  for (let i = 0; i <= retry; i++) {
    try {
      return await doFetch();
    } catch (e) {
      lastErr = e;
      const transient = e.message?.includes("timeout") || e.message?.includes("Network");
      if (method !== "GET" || !transient || i === retry) break;
      await new Promise((r) => setTimeout(r, 300 * (i + 1))); // backoff
    }
  }
  throw lastErr;
}

// shorthand
export const api = {
  get: (p, o) => apiFetch(p, { ...o, method: "GET" }),
  post: (p, body, o) => apiFetch(p, { ...o, method: "POST", body }),
  patch: (p, body, o) => apiFetch(p, { ...o, method: "PATCH", body }),
  put: (p, body, o) => apiFetch(p, { ...o, method: "PUT", body }),
  del: (p, o) => apiFetch(p, { ...o, method: "DELETE" }),

  // namespace สำหรับหลังบ้าน (บังคับ auth + prefix)
  admin: {
    get: (p, o) => apiFetch(`/api/admin${p.startsWith("/") ? "" : "/"}${p}`, { ...o, method: "GET", auth: true }),
    post: (p, body, o) => apiFetch(`/api/admin${p.startsWith("/") ? "" : "/"}${p}`, { ...o, method: "POST", body, auth: true }),
    patch: (p, body, o) => apiFetch(`/api/admin${p.startsWith("/") ? "" : "/"}${p}`, { ...o, method: "PATCH", body, auth: true }),
    put: (p, body, o) => apiFetch(`/api/admin${p.startsWith("/") ? "" : "/"}${p}`, { ...o, method: "PUT", body, auth: true }),
    del: (p, o) => apiFetch(`/api/admin${p.startsWith("/") ? "" : "/"}${p}`, { ...o, method: "DELETE", auth: true }),
  },
};