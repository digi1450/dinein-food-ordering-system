import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API;

export default function SelectTablePage() {
  const nav = useNavigate();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/tables`);
        if (!res.ok) throw new Error("Failed to load tables");
        const data = await res.json();
        setTables(data);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = (id) => {
    nav(`/home?table=${id}`);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-6">Select Your Table</h1>

      {loading && <p className="opacity-70">Loading tables...</p>}
      {err && <p className="text-red-400">{err}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
        {tables.map((t) => (
          <button
            key={t.table_id}
            onClick={() => handleSelect(t.table_id)}
            disabled={t.status === "occupied"}
            className={`border rounded-lg px-6 py-4 text-lg font-semibold ${
              t.status === "occupied"
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-white/10"
            }`}
          >
            Table {t.table_label}
          </button>
        ))}
      </div>
    </div>
  );
}