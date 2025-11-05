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
    <div className="min-h-screen w-full bg-[radial-gradient(800px_600px_at_-10%_-5%,#fce0ff,transparent),radial-gradient(900px_650px_at_110%_0%,#ffe7cc,transparent),linear-gradient(180deg,#fef7ff,#f3f8ff)] text-slate-900">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Your Cart</h1>
        <p className="text-sm text-slate-600 mt-1 mb-6">Table {tableId || "?"}</p>

        {!cart.length ? (
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 px-6 py-8 text-center shadow-sm">
            <div className="text-base text-slate-600">Your cart is empty.</div>
            <Link
              to={`/menu?table=${tableId}`}
              className="mt-4 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2 text-slate-900 shadow-sm hover:bg-slate-50"
            >
              Back to Menu
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((it) => {
              const unit = priceOf(it);
              const qty = Number(it.quantity) || 1;
              const sub = unit * qty;

              return (
                <div
                  key={it.food_id}
                  className="rounded-3xl bg-white ring-1 ring-slate-200 p-4 md:p-5 flex items-center justify-between shadow-sm"
                >
                  <div>
                    <div className="font-semibold">{it.food_name}</div>
                    <div className="text-sm opacity-70">฿{unit.toFixed(2)}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      aria-label="decrease quantity"
                      onClick={() => updateQty(it.food_id, -1)}
                      className="size-9 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50"
                    >
                      −
                    </button>
                    <div className="w-10 text-center font-medium">{qty}</div>
                    <button
                      aria-label="increase quantity"
                      onClick={() => updateQty(it.food_id, +1)}
                      className="size-9 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50"
                    >
                      +
                    </button>

                    <div className="w-24 text-right font-semibold">{formatPrice(sub)}</div>

                    <button
                      onClick={() => removeItem(it.food_id)}
                      className="ml-3 text-red-600 hover:text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="rounded-3xl bg-white ring-1 ring-slate-200 px-5 py-4 mt-4 flex items-center justify-between shadow-sm">
              <div className="text-lg font-semibold text-slate-700">Total</div>
              <div className="text-xl font-bold">{formatPrice(total)}</div>
            </div>
          </div>
        )}

        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm opacity-80 mb-1">
              Name (optional — for take-home)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="e.g., John"
            />
          </div>
          <div>
            <label className="block text-sm opacity-80 mb-1">
              Phone (optional — for take-home)
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="08x-xxx-xxxx"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-sm opacity-80 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            rows={3}
            placeholder="no spicy, extra sauce, etc."
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={`/menu?table=${tableId}`}
            className="px-5 py-2 rounded-full border border-slate-300 bg-white/90 shadow-sm hover:bg-white"
          >
            Back to Menu
          </Link>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={loading || !cart.length}
            className="px-6 py-2 rounded-full bg-slate-900 text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Placing..." : "Place Order"}
          </button>
        </div>
      </div>
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">Place this order?</h2>
            <p className="mt-1 text-sm text-slate-600">
              We'll send it to the kitchen for Table {tableId || "?"}.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-full border border-slate-300 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setConfirmOpen(false); placeOrder(); }}
                className="px-4 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
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