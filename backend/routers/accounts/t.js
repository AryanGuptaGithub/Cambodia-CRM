import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import MRCash from "../../models/accounts/MRCash.js";
import Sale from "../../models/sale/saleSummary.js";
import stockTransferToMR from "../../models/stock/stockTransferToMR.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import multer from "multer";

const router = express.Router();

const storage = multer.memoryStorage();







export default router;