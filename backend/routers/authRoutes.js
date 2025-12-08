// routes/auth.js
import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// ------------------------------------------------------
// LOGIN
// ------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log("\n📥 LOGIN REQUEST:", req.body);

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username/email and password are required",
      });
    }

    // Allow login using either email or username
    const user = await User.findOne({
      $or: [
        { email: username.toLowerCase() },
        { username: username.toLowerCase() }
      ],
    });

    console.log("🔎 Found User:", user);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Compare hashed password
    console.log('values of user', user.password);
    console.log('values of pass', password);
    const isMatch = await bcrypt.compare(password, user.password);
    console.log("🔐 Password Match:", isMatch);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Create JWT token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      success: true,
      token,
      role: user.role,
      name: user.name,
      lastLogin: user.lastLogin,
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
});

// ------------------------------------------------------
// LOGOUT (client removes token, so this is optional)
// ------------------------------------------------------
router.post("/logout", (req, res) => {
  return res.json({
    success: true,
    message: "Logged out successfully",
  });
});

// ------------------------------------------------------
// VERIFY TOKEN
// ------------------------------------------------------
router.post("/verify", (req, res) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({
        success: false,
        message: "No authorization header provided",
      });
    }

    const token = header.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token missing",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return res.json({
      success: true,
      user: decoded,
    });

  } catch (error) {
    console.error("❌ Token verify error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

export default router;
