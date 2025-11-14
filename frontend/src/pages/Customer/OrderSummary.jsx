// frontend/src/pages/Customer/OrderSummary.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import API_BASE from "../../lib/apiBase";
import { api } from "../../lib/api";

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

const firstId = (obj, keys = ["order_item_id","item_id","id"]) => {
  for (const k of keys) {
    const v = obj && obj[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
};

// pick the first non-empty trimmed string from a set of keys on an object
const pickText = (obj, keys = []) => {
  for (const k of keys) {
    const v = obj && obj[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
};

// convenience to pick from data or nested data.order
const pickOrderField = (data, keys = []) => {
  return (
    pickText(data, keys) ||
    pickText(data && data.order, keys)
  );
};

const statusStyle = (s = "") => {
  const k = s.toLowerCase();
  if (["pending"].includes(k)) return "bg-amber-200 text-slate-800 ring-1 ring-amber-300/60";
  if (["preparing"].includes(k))
    return "bg-blue-200 text-slate-800 ring-1 ring-blue-300/60";
  if (["served"].includes(k)) return "bg-purple-200 text-slate-800 ring-1 ring-purple-300/60";
  if (["completed", "paid"].includes(k))
    return "bg-green-200 text-slate-800 ring-1 ring-green-300/60";
  if (["cancelled", "canceled"].includes(k))
    return "bg-red-200 text-slate-900 ring-1 ring-red-300/60";
  return "bg-gray-200 text-slate-800 ring-1 ring-gray-300/60";
};

const isActiveStatus = (s = "") => {
  const k = String(s).toLowerCase();
  return !["completed", "cancelled", "canceled"].includes(k);
};

export default function OrderSummary() {
  const esRef = useRef(null);                    // เก็บ EventSource ไว้ปิดตอน unmount
  const { orderId } = useParams();
  const [params] = useSearchParams(); // เผื่อในอนาคตใช้ code=? ตรวจสิทธิ์
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState(null);
  const [currentId, setCurrentId] = useState(null); // resolved order_id to use
  const [recent, setRecent] = useState([]);     // ประวัติออเดอร์โต๊ะนี้ (ล่าสุด→เก่า)
  const [loadingPast, setLoadingPast] = useState(false);
  const [error, setError] = useState("");
  const [cancelingId, setCancelingId] = useState(null);
  const [cancelErr, setCancelErr] = useState("");
  const handleCancelItem = async (item) => {
    // Show confirmation dialog before proceeding
    const confirmed = window.confirm("Are you sure you want to cancel this item?");
    if (!confirmed) {
      return;
    }
    setCancelErr("");
    const itemId = firstId(item);
    if (!itemId) {
      setCancelErr("Cannot cancel: missing item id.");
      return;
    }

    try {
      setCancelingId(itemId);
      // ใช้ api helper เรียก endpoint ยกเลิกเมนูฝั่งลูกค้า
      const updated = await api.patch(`/orders/order-items/${itemId}/cancel`);

      // อัปเดตสถานะในหน้า Summary จากผลลัพธ์ backend
      setData((prev) => {
        if (!updated) return prev;

        let nextOrder = null;
        // กรณี backend ส่ง order ตรง ๆ
        if (updated.items && updated.order_id) {
          nextOrder = updated;
        }
        // กรณี backend ส่งเป็น { order: {...} }
        else if (updated.order && updated.order.items) {
          nextOrder = updated.order;
        } else {
          nextOrder = prev;
        }

        if (!nextOrder) return prev;

        // ถ้าทุกเมนูในออเดอร์ถูกยกเลิกแล้ว ให้ force สถานะเป็น cancelled และยอดรวมเป็น 0
        const allCancelled = Array.isArray(nextOrder.items) &&
          nextOrder.items.length > 0 &&
          nextOrder.items.every((it) => String(it?.status || "").toLowerCase() === "cancelled");

        if (allCancelled) {
          nextOrder = {
            ...nextOrder,
            status: "cancelled",
            total_amount: 0,
          };
        }

        return nextOrder;
      });
      // Note: Do not auto-promote here; let SSE or explicit refresh manage order switching.
    } catch (e) {
      console.error("[OrderSummary] cancel item error:", e);
      setCancelErr(e.message || "Cancel failed");
    } finally {
      setCancelingId(null);
    }
  };


  const savedOrderId = useMemo(() => {
    // Prefer per-table remembered order id if a table id is resolvable; otherwise fall back to legacy keys
    try {
      // Try to infer a table id from URL/data/localStorage without reordering declarations
      const rawTableId =
        (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('table') : null) ??
        localStorage.getItem('last_table_id');
      const tId = (() => {
        const s = String(rawTableId ?? '').trim();
        const n = Number(s);
        return Number.isFinite(n) && n > 0 ? n : null;
      })();
      if (tId) {
        const perTable = Number(localStorage.getItem(`last_order_id_by_table_${tId}`));
        if (Number.isFinite(perTable) && perTable > 0) return perTable;
      }
    } catch {}

    const keys = ["last_order_id", "order_id", "currentOrderId"];
    for (const k of keys) {
      const v = Number(localStorage.getItem(k));
      if (Number.isFinite(v) && v > 0) return v;
    }
    return null;
  }, []);

  const tableIdParam = params.get("table");
  const orderIdParam = params.get("order"); // optional ?order=17

  // Memoized flag: did user explicitly request a specific order via URL param or query
  const isUserPinned = useMemo(() => {
    const routePinned = cleanId(orderId);
    const queryPinned = cleanId(orderIdParam);
    return !!(routePinned || queryPinned);
  }, [orderId, orderIdParam]);

  // optional: table id saved locally if URL has none
  const savedTableId = useMemo(() => {
    const keys = ["last_table_id", "table_id", "currentTableId"];
    for (const k of keys) {
      const v = Number(localStorage.getItem(k));
      if (Number.isFinite(v) && v > 0) return v;
    }
    return null;
  }, []);

  // Resolve a single source of truth for table id to use across links/queries
  const tableIdResolved = useMemo(() => {
    const fromData = cleanId(data?.table_id);
    const fromQuery = cleanId(tableIdParam);
    const fromSaved = cleanId(savedTableId);
    return fromData ?? fromQuery ?? fromSaved ?? null;
  }, [data?.table_id, tableIdParam, savedTableId]);

  const savedOrderIdForResolvedTable = useMemo(() => {
    const t = cleanId(tableIdResolved);
    if (!t) return null;
    const v = Number(localStorage.getItem(`last_order_id_by_table_${t}`));
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [tableIdResolved]);

  // 1) Resolve which order_id to show: priority => route :orderId -> ?order= -> savedOrderId -> latest by ?table=
  useEffect(() => {
    const routeId  = cleanId(orderId);
    const qOrderId = cleanId(orderIdParam);
    const savedId  = cleanId(savedOrderId);
    const tableIdClean = cleanId(tableIdParam);
    const savedTableIdClean = cleanId(savedTableId);

    // priority 1–3
    if (routeId) { setCurrentId(routeId); return; }
    if (qOrderId) { setCurrentId(qOrderId); return; }
    const savedIdByTable = cleanId(savedOrderIdForResolvedTable);
    if (savedIdByTable) { setCurrentId(savedIdByTable); return; }
    if (savedId)  { setCurrentId(savedId);  return; }

  // priority 4: latest *active* order of explicit ?table=
  if (tableIdClean) {
    (async () => {
      try {
        setLoading(true);
        const list = await api.get(`/orders?table_id=${tableIdClean}`);

        // เลือกเฉพาะออเดอร์ที่ยัง active (ไม่เอา completed / cancelled มาเป็น current)
        const latestActive = Array.isArray(list)
          ? list.find(o => isActiveStatus(o.status))
          : null;

        if (latestActive && latestActive.order_id) {
          setCurrentId(cleanId(latestActive.order_id));
        } else {
          // ไม่มี active order เลย → ถือว่าโต๊ะเริ่ม session ใหม่
          setCurrentId(null);
          setData(null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    return;
  }

  // priority 5: latest *active* order of saved table id
  if (!tableIdClean && savedTableIdClean) {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`${API_BASE}/orders?table_id=${savedTableIdClean}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = (await r.json()) || [];

        const latestActive = Array.isArray(list)
          ? list.find(o => isActiveStatus(o.status))
          : null;

        if (latestActive && latestActive.order_id) {
          setCurrentId(cleanId(latestActive.order_id));
        } else {
          setCurrentId(null);
          setData(null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    return;
  }

    // if nothing matches, stop loading spinner
    setLoading(false);
  }, [orderId, orderIdParam, savedOrderId, tableIdParam, savedTableId]);

  // 2) Load the order once currentId is known
  useEffect(() => {
    const id = cleanId(currentId);
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const d = await api.get(`/orders/${id}`);
        // If a table filter is present and this order doesn't belong to that table, redirect to that table's latest order
        const tResolved = cleanId(tableIdResolved);
        if (tResolved && cleanId(d?.table_id) !== tResolved) {
          try {
            const r2 = await fetch(`${API_BASE}/orders?table_id=${tResolved}`);
            if (r2.ok) {
              const list2 = await r2.json();
              const latestForTable = list2?.[0];
              if (latestForTable?.order_id) {
                setCurrentId(cleanId(latestForTable.order_id));
                return; // stop here; next effect run will load the correct order
              }
            }
          } catch {}
          // If no orders for that table, clear data but keep page stable
          setData(null);
          setLoading(false);
          return;
        }
        setData(d);
        setError("");
        setLastAt(new Date());
        // keep latest order id for future visits, only if status is active
        try {
          const statusKey = String(d?.status || "").toLowerCase();
          const tForSave = cleanId(d?.table_id);

          if (isActiveStatus(statusKey)) {
            localStorage.setItem("last_order_id", String(d?.order_id || id));
            if (tForSave) {
              localStorage.setItem(`last_order_id_by_table_${tForSave}`, String(d?.order_id || id));
              localStorage.setItem("last_table_id", String(tForSave));
            }
          } else {
            localStorage.removeItem("last_order_id");
            if (tForSave) {
              localStorage.removeItem(`last_order_id_by_table_${tForSave}`);
              localStorage.setItem("last_table_id", String(tForSave));
            }
          }
        } catch {}
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentId]);

// Helper to compute past orders for the current sitting (session)
// - แสดงทุกสถานะ (รวม cancelled) ยกเว้น completed/paid
// - จำกัดให้เฉพาะออเดอร์ใน "session ปัจจุบัน" เท่านั้น
const computePastOrders = (list, currentId) => {
  const curStatus = String(data?.status || "").toLowerCase();

  // ถ้าไม่มี currentId หรือ current order ถูก checkout แล้ว → ไม่โชว์ประวัติ
  if (!currentId || curStatus === "completed" || curStatus === "paid") return [];

  const arr = Array.isArray(list) ? list.slice() : [];
  if (!arr.length) return [];

  const currentNumericId = Number(currentId);
  if (!Number.isFinite(currentNumericId)) return [];

  // หา active orders ทั้งหมดของโต๊ะ (สถานะที่ยังไม่ใช่ completed / cancelled)
  const activeOrders = arr.filter((o) => isActiveStatus(o.status));

  // sessionMinId = order_id ที่เล็กที่สุดในบรรดา active orders ของโต๊ะนี้
  // ถ้าไม่มี active order อื่น ก็ใช้ currentId เองเป็นจุดเริ่มต้นของ session
  let sessionMinId = currentNumericId;
  if (activeOrders.length > 0) {
    const activeIds = activeOrders
      .map((o) => Number(o.order_id))
      .filter((n) => Number.isFinite(n));
    if (activeIds.length > 0) {
      sessionMinId = Math.min(...activeIds);
    }
  }

  return arr.filter((o) => {
    const oid = Number(o.order_id);
    if (!Number.isFinite(oid)) return false;

    // ตัดทุกออเดอร์ที่ "เก่ากว่า session ปัจจุบัน" ทิ้ง
    // → ลูกค้าใหม่จะไม่เห็นออเดอร์ของลูกค้าคนก่อน
    if (oid < sessionMinId) return false;

    // ไม่แสดง current order ซ้ำใน Past orders
    if (oid === currentNumericId) return false;

    const st = String(o.status || "").toLowerCase();

    // Past orders ไม่ต้องโชว์ completed/paid
    if (st === "completed" || st === "paid") return false;

    // ที่เหลือ (รวม cancelled ใน session นี้) ให้โชว์ทั้งหมด
    return true;
  });
};

  // 2.5) Load recent orders by table (exclude current)
  useEffect(() => {
    const tableId = Number(tableIdResolved);
    if (!Number.isFinite(tableId) || tableId <= 0) {
      setRecent([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadingPast(true);
        const r = await fetch(`${API_BASE}/orders?table_id=${tableId}&include_closed=1`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = (await r.json()) || [];
        const curStatus = String(data?.status || "").toLowerCase();
        if (curStatus === "completed" || curStatus === "paid") {
          if (!cancelled) setRecent([]);
          return;
        }
        // Prefer the newest active order for this table as the current card.
        // API is expected to return newest first; find the first active order.
        const newestActive = list.find(o => isActiveStatus(o.status));
        if (!isUserPinned && newestActive && Number(newestActive.order_id) !== Number(currentId)) {
          // Only auto-promote when the user did not explicitly open a specific order.
          if (!cancelled) setCurrentId(cleanId(newestActive.order_id));
          return;
        }
        const filtered = computePastOrders(list, currentId);
        if (!cancelled) setRecent(filtered);
      } catch (e) {
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setLoadingPast(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tableIdResolved, currentId, isUserPinned, data?.status]);

  // Realtime via SSE (follow currentId)
  useEffect(() => {
    const id = cleanId(currentId);
    if (!id) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const streamUrl = `${API_BASE}/orders/${id}/stream`;
    let es;
    try {
      es = new EventSource(streamUrl, { withCredentials: false });
    } catch (e) {
      console.error("[OrderSummary] EventSource init error. URL:", streamUrl, e);
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

  // Auto-promote the next active order for this table when current order becomes inactive or empty
  useEffect(() => {
    const inactive = !data || !isActiveStatus(data.status) || (Array.isArray(data.items) && data.items.length === 0);
    if (!inactive) return;
    if (isUserPinned) return; // Respect manual selection; do not auto-switch

    const t = cleanId(tableIdResolved);
    if (!t) return;

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/orders?table_id=${t}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = (await r.json()) || [];
        const next = list.find(o => isActiveStatus(o.status) && Number(o.order_id) !== Number(currentId));
        if (!cancelled && next && next.order_id) {
          setCurrentId(cleanId(next.order_id));
        }
      } catch (_) {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [data?.status, data?.items?.length, tableIdResolved, currentId, isUserPinned]);


  const items = data?.items || [];
  const isClosed = ["completed", "paid"].includes(String(data?.status || "").toLowerCase());
  const orderIsPending = String(data?.status || "").toLowerCase() === "pending";
  const derivedTotal = useMemo(() => {
    const isCancelledOrder = String(data?.status || "").toLowerCase() === "cancelled";
    if (!isCancelledOrder && data?.total_amount != null && Number.isFinite(Number(data.total_amount))) {
      return Number(data.total_amount);
    }
    return items.reduce((sum, it) => {
      // skip cancelled items when computing from lines
      if (String(it?.status || "").toLowerCase() === "cancelled") return sum;
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
  }, [data?.status, data?.total_amount, items]);

  // --- safe mappings based on current response shape ---
  const orderNo  = data?.order_id ?? currentId ?? "—";
  const tableNo  = data?.table_label ?? data?.table_id ?? tableIdResolved ?? "—";

  const statusRaw = data?.status ?? data?.order?.status ?? "unknown";
  const statusText = String(statusRaw).toUpperCase();

  // --- customer metadata (best-effort across possible field names) ---
  const customerName = pickOrderField(data, [
    "customer_name", "name", "contact_name", "customerName"
  ]);
  const customerPhone = pickOrderField(data, [
    "customer_phone", "phone", "contact_phone", "tel"
  ]);
  const customerNote = pickOrderField(data, [
    "note", "notes", "description", "comment", "remarks", "order_note", "additional_info"
  ]);

  return (
    <div
      className="min-h-screen w-full text-slate-900 bg-[radial-gradient(900px_600px_at_0%_-10%,#e8f0ff,transparent),radial-gradient(900px_600px_at_100%_-10%,#ffe6eb,transparent),linear-gradient(180deg,#f9fbff,#ffe9f0)]">
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

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 text-red-700 ring-1 ring-red-200 px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {cancelErr && (
          <div className="mt-4 rounded-xl bg-amber-50 text-amber-800 ring-1 ring-amber-200 px-4 py-3 text-sm">
            {cancelErr}
          </div>
        )}

        {loading ? (
          <div className="p-6 bg-white bg-opacity-80 rounded-2xl shadow">Loading...</div>
        ) : !data ? (
          <div className="px-8 md:px-12 py-10 rounded-[28px] bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,.2)] ring-1 ring-black/5 max-w-[680px] mx-auto text-center">
            <h2 className="text-xl font-semibold text-slate-900">
              No active orders for this table
            </h2>
            <p className="text-slate-500 mt-2">
              Table {tableIdParam || tableIdResolved || "—"} has no active orders yet. Please start a new order from the menu.
            </p>
            <div className="mt-7 flex justify-center">
              <Link
                to={`/home?table=${tableIdResolved ?? tableIdParam ?? ""}`}
                className="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-900 px-6 py-3 text-sm font-semibold shadow-[inset_0_-2px_0_rgba(0,0,0,.05)] ring-1 ring-black/5 hover:bg-slate-200 transition"
              >
                Back to Menu
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Show completed as a closed card; for cancelled, still show the order with a clear banner */}
            {String(data.status).toLowerCase() === "completed" ? (
              <div className="px-8 md:px-12 py-10 rounded-[28px] bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,.2)] ring-1 ring-black/5 max-w-[680px] mx-auto text-center">
                <h2 className="text-xl font-semibold text-slate-900">Order Completed</h2>
                <p className="text-slate-500 mt-2">This table has already checked out. Please start a new order from the menu.</p>
                <div className="mt-7 flex justify-center">
                  <Link
                    to={`/home?table=${tableIdResolved ?? ""}`}
                    className="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-900 px-6 py-3 text-sm font-semibold shadow-[inset_0_-2px_0_rgba(0,0,0,.05)] ring-1 ring-black/5 hover:bg-slate-200 transition"
                  >
                    Back to Menu
                  </Link>
                </div>
              </div>
            ) : (
              <div
                className="px-8 md:px-12 py-10 rounded-[28px] bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,.2)] ring-1 ring-black/5 max-w-[680px] mx-auto"
              >
                {String(data.status).toLowerCase() === "cancelled" && (
                  <div className="mb-4 text-center text-red-500 font-semibold text-lg">Order Cancelled</div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-500">Current status</p>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-5 py-2 min-h-[40px] min-w-[96px] leading-none text-sm font-semibold uppercase ${statusStyle(statusRaw)}`}
                  >
                    {statusText}
                  </span>
                </div>

                <h2 className="text-xl font-semibold text-slate-900 mt-4">Your order has been placed successfully!</h2>
                <p className="text-sm text-slate-500 mt-2">We'll keep this page updated as it progresses.</p>
                {(customerName || customerPhone || customerNote) && (
                  <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-black/5">
                    <div className="space-y-1">
                      {customerName && (
                        <div><span className="font-medium text-slate-700">Name:</span> {customerName}</div>
                      )}
                      {customerPhone && (
                        <div><span className="font-medium text-slate-700">Phone:</span> {customerPhone}</div>
                      )}
                      {customerNote && (
                        <div className="text-slate-600 break-words whitespace-pre-wrap"><span className="font-medium text-slate-700">Note:</span> {customerNote}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Items */}
                <div className="mt-6 space-y-2">
                  {items.map((it) => {
                    const qty = num(it?.quantity, 0);
                    const itemNote = pickText(it, [
                      "note", "notes", "comment", "comments", "special_request", "description", "options_note"
                    ]);
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
                    const isCancelled = String(it?.status || "").toLowerCase() === "cancelled";
                    const itemClassName = isCancelled
                      ? "flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 opacity-50 line-through text-red-400"
                      : "flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5";
                    return (
                      <div
                        key={`${it.food_id}-${it.food_name}`}
                        className={itemClassName}
                      >
                        <div className="flex items-center justify-between gap-3 w-full">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900">
                              {it.food_name}{" "}
                              {isCancelled && (
                                <span className="ml-1 text-xs text-red-400 font-normal">(Cancelled)</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">×{qty}</div>
                            {itemNote && (
                              <div className="mt-1 text-[11px] italic text-slate-500 break-words whitespace-pre-wrap">{itemNote}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right min-w-[7rem]">฿{num(computed, 0).toFixed(2)}</div>
                            {orderIsPending && String(it?.status || "").toLowerCase() === "pending" && (
                              <button
                                type="button"
                                onClick={() => handleCancelItem(it)}
                                disabled={cancelingId === firstId(it)}
                                className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold bg-white text-red-600 ring-1 ring-red-200 shadow-sm hover:bg-red-50 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                              >
                                {cancelingId === firstId(it) ? "Cancelling…" : "Cancel"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-black/5">
                    <div className="font-semibold text-slate-700">Total</div>
                    <div className="font-semibold">฿{derivedTotal.toFixed(2)}</div>
                  </div>
                </div>

                <div className="mt-7 flex justify-center">
                  <Link
                    to={`/home?table=${tableIdResolved ?? ""}`}
                    className="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-900 px-6 py-3 text-sm font-semibold shadow-[inset_0_-2px_0_rgba(0,0,0,.05)] ring-1 ring-black/5 hover:bg-slate-200 transition"
                  >
                    Back to Menu
                  </Link>
                </div>
              </div>
            )}

          {/* Past orders */}
          {!isClosed && (
            <div className="mt-10">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold text-slate-800">Past orders for this table</h2>
                <button
                  onClick={async () => {
                    if (isClosed) { setRecent([]); return; }
                    const tableId = Number(tableIdResolved);
                    if (!Number.isFinite(tableId) || tableId <= 0) return;
                    try {
                      setLoadingPast(true);
                      const r = await fetch(`${API_BASE}/orders?table_id=${tableId}&include_closed=1`);
                      const list = (await r.json()) || [];
                      const filtered = computePastOrders(list, currentId);
                      setRecent(filtered);
                    } catch (err) {
                      console.error("[OrderSummary] Manual past orders refresh failed", err);
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
                <>
                  <div className="space-y-2">
                    {recent.map((o) => (
                      <Link
                        key={o.order_id}
                        to={`/summary/${Number(o.order_id)}?table=${tableIdResolved ?? ""}`}
                        className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 cursor-pointer hover:brightness-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
                        aria-label={`View order #${o.order_id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-semibold text-slate-700">
                            #{o.order_id} {o.table_label ? `Table ${o.table_label}` : `Table ${o.table_id}`}
                          </div>
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${statusStyle(o.status)}`}>
                            {String(o.status || "").toUpperCase()}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-700">฿{Number(o.total_amount || 0).toFixed(2)}</div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {/* Checkout button stays at the bottom even if no past orders */}
              {data && items.length > 0 && isActiveStatus(data.status) && (
                <div className="mt-8 flex justify-end">
                  <Link
                    to={`/checkout?table=${tableIdResolved ?? ""}`}
                    className="inline-flex items-center gap-2 rounded-full bg-white text-red-600 px-6 py-2.5 text-sm font-semibold shadow-md ring-1 ring-red-200 hover:bg-red-50 hover:text-red-700 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-400"
                  >
                    Checkout
                  </Link>
                </div>
              )}
            </div>
             )}
          </>
        )}
      </div>
  </div>
  );
}