import { BrowserRouter, Routes, Route } from "react-router-dom";
import SelectTablePage from "./pages/Customer/SelectTablePage";
import HomePage from "./pages/Customer/HomePage";
import MenuPage from "./pages/Customer/MenuPage";
import CartPage from "./pages/Customer/CartPage";
import OrderSummary from "./pages/Customer/OrderSummary";
import AdminLogin from "./pages/Admin/AdminLogin.jsx";
import AdminDashboard from "./pages/Admin/AdminDashboard.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SelectTablePage />} />   {/* ✅ หน้าเลือกโต๊ะ */}
        <Route path="/home" element={<HomePage />} />      {/* ✅ หน้าเลือกหมวด */}
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/summary/:orderId" element={<OrderSummary />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}