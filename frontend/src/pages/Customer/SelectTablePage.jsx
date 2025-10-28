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
    <div className="min-h-screen w-screen bg-black text-white relative">
      {/* Admin Login pinned to top-right */}
      <a
        href="/admin/login"
        className="fixed top-4 right-6 text-sm text-gray-400 hover:text-white transition"
      >
        Admin Login
      </a>

      {/* Centered content container */}
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-screen px-4">
        {/* Title */}
        <h1 className="text-4xl font-bold mb-8 text-center">Select Your Table</h1>

        {/* Table Buttons */}
        {loading && <p className="opacity-70">Loading tables...</p>}
        {err && <p className="text-red-400">{err}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 place-items-center">
          {tables.map((t) => (
            <button
              key={t.table_id}
              onClick={() => handleSelect(t.table_id)}
              disabled={t.status === "occupied"}
              className={`border rounded-lg px-8 py-5 text-lg font-semibold ${
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
    </div>
  );
}