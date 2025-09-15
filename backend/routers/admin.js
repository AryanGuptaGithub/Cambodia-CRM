// routes/admin.js
import express from "express";
import { authenticate, authorizeRoles } from "../middleware/auth.js";

const router = express.Router();

// Only super-admin can access
router.get("/superadmin-only", authenticate, authorizeRoles("super-admin"), (req, res) => {
  res.json({ message: "Welcome Super Admin!" });
});

// Admin or super-admin can access
router.get("/admin-dashboard", authenticate, authorizeRoles("admin", "super-admin"), (req, res) => {
  res.json({ message: "Welcome Admin!" });
});

export default router;
