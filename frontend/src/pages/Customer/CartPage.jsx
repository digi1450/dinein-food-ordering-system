import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API;

export default function CartPage() {
  const nav = useNavigate();
  const { search } = useLocation();
  const tableIdRaw = new URLSearchParams(search).get("table");
  const tableId = Number(tableIdRaw || 0);

  const [cart, setCart] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // โหลดตะกร้าจาก localStorage
  useEffect(() => {
    const c = JSON.parse(localStorage.getItem("cart") || "[]");
    setCart(c);
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0),
    [cart]
  );

  const updateQty = (food_id, delta) => {
    const next = cart
      .map((it) =>
        it.food_id === food_id ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it
      )
      .filter((it) => it.quantity > 0);
    setCart(next);
    localStorage.setItem("cart", JSON.stringify(next));
  };

  const removeItem = (food_id) => {
    const next = cart.filter((it) => it.food_id !== food_id);
    setCart(next);
    localStorage.setItem("cart", JSON.stringify(next));
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

      const res = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Create order failed (${res.status}): ${errText}`);
      }

      let data;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Invalid API response (not JSON)");
      }

      const orderId = Number(data?.order_id);
      if (!Number.isFinite(orderId)) {
        throw new Error("Invalid API response: missing order_id");
      }

      localStorage.removeItem("cart");
      nav(`/summary/${orderId}`);
    } catch (e) {
      console.error(e);
      alert(e.message || "Create order failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 text-white">
      <h1 className="text-2xl font-bold mb-4">Your Cart — Table {tableId || "?"}</h1>

      {!cart.length ? (
        <div className="opacity-80">Your cart is empty.</div>
      ) : (
        <div className="space-y-3">
          {cart.map((it) => (
            <div key={it.food_id} className="border rounded p-3 flex items-center justify-between">
              <div>
                <div className="font-semibold">{it.food_name}</div>
                <div className="text-sm opacity-70">฿{Number(it.price).toFixed(2)}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQty(it.food_id, -1)}
                  className="px-2 py-1 border rounded"
                >
                  −
                </button>
                <div className="w-8 text-center">{it.quantity}</div>
                <button
                  onClick={() => updateQty(it.food_id, +1)}
                  className="px-2 py-1 border rounded"
                >
                  +
                </button>

                <button onClick={() => removeItem(it.food_id)} className="ml-3 text-red-400">
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="flex justify-between items-center border-t pt-3">
            <div className="text-xl font-bold">Total</div>
            <div className="text-xl font-bold">฿{total.toFixed(2)}</div>
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
            className="w-full bg-transparent border rounded px-3 py-2"
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
            className="w-full bg-transparent border rounded px-3 py-2"
            placeholder="08x-xxx-xxxx"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-sm opacity-80 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-transparent border rounded px-3 py-2"
          rows={3}
          placeholder="no spicy, extra sauce, etc."
        />
      </div>

      <div className="mt-6 flex gap-3">
        <a
          href={`/?table=${tableId}`}
          className="px-4 py-2 border rounded hover:bg-white/10"
        >
          Back to Menu
        </a>
        <button
          type="button"
          onClick={placeOrder}
          disabled={loading || !cart.length}
          className="px-4 py-2 bg-white text-black rounded disabled:opacity-60"
        >
          {loading ? "Placing..." : "Place Order"}
        </button>
      </div>
    </div>
  );
}