// frontend/src/pages/Admin/AdminLogin.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API_BASE from "../../lib/apiBase";

export default function AdminLogin() {
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000); // 10s timeout

      const r = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));

      let data = null;
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        data = await r.json().catch(() => null);
      } else {
        await r.text().catch(() => null);
      }

      if (!r.ok) {
        const msg = data?.message || r.statusText || "Login failed";
        throw new Error(msg);
      }

      const { token } = data || {};
      if (!token) throw new Error("No token returned from server");

      // บันทึก token
      sessionStorage.setItem("token", token);
      sessionStorage.setItem("isAdmin", "true");

      // ไปหน้าแดชบอร์ด
      nav("/admin/dashboard", { replace: true });
    } catch (err) {
      if (err?.name === "AbortError") {
        setError("Request timeout, please try again.");
      } else {
        setError(err?.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1A2F] text-white flex items-center justify-center px-6 relative">
      {/* Back link */}
      <a
        href="/"
        className="absolute top-4 right-4 text-xs md:text-sm opacity-70 hover:opacity-100 underline"
      >
        Back to Tables
      </a>

      <div className="w-full max-w-md bg-[#102341] border border-blue-400/10 rounded-2xl p-8 shadow-xl">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-zinc-400 mb-2">Admin</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide">Dashboard Login</h1>
        </div>

        <form className="space-y-5" onSubmit={handleLogin}>
          <div>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-slate-300 focus:ring-0 outline-none text-sm text-slate-100 placeholder:text-slate-500 transition"
              placeholder="Username"
            />
          </div>

          <div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-slate-300 focus:ring-0 outline-none text-sm text-slate-100 placeholder:text-slate-500 transition pr-16"
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded-full border border-blue-600/40 hover:bg-white/10"
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-blue-300 text-xs md:text-sm text-center bg-blue-950/40 border border-blue-400/40 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold bg-blue-500 text-white hover:bg-blue-400 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          <p className="text-center text-[11px] text-zinc-500 mt-2">
            API: {API_BASE.replace(/^https?:\/\//, "")}
          </p>
        </form>
      </div>
    </div>
  );
}