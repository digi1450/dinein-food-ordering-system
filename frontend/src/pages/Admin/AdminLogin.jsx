// frontend/src/pages/Admin/AdminLogin.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminLogin() {
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();            // กันรีเฟรชหน้า
    setError("");
    setLoading(true);
    try {
      const API = "http://127.0.0.1:5050";
      const r = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const msg = body?.message || "Login failed";
        throw new Error(msg);
      }

      const data = await r.json();
      const { token } = data || {};
      if (!token) throw new Error("No token returned from server");

      // ✅ เก็บ token ไว้ใช้เรียก API อื่น ๆ
      localStorage.setItem("token", token);
      localStorage.setItem("isAdmin", "true");

      // ✅ ไปหน้าแดชบอร์ด
      nav("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed");
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

          {/* ใช้ form เพื่อให้กด Enter ได้ */}
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm mb-1">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 focus:border-white outline-none"
                placeholder="Enter username"
                required
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
                  required
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
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black py-2 rounded font-semibold hover:bg-gray-200 transition disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Login"}
            </button>

            <p className="text-xs opacity-70 text-center mt-2">API: 127.0.0.1:5050</p>
          </form>
        </div>
      </div>
    </div>
  );
}