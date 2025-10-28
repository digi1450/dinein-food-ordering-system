import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API || "http://127.0.0.1:5050";

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

      const r = await fetch(`${API}/api/admin/login`, {
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
      localStorage.setItem("token", token);
      localStorage.setItem("isAdmin", "true");

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
    <div className="relative min-h-screen bg-gray-900 text-white">
      <a
        href="/"
        className="absolute top-4 right-4 text-sm opacity-80 hover:opacity-100 underline"
      >
        Back to Tables
      </a>

      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur p-8 rounded-lg shadow-lg w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 focus:border-white outline-none"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Password</label>
              <div>
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 focus:border-white outline-none"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="mt-2 text-xs px-3 py-1 border rounded hover:bg-white/10"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && <div className="text-red-400 text-sm">{error}</div>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-white text-black py-2 rounded font-semibold hover:bg-gray-200 transition disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Login"}
            </button>

            <p className="text-xs opacity-70 text-center mt-2">
              API: {API.replace(/^https?:\/\//, "")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}