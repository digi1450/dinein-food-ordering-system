import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
const API = import.meta.env.VITE_API;

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
  const { orderId } = useParams();
  const [params] = useSearchParams(); // เผื่อในอนาคตใช้ code=? ตรวจสิทธิ์
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState(null);

  // ดึงข้อมูลออเดอร์
  const fetchOrder = async () => {
    try {
      setLoading(true);
      const r = await fetch(`${API}/api/orders/${orderId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d);
      setLastAt(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  // Realtime via SSE
  useEffect(() => {
    if (!orderId) return;

    const es = new EventSource(`${API}/api/orders/${orderId}/stream`);
    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        setData(payload);
        setLastAt(new Date());
      } catch (e) {
        // ignore parse errors
      }
    };
    es.onerror = () => {
      // Close on error; UI still has a manual Refresh button as fallback
      es.close();
    };

    return () => es.close();
  }, [orderId]);

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
  const orderNo  = data?.order_id ?? "—";
  const tableNo  = data?.table_label ?? data?.table_id ?? "—";

  const statusRaw = data?.status ?? data?.order?.status ?? "unknown";
  const statusText = String(statusRaw).toUpperCase();

  return (
    <div className="max-w-3xl mx-auto p-4 text-white">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold">Order Summary</h1>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrder}
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

      {!data ? (
        <div className="opacity-80">Loading...</div>
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