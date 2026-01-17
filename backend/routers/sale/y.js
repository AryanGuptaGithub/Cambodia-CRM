import express from "express";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import PaymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import axios from "axios";

const router = express.Router();
const importProgressMap = new Map();

const productCache = new Map();
const stockCache = new Map();
const adjustmentCache = new Map();
let lastCacheClear = Date.now();
const CACHE_TTL = 1 * 60 * 1000;
const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

// *********


// ... (rest of the code remains mostly the same, but update the import endpoint)



// Add a new endpoint to retry failed imports




export default router;