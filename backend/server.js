// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./utils/db.js";
import bodyParser from "body-parser";

import customerRoutes from "./routers/master/customers.js";
import suppilerRoutes from "./routers/master/supplier.js";
import brand from "./routers/projectManager/brands.js";
import product from "./routers/projectManager/product.js";
import authRoutes from "./routers/authRoutes.js";
import staff from "./routers/staffMember/staff.js";
import priceList from "./routers/projectManager/pricelist.js";
import saleSummary from "./routers/sale/saleSummary.js";
import payments from "./routers/reports/payments.js";
import dailySample from "./routers/reports/dailysample.js";
import purcharse from "./routers/purcharsing/purcharsing.js";
import dailySummary from "./routers/reports/dailysummary.js";
import dailyReports from "./routers/reports/dailyReports.js";
import SalesReturn from "./routers/sale/saleReturn.js";
import stockAdjustment from "./routers/stock/stockAdjustment.js";
import stockTransfer from "./routers/stock/stockTransfer.js";
import warehouse from "./routers/stock/warehouse.js";
import orderStatus from "./routers/stock/orderStatus.js";

dotenv.config(); // Load environment variables

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://fcrmcambodia.healthcarese.asia",
  "http://fcrmcambodia.healthcarese.asia",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Connect to MongoDB
connectDB(process.env.MONGODB_URI);

// Middleware
app.use(express.json());

// Routes
app.use("/api", customerRoutes);
app.use("/api", suppilerRoutes);
app.use("/api", brand);
app.use("/api", product);
app.use("/api", authRoutes);
app.use("/api", staff);
app.use("/api", priceList);
app.use("/api", saleSummary);
app.use("/api", payments);
app.use("/api", dailySample);
app.use("/api", purcharse);
app.use("/api", dailySummary);
app.use("/api", dailyReports);
app.use("/api", SalesReturn);
app.use("/api", stockAdjustment);
app.use("/api", stockTransfer);
app.use("/api", warehouse);
app.use("/api", orderStatus);

// Server listener
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
