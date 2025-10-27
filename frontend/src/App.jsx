import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MenuPage from "./pages/Customer/MenuPage.jsx";
import CartPage from "./pages/Customer/CartPage.jsx";
import OrderSummary from "./pages/Customer/OrderSummary.jsx";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/summary/:orderId" element={<OrderSummary />} />        
      </Routes>
    </Router>
  );
}

export default App;