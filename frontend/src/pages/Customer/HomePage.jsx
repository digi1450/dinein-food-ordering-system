// frontend/src/pages/Customer/HomePage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import API_BASE from "../../lib/apiBase";

// Fixed visuals (images placed in frontend/public/images/)
const VISUALS = [
  { key: "appetizers", label: "Appetizers", img: "/images/appetizer.jpg", aliases: ["appetizer", "appetizers"] },
  { key: "mains",      label: "Mains",      img: "/images/main.jpg",       aliases: ["main", "mains"] },
  { key: "desserts",   label: "Desserts",   img: "/images/dessert.jpg",    aliases: ["dessert", "desserts"] },
  { key: "drinks",     label: "Drinks",     img: "/images/drink.jpg",      aliases: ["drink", "drinks"] },
];

export default function HomePage() {
  const nav = useNavigate();
  const { search } = useLocation();
  const tableId = new URLSearchParams(search).get("table") || "";

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Derived list merged with fixed visuals, and FORCE display order:
  // Appetizers → Mains → Desserts → Drinks
  const visualCats = useMemo(() => {
    const aliasToKey = new Map();
    for (const v of VISUALS) {
      for (const a of v.aliases) aliasToKey.set(String(a).toLowerCase(), v.key);
    }

    const byKey = new Map();
    if (Array.isArray(cats)) {
      for (const c of cats) {
        const name = String(c?.category_name || c?.name || "").toLowerCase();
        const parts = name.split(/\s+/);
        let matchedKey = "";
        for (const p of parts) {
          if (aliasToKey.has(p)) {
            matchedKey = aliasToKey.get(p);
            break;
          }
        }
        if (!matchedKey && aliasToKey.has(name)) matchedKey = aliasToKey.get(name);
        if (matchedKey && !byKey.has(matchedKey)) byKey.set(matchedKey, c);
      }
    }

    return VISUALS.map((v) => {
      const c = byKey.get(v.key);
      const id = Number.isFinite(Number(c?.category_id)) ? Number(c.category_id) : v.key;
      const name = c?.category_name || c?.name || v.label;
      const count = typeof c?.item_count === "number" ? c.item_count : undefined;
      return { id, name, img: v.img, count };
    });
  }, [cats]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = `${API_BASE}/menu/categories?_=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load categories");
        const data = await res.json();
        if (!alive) return;
        setCats(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Load failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const goCategory = (catId) => {
    if (!tableId) {
      alert("Missing table id in URL (use ?table=1)");
      return;
    }
    nav(`/menu?table=${tableId}&cat=${encodeURIComponent(catId)}`);
  };

  return (
    <div className="min-h-screen w-full text-slate-900 bg-slate-50">
      {/* Top brand bar (same tone with SelectTablePage) */}
      <header className="sticky top-0 z-20 bg-[#1d4ed8] text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-sky-400 flex items-center justify-center text-base font-semibold shadow-sm">
              🍽️
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-sky-100/90">
                Customer Menu
              </div>
              <div className="text-sm md:text-base font-semibold leading-tight">
                Browse categories and start your order.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.16em] text-sky-100/80">
              Table
            </span>
            <span
              className={
                "px-3 py-1 rounded-full border text-xs font-semibold shadow-sm transition " +
                (tableId
                  ? "bg-sky-500/20 border-sky-200/40"
                  : "bg-slate-500/30 border-slate-200/40")
              }
            >
              {tableId || "—"}
            </span>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <section className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/60 px-4 py-6 md:px-8 md:py-8 backdrop-blur-sm">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
              Welcome to Our Restaurant
            </h1>
            <p className="mt-2 text-sm md:text-base text-slate-500">
              Please choose a category to see the menu for Table{" "}
              <span className="font-semibold text-slate-700">
                {tableId || "—"}
              </span>
              .
            </p>
          </div>

          {/* UX: แจ้งเตือนเบา ๆ ถ้าไม่มี table id */}
          {!loading && !err && !tableId && (
            <div className="max-w-xl mx-auto mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs md:text-sm text-amber-800 flex items-start gap-2">
              <span className="mt-0.5 text-lg">⚠️</span>
              <div>
                <div className="font-semibold text-xs md:text-sm">
                  No table selected
                </div>
                <div className="text-[11px] md:text-xs mt-0.5">
                  Please go back and select your table, or ask our staff for assistance.
                </div>
              </div>
            </div>
          )}

          {/* Loading state: skeleton + animated bar */}
          {loading && (
            <div className="max-w-xl mx-auto text-center bg-slate-50 rounded-2xl p-5 ring-1 ring-slate-200 space-y-4">
              <div className="h-4 w-40 mx-auto rounded-full bg-slate-200 animate-pulse" />
              <div className="flex justify-center gap-3 mt-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 w-24 rounded-2xl bg-slate-200/70 animate-pulse"
                  />
                ))}
              </div>
              <div className="mt-4 h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 animate-pulse" />
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="max-w-xl mx-auto text-center bg-red-50 text-red-700 rounded-2xl p-4 ring-1 ring-red-200 mb-6">
              <div className="text-sm font-medium">Failed to load categories</div>
              <div className="text-xs mt-1 opacity-80">{err}</div>
            </div>
          )}

          {/* Categories */}
          {!loading && !err && (
            <div className="flex flex-wrap justify-center gap-6 md:gap-8">
              {visualCats.map((c, idx) => (
                <button
                  key={`${c.id}-${idx}`}
                  onClick={() => goCategory(c.id)}
                  className="group relative w-[210px] md:w-[230px] bg-white rounded-2xl p-3 ring-1 ring-slate-200 shadow-sm hover:shadow-lg hover:shadow-sky-100 hover:-translate-y-1 active:translate-y-0 transition-all duration-200 transform outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                  style={{ isolation: "isolate" }}
                >
                  {/* Image */}
                  <div className="w-full aspect-square overflow-hidden rounded-xl ring-1 ring-slate-200 bg-slate-100 relative">
                    <img
                      src={c.img}
                      alt={c.name}
                      className="block w-full h-full object-cover object-center group-hover:scale-[1.04] group-active:scale-[0.99] transition-transform duration-200"
                      loading="lazy"
                    />
                    {/* UX overlay: label มุมล่าง */}
                    <div className="absolute inset-x-2 bottom-2 rounded-xl bg-black/40 backdrop-blur-sm px-2 py-1 flex items-center justify-between text-[11px] text-slate-50">
                      <span className="font-medium">{c.name}</span>
                      <span className="inline-flex items-center gap-1 opacity-80">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>View</span>
                      </span>
                    </div>
                  </div>

                  {/* Detail text */}
                  <div className="mt-2 text-center">
                    <div className="text-xs md:text-sm font-semibold text-slate-900">
                      {c.name}
                    </div>
                    {typeof c.count === "number" && (
                      <div className="opacity-60 text-[11px] mt-0.5 text-slate-500">
                        {c.count} items available
                      </div>
                    )}
                  </div>

                  {/* Accent bar under card */}
                  <div className="absolute -bottom-2 left-5 right-5 h-2 rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-transform" />
                </button>
              ))}

              {/* ถ้าไม่มี category เลย */}
              {visualCats.length === 0 && (
                <div className="text-sm text-slate-500 text-center">
                  No categories available at the moment.
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}