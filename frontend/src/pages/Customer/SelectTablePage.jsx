import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API || "http://127.0.0.1:5050";

// แปลงผลลัพธ์จาก API ให้ใช้ได้แน่นอน โดยไม่ทำให้ layout เปลี่ยน
function normalizeTables(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return rows.map((r, i) => {
    const table_id =
      Number(r?.table_id) ||
      Number(r?.id) ||
      (typeof r?.table === "number" ? r.table : i + 1);

    const table_label =
      r?.table_label ||
      r?.label ||
      r?.name ||
      (Number.isFinite(table_id) ? `T${table_id}` : `T${i + 1}`);

    const status = String(r?.status || "available").toLowerCase();

    return { table_id, table_label, status };
  });
}

export default function SelectTablePage() {
  const nav = useNavigate();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const loadTables = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/api/tables`);
      if (!res.ok) throw new Error("Failed to load tables");
      const data = await res.json();
      const list = normalizeTables(data).filter((t) => Number.isFinite(t.table_id));
      setTables(list);
    } catch (e) {
      setErr(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (id) => {
    // เก็บข้อมูลโต๊ะไว้ใช้ต่อทั้งแอป
    const found = tables.find((t) => t.table_id === id);
    if (found) {
      sessionStorage.setItem("table_id", String(found.table_id));
      sessionStorage.setItem("table_label", String(found.table_label));
    }
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
        {err && (
          <>
            <p className="text-red-400">{err}</p>
            <button
              onClick={loadTables}
              className="mt-4 border rounded-lg px-4 py-2 hover:bg-white/10"
            >
              Retry
            </button>
          </>
        )}

        {!loading && !err && (
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
        )}
      </div>
    </div>
  );
}