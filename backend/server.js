// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./utils/db.js";
import bodyParser  from "body-parser";

import customerRoutes from "./routers/master/customers.js";
import suppilerRoutes from "./routers/master/supplier.js";
import Brand from "./routers/projectManager/brands.js"
import authRoutes from "./routers/authRoutes.js";
import staff from "./routers/staffMember/staff.js";

dotenv.config(); // Load environment variables

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));  
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5500",
  "http://your-other-origin.com",
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
app.use("/api", Brand);
app.use("/api", authRoutes);
app.use("/api", staff);

// Server listener
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
