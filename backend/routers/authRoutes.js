// routes/auth.js
import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs"; // Import bcrypt
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Username and password are required" 
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    // Use bcrypt directly to compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials" 
      });
    }

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        username: user.username
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h", // You can adjust the expiration
      }
    );

    res.json({
      success: true,
      token,
      role: user.role,
      username: user.username,
      name: user.name,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false,
      message: error.message || "Server error" 
    });
  }
});

// Optional: Add a logout route (if needed)
router.post("/logout", (req, res) => {
  // Since JWT is stateless, logout is handled on the client side
  // by removing the token
  res.json({
    success: true,
    message: "Logged out successfully"
  });
});

// Optional: Add a route to check token validity
router.post("/verify", (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({
      success: true,
      user: decoded
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
});

export default router;