// frontend/src/pages/Customer/CheckoutSuccess.jsx
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

export default function CheckoutSuccess() {
  const { search } = useLocation();
  const qs = new URLSearchParams(search);
  const tableId = qs.get("table");
  const toHomeHref = tableId ? `/home?table=${tableId}` : `/home`;

  useEffect(() => {
    // Clear order-related localStorage data (including per-table keys)
    try {
      if (tableId) {
        localStorage.removeItem(`cart_table_${tableId}`);
        localStorage.removeItem(`last_order_id_by_table_${tableId}`);
      }
      // Legacy / generic keys
      localStorage.removeItem("last_order_id");
      localStorage.removeItem("currentOrderId");
      localStorage.removeItem("cart");
      localStorage.removeItem("order");
    } catch {
      // ignore storage errors (e.g., private mode)
    }

    const timer = setTimeout(() => {
      window.location.href = toHomeHref;
    }, 10000);

    return () => clearTimeout(timer);
  }, [toHomeHref, tableId]);

  return (
    <div className="min-h-screen w-full text-slate-900 bg-slate-100">
      {/* Top brand bar (match HomePage theme) */}
      <header className="sticky top-0 z-20 bg-[#1d4ed8] text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-sky-400 flex items-center justify-center text-base font-semibold shadow-sm">
              ✅
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-sky-100/90">
                Payment Complete
              </div>
              <div className="text-sm md:text-base font-semibold leading-tight">
                Thank you for dining with us.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.16em] text-sky-100/80">
              Table
            </span>
            <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-200/40 text-xs font-semibold shadow-sm">
              {tableId || "—"}
            </span>
          </div>
        </div>
      </header>

      {/* Center content card */}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <div className="max-w-md mx-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/70 px-6 py-8 md:px-8 md:py-10 text-center">
            {/* Check icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
              <svg
                className="h-9 w-9 text-emerald-600"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M20 7L9 18l-5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
              Payment successful
            </h1>
            <p className="mt-2 text-sm md:text-base text-slate-600">
              A staff member is on the way to your table
              {tableId ? ` (Table ${tableId})` : ""}.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              You will be redirected back to the menu shortly.
            </p>

            <div className="mt-8 flex items-center justify-center gap-3">
              <Link
                to={toHomeHref}
                className="px-4 py-2.5 rounded-full bg-[#1d4ed8] text-white text-sm font-medium shadow-sm hover:bg-indigo-600 transition-colors"
              >
                Back to Menu
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}