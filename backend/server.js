// server.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./utils/db");
const customerRoutes = require('./routers/master/customers');
const suppilerRoutes = require('./routers/master/supplier');
const brands = require('./routers/projectManager/brands');


dotenv.config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin:'http://localhost:5173',
    Credentials: true
}))
// Connect to MongoDB
connectDB(process.env.MONGODB_URI);

// Middleware
app.use(express.json());

// Routes
app.use("/api", customerRoutes);
app.use("/api", suppilerRoutes); 
app.use("/api", brands);

// Server listener
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

