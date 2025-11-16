// frontend/src/pages/Admin/AdminDashboard.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import API_BASE from "../../lib/apiBase";
import AdminActivityPage from "./AdminActivityPage";

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
    const ta = Number(a?.table_id || 0),
      tb = Number(b?.table_id || 0);
    if (ta && tb) return ta - tb;
    const la = String(a?.table_label || ""),
      lb = String(b?.table_label || "");
    return la.localeCompare(lb);
  });
}

export default function AdminDashboard() {
  const nav = useNavigate();
  // unique id per admin tab (for cross-tab sync loop protection)
  const tabInstanceIdRef = useRef(
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );

  // tabs: orders | menu | activity | bills
  const [tab, setTab] = useState("orders");

  // data states
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);

  // ---- Bills (Admin Billing) ----
  const [currentBills, setCurrentBills] = useState([]); // one (latest) pending_payment per table
  const [pastBills, setPastBills] = useState([]); // paid bills (history)
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
      const unit = Number(
        it.unit_price ?? (Number(it.line_total || 0) / Math.max(qty, 1)) ?? 0
      );
      const meta = {
        customer_name: coalesce(it.customer_name, it.name, it.customerName),
        customer_phone: coalesce(
          it.customer_phone,
          it.phone,
          it.phone_number,
          it.tel,
          it.contact
        ),
        description: coalesce(
          it.description,
          it.note,
          it.notes,
          it.comment,
          it.special_request
        ),
      };
      const key = [
        it.food_id,
        unit,
        meta.customer_name,
        meta.customer_phone,
        meta.description,
      ].join("|");
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
      const total =
        data?.totals?.total != null
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

      // broadcast: notify other admin tabs that bills changed
      try {
        localStorage.setItem(
          "admin_sync",
          JSON.stringify({
            ts: Date.now(),
            source: tabInstanceIdRef.current,
            scope: "bills",
          })
        );
      } catch {}
    } catch (e) {
      console.error("onMarkBillPaid error:", e);
      alert(e?.message || "Failed to confirm payment");
    }
  };

  const [editingId, setEditingId] = useState(null); // food_id that is being edited; null = create-new
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
      const incoming = Array.isArray(res?.list) ? res.list : [];

      // Merge with existing orders: if the new snapshot has no items for a given order,
      // keep the previous items instead of wiping them out.
      setOrders((prev) => {
        const prevById = new Map();
        (Array.isArray(prev) ? prev : []).forEach((o) => {
          if (o && o.order_id != null) {
            prevById.set(o.order_id, o);
          }
        });

        return incoming.map((o) => {
          const existing = prevById.get(o.order_id) || {};
          const mergedItems = Array.isArray(o.items)
            ? o.items
            : Array.isArray(existing.items)
            ? existing.items
            : [];

          return {
            ...existing,
            ...o,
            items: mergedItems,
          };
        });
      });
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
    cancelled: [],
  };

  // ---- Item status transitions (item-level) ----
  const itemNextStatuses = {
    pending: ["cancelled"],
    preparing: ["cancelled"],
    served: ["cancelled"],
    completed: [],
    cancelled: [],
  };

  const onUpdateOrderStatus = async (order, newStatus) => {
    if (
      !confirm(
        `Change order status to "${newStatus}" for ${
          order.order_code || `Order #${order.order_id}`
        }?`
      )
    )
      return;
    try {
      await api.adminOrders.updateOrderStatus(order.order_id, newStatus);
      await loadOrders();

      // broadcast: notify other admin tabs that orders list changed
      try {
        localStorage.setItem(
          "admin_sync",
          JSON.stringify({
            ts: Date.now(),
            source: tabInstanceIdRef.current,
            scope: "orders",
          })
        );
      } catch {}
    } catch (err) {
      console.error("updateOrderStatus error:", err);
      alert("Failed to update order status");
    }
  };

  const onUpdateOrderItemStatus = async (order, item, newStatus) => {
    if (
      !confirm(
        `Change item status to "${newStatus}" for ${item.food_name} (Order #${order.order_id})?`
      )
    )
      return;

    try {
      await api.adminOrders.updateOrderItemStatus(item.order_item_id, newStatus);
      await loadOrders();

      // broadcast: notify other admin tabs that orders list changed
      try {
        localStorage.setItem(
          "admin_sync",
          JSON.stringify({
            ts: Date.now(),
            source: tabInstanceIdRef.current,
            scope: "orders",
          })
        );
      } catch {}
    } catch (err) {
      console.error("updateOrderItemStatus error:", err);
      alert("Failed to update item status");
    }
  };

  // ---- Guard: ไม่มี token ให้เด้งไป login ----
  useEffect(() => {
    const t = sessionStorage.getItem("token");
    if (!t) {
      nav("/admin/login", { replace: true });
    }
  }, [nav]);

  // ---- Cross-tab sync via localStorage (Admin Dashboard) ----
  useEffect(() => {
    const instanceId = tabInstanceIdRef.current;

    const handleStorage = (e) => {
      if (e.key !== "admin_sync") return;
      if (!e.newValue) return;

      try {
        const msg = JSON.parse(e.newValue || "{}");
        // ignore events from the same tab
        if (!msg || msg.source === instanceId) return;

        const scope = msg.scope || "all";

        if (scope === "all" || scope === "orders") {
          loadOrders();
        }
        if (scope === "all" || scope === "bills") {
          loadCurrentBills();
          loadPastBills();
        }
        if (scope === "all" || scope === "menu") {
          loadMenu();
        }
      } catch {
        // ignore parse errors
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // ---- Realtime orders (SSE feed) ----
  useEffect(() => {
    // เปิด SSE เฉพาะตอนอยู่ในแท็บที่ต้องการ realtime (orders, bills, menu)
    const shouldListen = tab === "orders" || tab === "bills" || tab === "menu";
    if (!shouldListen) return;

    let es;
    try {
      const token = sessionStorage.getItem("token");
      const url = token
        ? `${API_BASE}/orders/stream-all?token=${encodeURIComponent(token)}`
        : `${API_BASE}/orders/stream-all`;

      es = new EventSource(url, { withCredentials: false });

      es.onmessage = () => {
        // ถ้าแท็บนี้ไม่ได้ถูกมองอยู่ (background tab) → ไม่ต้องโหลดอะไร เพื่อลดการกระพริบ
        if (document.visibilityState !== "visible") return;

        // อัปเดตเฉพาะข้อมูลของ tab ปัจจุบัน เพื่อลดการรีเฟรชเกินจำเป็น
        if (tab === "orders") {
          loadOrders();
        } else if (tab === "bills") {
          loadCurrentBills();
          loadPastBills();
        } else if (tab === "menu") {
          loadMenu();
        }
      };

      es.onerror = (err) => {
        // อย่าปิด stream ใน onerror เพื่อให้ EventSource auto-reconnect เอง
        console.error("AdminDashboard SSE error:", err);
        // ถ้าต้องการ logic เพิ่มเช่นนับจำนวน error ค่อยเพิ่มทีหลังได้
      };
    } catch (err) {
      console.error("AdminDashboard SSE init error:", err);
    }

    return () => {
      if (es) es.close();
    };
  }, [tab]);

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

  // lazy-load per tab
  useEffect(() => {
    if (tab === "menu") loadMenu();
    if (tab === "orders") loadOrders();
    if (tab === "bills") {
      loadCurrentBills();
      loadPastBills();
    }
  }, [tab]);

  // Preload current bills once on mount so header stats are correct
  useEffect(() => {
    loadCurrentBills();
    loadMenu();
  }, []);

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

      setForm({
        category_id: "2",
        food_name: "",
        price: "",
        description: "",
        is_active: 1,
      });
      setEditingId(null);
      await loadMenu();

      // broadcast: notify other admin tabs that menu has changed
      try {
        localStorage.setItem(
          "admin_sync",
          JSON.stringify({
            ts: Date.now(),
            source: tabInstanceIdRef.current,
            scope: "menu",
          })
        );
      } catch {}
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
    setForm({
      category_id: "2",
      food_name: "",
      price: "",
      description: "",
      is_active: 1,
    });
  };

  const onDeleteClick = async (food_id, food_name) => {
    if (!confirm(`Delete "${food_name}"? This cannot be undone.`)) return;
    setDeletingId(food_id);
    try {
      await api.admin.delete(`/menu/${food_id}`);
      await loadMenu();
      alert("Deleted ✅");
      if (editingId === food_id) onCancelEdit();

      // broadcast: notify other admin tabs that menu has changed
      try {
        localStorage.setItem(
          "admin_sync",
          JSON.stringify({
            ts: Date.now(),
            source: tabInstanceIdRef.current,
            scope: "menu",
          })
        );
      } catch {}
    } catch (err) {
      alert(err?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const onLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("isAdmin");
    nav("/admin/login", { replace: true });
  };

  // ---- simple stats for header cards ----
  const stats = {
    orders: orders.length,
    currentBills: currentBills.filter(b => b.bill_id && b.status === "pending_payment").length,
    menuItems: menu.length,
  };

  const tabs = [
    { id: "orders", label: "Orders" },
    { id: "bills", label: "Bills" },
    { id: "menu", label: "Menu" },
    { id: "activity", label: "Activity" },
  ];

  // Helper for status-change button color by target status
  const getStatusButtonClasses = (targetStatus) => {
    const s = String(targetStatus || "").toLowerCase();
    if (s === "pending") {
      return "border-amber-500/60 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20";
    }
    if (s === "preparing") {
      return "border-sky-500/60 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20";
    }
    if (s === "served") {
      return "border-teal-500/60 bg-teal-500/10 text-teal-100 hover:bg-teal-500/20";
    }
    if (s === "cancelled") {
      return "border-red-500/70 bg-red-500/10 text-red-100 hover:bg-red-500/20";
    }
    return "border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Admin Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage orders, bills, menu, and admin activity in one place.
            </p>
          </div>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-900/60 px-4 py-1.5 text-sm font-medium text-slate-100 shadow-sm hover:bg-slate-800 hover:border-slate-500 transition-colors"
            title="Logout"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            Logout
          </button>
        </header>

        {/* Quick stats */}
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 shadow-lg shadow-black/40">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Active Orders
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-semibold">
                {stats.orders}
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                Live
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 shadow-lg shadow-black/40">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Current Bills
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-semibold">
                {stats.currentBills}
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                {stats.currentBills === 0 ? "No pending bills" : "Pending payment"}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 shadow-lg shadow-black/40">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Menu Items
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-semibold">
                {stats.menuItems}
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30">
                Admin managed
              </span>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <nav className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-slate-800 bg-slate-900/70 p-1">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 md:px-4 py-1.5 text-xs md:text-sm rounded-full font-medium transition-all ${
                    active
                      ? "bg-slate-50 text-slate-900 shadow-sm"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/80"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main content card */}
        <main className="rounded-3xl border border-slate-800 bg-slate-900/70 px-4 py-4 md:px-6 md:py-6 shadow-2xl shadow-black/40 backdrop-blur">
          {/* Tab: Bills (Admin Billing) */}
          {tab === "bills" && (
            <div className="space-y-8">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg md:text-xl font-semibold">Bills</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Confirm payments and review billing history.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 rounded-full border border-slate-600 bg-slate-800/80 text-xs md:text-sm hover:bg-slate-700 transition-colors"
                    onClick={() => {
                      loadCurrentBills();
                      loadPastBills();
                    }}
                    title="Refresh"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Current Bills (one per table, status = pending_payment) */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm md:text-base font-semibold">
                    Current Bills (per table)
                  </h3>
                  {loadingCurrent && (
                    <span className="text-xs text-slate-400">Loading…</span>
                  )}
                </div>

                {!loadingCurrent && currentBills.length === 0 && (
                  <div className="text-sm text-slate-400">
                    No current bills.
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  {currentBills.map((b) => {
                    const isPlaceholder = !b?.bill_id;
                    return (
                      <div
                        key={`${b.table_id ?? b.table_label}-${b.bill_id ?? "placeholder"}`}
                        className="rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-2 gap-3">
                          <div>
                            <div className="font-semibold text-sm md:text-base">
                              {isPlaceholder
                                ? `Bill — waiting (Table ${b.table_label || b.table_id})`
                                : b.bill_code || `Bill #${b.bill_id}`}
                            </div>
                            <div className="text-xs md:text-sm text-slate-400">
                              Table {b.table_label || b.table_id} • ฿
                              {Number(b.total_amount || 0).toFixed(2)}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              Updated:{" "}
                              {b.updated_at
                                ? new Date(b.updated_at).toLocaleString()
                                : "-"}
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 bg-slate-900 text-slate-200">
                            {isPlaceholder
                              ? "EMPTY"
                              : String(b.status || "").toUpperCase()}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            className="px-2.5 py-1 text-xs border border-slate-600 rounded-full bg-slate-800/80 hover:bg-slate-700 disabled:opacity-60"
                            disabled={isPlaceholder}
                            onClick={() => openBillSummary(b)}
                          >
                            View summary
                          </button>
                          {!isPlaceholder &&
                            String(b.status) === "pending_payment" && (
                              <button
                                className="px-2.5 py-1 text-xs border border-emerald-500/60 rounded-full bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                                onClick={() => onMarkBillPaid(b.bill_id, "cash")}
                              >
                                Mark paid
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
                  <h3 className="text-sm md:text-base font-semibold">Past Bills</h3>
                  {loadingPast && (
                    <span className="text-xs text-slate-400">Loading…</span>
                  )}
                </div>

                {!loadingPast && pastBills.length === 0 && (
                  <div className="text-sm text-slate-400">
                    No past bills.
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  {pastBills.map((b) => (
                    <div
                      key={b.bill_id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-2 gap-3">
                        <div>
                          <div className="font-semibold text-sm md:text-base">
                            {b.bill_code || `Bill #${b.bill_id}`}
                          </div>
                          <div className="text-xs md:text-sm text-slate-400">
                            Table {b.table_label || b.table_id} • ฿
                            {Number(b.total_amount || 0).toFixed(2)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            Updated:{" "}
                            {b.updated_at
                              ? new Date(b.updated_at).toLocaleString()
                              : "-"}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 bg-slate-900 text-slate-200">
                          {String(b.status || "").toUpperCase()}
                        </span>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <button
                          className="px-2.5 py-1 text-xs border border-slate-600 rounded-full bg-slate-800/80 hover:bg-slate-700"
                          onClick={() => openBillSummary(b)}
                        >
                          View summary
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
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h2 className="text-lg md:text-xl font-semibold">
                    Orders Management
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Track and update live orders by table.
                  </p>
                </div>
                <button
                  className="px-3 py-1.5 rounded-full border border-slate-600 bg-slate-800/80 text-xs md:text-sm hover:bg-slate-700"
                  onClick={loadOrders}
                >
                  Refresh
                </button>
              </div>

              {loadingOrders && (
                <div className="text-sm text-slate-400">Loading orders...</div>
              )}

              {!loadingOrders && orders.length === 0 && (
                <div className="text-sm text-slate-400">No orders yet.</div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {orders.map((o) => {
                  const orderStatus = String(o.status || "").toLowerCase();
                  const statusStyles =
                    orderStatus === "pending"
                      ? "bg-amber-500/10 text-amber-200 border-amber-500/40"
                      : orderStatus === "preparing"
                      ? "bg-sky-500/10 text-sky-200 border-sky-500/40"
                      : orderStatus === "served"
                      ? "bg-teal-500/10 text-teal-200 border-teal-500/40"
                      : orderStatus === "cancelled"
                      ? "bg-red-500/10 text-red-200 border-red-500/40"
                      : orderStatus === "completed"
                      ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/40"
                      : "bg-slate-800 text-slate-200 border-slate-600";

                  return (
                    <div
                      key={o.order_id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 shadow-sm"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold text-sm md:text-base">
                          {o.order_code || `Order #${o.order_id}`}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${statusStyles}`}
                        >
                          {orderStatus.toUpperCase()}
                        </span>
                      </div>

                    {/* Order status controls */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {nextStatuses[String(o.status || "").toLowerCase()]?.map(
                        (s) => (
                          <button
                            key={s}
                            onClick={() => onUpdateOrderStatus(o, s)}
                            className={
                              "text-[11px] px-2.5 py-0.5 rounded-full " +
                              getStatusButtonClasses(s)
                            }
                          >
                            {s}
                          </button>
                        )
                      )}
                    </div>

                    <div className="text-xs md:text-sm text-slate-300 mb-2">
                      Table {o.table_label || o.table_id} — ฿
                      {Number(o.total_amount || 0).toFixed(2)}
                    </div>

                    <div className="space-y-1">
                      {o.items?.map((it) => {
                        const orderStatusLower = String(
                          o.status || ""
                        ).toLowerCase();
                        const itemStatusLower = String(
                          it.status || ""
                        ).toLowerCase();
                        const canCancelItem =
                          orderStatusLower !== "completed" &&
                          orderStatusLower !== "cancelled" &&
                          itemStatusLower !== "cancelled";

                        return (
                          <div
                            key={it.order_item_id}
                            className="flex items-center justify-between text-xs md:text-sm border-t border-slate-800 pt-1.5 mt-1"
                          >
                            <div>
                              {it.food_name} × {it.quantity}
                              <span
                                className={
                                  "ml-2 text-[11px] " +
                                  (itemStatusLower === "pending"
                                    ? "text-amber-300"
                                    : itemStatusLower === "preparing"
                                    ? "text-sky-300"
                                    : itemStatusLower === "served"
                                    ? "text-emerald-300"
                                    : itemStatusLower === "cancelled"
                                    ? "text-red-300"
                                    : itemStatusLower === "completed"
                                    ? "text-emerald-300"
                                    : "text-slate-400")
                                }
                              >
                                ({itemStatusLower})
                              </span>
                            </div>
                            {canCancelItem && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() =>
                                    onUpdateOrderItemStatus(
                                      o,
                                      it,
                                      "cancelled"
                                    )
                                  }
                                  className="text-[11px] px-2 py-0.5 border border-red-500/70 rounded-full bg-red-500/10 text-red-200 hover:bg-red-500/20"
                                >
                                  cancel
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          )}

          {/* Tab: Menu (list + create form) */}
          {tab === "menu" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h2 className="text-lg md:text-xl font-semibold">
                    Menu Items{" "}
                    {editingId && (
                      <span className="text-sm font-normal text-slate-400">
                        (editing #{editingId})
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Create and manage menu items for customers.
                  </p>
                </div>
                <button
                  className="px-3 py-1.5 rounded-full border border-slate-600 bg-slate-800/80 text-xs md:text-sm hover:bg-slate-700"
                  onClick={loadMenu}
                >
                  Refresh
                </button>
              </div>

              {/* Create Menu Form */}
              <form
                onSubmit={onSaveMenu}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 md:p-5 mb-4 grid md:grid-cols-4 gap-3"
              >
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-300">
                    Category
                  </label>
                  <select
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100"
                    value={form.category_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category_id: e.target.value }))
                    }
                    required
                  >
                    <option value="1">Appetizers</option>
                    <option value="2">Mains</option>
                    <option value="3">Desserts</option>
                    <option value="4">Drinks</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-300">
                    Food name
                  </label>
                  <input
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                    value={form.food_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, food_name: e.target.value }))
                    }
                    placeholder="e.g. New Dish"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-300">
                    Price (THB)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value }))
                    }
                    placeholder="e.g. 99.00"
                    required
                  />
                </div>

                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-emerald-500 border-slate-500 rounded cursor-pointer"
                      checked={!!form.is_active}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          is_active: e.target.checked ? 1 : 0,
                        }))
                      }
                    />
                    Active
                  </label>
                </div>

                <div className="md:col-span-4">
                  <label className="block text-xs font-medium mb-1 text-slate-300">
                    Description (optional)
                  </label>
                  <div className="flex flex-col md:flex-row gap-2">
                    <input
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      placeholder="Short description"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 rounded-full bg-slate-50 text-slate-900 text-sm font-semibold hover:bg-slate-200 disabled:opacity-60"
                      >
                        {editingId
                          ? saving
                            ? "Saving..."
                            : "Update"
                          : saving
                          ? "Saving..."
                          : "Add"}
                      </button>
                      {editingId && (
                        <button
                          type="button"
                          onClick={onCancelEdit}
                          className="px-3 py-2 rounded-full border border-slate-600 bg-slate-900/80 text-sm hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>

              {/* Menu List */}
              <div className="grid md:grid-cols-2 gap-3">
                {menu.map((m) => (
                  <div
                    key={m.food_id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm md:text-base">
                          {m.food_name}
                        </div>
                        <div className="text-xs md:text-sm text-slate-400 mt-0.5">
                          ฿{Number(m.price).toFixed(2)} •{" "}
                          {m.category_name || `Category ${m.category_id}`} •
                          <span className="ml-1">
                            {m.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        {m.description && (
                          <div className="text-xs text-slate-400 mt-1">
                            {m.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-2.5 py-1 text-xs border border-slate-600 rounded-full bg-slate-900/80 hover:bg-slate-800"
                          onClick={() => onEditClick(m)}
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          className="px-2.5 py-1 text-xs border border-red-500/70 rounded-full bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                          onClick={() => onDeleteClick(m.food_id, m.food_name)}
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
                  <div className="text-sm text-slate-400">
                    No menu data yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Activity (admin logs) */}
          {tab === "activity" && (
            <div className="-mx-1 md:mx-0">
              <AdminActivityPage />
            </div>
          )}
        </main>

        {/* Bill Summary Modal */}
        {summaryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSummaryOpen(false)}
            />
            <div className="relative z-10 w-[90%] max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl p-6 text-slate-50 shadow-2xl shadow-black/60">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold">
                    {summaryBill?.bill_code}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Table {summaryBill?.table_label}
                  </p>
                </div>
                <button
                  onClick={() => setSummaryOpen(false)}
                  className="px-3 py-1 border border-slate-600 rounded-full hover:bg-slate-800 text-sm"
                >
                  Close
                </button>
              </div>

              <div className="text-sm font-semibold text-slate-400 mb-2">
                Order summary (merged)
                <span className="block text-xs font-normal">
                  Same items from multiple orders are combined.
                </span>
              </div>

              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {summaryItems.map((r, idx) => (
                  <div
                    key={`${r.food_id}-${idx}`}
                    className="flex justify-between items-start bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="font-medium text-slate-50">
                        {r.food_name}{" "}
                        <span className="text-xs text-slate-400">
                          ×{r.quantity}
                        </span>
                      </div>
                      {(r.meta.customer_name ||
                        r.meta.customer_phone ||
                        r.meta.description) && (
                        <div className="text-xs text-slate-400 mt-1 break-words">
                          {r.meta.customer_name && (
                            <span>Name: {r.meta.customer_name}</span>
                          )}
                          {r.meta.customer_name && r.meta.customer_phone && (
                            <span> · </span>
                          )}
                          {r.meta.customer_phone && (
                            <span>Phone: {r.meta.customer_phone}</span>
                          )}
                          {r.meta.description && (
                            <div className="mt-1 whitespace-pre-wrap">
                              {r.meta.description}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right font-medium ml-2 text-slate-50">
                      ฿{(r.unit_price * r.quantity).toFixed(2)}
                      <div className="text-xs text-slate-400">
                        ({r.unit_price.toFixed(2)} each)
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>฿{summaryTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}