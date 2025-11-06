// frontend/src/pages/Admin/AdminDashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import API_BASE from "../../lib/apiBase";


export default function AdminDashboard() {
  const nav = useNavigate();

  // tabs: orders | menu | activity
  const [tab, setTab] = useState("orders");

  // data states
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [activity, setActivity] = useState([]);

  const [editingId, setEditingId] = useState(null);   // food_id that is being edited; null = create-new
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // to disable delete button while processing

  // create-menu form
  const [form, setForm] = useState({
    category_id: "2",
    food_name: "",
    price: "",
    description: "",
    is_active: 1,
  });

  // ---- Guard: ไม่มี token ให้เด้งไป login ----
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) {
      nav("/admin/login", { replace: true });
    }
  }, [nav]);

  // ---- Realtime orders (SSE feed) ----
  useEffect(() => {
    // ถ้า stream นี้ต้องใช้ auth ให้เปลี่ยนไปใช้ ?token=... ใน query (EventSource ใส่ header ไม่ได้)
    const es = new EventSource(`${API_BASE}/orders/stream-all`);
    es.onmessage = (e) => {
      try { setOrders(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  // ---- load menu list (ต้องแนบ token) ----
  const loadMenu = async () => {
    try {
      // ใช้ api.admin เพื่อบังคับแนบ Authorization: Bearer <token>
      const data = await api.admin.get("/menu");
      setMenu(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("loadMenu error:", e);
      setMenu([]);
    }
  };

  // ---- load recent admin activity (ต้องแนบ token) ----
  const loadActivity = async () => {
    try {
      // ใช้ api.admin เช่นกัน
      const data = await api.admin.get("/logs/activity");
      setActivity(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("loadActivity error:", e);
      setActivity([]);
    }
  };

  // lazy-load per tab
  useEffect(() => {
    if (tab === "menu") loadMenu();
    if (tab === "activity") loadActivity();
  }, [tab]);

  // ---- helpers ----
  const onSaveMenu = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        category_id: Number(form.category_id),
        food_name: form.food_name.trim(),
        price: Number(form.price),
        description: form.description.trim() || null,
        is_active: form.is_active ? 1 : 0,
      };
      if (!payload.food_name || !Number.isFinite(payload.price)) {
        alert("Please fill food name and valid price");
        return;
      }

      if (editingId) {
        await api.admin.patch(`/menu/${editingId}`, payload);
        alert("Menu updated ✅");
      } else {
        await api.admin.post("/menu", payload);
        alert("Created menu item ✅");
      }

      setForm({ category_id: "2", food_name: "", price: "", description: "", is_active: 1 });
      setEditingId(null);
      await loadMenu();
    } catch (err) {
      alert(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onEditClick = (m) => {
    setEditingId(m.food_id);
    setForm({
      category_id: String(m.category_id ?? "2"),
      food_name: m.food_name ?? "",
      price: String(m.price ?? ""),
      description: m.description ?? "",
      is_active: m.is_active ? 1 : 0,
    });
    setTab("menu");
  };

  const onCancelEdit = () => {
    setEditingId(null);
    setForm({ category_id: "2", food_name: "", price: "", description: "", is_active: 1 });
  };

  const onDeleteClick = async (food_id, food_name) => {
    if (!confirm(`Delete "${food_name}"? This cannot be undone.`)) return;
    setDeletingId(food_id);
    try {
      await adminDelete(`/admin/menu/${food_id}`);
      await loadMenu();
      alert("Deleted ✅");
      if (editingId === food_id) onCancelEdit();
    } catch (err) {
      alert(err?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const onLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("isAdmin");
    nav("/admin/login", { replace: true });
  };

  async function adminDelete(path) {
    const token = localStorage.getItem("token");
    // ensure /admin prefix for secured admin routes
    const normalized = path.startsWith("/admin/") ? path : `/admin${path}`;
    const r = await fetch(`${API_BASE}${normalized}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) {
      const msg = (await r.text().catch(() => "")) || r.statusText || "Delete failed";
      throw new Error(msg);
    }
    return true;
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1 border rounded ${tab==='orders' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
            onClick={() => setTab("orders")}
          >
            Orders
          </button>
          <button
            className={`px-3 py-1 border rounded ${tab==='menu' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
            onClick={() => setTab("menu")}
          >
            Menu
          </button>
          <button
            className={`px-3 py-1 border rounded ${tab==='activity' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
            onClick={() => setTab("activity")}
          >
            Activity
          </button>

          {/* Logout (ตัวเลือก) */}
          <button
            onClick={onLogout}
            className="ml-3 px-3 py-1 border rounded hover:bg-white/10"
            title="Logout"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tab: Orders (Realtime) */}
      {tab === "orders" && (
        <div className="grid md:grid-cols-2 gap-4">
          {orders.map((o) => (
            <div key={o.order_id} className="border border-white/10 rounded p-4">
              <div className="flex justify-between">
                <span className="font-semibold">Order #{o.order_id}</span>
                <span className="opacity-70">{o.status}</span>
              </div>
              <div className="mt-2 opacity-80">
                Table {o.table_label || o.table_id} — ฿{Number(o.total_amount || 0).toFixed(2)}
              </div>
            </div>
          ))}
          {!orders.length && (
            <div className="opacity-70">No orders yet.</div>
          )}
        </div>
      )}

      {/* Tab: Menu (list + create form) */}
      {tab === "menu" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Menu Items {editingId ? <span className="text-sm font-normal opacity-70">(editing #{editingId})</span> : null}</h2>
            <button className="px-3 py-1 border rounded hover:bg-white/10" onClick={loadMenu}>Refresh</button>
          </div>

          {/* Create Menu Form */}
          <form onSubmit={onSaveMenu} className="bg-white/5 border border-white/10 rounded p-4 mb-4 grid md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm mb-1 opacity-80">Category</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2"
                value={form.category_id}
                onChange={(e)=>setForm(f=>({...f, category_id: e.target.value}))}
                required
              >
                <option value="1">Appetizers</option>
                <option value="2">Mains</option>
                <option value="3">Desserts</option>
                <option value="4">Drinks</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1 opacity-80">Food name</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2"
                value={form.food_name}
                onChange={(e)=>setForm(f=>({...f, food_name: e.target.value}))}
                placeholder="e.g. New Dish"
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1 opacity-80">Price (THB)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2"
                value={form.price}
                onChange={(e)=>setForm(f=>({...f, price: e.target.value}))}
                placeholder="129"
                required
              />
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm opacity-80">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-green-500 border-gray-400 rounded cursor-pointer"
                  checked={!!form.is_active}
                  onChange={(e)=>setForm(f=>({...f, is_active: e.target.checked ? 1 : 0}))}
                />
                Active
              </label>
            </div>

            <div className="md:col-span-4">
              <label className="block text-sm mb-1 opacity-80">Description (optional)</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-2"
                  value={form.description}
                  onChange={(e)=>setForm(f=>({...f, description: e.target.value}))}
                  placeholder="Short description"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-white text-black rounded font-semibold hover:bg-gray-200 disabled:opacity-60"
                >
                  {editingId ? (saving ? "Saving..." : "Update") : (saving ? "Saving..." : "Add")}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="px-3 py-2 border rounded hover:bg-white/10"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Menu List */}
          <div className="grid md:grid-cols-2 gap-3">
            {menu.map(m => (
              <div key={m.food_id} className="border border-white/10 rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{m.food_name}</div>
                    <div className="text-sm opacity-70">
                      ฿{Number(m.price).toFixed(2)} • {m.category_name || `Category ${m.category_id}`} • Active: {m.is_active ? "Yes" : "No"}
                    </div>
                    {m.description && (
                      <div className="text-xs opacity-70 mt-1">{m.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 text-sm border rounded hover:bg-white/10"
                      onClick={()=>onEditClick(m)}
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      className="px-2 py-1 text-sm border rounded hover:bg-red-500/10 disabled:opacity-60"
                      onClick={()=>onDeleteClick(m.food_id, m.food_name)}
                      disabled={deletingId === m.food_id}
                      title="Delete"
                    >
                      {deletingId === m.food_id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!menu.length && (
              <div className="opacity-70">No menu data yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Activity (admin logs) */}
      {tab === "activity" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Recent Activity</h2>
            <button className="px-3 py-1 border rounded hover:bg-white/10" onClick={loadActivity}>Refresh</button>
          </div>
          <div className="space-y-2">
            {activity.map((a) => (
              <div key={a.activity_id} className="border border-white/10 rounded p-3">
                <div className="font-semibold">{a.entity_type} #{a.entity_id} — {a.action}</div>
                <div className="text-sm opacity-70">
                  by {a.username || a.user_id} at {new Date(a.created_at).toLocaleString()}
                </div>
                {a.details && (
                  <pre className="text-xs opacity-80 mt-1 overflow-auto">
                    {JSON.stringify(a.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            {!activity.length && (
              <div className="opacity-70">No activity yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}