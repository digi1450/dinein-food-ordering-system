// frontend/src/pages/Customer/CartPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import API_BASE from "../../lib/apiBase";


export default function CartPage() {
  const nav = useNavigate();
  const { search } = useLocation();

  // read table id from URL and derive per-table cart key
  const tableIdRaw = new URLSearchParams(search).get("table");
  const tableId = Number(tableIdRaw || 0);
  const cartKey = tableId ? `cart_table_${tableId}` : "cart";

  const [cart, setCart] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // load cart for this table
  useEffect(() => {
    const c = JSON.parse(localStorage.getItem(cartKey) || "[]");
    setCart(c);
  }, [cartKey]);

  const writeCart = (next) => {
    setCart(next);
    localStorage.setItem(cartKey, JSON.stringify(next));
  };

  const priceOf = (it) => Number(it.price ?? it.unit_price ?? 0);
  const formatPrice = (n) => `฿${Number(n || 0).toFixed(2)}`;

  const total = useMemo(
    () => cart.reduce((sum, it) => sum + priceOf(it) * (Number(it.quantity) || 1), 0),
    [cart]
  );

  const updateQty = (food_id, delta) => {
    const next = cart
      .map((it) =>
        it.food_id === food_id
          ? { ...it, quantity: Math.max(1, (Number(it.quantity) || 1) + delta) }
          : it
      )
      .filter((it) => (Number(it.quantity) || 1) > 0);
    writeCart(next);
  };

  const removeItem = (food_id) => {
    const next = cart.filter((it) => it.food_id !== food_id);
    writeCart(next);
  };

  const placeOrder = async () => {
    if (!cart.length) return alert("Cart is empty.");
    if (!tableId) return alert("Missing table id in URL (?table=1).");

    try {
      setLoading(true);

      const payload = {
        table_id: Number(tableId),
        customer_name: name?.trim() || null,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
        items: cart.map((c) => ({
          food_id: Number(c.food_id),
          quantity: Number(c.quantity || 1),
        })),
      };

      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Create order failed (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const orderId = Number(data?.order_id);
      if (!Number.isFinite(orderId)) {
        throw new Error("Invalid API response: missing order_id");
      }

      // clear only this table's cart
      localStorage.removeItem(cartKey);

      // go to Order Summary
      nav(`/summary/${orderId}`);
    } catch (e) {
      console.error(e);
      alert(e.message || "Create order failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full text-slate-900 bg-slate-100">
      {/* Top brand bar (blue) */}
      <header className="sticky top-0 z-20 bg-[#1d4ed8] text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-sky-400 flex items-center justify-center text-base font-semibold shadow-sm">
              🧾
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/90">
                Cart
              </div>
              <div className="text-sm md:text-base font-semibold leading-tight">
                Review your items before sending to kitchen.
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-sky-100/80">
                Table
              </span>
              <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-200/40 text-xs font-semibold shadow-sm">
                {tableId || "—"}
              </span>
            </div>
            <div className="text-[11px] text-sky-100/80">
              {cart.length} item{cart.length === 1 ? "" : "s"} in cart
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <section className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/60 px-4 py-6 md:px-8 md:py-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                Your Cart
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Table{" "}
                <span className="font-semibold text-slate-700">
                  {tableId || "—"}
                </span>
                . Adjust quantities and add notes before placing your order.
              </p>
            </div>
          </div>

          {!cart.length ? (
            <div className="rounded-3xl bg-slate-50 ring-1 ring-slate-200 px-6 py-10 text-center shadow-sm">
              <div className="text-base md:text-lg text-slate-700 font-medium">
                Your cart is empty.
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Go back to the menu and add some dishes for your table.
              </p>
              <Link
                to={`/menu?table=${tableId}`}
                className="mt-5 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
              >
                ← Back to Menu
              </Link>
            </div>
          ) : (
            <>
              {/* Cart items */}
              <div className="space-y-3">
                {cart.map((it) => {
                  const unit = priceOf(it);
                  const qty = Number(it.quantity) || 1;
                  const sub = unit * qty;

                  return (
                    <div
                      key={it.food_id}
                      className="rounded-2xl bg-white ring-1 ring-slate-200 px-4 py-3 md:px-5 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm"
                    >
                      <div>
                        <div className="font-semibold text-sm md:text-base text-slate-900">
                          {it.food_name}
                        </div>
                        <div className="text-xs md:text-sm text-slate-500 mt-0.5">
                          ฿{unit.toFixed(2)} each
                        </div>
                      </div>

                      <div className="flex items-center gap-2 md:gap-3">
                        <button
                          aria-label="decrease quantity"
                          onClick={() => updateQty(it.food_id, -1)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50"
                        >
                          −
                        </button>
                        <div className="w-10 text-center font-semibold text-slate-900">
                          {qty}
                        </div>
                        <button
                          aria-label="increase quantity"
                          onClick={() => updateQty(it.food_id, +1)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50"
                        >
                          +
                        </button>

                        <div className="w-24 text-right font-semibold text-slate-900 text-sm md:text-base">
                          {formatPrice(sub)}
                        </div>

                        <button
                          onClick={() => removeItem(it.food_id)}
                          className="ml-1 text-xs md:text-sm text-red-500 hover:text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Total row */}
                <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-5 py-4 mt-4 flex items-center justify-between shadow-sm">
                  <div className="text-sm md:text-lg font-semibold text-slate-700">
                    Total
                  </div>
                  <div className="text-lg md:text-xl font-extrabold text-slate-900">
                    {formatPrice(total)}
                  </div>
                </div>
              </div>

              {/* Customer info */}
              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Name (optional — for take-home)
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                    placeholder="e.g., John"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Phone (optional — for take-home)
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                    placeholder="08x-xxx-xxxx"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300"
                  rows={3}
                  placeholder="No spicy, extra sauce, etc."
                />
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to={`/menu?table=${tableId}`}
                  className="px-5 py-2.5 rounded-full border border-slate-300 bg-white/90 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  ← Back to Menu
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={loading || !cart.length}
                  className="px-6 py-2.5 rounded-full bg-[#1d4ed8] text-sm font-semibold text-white shadow-sm hover:bg-[#1e40af] disabled:opacity-60"
                >
                  {loading ? "Placing..." : "Place Order"}
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-slate-700/40"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              Place this order?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              We&apos;ll send it to the kitchen for Table{" "}
              <span className="font-semibold text-slate-800">
                {tableId || "—"}
              </span>
              .
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-full border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  placeOrder();
                }}
                className="px-4 py-2 rounded-full bg-[#1d4ed8] text-sm font-semibold text-white hover:bg-[#1e40af]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}