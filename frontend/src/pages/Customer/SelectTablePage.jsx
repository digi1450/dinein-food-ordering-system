import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API_BASE from "../../lib/apiBase";

/* ปรับข้อมูลโต๊ะจาก API ให้เป็นรูปแบบเดียว */
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

    const status = String(r?.status || "available").trim().toLowerCase();

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
    const url = `${API_BASE}/tables?_=${Date.now()}`; // via Vite proxy (/api → 5050)
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
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
  }, []);

  const handleSelect = (id) => {
    const found = tables.find((t) => t.table_id === id);
    if (found) {
      sessionStorage.setItem("table_id", String(found.table_id));
      sessionStorage.setItem("table_label", String(found.table_label));
      try {
        localStorage.setItem("last_table_id", String(id));
      } catch {}
    }
    nav(`/home?table=${id}`);
  };

  return (
    <div
      className="
        min-h-screen w-full text-slate-900
        bg-[radial-gradient(1200px_800px_at_-20%_-10%,#cde7ff,transparent),radial-gradient(900px_600px_at_120%_10%,#ffd9e0,transparent),linear-gradient(180deg,#fff,#ffe6c4)]
      "
    >
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold tracking-wide">Dine-in Ordering</div>
          <a
            href="/admin/login"
            className="text-sm text-slate-700 hover:text-slate-900"
          >
            Admin
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-5xl md:text-6xl font-extrabold text-center tracking-tight mb-8">
          Select a Table
        </h1>

        {/* Action row */}
        <div className="flex justify-end mb-6">
          <button
            onClick={loadTables}
            className="inline-flex items-center rounded-xl px-5 py-2 text-white font-semibold shadow-md hover:shadow-lg active:translate-y-[1px] bg-teal-500 hover:bg-teal-600"
            title="Refresh"
          >
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-2xl bg-white/80 shadow-sm animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {err && (
          <div className="space-y-3">
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {err}
            </p>
            <button
              onClick={loadTables}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 bg-white hover:bg-slate-50"
            >
              ↻ Retry
            </button>
          </div>
        )}

        {/* Tables */}
        {!loading && !err && (
          <div className="grid grid-cols-3 gap-14 justify-items-center">
            {tables.map((t) => {
              const statusKey = String(t.status).trim().toLowerCase();
              return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={t.table_id}
                    onClick={() => handleSelect(t.table_id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelect(t.table_id)}
                    className="relative cursor-pointer
                               w-[300px] h-[190px] md:w-[320px] md:h-[200px]
                               bg-white text-slate-900 rounded-[26px] overflow-hidden
                               shadow-[0_8px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_20px_rgba(0,0,0,0.12)]
                               ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1
                               outline-none isolation-isolate"
                    style={{ backgroundColor: '#ffffff' }}
                  >

                  {/* Content */}
                  <div className="relative z-10 flex flex-col items-center justify-center h-full text-slate-900">
                    {/* Title */}
                    <div className="text-[36px] md:text-[42px] leading-none font-extrabold tracking-tight text-slate-900 mb-4">
                      Table {String(t.table_label).replace(/^T/i, "")}
                    </div>

                    {/* Status pill */}
                    <span
                      className={`inline-flex items-center justify-center
                                  px-6 md:px-7 py-2.5 md:py-3
                                  rounded-full text-[18px] md:text-[20px] font-semibold
                                  shadow-[0_4px_8px_rgba(0,0,0,0.08)] text-white`}
                      style={{ backgroundColor: statusKey === 'occupied' ? '#ff8fab' : '#22c55e' }}
                    >
                      {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                    </span>

                    {/* Colored bottom accent bar (clips to rounded corners) */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-[12px] bg-gradient-to-r
                                  ${statusKey === 'occupied'
                                    ? "from-pink-400 via-rose-400 to-orange-400"
                                    : "from-emerald-400 via-green-400 to-teal-400"}`}
                    />

                    {/* Soft drop shadow below card */}
                    <div
                      aria-hidden
                      className="absolute -bottom-3 left-8 right-8 h-3 rounded-full bg-black/10 blur-[4px]"/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}