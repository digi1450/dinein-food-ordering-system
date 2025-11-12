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
  const [bills, setBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);
  // ---- Bills (Admin Billing) ----
  const loadBills = async (status = "") => {
    setLoadingBills(true);
    try {
      // secured admin route; use api.admin to send Authorization header
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const data = await api.admin.get(`/billing${query}`);
      setBills(Array.isArray(data?.list) ? data.list : []);
    } catch (e) {
      console.error("loadBills error:", e);
      setBills([]);
      alert("Failed to load bills");
    } finally {
      setLoadingBills(false);
    }
  };

  const onMarkBillPaid = async (billId, method = "cash") => {
    if (!confirm(`Confirm payment for Bill #${billId}?`)) return;
    try {
      // use admin endpoint defined in admin.billing.js
      const res = await api.admin.post(`/billing/${billId}/confirm`, { method });
      // backend returns { ok: true, bill, ... } or similar on success
      if (res && res.ok === false) {
        throw new Error(res?.error || "Confirm payment failed");
      }
      alert("Bill confirmed as PAID ✅");
      await loadBills(); // refresh
    } catch (e) {
      console.error("onMarkBillPaid error:", e);
      alert(e?.message || "Failed to confirm payment");
    }
  };

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

  const [loadingOrders, setLoadingOrders] = useState(false);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await api.adminOrders.getOrders();
      setOrders(res.list || []);
    } catch (err) {
      console.error("loadOrders error:", err);
      alert("Failed to load orders");
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  // ---- Order status transitions ----
  const nextStatuses = {
    pending: ["preparing", "cancelled"],
    preparing: ["served", "cancelled"],
    served: ["cancelled"], // allow admin to cancel even after served; no completed here
    completed: [],
    cancelled: []
  };

  const onUpdateOrderStatus = async (order, newStatus) => {
    if (!confirm(`Change order status to "${newStatus}" for ${order.order_code || `Order #${order.order_id}` }?`)) return;
    try {
      await api.adminOrders.updateOrderStatus(order.order_id, newStatus);
      await loadOrders();
    } catch (err) {
      console.error("updateOrderStatus error:", err);
      alert("Failed to update order status");
    }
  };

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
    if (tab === "orders") loadOrders();
    if (tab === "bills") loadBills();
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
      await api.admin.delete(`/menu/${food_id}`);
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
            className={`px-3 py-1 border rounded ${tab==='bills' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
            onClick={() => setTab("bills")}
          >
            Bills
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
      {/* Tab: Bills (Admin Billing) */}
      {tab === "bills" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Bills</h2>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 border rounded hover:bg-white/10"
                onClick={() => loadBills()}
                title="Show all statuses"
              >
                All
              </button>
              <button
                className="px-3 py-1 border rounded hover:bg-white/10"
                onClick={() => loadBills("pending_payment")}
              >
                Pending Payment
              </button>
              <button
                className="px-3 py-1 border rounded hover:bg-white/10"
                onClick={() => loadBills("paid")}
              >
                Paid
              </button>
              <button
                className="px-3 py-1 border rounded hover:bg-white/10"
                onClick={() => loadBills()}
              >
                Refresh
              </button>
            </div>
          </div>

          {loadingBills && <div className="opacity-70">Loading bills...</div>}
          {!loadingBills && bills.length === 0 && (
            <div className="opacity-70">No bills found.</div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {bills.map((b) => (
              <div key={b.bill_id} className="border border-white/10 rounded p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold">{b.bill_code || `Bill #${b.bill_id}`}</div>
                    <div className="text-sm opacity-70">
                      Table {b.table_label || b.table_id} • ฿{Number(b.total_amount || 0).toFixed(2)}
                    </div>
                    <div className="text-xs opacity-50">
                      Updated: {b.updated_at ? new Date(b.updated_at).toLocaleString() : "-"}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 border rounded">
                    {String(b.status || "").toUpperCase()}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    className="px-2 py-1 text-sm border rounded hover:bg-white/10"
                    onClick={async () => {
                      try {
                        const data = await api.admin.get(`/billing/${b.bill_id}/summary`);
                        const lines = (data?.items || []).map(
                          (it) => `${it.food_name} × ${it.qty} — ฿${Number(it.line_total || 0).toFixed(2)}`
                        );
                        alert(
                          `${b.bill_code || `Bill #${b.bill_id}`}\n` +
                          `Total: ฿${Number(data?.totals?.total || b.total_amount || 0).toFixed(2)}\n\n` +
                          (lines.join("\n") || "(no items)")
                        );
                      } catch (e) {
                        alert("Failed to load bill summary");
                      }
                    }}
                  >
                    View Summary
                  </button>

                  {String(b.status) === "pending_payment" && (
                    <button
                      className="px-2 py-1 text-sm border rounded hover:bg-white/10"
                      onClick={() => onMarkBillPaid(b.bill_id, "cash")}
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Tab: Orders (Admin Management) */}
      {tab === "orders" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Orders Management</h2>
            <button
              className="px-3 py-1 border rounded hover:bg-white/10"
              onClick={loadOrders}
            >
              Refresh
            </button>
          </div>

          {loadingOrders && <div className="opacity-70">Loading orders...</div>}

          {!loadingOrders && orders.length === 0 && (
            <div className="opacity-70">No orders yet.</div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {orders.map((o) => (
              <div key={o.order_id} className="border border-white/10 rounded p-4">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">
                    {o.order_code || `Order #${o.order_id}`}
                  </span>
                  <span className="opacity-70">{String(o.status || "").toUpperCase()}</span>
                </div>
                {/* Order status controls */}
                <div className="flex gap-1 mb-2">
                  {nextStatuses[String(o.status || "").toLowerCase()]?.map((s) => (
                    <button
                      key={s}
                      onClick={() => onUpdateOrderStatus(o, s)}
                      className="text-xs px-2 py-1 border rounded hover:bg-white/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="opacity-80 text-sm mb-2">
                  Table {o.table_label || o.table_id} — ฿
                  {Number(o.total_amount || 0).toFixed(2)}
                </div>
                <div className="space-y-1">
                  {o.items?.map((it) => (
                    <div
                      key={it.order_item_id}
                      className="flex items-center justify-between text-sm border-b border-white/10 py-1"
                    >
                      <div>
                        {it.food_name} × {it.quantity}
                        <span className="ml-2 opacity-70">({it.status})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
                placeholder="e.g. 99.00"
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