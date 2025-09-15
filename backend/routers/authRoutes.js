// routes/auth.js
import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    console.log("📥 Body received:", req.body); // <-- Check if body exists
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ message: "Username & password required" });

    const user = await User.findOne({ username });
    console.log("🔑 User found:", user);

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    console.log("🔐 Password match:", isMatch);

    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token, role: user.role });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
});


export default router;  // ✅ ESM export
