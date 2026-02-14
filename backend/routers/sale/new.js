import express from "express";
import mongoose from "mongoose";
import SalesReturn from "../../models/sale/saleReturn.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ProductInventory from "../../models/purcharsing/purchaseInventory.js";
import Customer from "../../models/master/customer.js";          // <-- ADD THIS
import ExcelJS from "exceljs";

const router = express.Router();




export default router;