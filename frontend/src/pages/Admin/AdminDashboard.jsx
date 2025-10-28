// frontend/src/pages/Admin/AdminDashboard.jsx
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const API = import.meta.env.VITE_API || "http://127.0.0.1:5050";

export default function AdminDashboard() {
  // tabs: orders | menu | activity
  const [tab, setTab] = useState("orders");

  // data states
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [activity, setActivity] = useState([]);

  // create-menu form
  const [form, setForm] = useState({
    category_id: "2",
    food_name: "",
    price: "",
    description: ""
  });

  // Realtime orders (SSE feed)
  useEffect(() => {
    const es = new EventSource(`${API}/api/orders/stream-all`);
    es.onmessage = (e) => {
      try { setOrders(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  // load menu list (GET now public per our backend setup)
  const loadMenu = async () => {
    try {
      const data = await api.get("/api/admin/menu", { auth: false });
      setMenu(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("loadMenu error:", e);
      setMenu([]);
    }
  };

  // load recent admin activity (needs token)
  const loadActivity = async () => {
    try {
      const data = await api.get("/api/admin/logs/activity");
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

  // helpers
  const onCreateMenu = async (e) => {
    e.preventDefault();
    const payload = {
      category_id: Number(form.category_id),
      food_name: form.food_name.trim(),
      price: Number(form.price),
      description: form.description.trim() || null
    };
    if (!payload.food_name || !Number.isFinite(payload.price)) {
      alert("Please fill food name and valid price");
      return;
    }
    try {
      await api.post("/api/admin/menu", payload); // auth default true -> attaches Bearer token
      setForm({ category_id: "2", food_name: "", price: "", description: "" });
      await loadMenu();
      alert("Created menu item ✅");
    } catch (err) {
      alert(err?.message || "Create failed");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
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
            <h2 className="text-xl font-bold">Menu Items</h2>
            <button className="px-3 py-1 border rounded hover:bg-white/10" onClick={loadMenu}>Refresh</button>
          </div>

          {/* Create Menu Form */}
          <form onSubmit={onCreateMenu} className="bg-white/5 border border-white/10 rounded p-4 mb-4 grid md:grid-cols-4 gap-3">
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
                  className="px-4 py-2 bg-white text-black rounded font-semibold hover:bg-gray-200"
                >
                  Add
                </button>
              </div>
            </div>
          </form>

          {/* Menu List */}
          <div className="grid md:grid-cols-2 gap-3">
            {menu.map(m => (
              <div key={m.food_id} className="border border-white/10 rounded p-3">
                <div className="font-semibold">{m.food_name}</div>
                <div className="text-sm opacity-70">
                  ฿{Number(m.price).toFixed(2)} • {m.category_name || `Category ${m.category_id}`}
                </div>
                <div className="text-sm opacity-70">Active: {m.is_active ? "Yes" : "No"}</div>
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