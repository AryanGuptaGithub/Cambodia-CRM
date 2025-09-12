// server.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./utils/db");
const customerRoutes = require('./routers/customers');
const suppilerRoutes = require('./routers/supplier');


dotenv.config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5500',
    'http://your-other-origin.com'
];
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
// Connect to MongoDB
connectDB(process.env.MONGODB_URI);

// Middleware
app.use(express.json());

// Routes
app.use("/api", customerRoutes);
app.use("/api", suppilerRoutes); 

// Server listener
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

