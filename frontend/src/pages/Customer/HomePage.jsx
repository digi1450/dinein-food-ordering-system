import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API;

export default function HomePage() {
  const nav = useNavigate();
  const { search } = useLocation();
  const tableId = new URLSearchParams(search).get("table") || "";

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/menu/categories`);
        if (!res.ok) throw new Error("Failed to load categories");
        const data = await res.json();
        setCats(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const goCategory = (catId) => {
    if (!tableId) {
      alert("Missing table id in URL (use ?table=1)");
      return;
    }
    nav(`/menu?table=${tableId}&cat=${catId}`);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto p-6">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Welcome to Our Restaurant</h1>
          <div className="opacity-70">Table {tableId || "?"}</div>
        </header>

        <h2 className="text-xl font-semibold mb-3">Choose a Category</h2>

        {loading && <div className="opacity-70">Loading categories…</div>}
        {err && <div className="text-red-400">{err}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {cats.map((c) => (
            <button
              key={c.category_id}
              onClick={() => goCategory(c.category_id)}
              className="border rounded-lg p-4 hover:bg-white/10 text-left"
            >
              <div className="text-lg font-semibold">{c.category_name}</div>
              {"item_count" in c && (
                <div className="opacity-70 text-sm mt-1">{c.item_count} items</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}