import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import API_BASE from "../../lib/apiBase";
try { console.debug("[OrderSummary] API base:", API_BASE); } catch {}

const cleanId = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "null" || s === "undefined" || s === "nan") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const statusStyle = (s = "") => {
  const k = s.toLowerCase();
  if (["pending"].includes(k)) return "bg-yellow-500/20 text-yellow-300 border-yellow-400/40";
  if (["accepted", "preparing", "cooking"].includes(k))
    return "bg-blue-500/20 text-blue-300 border-blue-400/40";
  if (["served"].includes(k)) return "bg-purple-500/20 text-purple-300 border-purple-400/40";
  if (["completed", "paid"].includes(k))
    return "bg-green-500/20 text-green-300 border-green-400/40";
  if (["cancelled", "canceled"].includes(k))
    return "bg-red-500/20 text-red-300 border-red-400/40";
  return "bg-gray-500/20 text-gray-300 border-gray-400/40";
};

export default function OrderSummary() {
  const [error, setError] = useState("");
  const esRef = useRef(null);                    // เก็บ EventSource ไว้ปิดตอน unmount
  const { orderId } = useParams();
  const [params] = useSearchParams(); // เผื่อในอนาคตใช้ code=? ตรวจสิทธิ์
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState(null);
  const [currentId, setCurrentId] = useState(null); // resolved order_id to use
  const [recent, setRecent] = useState([]);     // ประวัติออเดอร์โต๊ะนี้ (ล่าสุด→เก่า)
  const [loadingPast, setLoadingPast] = useState(false);

  const savedOrderId = useMemo(() => {
    const keys = ["last_order_id", "order_id", "currentOrderId"];
    for (const k of keys) {
      const v = Number(localStorage.getItem(k));
      if (Number.isFinite(v) && v > 0) return v;
    }
    return null;
  }, []);

  const tableIdParam = params.get("table");
  const orderIdParam = params.get("order"); // optional ?order=17

  // optional: table id saved locally if URL has none
  const savedTableId = useMemo(() => {
    const keys = ["last_table_id", "table_id", "currentTableId"];
    for (const k of keys) {
      const v = Number(localStorage.getItem(k));
      if (Number.isFinite(v) && v > 0) return v;
    }
    return null;
  }, []);

  // 1) Resolve which order_id to show: priority => route :orderId -> ?order= -> savedOrderId -> latest by ?table=
  useEffect(() => {
    console.debug("[OrderSummary] resolve id from:", { routeParam: orderId, queryOrder: orderIdParam, savedOrderId, tableIdParam, savedTableId });
    const routeId  = cleanId(orderId);
    const qOrderId = cleanId(orderIdParam);
    const savedId  = cleanId(savedOrderId);
    const tableIdClean = cleanId(tableIdParam);
    const savedTableIdClean = cleanId(savedTableId);

    // priority 1–3
    if (routeId) { setCurrentId(routeId); return; }
    if (qOrderId) { setCurrentId(qOrderId); return; }
    if (savedId)  { setCurrentId(savedId);  return; }

    // priority 4: latest order of explicit ?table=
    if (tableIdClean) {
      (async () => {
        try {
          setLoading(true);
          console.debug("[OrderSummary] fetch list URL:", `${API_BASE}/orders?table_id=${tableIdClean}`);
          const r = await fetch(`${API_BASE}/orders?table_id=${tableIdClean}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const list = await r.json();
          const latest = list?.[0]; // API orders by created_at DESC
          if (latest?.order_id) {
            setCurrentId(cleanId(latest.order_id));
          } else {
            setData(null);
          }
        } catch (e) {
          console.error(e);
          setError("ไม่พบออเดอร์ของโต๊ะนี้");
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // priority 5: latest order of saved table id
    if (!tableIdClean && savedTableIdClean) {
      (async () => {
        try {
          setLoading(true);
          console.debug("[OrderSummary] fetch list URL:", `${API_BASE}/orders?table_id=${savedTableIdClean}`);
          const r = await fetch(`${API_BASE}/orders?table_id=${savedTableIdClean}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const list = await r.json();
          const latest = list?.[0];
          if (latest?.order_id) {
            setCurrentId(cleanId(latest.order_id));
          } else {
            setData(null);
          }
        } catch (e) {
          console.error(e);
          setError("ไม่พบออเดอร์ของโต๊ะนี้ (saved)");
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // if nothing matches, show error and stop loading spinner
    setError("ไม่พบ order ที่ต้องแสดง");
    setLoading(false);
  }, [orderId, orderIdParam, savedOrderId, tableIdParam, savedTableId]);

  // 2) Load the order once currentId is known
  useEffect(() => {
    const id = cleanId(currentId);
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        console.debug("[OrderSummary] fetch order URL:", `${API_BASE}/orders/${id}`);
        const r = await fetch(`${API_BASE}/orders/${id}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        setData(d);
        setLastAt(new Date());
        // keep latest order id for future visits
        try { localStorage.setItem("last_order_id", String(d?.order_id || id)); } catch {}
      } catch (e) {
        console.error(e);
        setError("โหลดออเดอร์ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentId]);

  // 2.5) Load recent orders by table (exclude current)
  useEffect(() => {
    const resolvedTableId =
      cleanId(data?.table_id) ||
      cleanId(params.get("table")) ||
      cleanId(localStorage.getItem("last_table_id"));

    if (!resolvedTableId) {
      setRecent([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadingPast(true);
        const r = await fetch(`${API_BASE}/orders?table_id=${resolvedTableId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = (await r.json()) || [];
        const filtered = list
          .filter(o => cleanId(o.order_id) !== cleanId(currentId))
          .slice(0, 10);
        if (!cancelled) setRecent(filtered);
      } catch (e) {
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setLoadingPast(false);
      }
    })();

    return () => { cancelled = true; };
  }, [data?.table_id, currentId]);

  // Realtime via SSE (follow currentId)
  useEffect(() => {
    const id = cleanId(currentId);
    if (!id) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const streamUrl = `${API_BASE}/orders/${id}/stream`;
    console.debug("[OrderSummary] SSE URL:", streamUrl);
    let es;
    try {
      es = new EventSource(streamUrl, { withCredentials: false });
    } catch (e) {
      console.error("[OrderSummary] EventSource init error. URL:", streamUrl, e);
      setError("เชื่อมต่อสตรีมไม่สำเร็จ (ตรวจค่า VITE_API_BASE)");
      return;
    }
    esRef.current = es;
    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        setData(payload);
        setLastAt(new Date());
      } catch (_) {}
    };
    es.onerror = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [currentId]);


  const items = data?.items || [];
  const derivedTotal = useMemo(() => {
    if (data?.total_amount != null && Number.isFinite(Number(data.total_amount))) {
      return Number(data.total_amount);
    }
    return items.reduce((sum, it) => {
      const qty = num(it?.quantity, 0);
      const preferred = it?.subtotal != null ? num(it.subtotal, NaN) : NaN;
      const unit = num(it?.unit_price, NaN);
      const price = num(it?.price, NaN);
      const line = Number.isFinite(preferred)
        ? preferred
        : Number.isFinite(unit)
        ? unit * qty
        : Number.isFinite(price)
        ? price * qty
        : 0;
      return sum + line;
    }, 0);
  }, [data?.total_amount, items]);

  // --- safe mappings based on current response shape ---
  const orderNo  = data?.order_id ?? currentId ?? "—";
  const tableNo  = data?.table_label ?? data?.table_id ?? "—";

  const statusRaw = data?.status ?? data?.order?.status ?? "unknown";
  const statusText = String(statusRaw).toUpperCase();

  return (
    <div id="os-summary" className="min-h-screen w-full text-slate-900 bg-[radial-gradient(1200px_800px_at_-20%_-10%,#cde7ff,transparent),radial-gradient(900px_600px_at_120%_10%,#ffd9e0,transparent),linear-gradient(180deg,#fee,#f6c4)]" style={{ WebkitTextFillColor: 'inherit' }}>
      <div className="max-w-3xl mx-auto px-8 md:px-12 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight">Order Summary</h1>
          <p className="text-sm text-slate-600 mt-2">
            {lastAt ? `Last updated: ${lastAt.toLocaleTimeString()}` : "Last updated: —"}
          </p>
          <p className="text-base font-medium text-slate-700 mt-1">
            {`Order #${orderNo} - Table ${tableNo}`}
          </p>
        </div>

        {loading ? (
          <div className="p-6 bg-white bg-opacity-80 rounded-2xl shadow">Loading...</div>
        ) : !data ? (
          <div className="p-6 bg-white bg-opacity-80 rounded-2xl shadow">
            No orders found for tables {tableIdParam || "—"} — Create a new order from the menu.
          </div>
        ) : (
          <>
            {/* Order card */}
            <div
              className="os-card border border-slate-200 shadow-2xl px-8 md:px-12 py-10 rounded-[28px] !bg-white !bg-opacity-100"
              style={{ maxWidth: '680px', marginLeft: 'auto', marginRight: 'auto' }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-500">Current status</p>
                <span
                  className={`inline-flex items-center justify-center rounded-full border-2 px-6 py-2.5 min-h-[40px] min-w-[80px] leading-none text-sm sm:text-base font-semibold tracking-wide uppercase ${statusStyle(statusRaw)}`}
                  style={{ WebkitTextFillColor: "inherit" }}
                >
                  {statusText}
                </span>
              </div>

              <h2 className="text-xl font-semibold text-slate-900 mt-4">Your order has been placed successfully!</h2>
              <p className="text-sm text-slate-500 mt-2">We'll keep this page updated as it progresses.</p>

              {/* Items */}
              <div className="mt-6 space-y-2">
                {items.map((it) => {
                  const qty = num(it?.quantity, 0);
                  // Prefer explicit subtotal; otherwise try unit_price*qty then price*qty
                  const lineSubtotal =
                    (it?.subtotal != null ? num(it.subtotal, NaN) : NaN) ??
                    NaN;
                  const fallbackUnit = num(it?.unit_price, NaN);
                  const fallbackPrice = num(it?.price, NaN);
                  const computed = Number.isFinite(lineSubtotal)
                    ? lineSubtotal
                    : Number.isFinite(fallbackUnit)
                    ? fallbackUnit * qty
                    : Number.isFinite(fallbackPrice)
                    ? fallbackPrice * qty
                    : 0;

                  return (
                    <div
                      key={`${it.food_id}-${it.food_name}`}
                      className="os-row flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{it.food_name}</div>
                        <div className="text-xs text-slate-500">×{qty}</div>
                      </div>
                      <div className="text-right min-w-[7rem]">฿{num(computed, 0).toFixed(2)}</div>
                    </div>
                  );
                })}

                <div className="os-total flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div className="font-semibold text-slate-700">Total</div>
                  <div className="font-semibold">฿{derivedTotal.toFixed(2)}</div>
                </div>
              </div>

              <Link
                to={`/home?table=${data?.table_id ?? ""}`}
                className="mt-7 block mx-auto w-[280px] md:w-[320px] text-center px-6 py-3 rounded-full bg-slate-100 text-slate-900 font-semibold border border-slate-200 shadow-inner hover:bg-slate-200 transition"
              >
                Back to Menu
              </Link>
            </div>

            {/* Past orders */}
            <div className="mt-10">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold text-slate-800">Past orders for this table</h2>
                <button
                  onClick={async () => {
                    const tableId =
                      cleanId(data?.table_id) ||
                      cleanId(params.get("table")) ||
                      cleanId(localStorage.getItem("last_table_id"));
                    if (!tableId) return;
                    try {
                      setLoadingPast(true);
                      const r = await fetch(`${API_BASE}/orders?table_id=${tableId}`);
                      const list = (await r.json()) || [];
                      const filtered = list
                        .filter(o => cleanId(o.order_id) !== cleanId(currentId))
                        .slice(0, 10);
                      setRecent(filtered);
                    } catch (err) {
                      setError("Failed to load past orders");
                    } finally {
                      setLoadingPast(false);
                    }
                  }}
                  className="text-sm font-medium text-teal-600 hover:text-teal-700"
                  disabled={loadingPast}
                >
                  {loadingPast ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {loadingPast && <div className="opacity-70">Loading history…</div>}

              {!loadingPast && (!recent || recent.length === 0) ? (
                <div className="opacity-70">No previous orders for this table.</div>
              ) : (
                <div className="space-y-2">
                  {recent.map((o) => (
                    <Link
                      key={o.order_id}
                      to={`/summary/${Number(o.order_id)}`}
                      className="flex items-center justify-between rounded-2xl os-card px-4 py-3 shadow-sm cursor-pointer hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
                      aria-label={`View order #${o.order_id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-semibold text-slate-700">
                          #{o.order_id} {o.table_label ? `Table ${o.table_label}` : `Table ${o.table_id}`}
                        </div>
                        <span
                          className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${statusStyle(o.status)}`}
                          style={{ WebkitTextFillColor: "inherit" }}
                        >
                          {String(o.status || "").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-700">฿{Number(o.total_amount || 0).toFixed(2)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
  </div>
  );
}