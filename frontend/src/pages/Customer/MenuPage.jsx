// frontend/src/pages/Customer/MenuPage.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
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

  // Realtime: listen for order status changes for this table via SSE
  useEffect(() => {
    if (!tableId) return;

    // ถ้า browser ไม่รองรับ EventSource ให้ข้าม (จะ fallback เป็นค่าเริ่มต้น false)
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const streamUrl = `${API_BASE}/orders/stream-table?table=${encodeURIComponent(
      tableId
    )}`;

    let es;
    try {
      es = new EventSource(streamUrl, { withCredentials: false });
    } catch (err) {
      console.error("[MenuPage] orders EventSource init error:", err);
      return;
    }

    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        // backend ส่ง { table_id, hasActive } มาตามโต๊ะ
        setHasActiveOrders(!!payload.hasActive);
      } catch (e) {
        console.error("[MenuPage] orders EventSource parse error:", e);
      }
    };

    es.onerror = (err) => {
      // อย่าปิด stream เอง ปล่อยให้ EventSource ทำ auto-reconnect
      console.warn("[MenuPage] orders EventSource error:", err);
    };

    return () => {
      es && es.close();
    };
  }, [tableId]);

  // SSE connection for realtime menu updates
  const menuStreamRef = useRef(null);

  // Helper: load menu for current category
  const loadMenu = useCallback(
    async ({ background = false } = {}) => {
      if (!background) {
        // foreground load: show skeleton and clear old food list to avoid ghost cards
        setLoading(true);
        setFoods([]);
      }
      setErr(null);
      try {
        const url = catId
          ? `${API_BASE}/menu?cat=${encodeURIComponent(catId)}`
          : `${API_BASE}/menu`;

        // Add timeout + abort support so the page doesn't hang forever if the backend is slow
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error("Failed to load menu");
        const data = await res.json();
        setFoods(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e.name === "AbortError") {
          setErr("Request timeout, please try again.");
        } else {
          setErr(e.message || "Failed to load menu");
        }
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [catId]
  );

  const handleMenuEvent = useCallback(
    (evt) => {
      if (!evt?.data) return;
      try {
        const payload = JSON.parse(evt.data);
        if (payload && payload.type === "menu_updated") {
          // มีเมนูเปลี่ยนจริง ๆ → โหลดเมนูใหม่แบบ background (ไม่โชว์ skeleton)
          loadMenu({ background: true });
        }
      } catch (e) {
        console.warn("[MenuPage] menu EventSource bad payload:", e, evt?.data);
        // fallback: ถึง parse พัง ก็ลองรีโหลดเมนูแบบ background ไว้ก่อน
        loadMenu({ background: true });
      }
    },
    [loadMenu]
  );

  // Realtime: subscribe to menu updates via SSE and refetch when something changes
  useEffect(() => {
    // ถ้า browser ไม่รองรับ EventSource ก็ไม่ต้องทำอะไร ปล่อยให้ใช้โหลดครั้งเดียว
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    // ปิดของเก่าถ้ายังเปิดอยู่
    if (menuStreamRef.current) {
      try {
        menuStreamRef.current.removeEventListener("menu", handleMenuEvent);
      } catch (_) {
        // ignore
      }
      menuStreamRef.current.close();
      menuStreamRef.current = null;
    }

    const streamUrl = `${API_BASE}/menu/stream`;
    let es;
    try {
      es = new EventSource(streamUrl, { withCredentials: false });
    } catch (err) {
      console.error("[MenuPage] EventSource init error:", err);
      return;
    }

    menuStreamRef.current = es;

    // ใช้ named event "menu" ให้ตรงกับฝั่ง backend (`event: menu`)
    es.addEventListener("menu", handleMenuEvent);

    es.onerror = (err) => {
      // ไม่ปิด stream เพื่อให้ EventSource auto-reconnect เองถ้าเน็ตหลุดหรือเซิร์ฟเวอร์รีสตาร์ต
      console.warn("[MenuPage] menu EventSource error:", err);
    };

    // cleanup ตอน unmount หรือ dependency เปลี่ยน
    return () => {
      if (menuStreamRef.current) {
        try {
          menuStreamRef.current.removeEventListener("menu", handleMenuEvent);
        } catch (_) {
          // ignore
        }
        menuStreamRef.current.close();
        menuStreamRef.current = null;
      }
    };
  }, [handleMenuEvent]);

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

  // โหลดอาหารตามหมวด (ครั้งแรก + เมื่อเปลี่ยนหมวด)
  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const safeArray = Array.isArray(parsed) ? parsed : [];
      setCartCount(safeArray.reduce((n, it) => n + (it.quantity || 0), 0));
    } catch {
      // ถ้า parse พัง (ข้อมูลเสียหาย) ให้เคลียร์แล้วเริ่มใหม่
      try {
        localStorage.removeItem(cartKey);
      } catch {}
      setCartCount(0);
    }
  }, [cartKey]);

  const toCat = (nextCat) => {
    if (!tableId) return alert("Missing table id (use ?table=1)");
    nav(`/menu?table=${tableId}&cat=${nextCat}`);
  };

  const addToCart = (item) => {
    if (!tableId) {
      alert("Missing table id (use ?table=1)");
      return;
    }
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
    <div className="min-h-screen w-full text-slate-900 bg-slate-50">
      {/* Top brand bar (blue) */}
      <header className="sticky top-0 z-20 bg-[#1d4ed8] text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-sky-400 flex items-center justify-center text-base font-semibold shadow-sm">
              📖
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-sky-100/90">
                Menu
              </div>
              <div className="text-sm md:text-base font-semibold leading-tight">
                Choose dishes for your table.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              className="hidden md:inline-flex items-center text-[11px] px-3 py-1.5 rounded-full bg-white/10 text-sky-50 border border-sky-200/40 hover:bg-white/20 transition"
              to={`/home?table=${tableId}`}
            >
              ← Categories
            </Link>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.16em] text-sky-100/80">
                  Table
                </span>
                <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-200/40 text-xs font-semibold shadow-sm">
                  {tableId || "—"}
                </span>
              </div>

              {/* Cart icon link with badge */}
              <Link
                to={`/cart?table=${tableId}`}
                aria-label="Go to cart"
                className="relative ml-1 p-2 rounded-full bg-sky-500/20 border border-sky-200/40 hover:bg-sky-500/30 transition inline-flex items-center justify-center"
              >
                <ShoppingCart className="h-4 w-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-slate-900 text-[10px] flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>

              <Link
                aria-label="View current order"
                to={`/summary?table=${tableId}`}
                className="inline-flex items-center gap-2 rounded-full bg-white/95 text-slate-900 px-3 py-1.5 text-xs md:text-sm font-medium shadow-sm hover:bg-white"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    hasActiveOrders ? "bg-yellow-400" : "bg-green-400"
                  }`}
                />
                <span>Order</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <section className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/60 px-4 py-6 md:px-7 md:py-7">
          {/* Title + small info */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                Menu for Table{" "}
                <span className="text-sky-600">{tableId || "—"}</span>
              </h1>
              <p className="mt-1 text-xs md:text-sm text-slate-500">
                Tap a category tab then add items to your cart.
              </p>
            </div>

            {/* Cart pill (top-right) */}
            <Link
              to={`/cart?table=${tableId ?? ""}`}
              className="relative inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-xs md:text-sm font-medium shadow-sm hover:bg-slate-800 transition"
            >
              <span>Cart</span>
              {cartCount > 0 && (
                <span className="min-w-5 h-5 px-1 rounded-full bg-amber-400 text-slate-900 text-[11px] flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>

          {/* Tabs */}
          <div className="mb-6 inline-flex max-w-full overflow-x-auto rounded-full bg-slate-50 p-1 shadow-inner">
            {[{ category_id: "", category_name: "All" }, ...cats].map((c) => {
              const active = String(c.category_id) === String(catId);
              return (
                <button
                  key={`tab_${c.category_id || "all"}`}
                  onClick={() => toCat(c.category_id || "")}
                  className={
                    "px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition " +
                    (active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-700 hover:bg-white")
                  }
                  aria-current={active ? "page" : undefined}
                >
                  {c.category_name}
                </button>
              );
            })}
          </div>

          {/* Loading / error */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[80px] rounded-2xl border border-slate-100 bg-slate-50 shadow-sm animate-pulse"
                />
              ))}
            </div>
          )}

          {err && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-700 text-sm shadow-sm">
              {err}
            </div>
          )}

          {/* Empty state */}
          {!loading && !err && foods.length === 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-6 text-center text-slate-600">
              No items in this category yet.
            </div>
          )}

          {/* Menu list */}
          <div className="space-y-3">
            {foods.map((it) => (
              <div
                key={it.food_id}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-transform px-4 py-3 md:p-5 flex items-center justify-between gap-4"
              >
                <div className="pr-3 flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {it.food_name}
                  </div>
                  <div className="text-[11px] md:text-xs text-slate-400 uppercase tracking-wide">
                    {it.category_name}
                  </div>
                  {it.description && (
                    <div className="mt-1 text-xs md:text-sm text-slate-600 whitespace-pre-wrap break-words">
                      {it.description}
                    </div>
                  )}
                  <div className="mt-1 text-sm md:text-base font-semibold text-slate-900">
                    ฿{formatPrice(it.price)}
                  </div>
                </div>

                <div className="relative flex items-center">
                  <button
                    onClick={() => addToCart(it)}
                    className="px-3.5 py-1.5 rounded-full bg-[#1d4ed8] text-white text-xs md:text-sm font-semibold shadow-sm hover:bg-[#1e40af] active:scale-[.98] transition"
                  >
                    Add to cart
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

          {/* Bottom navigation */}
          <div className="mt-7 flex items-center gap-3 flex-wrap">
            <Link
              to={`/home?table=${tableId ?? ""}`}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm text-sm transition-colors"
            >
              ← Back to categories
            </Link>

            <Link
              to={`/cart?table=${tableId ?? ""}`}
              className="relative inline-flex items-center gap-2 px-5 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 shadow-sm text-sm transition-colors"
            >
              <span>Go to cart</span>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-amber-400 text-slate-900 text-xs flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </section>
      </main>

      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="rounded-lg border border-slate-200/60 bg-white/95 backdrop-blur px-4 py-2 text-slate-900 shadow-lg">
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