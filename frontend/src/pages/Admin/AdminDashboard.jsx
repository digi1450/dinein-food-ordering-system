// frontend/src/pages/Admin/AdminDashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import API_BASE from "../../lib/apiBase";

// Prefer a real bill (has bill_id) over a placeholder row for the same table.
function normalizeCurrentBills(list) {
  if (!Array.isArray(list)) return [];
  const byTable = new Map();
  for (const r of list) {
    const key = r?.table_id ?? r?.table_label ?? "";
    if (!key) continue;
    const existing = byTable.get(key);
    if (!existing) {
      byTable.set(key, r);
      continue;
    }
    // score: real bill (bill_id truthy) > placeholder; tie-breaker by updated_at then bill_id
    const score = (x) => (x?.bill_id ? 2 : 1);
    const exScore = score(existing);
    const newScore = score(r);
    if (newScore > exScore) {
      byTable.set(key, r);
    } else if (newScore === exScore) {
      const exTime = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const newTime = r?.updated_at ? new Date(r.updated_at).getTime() : 0;
      if (newTime > exTime) {
        byTable.set(key, r);
      } else if (newTime === exTime) {
        // final tie-breaker by higher bill_id
        const exId = Number(existing?.bill_id || 0);
        const newId = Number(r?.bill_id || 0);
        if (newId > exId) byTable.set(key, r);
      }
    }
  }
  // stable order by table_id (or label) to keep slots consistent
  return Array.from(byTable.values()).sort((a, b) => {
    const ta = Number(a?.table_id || 0), tb = Number(b?.table_id || 0);
    if (ta && tb) return ta - tb;
    const la = String(a?.table_label || ""), lb = String(b?.table_label || "");
    return la.localeCompare(lb);
  });
}


export default function AdminDashboard() {
  const nav = useNavigate();

  // tabs: orders | menu | activity
  const [tab, setTab] = useState("orders");

  // data states
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [activity, setActivity] = useState([]);
  // ---- Bills (Admin Billing) ----
  const [currentBills, setCurrentBills] = useState([]); // one (latest) pending_payment per table
  const [pastBills, setPastBills] = useState([]);       // paid bills (history)
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);

  // ===== Bill Summary modal state =====
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryBill, setSummaryBill] = useState(null);
  const [summaryItems, setSummaryItems] = useState([]);
  const [summaryTotal, setSummaryTotal] = useState(0);

  const coalesce = (...vals) => {
    for (const v of vals) {
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  function mergeBillLines(items = []) {
    const map = new Map();
    for (const it of items) {
      const qty = Number(it.qty ?? it.quantity ?? 0);
      const unit = Number(it.unit_price ?? (Number(it.line_total || 0) / Math.max(qty, 1)) ?? 0);
      const meta = {
        customer_name: coalesce(it.customer_name, it.name, it.customerName),
        customer_phone: coalesce(it.customer_phone, it.phone, it.phone_number, it.tel, it.contact),
        description: coalesce(it.description, it.note, it.notes, it.comment, it.special_request),
      };
      const key = [it.food_id, unit, meta.customer_name, meta.customer_phone, meta.description].join("|");
      if (!map.has(key)) {
        map.set(key, {
          food_id: it.food_id,
          food_name: it.food_name,
          unit_price: unit,
          quantity: 0,
          meta,
        });
      }
      map.get(key).quantity += qty;
    }
    return Array.from(map.values());
  }

  const openBillSummary = async (bill) => {
    if (!bill?.bill_id) return;
    try {
      const data = await api.admin.get(`/billing/${bill.bill_id}/summary`);
      const merged = mergeBillLines(data?.items || []);
      const total = (data?.totals?.total != null)
        ? Number(data.totals.total)
        : merged.reduce((s, r) => s + r.unit_price * r.quantity, 0);
      setSummaryBill({
        bill_id: bill.bill_id,
        bill_code: bill.bill_code || `Bill #${bill.bill_id}`,
        table_label: bill.table_label || bill.table_id,
      });
      setSummaryItems(merged);
      setSummaryTotal(total);
      setSummaryOpen(true);
    } catch (e) {
      console.error("openBillSummary error:", e);
      alert("Failed to load bill summary");
    }
  };

  const loadCurrentBills = async () => {
    setLoadingCurrent(true);
    try {
      const data = await api.admin.get(`/billing/current`);
      const raw = Array.isArray(data?.list) ? data.list : [];
      setCurrentBills(normalizeCurrentBills(raw));
    } catch (e) {
      console.error("loadCurrentBills error:", e);
      setCurrentBills([]);
      alert("Failed to load current bills");
    } finally {
      setLoadingCurrent(false);
    }
  };

  const loadPastBills = async () => {
    setLoadingPast(true);
    try {
      const data = await api.admin.get(`/billing?status=paid`);
      setPastBills(Array.isArray(data?.list) ? data.list : []);
    } catch (e) {
      console.error("loadPastBills error:", e);
      setPastBills([]);
      alert("Failed to load past bills");
    } finally {
      setLoadingPast(false);
    }
  };

  const onMarkBillPaid = async (billId, method = "cash") => {
    if (!confirm(`Confirm payment for Bill #${billId}?`)) return;
    try {
      // use admin endpoint defined in admin.billing.js
      const res = await api.admin.post(`/billing/${billId}/mark-paid`, { method });
      // backend returns { ok: true, bill, ... } or similar on success
      if (res && res.ok === false) {
        throw new Error(res?.error || "Confirm payment failed");
      }
      alert("Bill confirmed as PAID ✅");
      await Promise.all([loadCurrentBills(), loadPastBills()]);
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
    if (tab === "bills") { loadCurrentBills(); loadPastBills(); }
  }, [tab]);

  // ---- helpers ----
  const onSaveMenu = async (e) => {
    e.preventDefault();

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

    setSaving(true);
    try {
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
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Bills</h2>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 border rounded hover:bg-white/10"
                onClick={() => { loadCurrentBills(); loadPastBills(); }}
                title="Refresh"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Current Bills (one per table, status = pending_payment) */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Current Bills (per table)</h3>
              {loadingCurrent && <span className="text-sm opacity-70">Loading…</span>}
            </div>

            {!loadingCurrent && currentBills.length === 0 && (
              <div className="opacity-70">No current bills.</div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {currentBills.map((b) => {
                const isPlaceholder = !b?.bill_id;
                return (
                  <div key={`${b.table_id ?? b.table_label}-${b.bill_id ?? "placeholder"}`} className="border border-white/10 rounded p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold">
                          {isPlaceholder
                            ? `Bill — waiting (Table ${b.table_label || b.table_id})`
                            : (b.bill_code || `Bill #${b.bill_id}`)}
                        </div>
                        <div className="text-sm opacity-70">
                          Table {b.table_label || b.table_id} • ฿{Number(b.total_amount || 0).toFixed(2)}
                        </div>
                        <div className="text-xs opacity-50">
                          Updated: {b.updated_at ? new Date(b.updated_at).toLocaleString() : "-"}
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 border rounded">
                        {isPlaceholder ? "EMPTY" : String(b.status || "").toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                    <button
                      className="px-2 py-1 text-sm border rounded hover:bg-white/10 disabled:opacity-60"
                      disabled={isPlaceholder}
                      onClick={() => openBillSummary(b)}
                    >
                      View Summary
                    </button>
                      {!isPlaceholder && String(b.status) === "pending_payment" && (
                        <button
                          className="px-2 py-1 text-sm border rounded hover:bg-white/10"
                          onClick={() => onMarkBillPaid(b.bill_id, "cash")}
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Past Bills (paid history) */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Past Bills</h3>
              {loadingPast && <span className="text-sm opacity-70">Loading…</span>}
            </div>

            {!loadingPast && pastBills.length === 0 && (
              <div className="opacity-70">No past bills.</div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {pastBills.map((b) => (
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
                      onClick={() => openBillSummary(b)}
                    >
                      View Summary
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
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
    {/* Bill Summary Modal */}
    {summaryOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setSummaryOpen(false)} />
        <div className="relative z-10 w-[90%] max-w-2xl bg-white rounded-2xl p-6 text-slate-900 shadow-xl">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-lg font-bold">{summaryBill?.bill_code}</h3>
              <p className="text-xs text-slate-600">Table {summaryBill?.table_label}</p>
            </div>
            <button
              onClick={() => setSummaryOpen(false)}
              className="px-3 py-1 border border-slate-300 rounded-full hover:bg-slate-50 text-sm"
            >
              Close
            </button>
          </div>

          <div className="text-sm font-semibold text-slate-500 mb-2">
            Order summary (merged)
            <span className="block text-xs font-normal">
              Same items from multiple orders are combined.
            </span>
          </div>

          <div className="space-y-2">
            {summaryItems.map((r, idx) => (
              <div key={`${r.food_id}-${idx}`} className="flex justify-between items-start bg-white border border-slate-200 rounded-2xl px-4 py-3">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="font-medium text-slate-900">
                    {r.food_name}{" "}
                    <span className="text-xs text-slate-500">×{r.quantity}</span>
                  </div>
                  {(r.meta.customer_name || r.meta.customer_phone || r.meta.description) && (
                    <div className="text-xs text-slate-500 mt-1 break-words">
                      {r.meta.customer_name && <span>Name: {r.meta.customer_name}</span>}
                      {r.meta.customer_name && r.meta.customer_phone && <span> · </span>}
                      {r.meta.customer_phone && <span>Phone: {r.meta.customer_phone}</span>}
                      {r.meta.description && (
                        <div className="mt-1 whitespace-pre-wrap">{r.meta.description}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right font-medium ml-2">
                  ฿{(r.unit_price * r.quantity).toFixed(2)}
                  <div className="text-xs text-slate-500">
                    ({r.unit_price.toFixed(2)} each)
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>฿{summaryTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}