import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import MrBasicPayroll from "../../models/Hrm/MRBasicPayroll.js";
import Account from "../../models/accounts/Destination.js";
import Attendance from "../../models/Hrm/Attendance.js";
import Leave from "../../models/Hrm/Leaves.js";
import MrAdvance from "../../models/Hrm/MrAdvance.js";
import mongoose from "mongoose";
import { Parser } from "json2csv";

const router = express.Router();

const generateNextPayrollCode = async (session = null) => {
  const query = Payroll.findOne({})
    .sort({ createdAt: -1 })
    .select("payrollCode");
  if (session) query.session(session);
  const latest = await query;
  let nextNumber = 1;
  if (latest && latest.payrollCode) {
    const m = latest.payrollCode.match(/PR-(\d+)/);
    if (m && m[1]) nextNumber = parseInt(m[1]) + 1;
  }
  return `PR-${nextNumber.toString().padStart(4, "0")}`;
};







export default router;