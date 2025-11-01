import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import API_BASE from "../../lib/apiBase";

// Fixed visuals (images placed in frontend/public/images/)
const VISUALS = [
  { key: "appetizers", label: "Appetizers", img: "/images/appetizer.jpg", aliases: ["appetizer", "appetizers"] },
  { key: "mains",      label: "Mains",      img: "/images/main.jpg",       aliases: ["main", "mains"] },
  { key: "desserts",   label: "Desserts",   img: "/images/dessert.jpg",    aliases: ["dessert", "desserts"] },
  { key: "drinks",     label: "Drinks",     img: "/images/drink.jpg",      aliases: ["drink", "drinks"] },
];

function matchVisual(catName = "") {
  const n = String(catName).toLowerCase();
  for (const v of VISUALS) {
    if (v.aliases.some((a) => n === a || n.startsWith(a))) return v;
  }
  return null;
}

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
    // Build a matcher: alias -> VISUAL key
    const aliasToKey = new Map();
    for (const v of VISUALS) {
      for (const a of v.aliases) aliasToKey.set(String(a).toLowerCase(), v.key);
    }

    // Index API categories by matched visual key (using aliases)
    const byKey = new Map(); // key -> api category
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
        // fallback: direct name
        if (!matchedKey && aliasToKey.has(name)) matchedKey = aliasToKey.get(name);
        if (matchedKey && !byKey.has(matchedKey)) {
          byKey.set(matchedKey, c);
        }
      }
    }

    // Emit EXACTLY 4 cards in the desired fixed order
    return VISUALS.map((v, i) => {
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
    // catId can be numeric (from DB) or our slug (e.g., 'mains')
    nav(`/menu?table=${tableId}&cat=${encodeURIComponent(catId)}`);
  };

  return (
    <div
      className="min-h-screen w-full text-slate-900
      bg-[radial-gradient(1200px_800px_at_-20%_-10%,#cde7ff,transparent),radial-gradient(900px_600px_at_120%_10%,#ffd9e0,transparent),linear-gradient(180deg,#fff,#ffe6c4)]"
    >
      {/* Header (match Select Table tone) */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold tracking-wide">Home</div>
          <div className="text-sm opacity-80">Table: {tableId || "—"}</div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-center mb-10">
          Welcome to Our Restaurant
        </h1>

        {loading && (
          <div className="max-w-xl mx-auto text-center bg-white/80 rounded-xl p-4 ring-1 ring-black/5">
            Loading categories…
          </div>
        )}

        {err && (
          <div className="max-w-xl mx-auto text-center bg-red-50 text-red-700 rounded-xl p-4 ring-1 ring-red-200 mb-6">
            {err}
          </div>
        )}

        {/* Category cards (image + label) */}
        {!loading && (
          <div className="flex flex-wrap justify-center gap-8">
            {visualCats.map((c, idx) => (
              <button
                key={`${c.id}-${idx}`}
                onClick={() => goCategory(c.id)}
                className="group relative w-[220px] md:w-[240px] bg-white rounded-2xl p-3 ring-1 ring-black/5 shadow-sm
                           hover:shadow-md hover:-translate-y-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                style={{ isolation: "isolate" }}
              >
                <div className="w-full aspect-square overflow-hidden rounded-xl ring-1 ring-black/5 bg-slate-100">
                  <img
                    src={c.img}
                    alt={c.name}
                    className="block w-full h-full object-cover object-center"
                    loading="lazy"
                  />
                </div>
                <div className="mt-2 text-center">
                  <div className="text-xs md:text-sm font-semibold">{c.name}</div>
                  {typeof c.count === "number" && (
                    <div className="opacity-60 text-[11px] mt-0.5">{c.count} items</div>
                  )}
                </div>

                {/* bottom accent bar (same vibe as Select Table) */}
                <div className="absolute -bottom-2 left-4 right-4 h-2 rounded-full
                                bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 opacity-90" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}