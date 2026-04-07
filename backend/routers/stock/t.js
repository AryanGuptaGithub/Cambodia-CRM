import express from "express";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";

const router = express.Router();



// ==================== GET /in-stock ====================


// ==================== CREATE ADJUSTMENT ====================



export default router;