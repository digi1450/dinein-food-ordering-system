// frontend/src/pages/Customer/SelectTablePage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API_BASE from "../../lib/apiBase";
import { User } from "lucide-react";

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
    const res = await fetch(`${API_BASE}/tables`);
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
    <div className="min-h-screen w-full text-slate-900 bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#1d4ed8] text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-sky-400 flex items-center justify-center text-base font-semibold shadow-sm">
              🍽️
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-sky-100/90">
                Select Table
              </div>
              <div className="text-sm md:text-base font-semibold leading-tight">
                Choose your table to start ordering.
              </div>
            </div>
          </div>
          <a
            href="/admin/login"
            className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 transition"
          >
            <User className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="bg-white/90 border border-slate-200/80 rounded-3xl shadow-xl shadow-slate-200/60 px-4 py-6 md:px-8 md:py-8 backdrop-blur-sm">
          <div className="text-center mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
              Select your table
            </h1>
            <p className="mt-2 text-sm md:text-base text-slate-500">
              Tap your table number to start browsing the menu.
            </p>
            <div className="mt-3 flex justify-center gap-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> 
                Available
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Occupied
              </div>
            </div>
          </div>

          {/* Action row */}
          <div className="flex justify-end mb-6">
            <button
              onClick={loadTables}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white bg-[#1d4ed8] hover:bg-[#1e40af] shadow-sm shadow-sky-200 transition"
              title="Refresh"
            >
              <span className="text-base">↻</span>
              Refresh
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 md:h-32 rounded-2xl bg-slate-100 border border-slate-200 shadow-sm animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="space-y-3">
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
                {err}
              </p>
              <button
                onClick={loadTables}
                className="rounded-full px-4 py-2 text-sm font-medium text-white bg-[#1d4ed8] hover:bg-[#1e40af] shadow-sm transition"
              >
                <span className="text-base">↻</span>
                Retry
              </button>
            </div>
          )}

          {/* Tables */}
          {!loading && !err && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {tables.map((t) => {
                const statusKey = String(t.status).trim().toLowerCase();
                const isOccupied = statusKey === "occupied";

                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={t.table_id}
                    onClick={() => handleSelect(t.table_id)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      handleSelect(t.table_id)
                    }
                    className="relative cursor-pointer group w-full h-[140px] md:h-[150px] bg-white text-slate-800 rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-lg hover:shadow-sky-200 hover:-translate-y-[2px] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-sky-50"
                  >
                    <div className="flex flex-col justify-between h-full px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          Table
                        </div>
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium border",
                            isOccupied
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "mr-1 h-1.5 w-1.5 rounded-full",
                              isOccupied ? "bg-rose-500" : "bg-emerald-500",
                            ].join(" ")}
                          />
                          {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                        </span>
                      </div>

                      <div className="mt-1 text-3xl md:text-4xl font-semibold tracking-tight text-sky-600">
                        {String(t.table_label).replace(/^T/i, "")}
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>Tap to continue</span>
                        <span className="opacity-70 group-hover:translate-x-0.5 transition-transform">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}