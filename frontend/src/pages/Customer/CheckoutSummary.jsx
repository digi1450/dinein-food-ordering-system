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

// Extract meta (name/phone/description) from either order-level or item-level fields
const extractMeta = (order = {}, item = {}) => {
  const customer_name = coalesce(
    order.customer_name,
    order.name,
    order.customerName,
    item.customer_name,
    item.name,
    item.customerName
  );
  const customer_phone = coalesce(
    order.customer_phone,
    order.phone,
    order.phone_number,
    order.tel,
    order.contact,
    order.customerPhone,
    item.customer_phone,
    item.phone
  );
  const description = coalesce(
    order.description,
    order.note,
    order.notes,
    order.comment,
    order.comments,
    order.special_request,
    item.description,
    item.note,
    item.comment
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
        const cand = [
          it.unit_price,
          it.price,
          Number(it.subtotal) / Math.max(qty, 1),
        ];
        for (const v of cand) {
          const n = Number(v);
          if (Number.isFinite(n)) return n;
        }
        return 0;
      })();

      const meta = extractMeta(o, it);
      const keyParts = [
        it.food_id,
        unit,
        meta.customer_name,
        meta.customer_phone,
        meta.description,
      ];
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
      return t
        ? `/summary/${latestNum}?table=${encodeURIComponent(t)}`
        : `/summary/${latestNum}`;
    }

    // 2) last_order_id from localStorage
    const lastId = Number(localStorage.getItem("last_order_id"));
    if (Number.isFinite(lastId) && lastId > 0) {
      return t
        ? `/summary/${lastId}?table=${encodeURIComponent(t)}`
        : `/summary/${lastId}`;
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

        // Ensure/start an open bill for this table
        try {
          await fetch(`${API_BASE}/billing/checkout/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table: String(tableId) }),
          });
        } catch (_) {
          // non-blocking for customer view
        }

        // Load active orders via billing
        const openRes = await fetch(
          `${API_BASE}/billing/open-orders?table=${encodeURIComponent(
            String(tableId)
          )}`
        );
        if (!openRes.ok)
          throw new Error("Failed to load open orders via billing");
        const { orders: openOrders } = await openRes.json();

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
      if (!startRes.ok)
        throw new Error("Cannot start/ensure bill for this table");
      const startData = await startRes.json().catch(() => ({}));
      const billId =
        startData.billId || startData.bill_id || startData.bill?.bill_id;
      if (!billId) throw new Error("No bill_id returned");

      // 2) Confirm checkout
      const confirmRes = await fetch(
        `${API_BASE}/billing/checkout/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bill_id: Number(billId), method: "cash" }),
        }
      );
      if (!confirmRes.ok) {
        const data = await confirmRes.json().catch(() => ({}));
        throw new Error(
          data?.error || data?.message || "Failed to confirm checkout"
        );
      }

      // 2.5) Save session boundary order id (optional)
      try {
        const numericTableId = orders[0]?.table_id;
        const t = Number(numericTableId);
        if (Number.isFinite(t) && t > 0) {
          const ordersRes = await fetch(
            `${API_BASE}/orders?table_id=${t}&include_closed=1`
          );
          if (ordersRes.ok) {
            const list = (await ordersRes.json()) || [];
            const maxId = list
              .map((o) => Number(o.order_id))
              .filter((n) => Number.isFinite(n))
              .reduce((max, n) => (n > max ? n : max), 0);
            if (maxId > 0) {
              localStorage.setItem(
                `session_boundary_order_id_${t}`,
                String(maxId)
              );
            }
          }
        }
      } catch (_) {
        // ignore
      }

      // 3) Clear local cart and go to success
      try {
        localStorage.removeItem(`cart_table_${tableId}`);
      } catch {}
      nav(
        `/checkout/success?table=${encodeURIComponent(tableId ?? "")}`,
        { replace: true }
      );
    } catch (e) {
      setErr(e.message || "Checkout failed");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-900 bg-slate-100">
      {/* NAVBAR เหมือนธีม HomePage */}
      <header className="sticky top-0 z-20 bg-[#1d4ed8] text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-sky-400 flex items-center justify-center text-base font-semibold shadow-sm">
              💳
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/90">
                Checkout
              </div>
              <div className="text-sm md:text-base font-semibold leading-tight">
                Review and confirm your bill.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-[11px] uppercase tracking-[0.18em] text-sky-100/80">
                Table
              </span>
              <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-200/40 text-xs font-semibold shadow-sm">
                {tableId || "—"}
              </span>
            </div>
            <Link
              to={summaryHref}
              className="text-[11px] md:text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors border border-white/30"
            >
              Back to orders
            </Link>
          </div>
        </div>
      </header>

      {/* BODY */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 pt-6 pb-10">
        {err && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-red-700 text-sm shadow-sm">
            {err}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse"
              />
            ))}
          </div>
        ) : !hasAnything ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-7 text-center text-slate-600 shadow-md shadow-slate-200/60">
            <h2 className="text-lg font-semibold text-slate-900">
              No open orders
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              There are no active orders for this table right now.
            </p>
            <div className="mt-4">
              <Link
                to={`/menu?table=${encodeURIComponent(tableId ?? "")}`}
                className="inline-flex items-center px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50 shadow-sm"
              >
                Back to menu
              </Link>
            </div>
          </div>
        ) : (
          <section className="rounded-[28px] bg-white border border-slate-200 shadow-md shadow-slate-200/70 px-6 py-7 md:px-8 md:py-8">
            {/* Header in card */}
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Checkout Summary
                </p>
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 mt-1">
                  Order summary (merged)
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Same items from multiple orders are combined into a single bill.
                </p>
              </div>
              <div className="hidden sm:flex flex-col items-end text-right text-xs text-slate-500">
                <span>
                  Items:{" "}
                  <span className="font-semibold text-slate-800">
                    {lines.length}
                  </span>
                </span>
                <span>
                  Orders:{" "}
                  <span className="font-semibold text-slate-800">
                    {orders.length}
                  </span>
                </span>
              </div>
            </div>

            {/* รายการรวม */}
            <div className="space-y-2">
              {lines.map((r, idx) => (
                <div
                  key={`${r.food_id}-${idx}`}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3"
                >
                  <div className="pr-3 flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {r.food_name}{" "}
                      <span className="text-xs text-slate-500 font-normal">
                        ×{r.quantity}
                      </span>
                    </div>

                    {(r.meta.customer_name ||
                      r.meta.customer_phone ||
                      r.meta.description) && (
                      <div className="text-xs text-slate-500 mt-0.5 break-words">
                        {r.meta.customer_name && (
                          <span>Name: {r.meta.customer_name}</span>
                        )}
                        {r.meta.customer_name &&
                          r.meta.customer_phone && <span> · </span>}
                        {r.meta.customer_phone && (
                          <span>Phone: {r.meta.customer_phone}</span>
                        )}

                        {r.meta.description && (
                          <div className="mt-1 text-xs text-slate-500 break-words whitespace-pre-wrap">
                            {r.meta.description}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right font-semibold ml-2 text-slate-900">
                    ฿{currency(r.unit_price * r.quantity)}
                    <div className="text-xs text-slate-500 font-normal">
                      ({currency(r.unit_price)} each)
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* รวมทั้งหมด */}
            <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-lg font-bold text-slate-900">
              <span>Total</span>
              <span>฿{currency(grandTotal)}</span>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-end gap-2 sm:gap-3">
              <Link
                to={`/menu?table=${encodeURIComponent(tableId ?? "")}`}
                className="inline-flex justify-center px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 text-sm font-medium shadow-sm"
              >
                Add more items
              </Link>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={paying}
                className="inline-flex justify-center px-5 py-2.5 rounded-full bg-[#1d4ed8] text-white text-sm font-semibold shadow-sm hover:bg-[#1e40af] disabled:opacity-60"
              >
                {paying ? "Processing…" : "Confirm & Checkout"}
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (!paying ? setConfirmOpen(false) : null)}
          />
          <div className="relative z-10 w-[90%] max-w-sm rounded-2xl bg-white p-6 shadow-xl shadow-black/30">
            <h3 className="text-lg font-semibold text-slate-900">
              Confirm checkout?
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Your open orders for table {tableId} will be merged and sent to the
              cashier as{" "}
              <span className="font-semibold text-slate-800">
                pending payment
              </span>
              .
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
                onClick={doCheckout}
                disabled={paying}
                className="px-4 py-2 rounded-full bg-[#1d4ed8] text-white text-sm font-semibold hover:bg-[#1e40af] disabled:opacity-60"
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