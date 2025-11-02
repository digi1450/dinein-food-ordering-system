import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import API_BASE from "../../lib/apiBase";
try { console.debug("[OrderSummary] API base:", API_BASE); } catch {}

const cleanId = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "null" || s === "undefined" || s === "nan") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
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
    if (data?.total_amount != null && !Number.isNaN(Number(data.total_amount))) {
      return Number(data.total_amount);
    }
    return items.reduce((sum, it) => {
      const sub =
        it?.subtotal != null
          ? Number(it.subtotal)
          : Number(it.price) * Number(it.quantity);
      return sum + (Number.isFinite(sub) ? sub : 0);
    }, 0);
  }, [data, items]);

  // --- safe mappings based on current response shape ---
  const orderNo  = data?.order_id ?? currentId ?? "—";
  const tableNo  = data?.table_label ?? data?.table_id ?? "—";

  const statusRaw = data?.status ?? data?.order?.status ?? "unknown";
  const statusText = String(statusRaw).toUpperCase();

  return (
    <div className="min-h-screen w-full text-slate-900 bg-[radial-gradient(1200px_800px_at_-20%_-10%,#cde7ff,transparent),radial-gradient(900px_600px_at_120%_10%,#ffd9e0,transparent),linear-gradient(180deg,#fff,#ffe6c4)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-extrabold tracking-tight">Order Summary</h1>
          <button
            onClick={() => {
              const id = cleanId(currentId);
              if (!id) return;
              (async () => {
                try {
                  setLoading(true);
                  const r = await fetch(`${API_BASE}/orders/${id}`);
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  const d = await r.json();
                  setData(d);
                  setLastAt(new Date());
                } catch (e) {
                  console.error(e);
                  setError("Unsuccessful order reload");
                } finally {
                  setLoading(false);
                }
              })();
            }}
            className="px-4 py-2 rounded-xl bg-teal-500 text-white font-medium hover:bg-teal-600 shadow-md disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="text-sm text-slate-600 mb-8">
          {lastAt ? `Last updated: ${lastAt.toLocaleTimeString()}` : "—"}
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
            <div className="p-6 rounded-2xl bg-white bg-opacity-90 border border-slate-200 shadow-xl">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div className="font-semibold text-lg">Order #{orderNo}</div>
                  <div className="text-slate-500 text-sm">Table {tableNo}</div>
                </div>
                <span className={`border px-3 py-1 rounded-full text-sm font-medium ${statusStyle(statusRaw)}`}>
                  {statusText}
                </span>
              </div>

              <p className="text-slate-600 mb-4">Your order has been placed successfully!</p>

              {/* Items */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 bg-slate-50 text-slate-600 text-sm">
                  <div className="col-span-9 px-4 py-2">Item</div>
                  <div className="col-span-3 px-4 py-2 text-right">Amount</div>
                </div>

                {items.map((it) => {
                  const lineSubtotal =
                    it?.subtotal != null
                      ? Number(it.subtotal)
                      : Number(it.price) * Number(it.quantity);
                  return (
                    <div key={`${it.food_id}-${it.food_name}`} className="grid grid-cols-12 border-t border-slate-200 bg-white">
                      <div className="col-span-9 px-4 py-3">
                        <div className="font-medium">{it.food_name}</div>
                        <div className="text-sm opacity-60">x{it.quantity}</div>
                      </div>
                      <div className="col-span-3 px-4 py-3 text-right">
                        ฿{Number(lineSubtotal || 0).toFixed(2)}
                      </div>
                    </div>
                  );
                })}

                <div className="grid grid-cols-12 bg-slate-50 border-t border-slate-200">
                  <div className="col-span-9 px-4 py-3 text-right font-semibold">Total:</div>
                  <div className="col-span-3 px-4 py-3 text-right font-semibold">
                    ฿{derivedTotal.toFixed(2)}
                  </div>
                </div>
              </div>

              <a
                href={`/home?table=${data?.table_id ?? ""}`}
                className="inline-block mt-6 px-5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 shadow-sm font-medium"
              >
                Back to Menu
              </a>
            </div>

            {/* Past orders */}
            <div className="mt-10">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">Past orders for this table</h2>
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
                    } catch (_) {
                    } finally {
                      setLoadingPast(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium shadow-sm"
                  disabled={loadingPast}
                >
                  {loadingPast ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {loadingPast && <div className="opacity-70">Loading history…</div>}

              {!loadingPast && (!recent || recent.length === 0) ? (
                <div className="opacity-70">No previous orders for this table.</div>
              ) : (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 overflow-hidden bg-white bg-opacity-80">
                  {recent.map((o) => (
                    <div key={o.order_id} className="flex justify-between items-center p-3 hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-slate-600">#{o.order_id}</div>
                        <div className="text-sm text-slate-600">
                          {o.table_label ? `Table ${o.table_label}` : `Table ${o.table_id}`}
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600">
                          {String(o.status || "").toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-600">฿{Number(o.total_amount || 0).toFixed(2)}</div>
                        <a
                          href={`/summary/${Number(o.order_id)}`}
                          className="text-sm px-4 py-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 shadow-sm font-medium"
                        >
                          View
                        </a>
                      </div>
                    </div>
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