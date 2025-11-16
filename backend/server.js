import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import menuRoutes from "./routes/menu.js";
import orderRoutes from "./routes/order.js";
import tableRoutes from "./routes/table.js";
import paymentRoutes from "./routes/payment.js";
import billingRouter from "./routes/billing.js";
import authRoutes from "./routes/auth.js";
import adminMenuRoutes from "./routes/admin.menu.js";
import adminOrdersRoutes from "./routes/admin.orders.js";
import adminBillingRouter from "./routes/admin.billing.js";
import adminActivityRouter from "./routes/admin.activity.js";

const app = express();
app.use(
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/admin", authRoutes); // expose /api/admin/login for AdminLogin.jsx
app.use("/api/admin/menu", adminMenuRoutes);
app.use("/api/admin/orders", adminOrdersRoutes);
app.use("/api/admin/billing", adminBillingRouter);
app.use("/api/admin/activity", adminActivityRouter);


app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/billing", billingRouter);



app.get("/", (_req, res) => res.send("Food POS API running"));

const PORT = Number(process.env.PORT) || 5050;
console.log("Environment loaded, PORT:", PORT);
app.listen(PORT, () => console.log("API on :", PORT));
