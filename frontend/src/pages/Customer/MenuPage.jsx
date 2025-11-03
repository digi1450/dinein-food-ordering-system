import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import API_BASE from "../../lib/apiBase";

const formatPrice = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
};

export default function MenuPage() {
  const { search } = useLocation();
  const nav = useNavigate();
  const tableId = new URLSearchParams(search).get("table") || "";
  const cartKey = tableId ? `cart_table_${tableId}` : "cart";
  const catId = new URLSearchParams(search).get("cat") || "";

  const [foods, setFoods] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null); // {text: string} | null
  const [cartCount, setCartCount] = useState(0);
  const [flying, setFlying] = useState(null); // { id: number, ts: number } | null

  // ตรวจสอบสถานะของออเดอร์ในโต๊ะนี้
  const [hasActiveOrders, setHasActiveOrders] = useState(false);

  useEffect(() => {
    if (!tableId) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/orders?table_id=${tableId}`);
        if (!r.ok) throw new Error("Failed to fetch orders");
        const list = await r.json();
        // ถ้ามีแม้ออเดอร์เดียวที่ยังไม่ complete/paid → ถือว่ายัง active
        const active = Array.isArray(list)
          ? list.some((o) => !["completed", "paid"].includes(String(o.status).toLowerCase()))
          : false;
        setHasActiveOrders(active);
      } catch {
        setHasActiveOrders(false);
      }
    })();
  }, [tableId]);

  // latest order for this table (if any)
  const lastOrderId = (() => {
    try {
      const n = Number(localStorage.getItem("last_order_id"));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!tableId) nav("/", { replace: true });
  }, [tableId, nav]);

  // โหลดหมวดหมู่
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/menu/categories`);
        const d = await r.json();
        // Enforce tab order: All, Appetizers, Mains, Desserts, Drinks
        const ORDER = { Appetizers: 0, Mains: 1, Desserts: 2, Drinks: 3 };
        const sorted = Array.isArray(d)
          ? d.slice().sort((a, b) => {
              const ax = ORDER[a?.category_name] ?? 999;
              const bx = ORDER[b?.category_name] ?? 999;
              return ax - bx;
            })
          : [];
        setCats(sorted);
      } catch {}
    })();
  }, []);

  // โหลดอาหารตามหมวด
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const url = catId
          ? `${API_BASE}/menu?cat=${encodeURIComponent(catId)}`
          : `${API_BASE}/menu`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load menu");
        const data = await res.json();
        setFoods(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [catId]);

  useEffect(() => {
    const c = JSON.parse(localStorage.getItem(cartKey) || "[]");
    setCartCount(c.reduce((n, it) => n + (it.quantity || 0), 0));
  }, [cartKey]);

  const toCat = (nextCat) => {
    if (!tableId) return alert("Missing table id (use ?table=1)");
    nav(`/menu?table=${tableId}&cat=${nextCat}`);
  };

  const addToCart = (item) => {
    const cart = JSON.parse(localStorage.getItem(cartKey) || "[]");
    const idx = cart.findIndex((x) => x.food_id === item.food_id);
    if (idx >= 0) cart[idx].quantity += 1;
    else cart.push({ ...item, quantity: 1 });
    localStorage.setItem(cartKey, JSON.stringify(cart));

    // update badge
    const count = cart.reduce((n, it) => n + (it.quantity || 0), 0);
    setCartCount(count);

    // show toast briefly
    setToast({ text: `Added "${item.food_name}" to cart` });
    setTimeout(() => setToast(null), 1500);

    // trigger floating +1 over the clicked button
    setFlying({ id: item.food_id, ts: Date.now() });
    setTimeout(() => setFlying(null), 700);
  };

  return (
    <div className="min-h-screen text-slate-900 bg-[radial-gradient(1200px_800px_at_-20%_-10%,#cde7ff,transparent),radial-gradient(900px_650px_at_120%_0%,#ffd9e0,transparent),linear-gradient(180deg,#ffffff,#ffe8cc)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Menu</h1>
            <p className="text-sm text-slate-600 mt-1">Table {tableId || "?"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
              to={`/home?table=${tableId}`}
            >
              Categories
            </Link>
            {tableId && (
              <Link
                aria-label="View current order"
                to={lastOrderId ? `/summary/${lastOrderId}?table=${tableId}` : `/summary?table=${tableId}`}
                className="inline-flex items-center gap-2 rounded-full bg-white/90 text-slate-900 px-3 py-1.5 text-sm font-medium ring-1 ring-black/10 hover:bg-white"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    hasActiveOrders ? "bg-yellow-400" : "bg-green-400"
                  }`}
                />
                <span>Order</span>
              </Link>
            )}
          </div>
        </header>

        {/* Tabs */}
        <div className="mb-6 inline-flex rounded-full bg-white/70 p-1 shadow-inner backdrop-blur supports-[backdrop-filter]:bg-white/60">
          {[{ category_id: "", category_name: "All" }, ...cats].map((c) => {
            const active = String(c.category_id) === String(catId);
            return (
              <button
                key={`tab_${c.category_id || "all"}`}
                onClick={() => toCat(c.category_id || "")}
                className={
                  `px-4 py-1.5 rounded-full text-sm font-medium transition ` +
                  (active ? "bg-slate-900 text-white shadow" : "text-slate-700 hover:bg-white")
                }
                aria-current={active ? "page" : undefined}
              >
                {c.category_name}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] rounded-2xl border border-white/70 bg-white/70 shadow-sm animate-pulse"
              />
            ))}
          </div>
        )}
        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-700 text-sm shadow-sm">
            {err}
          </div>
        )}

        {/* Menu list */}
        {!loading && !err && foods.length === 0 && (
          <div className="mt-4 rounded-2xl border border-white/70 bg-white/90 px-5 py-6 text-center text-slate-600">
            No items in this category yet.
          </div>
        )}
        <div className="space-y-3">
          {foods.map((it) => (
            <div
              key={it.food_id}
              className="rounded-2xl border border-white/70 bg-white/90 shadow-sm px-4 py-3 md:p-5 flex items-center justify-between"
            >
              <div className="pr-3">
                <div className="font-semibold text-slate-900">{it.food_name}</div>
                <div className="text-xs md:text-sm text-slate-500">{it.category_name}</div>
                <div className="text-xs md:text-sm text-slate-600">฿{formatPrice(it.price)}</div>
              </div>
              <div className="relative flex items-center gap-3">
                <button
                  onClick={() => addToCart(it)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:scale-[.98] transition shadow-sm text-sm font-medium"
                >
                  Add to Cart
                </button>
                {flying && flying.id === it.food_id && (
                  <span
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none text-slate-900 font-semibold"
                    style={{
                      bottom: "110%",
                      animation: "floatUp 700ms ease-out forwards",
                      textShadow: "0 1px 2px rgba(0,0,0,0.08)",
                    }}
                  >
                    +1
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="mt-6 flex items-center gap-3">
          {/* Back to Categories */}
          <Link
            to={`/home?table=${tableId ?? ""}`}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-sm transition"
          >
            ← Back
          </Link>

          {/* Go to Cart */}
          <Link
            to={`/cart?table=${tableId ?? ""}`}
            className="relative inline-flex items-center gap-2 px-5 py-2 rounded-full border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 shadow-sm transition"
          >
            <span>Go to Cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50" aria-live="polite" aria-atomic="true">
          <div className="rounded-lg border border-white/40 bg-white/90 backdrop-blur px-4 py-2 text-slate-900 shadow-lg">
            {toast.text}
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes floatUp {
            0% { transform: translate(-50%, 0); opacity: 0; }
            15% { opacity: 1; }
            100% { transform: translate(-50%, -24px); opacity: 0; }
          }
        `}
      </style>
    </div>
  );
}