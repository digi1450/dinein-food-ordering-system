// frontend/src/pages/Customer/CheckoutSummary.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import API_BASE from "../../lib/apiBase";

const currency = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
};

// Helper to pick the first non-empty trimmed value
const coalesce = (...vals) => {
  for (const v of vals) {
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return "";
};

// Extract meta (name/phone/description) from either order-level or item-level fields,
// supporting multiple possible key names to be robust against schema differences.
const extractMeta = (order = {}, item = {}) => {
  const customer_name = coalesce(
    order.customer_name, order.name, order.customerName,
    item.customer_name, item.name, item.customerName
  );
  const customer_phone = coalesce(
    order.customer_phone, order.phone, order.phone_number, order.tel, order.contact, order.customerPhone,
    item.customer_phone, item.phone
  );
  const description = coalesce(
    order.description, order.note, order.notes, order.comment, order.comments, order.special_request,
    item.description, item.note, item.comment
  );
  return { customer_name, customer_phone, description };
};

// รวมรายการฟู้ดจากหลายออเดอร์ โดย “รวมบรรทัด” เมื่อ customer meta เหมือนกัน
function mergeLines(ordersWithItems) {
  const map = new Map();

  for (const o of ordersWithItems) {
    for (const it of o.items || []) {
      const qty = Number(it.quantity || 0);
      const unit = (() => {
        const cand = [it.unit_price, it.price, (Number(it.subtotal) / Math.max(qty, 1))];
        for (const v of cand) {
          const n = Number(v);
          if (Number.isFinite(n)) return n;
        }
        return 0;
      })();

      const meta = extractMeta(o, it);
      const keyParts = [it.food_id, unit, meta.customer_name, meta.customer_phone, meta.description];
      const key = keyParts.join("|");

      if (!map.has(key)) {
        map.set(key, {
          food_id: it.food_id,
          food_name: it.food_name,
          unit_price: unit,
          quantity: 0,
          meta,
        });
      }
      const row = map.get(key);
      row.quantity += qty;
    }
  }

  return Array.from(map.values());
}

export default function CheckoutSummary() {
  const { search } = useLocation();
  const nav = useNavigate();

  const tableId = new URLSearchParams(search).get("table");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState([]); // เฉพาะออเดอร์ที่ยังไม่เสร็จ
  const [lines, setLines] = useState([]);
  const [paying, setPaying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Robust summary link - always carry tableId in link
  const summaryHref = useMemo(() => {
    const t = tableId ? String(tableId) : "";

    // 1) latest open order id if present
    const latestId = orders && orders[0] && orders[0].order_id;
    const latestNum = Number(latestId);
    if (Number.isFinite(latestNum) && latestNum > 0) {
      return t ? `/summary/${latestNum}?table=${encodeURIComponent(t)}` : `/summary/${latestNum}`;
    }

    // 2) last_order_id from localStorage
    const lastId = Number(localStorage.getItem("last_order_id"));
    if (Number.isFinite(lastId) && lastId > 0) {
      return t ? `/summary/${lastId}?table=${encodeURIComponent(t)}` : `/summary/${lastId}`;
    }

    // 3) fallback by table query
    if (t) {
      return `/summary?table=${encodeURIComponent(t)}`;
    }

    // 4) ultimate fallback
    return "/";
  }, [orders, tableId]);

  // โหลดรายการออเดอร์ทั้งหมดของโต๊ะ และดึง items ของแต่ละออเดอร์
  useEffect(() => {
    (async () => {
      try {
        if (!tableId) {
          setErr("Missing table id");
          setLoading(false);
          return;
        }
        setLoading(true);
        setErr("");

        // --- Ensure/start an open bill for this table (id or label like "T1") ---
        try {
          await fetch(`${API_BASE}/billing/checkout/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table: String(tableId) }),
          });
        } catch (_) {
          // non-blocking for customer view
        }

        // --- Load active orders via billing (this also auto-attaches unattached active orders) ---
        const openRes = await fetch(`${API_BASE}/billing/open-orders?table=${encodeURIComponent(String(tableId))}`);
        if (!openRes.ok) throw new Error("Failed to load open orders via billing");
        const { bill_id, orders: openOrders } = await openRes.json();

        // Map to the shape expected by mergeLines (already includes items per order)
        const full = (openOrders || []).map((o) => ({
          order_id: o.order_id,
          table_id: o.table_id,
          status: o.status,
          total_amount: Number(o.total_amount || 0),
          items: Array.isArray(o.items) ? o.items : [],
          customer_name: coalesce(o.customer_name),
          customer_phone: coalesce(o.customer_phone),
          description: coalesce(o.description),
        }));

        setOrders(full);
        setLines(mergeLines(full));
      } catch (e) {
        setErr(e.message || "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [tableId]);

  const grandTotal = useMemo(() => {
    return lines.reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  }, [lines]);

  const hasAnything = orders.length > 0 && lines.length > 0;

  const doCheckout = async () => {
    if (!hasAnything || paying) return;
    setPaying(true);
    try {
      // 1) Ensure there is an open bill and attach any fresh active orders
      const startRes = await fetch(`${API_BASE}/billing/checkout/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: String(tableId) }),
      });
      if (!startRes.ok) throw new Error("Cannot start/ensure bill for this table");
      const startData = await startRes.json().catch(() => ({}));
      const billId = startData.billId || startData.bill_id || startData.bill?.bill_id;
      if (!billId) throw new Error("No bill_id returned");

      // 2) Confirm checkout → lock totals, mark orders completed, set bill.status = 'pending_payment'
      const confirmRes = await fetch(`${API_BASE}/billing/checkout/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: Number(billId), method: "cash" }),
      });
      if (!confirmRes.ok) {
        const data = await confirmRes.json().catch(() => ({}));
        throw new Error(data?.error || data?.message || "Failed to confirm checkout");
      }

      // 3) Clear local cart for this table and navigate to success
      try { localStorage.removeItem(`cart_table_${tableId}`); } catch {}
      nav(`/checkout/success?table=${encodeURIComponent(tableId ?? "")}`, { replace: true });
    } catch (e) {
      setErr(e.message || "Checkout failed");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-900 bg-[radial-gradient(1200px_800px_at_-20%_-10%,#cde7ff,transparent),radial-gradient(900px_650px_at_120%_0%,#ffd9e0,transparent),linear-gradient(180deg,#ffffff,#ffe8cc)]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Checkout</h1>
            <p className="text-sm text-slate-600 mt-1">Table {tableId || "?"}</p>
          </div>
          <Link
            to={summaryHref}
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Back to Summary
          </Link>
        </header>

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-700 text-sm shadow-sm">
            {err}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl border border-white/70 bg-white/70 shadow-sm animate-pulse" />
            ))}
          </div>
        ) : !hasAnything ? (
          <div className="rounded-2xl border border-white/70 bg-white/90 px-5 py-6 text-center text-slate-600">
            No open orders for this table.
          </div>
        ) : (
          <div className="rounded-[28px] bg-white/95 border border-white/60 shadow-xl px-6 py-7">
            {/* หัวข้อ */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-500">Order summary (merged)</p>
              <p className="text-xs text-slate-500">Same items from multiple orders are combined.</p>
            </div>

            {/* รายการรวม */}
            <div className="space-y-2">
              {lines.map((r, idx) => (
                <div
                  key={`${r.food_id}-${idx}`}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3"
                >
                  <div className="pr-3 flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {r.food_name} <span className="text-xs text-slate-500 font-normal">×{r.quantity}</span>
                    </div>

                    {/* meta เฉพาะกรณีมีอย่างใดอย่างหนึ่ง */}
                    {(r.meta.customer_name || r.meta.customer_phone || r.meta.description) && (
                      <div className="text-xs text-slate-500 mt-0.5 break-words">
                        {r.meta.customer_name && <span>Name: {r.meta.customer_name}</span>}
                        {r.meta.customer_name && r.meta.customer_phone && <span> · </span>}
                        {r.meta.customer_phone && <span>Phone: {r.meta.customer_phone}</span>}

                        {r.meta.description && (
                          <div className="mt-1 text-xs text-slate-500 break-words whitespace-pre-wrap hyphens-auto overflow-hidden">
                            {r.meta.description}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right font-medium ml-2">
                    ฿{currency(r.unit_price * r.quantity)}
                    <div className="text-xs text-slate-500">({currency(r.unit_price)} each)</div>
                  </div>
                </div>
              ))}
            </div>

            {/* รวมทั้งหมด */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>฿{currency(grandTotal)}</span>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Link
                to={`/menu?table=${encodeURIComponent(tableId ?? "")}`}
                className="px-4 py-2 rounded-full border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 text-sm font-medium shadow-sm"
              >
                Add more items
              </Link>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={paying}
                className="px-5 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold shadow-sm hover:bg-slate-800 disabled:opacity-60"
              >
                {paying ? "Processing…" : "Confirm & Checkout"}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (!paying ? setConfirmOpen(false) : null)}
          />
          <div className="relative z-10 w-[90%] max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Confirm checkout?</h3>
            <p className="mt-1 text-sm text-slate-600">
              Your open orders for table {tableId} will be merged and sent to cashier (pending payment).
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={paying}
                className="px-4 py-2 rounded-full border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await doCheckout();
                }}
                disabled={paying}
                className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
              >
                {paying ? "Processing…" : "Yes, confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}