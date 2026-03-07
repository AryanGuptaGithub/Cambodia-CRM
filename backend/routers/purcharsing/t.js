import express from "express";
import mongoose from "mongoose";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();





// POST /purchase/import (Excel import) – ensure sellingPrice is passed correctly


// All other routes (GET /, /invoice, /reports-in-hand, /debug, etc.) remain unchanged.

export default router;