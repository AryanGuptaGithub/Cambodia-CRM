// routes/auth.js
import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// ------------------------------------------------------
// LOGIN - ADMIN ONLY
// ------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;
     console.log('values of username------------> 18', username);
     console.log('value of password ---> 19', password);
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username/email and password are required",
      });
    }

    username = username.trim().toLowerCase();

    // ✅ FIXED: search by email OR name
    const user = await User.findOne({
      $or: [
        { email: username },
        { name: username }
      ],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // ✅ Admin only access
    if (!["admin", "super admin"].includes(user.role.toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin or SuperAdmin accounts only.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    
    return res.json({
      success: true,
      token,
      role: user.role,
      email: user.email,  // ✅ RETURN EMAIL
      name: user.email,   // ✅ so frontend shows full email
      lastLogin: user.lastLogin,
      isAdmin: true,
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

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


// ------------------------------------------------------
// GET CURRENT USER (/me)
// ------------------------------------------------------
router.get("/me", async (req, res) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = header.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB (BEST PRACTICE)
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user,
    });

  } catch (error) {
    console.error("❌ /me error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

export default router;
