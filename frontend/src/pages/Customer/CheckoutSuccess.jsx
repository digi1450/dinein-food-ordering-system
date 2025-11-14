// frontend/src/pages/Customer/CheckoutSuccess.jsx
import { Link, useLocation } from "react-router-dom";
import { useEffect } from 'react';

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
    <div className="min-h-screen text-slate-900 bg-[radial-gradient(1200px_800px_at_-20%_-10%,#cde7ff,transparent),radial-gradient(900px_650px_at_120%_0%,#ffd9e0,transparent),linear-gradient(180deg,#ffffff,#ffe8cc)]">
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        {/* Check icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-9 w-9 text-green-600" viewBox="0 0 24 24" fill="none">
            <path d="M20 7L9 18l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Payment successful</h1>
        <p className="mt-2 text-slate-600">
          A staff member is on the way to your table{tableId ? ` (Table ${tableId})` : ""}.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to={toHomeHref}
            className="px-4 py-2 rounded-full border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 text-sm font-medium shadow-sm"
          >
            Back to Menu
          </Link>
        </div>
      </div>
    </div>
  );
}