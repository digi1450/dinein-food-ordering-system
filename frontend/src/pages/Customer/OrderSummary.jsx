import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import API_BASE from "../../lib/apiBase";
try { console.debug("[OrderSummary] API base:", API_BASE); } catch {}

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
    // priority 1: route param /:orderId
    if (orderId && Number.isFinite(Number(orderId))) {
      setCurrentId(Number(orderId));
      return;
    }
    // priority 2: explicit ?order=...
    if (orderIdParam && Number.isFinite(Number(orderIdParam))) {
      setCurrentId(Number(orderIdParam));
      return;
    }
    // priority 3: saved id in localStorage
    if (Number.isFinite(Number(savedOrderId))) {
      setCurrentId(Number(savedOrderId));
      return;
    }
    // priority 4: latest order of this table (?table=...)
    const tableId = Number(tableIdParam);
    if (Number.isFinite(tableId)) {
      (async () => {
        try {
          setLoading(true);
          console.debug("[OrderSummary] fetch list URL:", `${API_BASE}/orders?table_id=${tableId}`);
          const r = await fetch(`${API_BASE}/orders?table_id=${tableId}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const list = await r.json();
          const latest = list?.[0]; // API already orders by created_at DESC
          if (latest?.order_id) {
            setCurrentId(Number(latest.order_id));
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
    // priority 5: latest order from saved table id
    if (!Number.isFinite(Number(tableIdParam)) && Number.isFinite(Number(savedTableId))) {
      const tableId = Number(savedTableId);
      (async () => {
        try {
          setLoading(true);
          console.debug("[OrderSummary] fetch list URL:", `${API_BASE}/orders?table_id=${tableId}`);
          const r = await fetch(`${API_BASE}/orders?table_id=${tableId}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const list = await r.json();
          const latest = list?.[0];
          if (latest?.order_id) {
            setCurrentId(Number(latest.order_id));
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
    if (!Number.isFinite(Number(currentId))) return;
    (async () => {
      try {
        setLoading(true);
        console.debug("[OrderSummary] fetch order URL:", `${API_BASE}/orders/${currentId}`);
        const r = await fetch(`${API_BASE}/orders/${currentId}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        setData(d);
        setLastAt(new Date());
        // keep latest order id for future visits
        try { localStorage.setItem("last_order_id", String(d?.order_id || currentId)); } catch {}
      } catch (e) {
        console.error(e);
        setError("โหลดออเดอร์ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentId]);

  // Realtime via SSE (follow currentId)
  useEffect(() => {
    if (!Number.isFinite(Number(currentId))) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const streamUrl = `${API_BASE}/orders/${currentId}/stream`;
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
    <div className="max-w-3xl mx-auto p-4 text-white">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold">Order Summary</h1>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!Number.isFinite(Number(currentId))) return;
              (async () => {
                try {
                  setLoading(true);
                  console.debug("[OrderSummary] fetch order URL:", `${API_BASE}/orders/${currentId}`);
                  const r = await fetch(`${API_BASE}/orders/${currentId}`);
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
            className="px-3 py-1 border rounded hover:bg-white/10 disabled:opacity-60"
            disabled={loading}
            title="Refresh now"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="opacity-75 text-sm mb-3">
        {lastAt ? `Last updated: ${lastAt.toLocaleTimeString()}` : "—"}
      </div>

      {loading ? (
        <div className="opacity-80">Loading...</div>
      ) : !data ? (
        <div className="opacity-80">
          ไม่พบออเดอร์สำหรับโต๊ะ {tableIdParam || "—"} — สร้างออเดอร์ใหม่จากเมนูได้เลย
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="opacity-80">
              Order <span className="font-semibold">#{orderNo}</span> — Table{" "}
              <span className="font-semibold">{tableNo}</span>
            </div>
            <span className={`border px-2 py-0.5 rounded text-sm ${statusStyle(statusRaw)}`}>
              {statusText}
            </span>
          </div>

          <div className="space-y-2">
            {items.map((it) => {
              const lineSubtotal =
                it?.subtotal != null
                  ? Number(it.subtotal)
                  : Number(it.price) * Number(it.quantity);

              return (
                <div key={`${it.food_id}-${it.food_name}`} className="flex justify-between border-b py-2">
                  <div>
                    {it.food_name} <span className="opacity-70">x{it.quantity}</span>
                  </div>
                  <div>฿{Number(lineSubtotal || 0).toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center border-t pt-3 mt-3">
            <div className="text-xl font-bold">Total</div>
            <div className="text-xl font-bold">฿{derivedTotal.toFixed(2)}</div>
          </div>

          <a href={`/home?table=${data?.table_id ?? ""}`} className="inline-block mt-6 border px-4 py-2 rounded">
            Back to Menu
          </a>
        </>
      )}
    </div>
  );
}