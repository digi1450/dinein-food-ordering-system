import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API;

export default function MenuPage() {
  const [menu, setMenu] = useState([]);
  const [tableId, setTableId] = useState("");

  useEffect(() => {
    // ดึงข้อมูลเมนูจาก backend
    fetch(`${API}/api/menu`)
      .then((res) => res.json())
      .then((data) => setMenu(data));

    // ดึงค่า table จาก URL เช่น ?table=1
    const t = new URLSearchParams(location.search).get("table");
    if (t) setTableId(t);
  }, []);

  // เพิ่มเมนูลงตะกร้า (เก็บใน localStorage)
  const addToCart = (item) => {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const exist = cart.find((c) => c.food_id === item.food_id);
    if (exist) exist.quantity += 1;
    else cart.push({ ...item, quantity: 1 });
    localStorage.setItem("cart", JSON.stringify(cart));
    alert(`Added ${item.food_name}`);
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-center">
        Menu {tableId && <span className="text-sm">— Table {tableId}</span>}
      </h1>

      <div className="flex justify-end mb-3">
        <a
          href={`/cart?table=${tableId || 1}`}
          className="border px-3 py-1 rounded hover:bg-gray-100 hover:text-black transition"
        >
          Go to Cart 🛒
        </a>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
        {menu.map((item) => (
          <div
            key={item.food_id}
            className="border rounded p-3 hover:shadow-md transition"
          >
            <div className="font-semibold text-lg">{item.food_name}</div>
            <div className="text-gray-600">{item.category_name}</div>
            <div className="mt-2 font-bold text-green-600">฿{item.price}</div>
            <button
              onClick={() => addToCart(item)}
              className="mt-2 bg-black text-white px-3 py-1 rounded hover:bg-gray-800"
            >
              Add to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}