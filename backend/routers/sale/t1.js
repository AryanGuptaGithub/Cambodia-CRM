// backend/routers/sale/saleSummary.js (Updated with BYPASS_STOCK_CHECK)

import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import mongoose from "mongoose";
import ReportInHand from "../../models/reports/reportsInHand.js";
import PaymentStatus from "../../models/paymentStatus.js";

const router = express.Router();
const importProgressMap = new Map();



// ... (rest of the file: processImportAsync, routes, etc. remain unchanged)

export default router;