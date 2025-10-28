import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

const API = import.meta.env.VITE_API;

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

  useEffect(() => {
    if (!tableId) nav("/", { replace: true });
  }, [tableId, nav]);
  // โหลดหมวดหมู่มาใช้ทำแท็บ
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/menu/categories`);
        const d = await r.json();
        setCats(Array.isArray(d) ? d : []);
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
          ? `${API}/api/menu?cat=${encodeURIComponent(catId)}`
          : `${API}/api/menu`;
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
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto p-6">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Menu — Table {tableId || "?"}</h1>
          <Link className="underline" to={`/home?table=${tableId}`} >
            Categories
          </Link>
        </header>

        {/* แท็บหมวดหมู่ */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {cats.map((c) => (
            <button
              key={c.category_id}
              onClick={() => toCat(c.category_id)}
              className={`px-3 py-1 rounded border ${
                String(c.category_id) === String(catId)
                  ? "bg-white text-black"
                  : "hover:bg-white/10"
              }`}
            >
              {c.category_name}
            </button>
          ))}
        </div>

        {loading && <div className="opacity-70">Loading…</div>}
        {err && <div className="text-red-400">{err}</div>}

        <div className="space-y-3">
          {foods.map((it) => (
            <div key={it.food_id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <div className="font-semibold">{it.food_name}</div>
                <div className="text-sm opacity-70">{it.category_name}</div>
                <div className="text-sm opacity-70">฿{Number(it.price).toFixed(2)}</div>
              </div>
              <div className="relative">
                <button
                  onClick={() => addToCart(it)}
                  className="px-3 py-1 border rounded hover:bg-white/10 active:scale-95 transition"
                >
                  Add to Cart
                </button>

                {flying && flying.id === it.food_id && (
                  <span
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none text-white font-semibold"
                    style={{
                      bottom: "110%",
                      animation: "floatUp 700ms ease-out forwards",
                      textShadow: "0 1px 2px rgba(0,0,0,0.6)"
                    }}
                  >
                    +1
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Link
            className="relative inline-flex items-center gap-1 whitespace-nowrap px-4 py-2 bg-white text-black rounded pr-8"
            to={`/cart?table=${tableId}`}
          >
            <span>Go to Cart</span>
            <span className="opacity-70"></span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur px-4 py-2 text-white shadow-lg">
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