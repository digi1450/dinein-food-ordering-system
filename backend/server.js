import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import menuRoutes from "./routes/menu.js";
import orderRoutes from "./routes/order.js";
import adminRoutes from "./routes/admin.js";
import tableRoutes from "./routes/table.js";
import paymentRoutes from "./routes/payment.js";
import authRoutes from "./routes/auth.js";
import adminMenuRoutes from "./routes/admin.menu.js";

const app = express();
app.use(cors({
  origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
}));
app.use(express.json());

app.use("/api/admin", authRoutes);
app.use("/api/admin/menu", adminMenuRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/payments", paymentRoutes);


app.get("/", (_req, res) => res.send("Food POS API running"));
app.listen(process.env.PORT, () => console.log("API on :", process.env.PORT));

