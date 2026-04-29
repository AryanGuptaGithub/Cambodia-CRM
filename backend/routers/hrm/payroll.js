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
import Expense from "../../models/expenses/addExpense.js";
import Transaction from "../../models/accounts/Transaction.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDateForLog = (date) => {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
};

// ─────────────────────────────────────────────
// HELPERS - EXACT MATH WITH PROPER ROUNDING
// ─────────────────────────────────────────────
const toExactAmount = (value) => {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return 0;
  return num;
};

const toFixedAmount = (value) => {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
};

const toRoundedDisplay = (value) => {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
};

const toFloorDisplay = (value) => {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return 0;
  return Math.floor(num * 100) / 100;
};

const toFloat = (value) => {
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? 0 : num;
};

const generateNextPayrollCode = async (session = null) => {
  const query = Payroll.findOne({})
    .sort({ createdAt: -1 })
    .select("payrollCode");
  if (session) query.session(session);
  const latest = await query;
  let nextNumber = 1;
  if (latest?.payrollCode) {
    const m = latest.payrollCode.match(/PR-(\d+)/);
    if (m?.[1]) nextNumber = parseInt(m[1]) + 1;
  }
  return `PR-${nextNumber.toString().padStart(4, "0")}`;
};

const getPendingAdvance = async (employeeId, session = null) => {
  try {
    let agg = MrAdvance.aggregate([
      {
        $match: {
          employeeId: new mongoose.Types.ObjectId(employeeId),
          status: "pending",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    if (session) agg = agg.session(session);
    const result = await agg;
    return toExactAmount(result[0]?.total || 0);
  } catch {
    return 0;
  }
};

// ─────────────────────────────────────────────
// MAIN CALCULATION FUNCTION
// ─────────────────────────────────────────────
const calculateSalaryForPeriod = async (employeeId, period, session = null) => {
  const employee = await Staff.findById(employeeId).session(session);
  if (!employee) throw new Error("Employee not found in staff records");

  const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
    session,
  );
  if (!basicPayroll)
    throw new Error("Basic payroll record not found for employee");

  const fullBasicSalary = toExactAmount(basicPayroll.currentBasicSalary || 0);

  const [year, month] = period.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const perDaySalaryExact = fullBasicSalary / totalDaysInMonth;

  const leaveRecords = await Leave.find({
    userId: employeeId,
    leaveDate: { $gte: startDate, $lte: endDate },
    status: "approved",
  }).session(session || null);

  let unpaidLeaveDays = 0;
  let paidLeaveDays = 0;
  let swapLeaveDays = 0;
  let totalLeaveDays = 0;
  const leaveDatesSet = new Set();

  for (const leave of leaveRecords) {
    const ds = new Date(leave.leaveDate).toISOString().split("T")[0];
    if (!leaveDatesSet.has(ds)) {
      leaveDatesSet.add(ds);
      totalLeaveDays++;

      if (leave.leaveType === "unpaid") {
        unpaidLeaveDays++;
      } else if (leave.leaveType === "paid") {
        paidLeaveDays++;
      } else if (leave.leaveType === "swapleave") {
        swapLeaveDays++;
        paidLeaveDays++;
      } else if (["holiday", "sunday"].includes(leave.leaveType)) {
        paidLeaveDays++;
      }
    }
  }

  const effectiveDays = totalDaysInMonth - unpaidLeaveDays;
  const leaveDeductionExact = unpaidLeaveDays * perDaySalaryExact;
  let netSalaryExact = perDaySalaryExact * effectiveDays;
  if (netSalaryExact < 0) netSalaryExact = 0;

  const attendanceRecords = await Attendance.find({
    userId: employeeId,
    loginTime: { $gte: startDate, $lte: endDate },
  }).session(session || null);

  const presentDatesSet = new Set();
  attendanceRecords.forEach((r) =>
    presentDatesSet.add(new Date(r.loginTime).toISOString().split("T")[0]),
  );
  const presentDays = presentDatesSet.size;

  const advanceDeduction = await getPendingAdvance(employeeId, session);
  const totalSalaryExact = Math.max(0, netSalaryExact - advanceDeduction);

  const leaveDeductionRounded = toRoundedDisplay(leaveDeductionExact);
  const totalSalaryRounded = toFloorDisplay(totalSalaryExact);
  const perDaySalaryRounded = toRoundedDisplay(perDaySalaryExact);

  return {
    employee: {
      id: employee._id,
      name: employee.medicalRepName,
      basicSalary: fullBasicSalary,
    },
    period,
    salaryCalculation: {
      basicSalary: fullBasicSalary,
      perDaySalaryExact: perDaySalaryExact,
      perDaySalaryDisplay: perDaySalaryRounded,
      totalDaysInMonth,
      workingDaysInMonth: totalDaysInMonth,
      presentDays,
      totalLeaves: totalLeaveDays,
      paidLeaves: paidLeaveDays,
      unpaidLeaves: unpaidLeaveDays,
      swapLeaves: swapLeaveDays,
      effectiveDays,
      leaveDeductionExact: leaveDeductionExact,
      leaveDeductionDisplay: leaveDeductionRounded,
      advanceDeduction: advanceDeduction,
      totalSalaryExact: totalSalaryExact,
      totalSalaryDisplay: totalSalaryRounded,
      isFull: unpaidLeaveDays === 0,
      calculationDetails: {
        formula: `${fullBasicSalary} / ${totalDaysInMonth} = ${perDaySalaryExact}`,
        deductionFormula: `${unpaidLeaveDays} × ${perDaySalaryExact} = ${leaveDeductionExact}`,
        netFormula: `${perDaySalaryExact} × ${effectiveDays} = ${netSalaryExact}`,
        finalFormula: `${netSalaryExact} - ${advanceDeduction} = ${totalSalaryExact}`,
      },
    },
  };
};

// ─────────────────────────────────────────────
// FINANCIAL CATEGORY HELPERS
// ─────────────────────────────────────────────
let _withdrawCategory = null;
const getWithdrawCategory = async (session = null) => {
  if (_withdrawCategory) return _withdrawCategory;
  try {
    const Category = mongoose.model("CategoryType");
    const cat = await Category.findOne({
      $or: [
        { name: { $regex: /^withdraw$/i } },
        { code: { $regex: /^withdraw$/i } },
        { title: { $regex: /^withdraw$/i } },
        { categoryName: { $regex: /^withdraw$/i } },
      ],
    })
      .select("_id name title categoryName code")
      .session(session);
    if (cat) {
      _withdrawCategory = {
        _id: cat._id,
        name:
          cat.name || cat.title || cat.categoryName || cat.code || "Withdraw",
      };
      return _withdrawCategory;
    }
    console.warn("⚠️ 'Withdraw' category not found in DB");
  } catch (err) {
    console.warn("Could not load Category model:", err.message);
  }
  return { _id: null, name: "Withdraw" };
};

let _salaryCategory = null;
const getSalaryCategory = async (session = null) => {
  if (_salaryCategory) return _salaryCategory;
  try {
    const ExpenseCategory = mongoose.model("ExpenseCategory");
    let category = await ExpenseCategory.findOne({
      category: { $regex: /^salary expenses$/i },
    }).session(session);
    if (!category) {
      category = await ExpenseCategory.findOne({
        category: { $regex: /salary/i },
      }).session(session);
    }
    if (category) {
      _salaryCategory = { _id: category._id, name: category.category };
      return _salaryCategory;
    }
    console.warn("⚠️ 'Salary Expenses' category not found, creating one...");
    const newCategory = new ExpenseCategory({
      category: "Salary Expenses",
      description: "Monthly salary expenses for employees",
      isActive: true,
    });
    await newCategory.save({ session });
    _salaryCategory = { _id: newCategory._id, name: newCategory.category };
    return _salaryCategory;
  } catch (err) {
    console.warn("Could not load ExpenseCategory model:", err.message);
    return await getWithdrawCategory(session);
  }
};

// ─────────────────────────────────────────────
// CREATE FINANCIAL RECORDS WITH PAYROLL ID AND isPayroll FLAG
// ─────────────────────────────────────────────
const createPayrollFinancialRecords = async ({
  payrollNetSalary,
  payrollCode,
  payrollId,
  employeeId,
  employeeName,
  period,
  sourceAccounts,
  createdBy,
  session,
}) => {
  if (!payrollNetSalary || payrollNetSalary <= 0) {
    console.log(
      `Skipping expense creation for ${payrollCode} - Net salary: ${payrollNetSalary}`,
    );
    return;
  }

  const payrollDate = new Date();
  const remarks = `Salary payment - ${employeeName} (${period})`;

  const withdrawCategory = await getWithdrawCategory(session);
  const salaryCategory = await getSalaryCategory(session);

  console.log(`\n💰 Creating financial records for ${payrollCode}`);
  console.log(`   Payroll ID: ${payrollId}`);
  console.log(`   Net Salary: ${payrollNetSalary}`);
  console.log(`   Source Accounts: ${sourceAccounts.length}`);

  // Create one transaction per source account with isPayroll = true
  for (const { account, amount } of sourceAccounts) {
    if (amount > 0) {
      console.log(`   Creating transaction for ${account.name}: $${amount}`);
      const txn = new Transaction({
        categoryType: withdrawCategory.name,
        sourceAccount: account.name || account.code || "Unknown Account",
        source: account._id,
        destination: null,
        supplier: employeeId,
        date: payrollDate,
        amount: toFixedAmount(amount),
        exchangeLoss: 0,
        finalAmount: toFixedAmount(amount),
        accountType: "Company Account",
        remarks: remarks,
        description: remarks,
        invoiceNo: "NA",
        isConversionLoss: false,
        transactionType: "payment outward",
        importStatus: "imported",
        importErrors: [],
        payrollCode: payrollCode,
        payrollId: payrollId,
        isPayroll: true, // ✅ Mark as payroll transaction
      });
      await txn.save({ session });
      console.log(`      Transaction saved with ID: ${txn._id}`);
    }
  }

  // Create one expense record per source account with isPayroll = true
  const resolvedCategoryId = salaryCategory._id || withdrawCategory._id;

  for (const { account, amount } of sourceAccounts) {
    if (!resolvedCategoryId || amount <= 0) {
      console.log(
        `   ⚠️ Skipping expense for account "${account.name}" — invalid category or zero amount`,
      );
      continue;
    }

    console.log(
      `   Creating expense for account "${account.name}": $${amount}`,
    );

    const expense = new Expense({
      category: resolvedCategoryId,
      categoryType: resolvedCategoryId,
      amount: toFixedAmount(amount),
      finalAmount: toFixedAmount(amount),
      exchangeLoss: 0,
      description: remarks,
      remarks: remarks,
      date: payrollDate,
      reference: payrollCode,
      payrollCode: payrollCode,
      employeeId: employeeId,
      supplier: employeeId,
      payrollId: payrollId,
      period: period,
      transactionType: "payment outward",
      accountType: "Company Account",
      importStatus: "imported",
      importErrors: [],
      invoiceNo: "NA",
      isConversionLoss: false,
      createdBy: createdBy || null,
      sourceAccount: account._id,
      isPayroll: true, // ✅ Mark as payroll expense
      sources: [
        {
          accountId: account._id,
          accountName: account.name || account.code || "Unknown Account",
          amount: toFixedAmount(amount),
          finalAmount: toFixedAmount(amount),
        },
      ],
    });

    await expense.save({ session });
    console.log(`      Expense saved with ID: ${expense._id}`);
  }
};

// ─────────────────────────────────────────────
// RESTORE ACCOUNT BALANCES DIRECTLY FROM PAYROLL SOURCES
// ─────────────────────────────────────────────
const restoreAccountBalancesFromSources = async (payroll, session) => {
  const payrollId = payroll._id;
  const payrollCode = payroll.payrollCode;
  const restoredDetails = [];
  let totalRestored = 0;

  // ── PRIMARY: use the sources array stored on the payroll document ──
  if (payroll.sources && payroll.sources.length > 0) {
    console.log(
      `   ✅ Restoring from payroll.sources (${payroll.sources.length} entr${payroll.sources.length === 1 ? "y" : "ies"})`,
    );

    for (const src of payroll.sources) {
      const amount = toExactAmount(src.amount);
      if (!src.accountId || amount <= 0) continue;

      const account = await Account.findById(src.accountId).session(session);
      if (account) {
        const oldBalance = toExactAmount(account.totalAmount || 0);
        account.totalAmount = toExactAmount(oldBalance + amount);
        await account.save({ session });
        totalRestored += amount;
        restoredDetails.push({
          accountId: account._id,
          accountName: account.name,
          amount,
          oldBalance,
          newBalance: account.totalAmount,
        });
        console.log(
          `   ✅ Restored $${amount} to "${account.name}" (${oldBalance} → ${account.totalAmount})`,
        );
      } else {
        console.warn(
          `   ⚠️ Account ${src.accountId} (${src.accountName || "unknown"}) not found`,
        );
      }
    }

    return { totalRestored, restoredDetails };
  }

  // ── FALLBACK: older payrolls without sources array — use transactions ──
  console.log(
    `   ⚠️ payroll.sources empty — falling back to transaction lookup`,
  );

  let transactions = await Transaction.find({
    payrollId: payrollId,
    transactionType: "payment outward",
  }).session(session);

  if (transactions.length === 0) {
    console.log(
      `   No transactions by payrollId, trying payrollCode: ${payrollCode}`,
    );
    transactions = await Transaction.find({
      payrollCode: payrollCode,
      transactionType: "payment outward",
    }).session(session);
  }

  console.log(
    `   Found ${transactions.length} transaction(s) to reverse (fallback)`,
  );

  for (const tx of transactions) {
    const accountName = tx.sourceAccount;
    const amountToRestore = toExactAmount(tx.amount || tx.finalAmount || 0);

    if (!accountName || accountName === "--" || amountToRestore <= 0) continue;

    const account = await Account.findOne({ name: accountName }).session(
      session,
    );

    if (account) {
      const oldBalance = toExactAmount(account.totalAmount || 0);
      account.totalAmount = toExactAmount(oldBalance + amountToRestore);
      await account.save({ session });
      totalRestored += amountToRestore;
      restoredDetails.push({
        accountId: account._id,
        accountName: account.name,
        amount: amountToRestore,
        oldBalance,
        newBalance: account.totalAmount,
      });
      console.log(
        `   ✅ Restored $${amountToRestore} to "${accountName}" (fallback)`,
      );
    } else if (
      tx.source &&
      mongoose.Types.ObjectId.isValid(String(tx.source))
    ) {
      const accountById = await Account.findById(tx.source).session(session);
      if (accountById) {
        const oldBalance = toExactAmount(accountById.totalAmount || 0);
        accountById.totalAmount = toExactAmount(oldBalance + amountToRestore);
        await accountById.save({ session });
        totalRestored += amountToRestore;
        restoredDetails.push({
          accountId: accountById._id,
          accountName: accountById.name,
          amount: amountToRestore,
          oldBalance,
          newBalance: accountById.totalAmount,
        });
        console.log(
          `   ✅ Restored $${amountToRestore} to "${accountById.name}" via ID fallback`,
        );
      } else {
        console.warn(`   ⚠️ Account not found by name or ID for tx: ${tx._id}`);
      }
    } else {
      console.warn(
        `   ⚠️ Account "${accountName}" not found and no valid source ID`,
      );
    }
  }

  return { totalRestored, restoredDetails };
};

// ─────────────────────────────────────────────
// GET /mrs/all
// ─────────────────────────────────────────────
router.get("/mrs/all", async (req, res) => {
  try {
    const staffList = await Staff.find({ enabled: { $ne: false } })
      .select("_id medicalRepName MRId teamName")
      .lean();
    const mrList = staffList.map((s) => ({
      _id: s._id,
      medicalRepName: s.medicalRepName || `MR ${s._id}`,
      MRId: s.MRId,
      teamName: s.teamName,
    }));
    return res
      .status(200)
      .json({ success: true, count: mrList.length, data: mrList });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch staff list.",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /basic-payroll/employee/:employeeId
// ─────────────────────────────────────────────
router.get("/basic-payroll/employee/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid employee ID" });
    const basicPayroll = await MrBasicPayroll.findOne({ employeeId });
    if (!basicPayroll)
      return res
        .status(404)
        .json({ success: false, message: "Basic payroll not found" });
    res.status(200).json({
      success: true,
      data: {
        _id: basicPayroll._id,
        employeeId: basicPayroll.employeeId,
        currentBasicSalary: toFixedAmount(basicPayroll.currentBasicSalary || 0),
        currentEffectiveFrom: basicPayroll.currentEffectiveFrom,
        employeeName: basicPayroll.employeeName,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch basic payroll",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET / — List payrolls
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// GET / — List payrolls (with optional pagination)
// ─────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit,
      search = "",
      status = "",
      period = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    
    const pageNum = parseInt(page);
    // If limit is not provided, get ALL records (no pagination)
    let limitNum = limit ? parseInt(limit) : null;
    let skip = limitNum ? (pageNum - 1) * limitNum : 0;

    const matchConditions = { enabled: true };
    if (status && status !== "all") matchConditions.status = status;
    if (period) {
      if (period.endsWith("-YTD"))
        matchConditions.period = {
          $regex: `^${period.split("-")[0]}-`,
          $options: "i",
        };
      else if (period !== "all") matchConditions.period = period;
    }

    let searchConditions = {};
    if (search?.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      const staffIds = (
        await Staff.find({
          $or: [
            { medicalRepName: searchRegex },
            { teamName: searchRegex },
            { contactNo: searchRegex },
            { email: searchRegex },
          ],
        }).select("_id")
      ).map((s) => s._id);
      searchConditions = {
        $or: [
          { payrollCode: searchRegex },
          { paymentMethod: searchRegex },
          { employeeId: { $in: staffIds } },
        ],
      };
    }

    const finalConditions = {
      ...matchConditions,
      ...(Object.keys(searchConditions).length > 0 ? searchConditions : {}),
    };
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Build the query
    let query = Payroll.find(finalConditions)
      .populate(
        "employeeId",
        "medicalRepName teamName contactNo email date enabled MRId",
      )
      .sort(sort);

    // Apply pagination only if limit is provided
    if (limitNum) {
      query = query.skip(skip).limit(limitNum);
    }

    const payrolls = await query.lean();

    const employeeIds = payrolls.map((p) => p.employeeId?._id).filter(Boolean);
    const basicPayrolls = await MrBasicPayroll.find({
      employeeId: { $in: employeeIds },
    }).lean();
    const basicSalaryMap = {};
    basicPayrolls.forEach(
      (bp) =>
        (basicSalaryMap[bp.employeeId] = toFixedAmount(
          bp.currentBasicSalary || 0,
        )),
    );

    const transformedPayrolls = payrolls.map((payroll) => {
      const obj = { ...payroll };
      if (
        obj.employeeId &&
        typeof obj.employeeId === "object" &&
        obj.employeeId._id
      ) {
        obj.employeeName = obj.employeeId.medicalRepName;
        obj.teamName = obj.employeeId.teamName;
        obj.contactNo = obj.employeeId.contactNo;
        obj.email = obj.employeeId.email;
        obj.joiningDate = obj.employeeId.date;
        obj.employeeEnabled = obj.employeeId.enabled;
        obj.MRId = obj.employeeId.MRId;
        obj.employeeBasicSalary = basicSalaryMap[obj.employeeId._id] || 0;
      } else {
        obj.employeeName = "Unknown";
        obj.teamName = "Unknown";
        obj.contactNo = "N/A";
        obj.email = "N/A";
        obj.joiningDate = null;
        obj.employeeEnabled = false;
        obj.MRId = "N/A";
        obj.employeeBasicSalary = 0;
      }
      obj.displayBasicSalary = obj.basicSalary;
      return obj;
    });

    const total = await Payroll.countDocuments(finalConditions);
    const nextPayrollCode = await generateNextPayrollCode();

    // Prepare response
    const responseData = {
      success: true,
      data: transformedPayrolls,
      nextPayrollCode,
    };

    // Add pagination info only if pagination was applied
    if (limitNum) {
      responseData.pagination = {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      };
    } else {
      responseData.pagination = {
        totalItems: total,
        itemsPerPage: total,
      };
    }

    res.status(200).json(responseData);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payrolls",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /export/csv
// ─────────────────────────────────────────────
router.get("/export/csv", async (req, res) => {
  try {
    const { search = "", status = "", period = "" } = req.query;
    const matchConditions = { enabled: true };
    if (status && status !== "all") matchConditions.status = status;
    if (period) {
      if (period.endsWith("-YTD"))
        matchConditions.period = {
          $regex: `^${period.split("-")[0]}-`,
          $options: "i",
        };
      else if (period !== "all") matchConditions.period = period;
    }
    let searchConditions = {};
    if (search?.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      const staffIds = (
        await Staff.find({
          $or: [
            { medicalRepName: searchRegex },
            { teamName: searchRegex },
            { contactNo: searchRegex },
            { email: searchRegex },
          ],
        }).select("_id")
      ).map((s) => s._id);
      searchConditions = {
        $or: [
          { payrollCode: searchRegex },
          { paymentMethod: searchRegex },
          { employeeId: { $in: staffIds } },
        ],
      };
    }
    const finalConditions = {
      ...matchConditions,
      ...(Object.keys(searchConditions).length > 0 ? searchConditions : {}),
    };
    const payrolls = await Payroll.find(finalConditions)
      .populate(
        "employeeId",
        "medicalRepName teamName contactNo email date enabled MRId",
      )
      .sort({ createdAt: -1 })
      .lean();

    const employeeIds = payrolls.map((p) => p.employeeId?._id).filter(Boolean);
    const basicPayrolls = await MrBasicPayroll.find({
      employeeId: { $in: employeeIds },
    }).lean();
    const basicSalaryMap = {};
    basicPayrolls.forEach(
      (bp) =>
        (basicSalaryMap[bp.employeeId] = toFixedAmount(
          bp.currentBasicSalary || 0,
        )),
    );

    const transformed = payrolls.map((payroll) => {
      const obj = { ...payroll };
      if (
        obj.employeeId &&
        typeof obj.employeeId === "object" &&
        obj.employeeId._id
      ) {
        obj.employeeName = obj.employeeId.medicalRepName;
        obj.teamName = obj.employeeId.teamName;
        obj.contactNo = obj.employeeId.contactNo;
        obj.email = obj.employeeId.email;
        obj.joiningDate = obj.employeeId.date;
        obj.employeeEnabled = obj.employeeId.enabled;
        obj.MRId = obj.employeeId.MRId;
        obj.employeeBasicSalary = basicSalaryMap[obj.employeeId._id] || 0;
      } else {
        obj.employeeName = "Unknown";
        obj.teamName = "Unknown";
        obj.contactNo = "N/A";
        obj.email = "N/A";
        obj.joiningDate = null;
        obj.employeeEnabled = false;
        obj.MRId = "N/A";
        obj.employeeBasicSalary = 0;
      }
      obj.displayBasicSalary = obj.basicSalary;
      obj.allowancesCSV = obj.allowances
        ? obj.allowances
            .map((a) => `${a.type}: $${toFixedAmount(a.amount)}`)
            .join("; ")
        : "";
      return obj;
    });

    const fields = [
      { label: "Payroll Code", value: "payrollCode" },
      { label: "Employee Name", value: "employeeName" },
      { label: "Team", value: "teamName" },
      { label: "Period", value: "period" },
      { label: "Basic Salary", value: "basicSalary" },
      { label: "Allowances", value: "allowancesCSV" },
      { label: "Total Allowance", value: "totalAllowance" },
      { label: "Deductions", value: "deductions" },
      { label: "Net Salary", value: "netSalary" },
      { label: "Status", value: "status" },
      { label: "Payment Method", value: "paymentMethod" },
      { label: "Created At", value: "createdAt" },
    ];
    const csvData = new Parser({ fields }).parse(transformed);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=payrolls_export.csv",
    );
    res.status(200).send(csvData);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to export",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /mrs/from-basic-payroll
// ─────────────────────────────────────────────
router.get("/mrs/from-basic-payroll", async (req, res) => {
  try {
    const mrBasicPayrolls = await MrBasicPayroll.find({})
      .populate("employeeId", "medicalRepName")
      .lean();
    const mrList = mrBasicPayrolls
      .map((p) => {
        if (
          p.employeeId &&
          typeof p.employeeId === "object" &&
          p.employeeId._id
        )
          return {
            _id: p.employeeId._id,
            medicalRepName: p.employeeId.medicalRepName,
          };
        else if (p.employeeId)
          return {
            _id: p.employeeId,
            medicalRepName: p.employeeName || "Unknown",
          };
        return null;
      })
      .filter(Boolean);
    return res
      .status(200)
      .json({ success: true, count: mrList.length, data: mrList });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employee list.",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /calculate/:employeeId/:period
// ─────────────────────────────────────────────
router.get("/calculate/:employeeId/:period", async (req, res) => {
  try {
    const { employeeId, period } = req.params;

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res
        .status(400)
        .json({ success: false, message: "Period must be YYYY-MM" });
    }

    const calculation = await calculateSalaryForPeriod(employeeId, period);

    res.status(200).json({
      success: true,
      data: calculation,
    });
  } catch (error) {
    if (
      error.message === "Employee not found in staff records" ||
      error.message === "Basic payroll record not found for employee"
    ) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("Salary calculation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate salary",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /available-sources
// ─────────────────────────────────────────────
router.get("/available-sources", async (req, res) => {
  try {
    const { excludeIds } = req.query;
    let query = { totalAmount: { $gt: 0 } };
    if (excludeIds) {
      const idsToExclude = excludeIds
        .split(",")
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (idsToExclude.length > 0) query._id = { $nin: idsToExclude };
    }
    const accounts = await Account.find(query)
      .select("_id name code totalAmount balance")
      .lean();
    const options = accounts.map((account) => ({
      value: account._id,
      label: `${account.name || account.code || "Account"} ($${toFixedAmount(account.totalAmount || account.balance || 0).toFixed(2)})`,
      balance: toFixedAmount(account.totalAmount || account.balance || 0),
    }));
    res.status(200).json({ success: true, data: options });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch sources",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /:id
// ─────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id).populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
    );
    if (!payroll)
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });
    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id,
    });
    const data = payroll.toObject();
    if (data.employeeId) {
      data.employeeName = data.employeeId.medicalRepName;
      data.teamName = data.employeeId.teamName;
      data.contactNo = data.employeeId.contactNo;
      data.email = data.employeeId.email;
      data.employeeBasicSalary = toFixedAmount(
        basicPayroll?.currentBasicSalary || 0,
      );
    }
    data.displayBasicSalary = data.basicSalary;
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid payroll ID" });
    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// POST / — Create payroll
// ─────────────────────────────────────────────
router.post("/", protect, allowAdminOnly, async (req, res) => {
  console.log("=".repeat(80));
  console.log("📝 PAYROLL CREATION STARTED");
  console.log("=".repeat(80));

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const {
      employeeId,
      period,
      allowances,
      deductions,
      status,
      paymentMethod,
      bankAccount,
      remarks,
      sources,
    } = req.body;

    if (!employeeId || !period)
      return res.status(400).json({
        success: false,
        message: "Employee ID and period are required",
      });

    if (!/^\d{4}-\d{2}$/.test(period))
      return res
        .status(400)
        .json({ success: false, message: "Period must be YYYY-MM" });

    if (!sources || !Array.isArray(sources) || sources.length === 0)
      return res.status(400).json({
        success: false,
        message: "At least one source account is required",
      });

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (!src.accountId)
        return res.status(400).json({
          success: false,
          message: `Source at index ${i} missing accountId`,
        });
      if (!mongoose.Types.ObjectId.isValid(src.accountId))
        return res
          .status(400)
          .json({ success: false, message: `Invalid accountId at index ${i}` });
      if (src.amount === undefined || src.amount === null)
        return res.status(400).json({
          success: false,
          message: `Source at index ${i} missing amount`,
        });
      const amountNum = toExactAmount(src.amount);
      if (isNaN(amountNum) || amountNum <= 0)
        return res.status(400).json({
          success: false,
          message: `Source at index ${i} must have a positive amount`,
        });
    }

    const employee = await Staff.findById(employeeId).session(session);
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });

    const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
      session,
    );
    if (!basicPayroll)
      return res.status(404).json({
        success: false,
        message: "Basic payroll not found. Set basic salary first.",
      });

    const existingPayroll = await Payroll.findOne({
      employeeId,
      period,
    }).session(session);
    if (existingPayroll)
      return res.status(409).json({
        success: false,
        message: "Payroll already exists for this employee in this period",
      });

    const salaryData = await calculateSalaryForPeriod(
      employeeId,
      period,
      session,
    );
    const sc = salaryData.salaryCalculation;

    const fullBasicSalaryNum = sc.basicSalary;
    const advanceDeduction = sc.advanceDeduction;
    const leaveDeductionExact = sc.leaveDeductionExact;
    const totalSalaryExact = sc.totalSalaryExact;
    const totalSalaryDisplay = sc.totalSalaryDisplay;

    let totalAllowance = 0;
    const processedAllowances = [];
    if (allowances && Array.isArray(allowances)) {
      for (let i = 0; i < allowances.length; i++) {
        const allowance = allowances[i];
        if (!allowance.type || allowance.amount === undefined)
          return res.status(400).json({
            success: false,
            message: "Each allowance must have type and amount",
          });
        const amt = toExactAmount(allowance.amount);
        if (isNaN(amt) || amt < 0)
          return res.status(400).json({
            success: false,
            message: "Allowance amount must be non-negative",
          });
        if (amt > 0) {
          totalAllowance += amt;
          processedAllowances.push({
            type: allowance.type.trim(),
            amount: toFixedAmount(amt),
          });
        }
      }
    }

    const deductionsNum = toExactAmount(deductions || 0);

    // ── Deduct balances from each source account ──
    let totalSourceAmount = 0;
    const sourceAccounts = [];

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const account = await Account.findById(src.accountId).session(session);
      if (!account)
        throw new Error(`Source account ${src.accountId} not found`);
      const amount = toExactAmount(src.amount);
      if (account.totalAmount < amount)
        throw new Error(
          `Insufficient balance in ${account.name}. Available: ${account.totalAmount}, Required: ${amount}`,
        );
      account.totalAmount = toExactAmount(account.totalAmount - amount);
      await account.save({ session });
      sourceAccounts.push({ account, amount });
      totalSourceAmount += amount;
    }

    const calculatedNetSalary = toFixedAmount(totalSourceAmount);
    const payrollCode = await generateNextPayrollCode(session);

    // ✅ Get current user ID
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // ✅ Set paymentDate to current date when creating payroll
    const currentDate = new Date();

    const payroll = new Payroll({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      period,
      basicSalary: toFixedAmount(fullBasicSalaryNum),
      adjustedBasicSalary: sc.isFull
        ? toFixedAmount(fullBasicSalaryNum)
        : toFixedAmount(Math.max(0, fullBasicSalaryNum - leaveDeductionExact)),
      extraTimeAmount: 0,
      allowances: processedAllowances,
      totalAllowance: toFixedAmount(totalAllowance),
      deductions: toFixedAmount(deductionsNum),
      netSalary: calculatedNetSalary,
      netSalaryExact: totalSalaryDisplay,
      status: status || "pending",
      paymentMethod: paymentMethod || "bank",
      bankAccount: bankAccount || "",
      paymentDate: currentDate,
      remarks: remarks || "",
      payrollCode,
      payrollType: "current",
      sources: sourceAccounts.map(({ account, amount }) => ({
        accountId: account._id,
        accountName: account.name || "",
        amount: toFixedAmount(amount),
      })),
      createdBy: new mongoose.Types.ObjectId(userId),
      attendanceInfo: {
        totalWorkingDays: sc.workingDaysInMonth || 0,
        presentDays: sc.presentDays || 0,
        totalLeaves: sc.totalLeaves || 0,
        paidLeaves: sc.paidLeaves || 0,
        unpaidLeaves: sc.unpaidLeaves || 0,
        swapLeaves: sc.swapLeaves || 0,
        perDaySalary: sc.perDaySalaryDisplay || 0,
        perDaySalaryExact: sc.perDaySalaryExact || 0,
        effectiveDays: sc.effectiveDays || 0,
        leaveDeduction: sc.leaveDeductionDisplay || 0,
        leaveDeductionExact: sc.leaveDeductionExact || 0,
        isFull: sc.isFull || false,
      },
    });

    await payroll.save({ session });
    console.log(`   ✅ Payroll saved with ID: ${payroll._id}`);
    console.log(`   ✅ Payment Date set to: ${currentDate}`);

    if (advanceDeduction > 0) {
      await MrAdvance.updateMany(
        { employeeId, status: "pending" },
        { $set: { status: "adjusted" } },
        { session },
      );
    }

    // Create financial records with isPayroll = true
    await createPayrollFinancialRecords({
      payrollNetSalary: calculatedNetSalary,
      payrollCode: payroll.payrollCode,
      payrollId: payroll._id,
      employeeId: payroll.employeeId,
      employeeName: employee.medicalRepName,
      period,
      sourceAccounts,
      createdBy: payroll.createdBy,
      session,
    });

    await session.commitTransaction();

    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
    );

    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Payroll: ${payrollCode} for ${toTitleCase(employee.medicalRepName)}`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      recordId: payroll._id,
      referenceNumber: payrollCode,
      newData: payroll.toObject(),
      description: `Payroll ${payrollCode} created for ${toTitleCase(employee.medicalRepName)} for period ${period}. Net Salary: $${calculatedNetSalary.toFixed(2)}`,
      refField: "payrollCode",
    });

    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
      responseData.employeeBasicSalary = basicPayroll.currentBasicSalary;
    }
    responseData.displayBasicSalary = fullBasicSalaryNum;
    responseData.exactCalculation = {
      totalSalaryExact,
      totalSalaryDisplay,
      leaveDeductionExact,
      leaveDeductionDisplay: sc.leaveDeductionDisplay,
      perDaySalaryExact: sc.perDaySalaryExact,
      perDaySalaryDisplay: sc.perDaySalaryDisplay,
      effectiveDays: sc.effectiveDays,
      calculationDetails: sc.calculationDetails,
    };

    res.status(201).json({
      success: true,
      message: "Payroll created successfully.",
      data: responseData,
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    console.error("\n❌ PAYROLL CREATION ERROR:", error);

    if (error.name === "ValidationError")
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((v) => v.message),
      });
    if (error.code === 11000)
      return res.status(409).json({
        success: false,
        message: "Payroll already exists for this period",
      });
    if (error.message.includes("Insufficient balance"))
      return res.status(400).json({ success: false, message: error.message });
    if (error.message.includes("not found"))
      return res.status(404).json({ success: false, message: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to create payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// PATCH /:id/payment-status - Update payment status and date
// ─────────────────────────────────────────────
router.patch(
  "/:id/payment-status",
  protect,
  allowAdminOnly,
  async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.startTransaction();

      const { status } = req.body;
      const payrollId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(payrollId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid payroll ID" });
      }

      const payroll = await Payroll.findById(payrollId).session(session);
      if (!payroll) {
        return res
          .status(404)
          .json({ success: false, message: "Payroll not found" });
      }

      if (status) {
        payroll.status = status;
      }

      if (status === "paid") {
        payroll.paymentDate = new Date();
      }

      await payroll.save({ session });
      await session.commitTransaction();

      await logActivity(req, {
        action: "UPDATE",
        actionLabel: `Updated Payment Status: ${payroll.payrollCode} to ${status}`,
        tableName: "payrolls",
        tableLabel: "Payroll",
        recordId: payroll._id,
        referenceNumber: payroll.payrollCode,
        newData: { status: payroll.status, paymentDate: payroll.paymentDate },
        description: `Payment status for ${payroll.payrollCode} updated to ${status}`,
        refField: "payrollCode",
      });

      res.status(200).json({
        success: true,
        message: "Payment status updated successfully",
        data: payroll,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error("Error updating payment status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update payment status",
        error: error.message,
      });
    } finally {
      await session.endSession();
    }
  },
);

// ─────────────────────────────────────────────
// POST /bulk
// ─────────────────────────────────────────────
router.post("/bulk", protect, allowAdminOnly, async (req, res) => {
  const records = req.body;
  if (!Array.isArray(records) || records.length === 0)
    return res
      .status(400)
      .json({ success: false, message: "Body must be a non-empty array" });

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const results = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const {
        employeeId,
        period,
        basicSalary,
        allowances = [],
        totalAllowance = 0,
        deductions = 0,
        netSalary,
        status = "pending",
        paymentMethod = "bank",
        payrollType = "previous",
        bankAccount = "",
        remarks = "",
      } = record;

      if (!employeeId || !period) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: employeeId and period required`,
        });
        continue;
      }
      if (!/^\d{4}-\d{2}$/.test(String(period))) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Period must be YYYY-MM`,
        });
        continue;
      }
      if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Invalid employeeId`,
        });
        continue;
      }

      const employee = await Staff.findById(employeeId).session(session);
      if (!employee) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Employee not found`,
        });
        continue;
      }

      const existing = await Payroll.findOne({ employeeId, period }).session(
        session,
      );
      if (existing) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Payroll already exists for ${employee.medicalRepName} in ${period}`,
        });
        continue;
      }

      const basicNum = toFixedAmount(basicSalary);
      const allowanceNum = toFixedAmount(totalAllowance);
      const deductionNum = toFixedAmount(deductions);
      let netSalaryValue =
        netSalary !== undefined &&
        netSalary !== null &&
        !isNaN(parseFloat(netSalary))
          ? toFixedAmount(netSalary)
          : toFixedAmount(basicNum + allowanceNum - deductionNum);
      if (netSalaryValue < 0) netSalaryValue = 0;

      const processedAllowances = Array.isArray(allowances)
        ? allowances
            .filter(
              (a) =>
                a?.type &&
                a?.amount !== undefined &&
                a?.amount !== null &&
                toFixedAmount(a.amount) > 0,
            )
            .map((a) => ({
              type: String(a.type).trim(),
              amount: toFixedAmount(a.amount),
            }))
        : [];

      const finalTotalAllowance =
        allowanceNum > 0
          ? allowanceNum
          : processedAllowances.reduce((sum, a) => sum + a.amount, 0);

      const userId = req.user?._id || req.user?.id;

      try {
        const payroll = new Payroll({
          employeeId: new mongoose.Types.ObjectId(employeeId),
          period,
          basicSalary: basicNum,
          adjustedBasicSalary: basicNum,
          extraTimeAmount: 0,
          allowances: processedAllowances,
          totalAllowance: finalTotalAllowance,
          deductions: deductionNum,
          netSalary: netSalaryValue,
          status,
          paymentMethod,
          bankAccount,
          remarks,
          payrollType,
          sources: [],
          createdBy: userId ? new mongoose.Types.ObjectId(userId) : null,
        });
        await payroll.save({ session });
        results.push({
          id: payroll._id,
          code: payroll.payrollCode,
          employee: employee.medicalRepName,
        });
      } catch (saveError) {
        const msg =
          saveError.name === "ValidationError"
            ? Object.values(saveError.errors)
                .map((e) => e.message)
                .join("; ")
            : saveError.message;
        errors.push({
          index: i,
          message: `Record ${i + 1} (${employee.medicalRepName}): ${msg}`,
        });
      }
    }

    if (results.length === 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "No records saved.", errors });
    }

    await session.commitTransaction();

    await logActivity(req, {
      action: "IMPORT",
      actionLabel: `Bulk Created ${results.length} Payroll(s)`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      description: `Created ${results.length} payroll records. Failed: ${errors.length}.`,
      newData: {
        createdCount: results.length,
        failedCount: errors.length,
        createdList: results.map((r) => r.code),
      },
    });

    return res.status(201).json({
      success: true,
      message: `${results.length} record(s) created${errors.length > 0 ? `, ${errors.length} skipped` : ""}`,
      data: {
        created: results.length,
        skipped: errors.length,
        records: results,
        ...(errors.length > 0 && { errors }),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      message: "Bulk payroll failed",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// PUT /:id
// ─────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const {
      basicSalary,
      allowances,
      deductions,
      status,
      paymentMethod,
      bankAccount,
      remarks,
      enabled,
    } = req.body;

    const previousRecord = await Payroll.findById(req.params.id)
      .populate("employeeId", "medicalRepName")
      .lean();
    if (!previousRecord) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });
    }

    const payroll = await Payroll.findById(req.params.id).session(session);
    if (!payroll) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });
    }

    if (basicSalary !== undefined)
      payroll.basicSalary = toFixedAmount(basicSalary);
    if (deductions !== undefined)
      payroll.deductions = toFixedAmount(deductions);
    if (status) payroll.status = status;
    if (paymentMethod) payroll.paymentMethod = paymentMethod;
    if (bankAccount !== undefined) payroll.bankAccount = bankAccount;
    if (remarks !== undefined) payroll.remarks = remarks;
    if (enabled !== undefined) payroll.enabled = enabled;

    if (allowances && Array.isArray(allowances)) {
      payroll.allowances = allowances
        .filter((a) => toFixedAmount(a.amount) > 0)
        .map((a) => ({ type: a.type.trim(), amount: toFixedAmount(a.amount) }));
      payroll.totalAllowance = payroll.allowances.reduce(
        (t, a) => t + a.amount,
        0,
      );
    }

    let newNetSalary = toFixedAmount(
      payroll.basicSalary + payroll.totalAllowance - payroll.deductions,
    );
    if (newNetSalary < 0) newNetSalary = 0;
    payroll.netSalary = newNetSalary;

    await payroll.save({ session });
    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
    );
    await session.commitTransaction();

    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Payroll: ${payroll.payrollCode}`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      recordId: payroll._id,
      referenceNumber: payroll.payrollCode,
      previousData: previousRecord,
      newData: payroll.toObject(),
      description: `Payroll ${payroll.payrollCode} for ${toTitleCase(payroll.employeeId?.medicalRepName || "Unknown")} updated. Net Salary: $${toFixedAmount(previousRecord.netSalary || 0).toFixed(2)} → $${payroll.netSalary.toFixed(2)}`,
      refField: "payrollCode",
    });

    const basicPayrollRec = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id,
    });
    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
      responseData.employeeBasicSalary = toFixedAmount(
        basicPayrollRec?.currentBasicSalary || 0,
      );
    }
    responseData.displayBasicSalary = responseData.basicSalary;
    res.status(200).json({
      success: true,
      message: "Payroll updated successfully",
      data: responseData,
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    if (error.name === "ValidationError")
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((v) => v.message),
      });
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid payroll ID" });
    res.status(500).json({
      success: false,
      message: "Failed to update payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// DELETE /:id — Single payroll (also deletes linked transactions and expenses)
// ─────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    console.log(`🔍 Finding payroll with ID: ${req.params.id}`);
    const payroll = await Payroll.findById(req.params.id)
      .populate("employeeId", "medicalRepName")
      .lean();

    if (!payroll) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });
    }

    console.log(`\n🗑️ DELETING PAYROLL: ${payroll.payrollCode}`);
    console.log(`   Payroll ID: ${payroll._id}`);
    console.log(`   Net Salary: ${payroll.netSalary}`);
    console.log(`   Stored sources: ${(payroll.sources || []).length}`);

    // ── Restore account balances (uses payroll.sources, falls back to txns) ──
    const { totalRestored, restoredDetails } =
      await restoreAccountBalancesFromSources(payroll, session);

    // ── Delete associated transactions (including isPayroll flagged) ──
    const txnDeleteResult = await Transaction.deleteMany({
      $or: [{ payrollId: payroll._id }, { payrollCode: payroll.payrollCode }],
      transactionType: "payment outward",
    }).session(session);
    const transactionsDeleted = txnDeleteResult.deletedCount || 0;
    console.log(`   ✅ Deleted ${transactionsDeleted} transaction(s)`);

    // ── Delete associated expenses (including isPayroll flagged) ──
    const expenseDeleteResult = await Expense.deleteMany({
      $or: [{ payrollId: payroll._id }, { payrollCode: payroll.payrollCode }],
    }).session(session);
    const expensesDeleted = expenseDeleteResult.deletedCount || 0;
    console.log(`   ✅ Deleted ${expensesDeleted} expense(s)`);

    // ── Delete the payroll itself ──
    await Payroll.findByIdAndDelete(req.params.id).session(session);
    console.log(`   ✅ Payroll record deleted`);

    await session.commitTransaction();
    console.log(`✅ Transaction committed`);

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Payroll: ${payroll.payrollCode}`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      recordId: payroll._id,
      referenceNumber: payroll.payrollCode,
      previousData: payroll,
      description: `Payroll ${payroll.payrollCode} for ${toTitleCase(payroll.employeeId?.medicalRepName || "Unknown")} (${payroll.period}) deleted. Restored $${totalRestored.toFixed(2)} to source accounts. Deleted ${transactionsDeleted} transaction(s) and ${expensesDeleted} expense(s).`,
      refField: "payrollCode",
    });

    res.status(200).json({
      success: true,
      message:
        "Payroll deleted successfully. Source account balances restored.",
      data: {
        id: req.params.id,
        restoredAmount: totalRestored,
        restoredDetails,
        transactionsDeleted,
        expensesDeleted,
      },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    console.error("Error deleting payroll:", error);
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid payroll ID" });
    res.status(500).json({
      success: false,
      message: "Failed to delete payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// DELETE / — Bulk delete payrolls
// ─────────────────────────────────────────────
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Array of payroll IDs required" });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res
        .status(400)
        .json({ success: false, message: "Some IDs are invalid" });
    }

    const toDelete = await Payroll.find({ _id: { $in: validIds } })
      .populate("employeeId", "medicalRepName")
      .lean();

    if (toDelete.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No payrolls found" });
    }

    let totalRestoredAmount = 0;
    let totalTransactionsDeleted = 0;
    let totalExpensesDeleted = 0;
    const allRestoredDetails = [];

    for (const payroll of toDelete) {
      console.log(
        `\n🗑️ Processing payroll: ${payroll.payrollCode} (ID: ${payroll._id})`,
      );

      // Restore source account balances
      const { totalRestored, restoredDetails } =
        await restoreAccountBalancesFromSources(payroll, session);

      totalRestoredAmount += totalRestored;
      allRestoredDetails.push(...restoredDetails);

      // Delete transactions (including isPayroll flagged)
      const txnResult = await Transaction.deleteMany({
        $or: [{ payrollId: payroll._id }, { payrollCode: payroll.payrollCode }],
        transactionType: "payment outward",
      }).session(session);
      totalTransactionsDeleted += txnResult.deletedCount || 0;

      // Delete expenses (including isPayroll flagged)
      const expResult = await Expense.deleteMany({
        $or: [{ payrollId: payroll._id }, { payrollCode: payroll.payrollCode }],
      }).session(session);
      totalExpensesDeleted += expResult.deletedCount || 0;
    }

    // Delete all payroll records
    const result = await Payroll.deleteMany({ _id: { $in: validIds } }).session(
      session,
    );

    await session.commitTransaction();

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Payroll(s)`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      previousData: toDelete,
      description: `Deleted ${result.deletedCount} payrolls. Restored $${totalRestoredAmount.toFixed(2)} to source accounts. Deleted ${totalTransactionsDeleted} transaction(s) and ${totalExpensesDeleted} expense(s).`,
      refField: "payrollCode",
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} payroll(s) deleted successfully. Restored $${totalRestoredAmount.toFixed(2)} to source accounts.`,
      data: {
        deletedCount: result.deletedCount,
        restoredAmount: totalRestoredAmount,
        restoredDetails: allRestoredDetails.slice(0, 20),
        transactionsDeleted: totalTransactionsDeleted,
        expensesDeleted: totalExpensesDeleted,
      },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    console.error("Error deleting payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete payrolls",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// GET /export — Excel export
// ─────────────────────────────────────────────
router.get("/export", protect, allowAdminOnly, async (req, res) => {
  try {
    const { search = "", status = "", period = "" } = req.query;
    const matchConditions = { enabled: true };
    if (status && status !== "all") matchConditions.status = status;
    if (period) {
      if (period.endsWith("-YTD"))
        matchConditions.period = {
          $regex: `^${period.split("-")[0]}-`,
          $options: "i",
        };
      else if (period !== "all") matchConditions.period = period;
    }
    let searchConditions = {};
    if (search?.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      const staffIds = (
        await Staff.find({
          $or: [
            { medicalRepName: searchRegex },
            { teamName: searchRegex },
            { contactNo: searchRegex },
            { email: searchRegex },
          ],
        }).select("_id")
      ).map((s) => s._id);
      searchConditions = {
        $or: [
          { payrollCode: searchRegex },
          { paymentMethod: searchRegex },
          { employeeId: { $in: staffIds } },
        ],
      };
    }
    const finalConditions = {
      ...matchConditions,
      ...(Object.keys(searchConditions).length > 0 ? searchConditions : {}),
    };
    const payrolls = await Payroll.find(finalConditions)
      .populate("employeeId", "medicalRepName teamName")
      .sort({ createdAt: -1 })
      .lean();

    const data = payrolls.map((p) => ({
      "Payroll Code": p.payrollCode,
      "Employee Name": p.employeeId?.medicalRepName || "Unknown",
      Team: p.employeeId?.teamName || "Unknown",
      Period: p.period,
      "Basic Salary": toFixedAmount(p.basicSalary),
      "Total Allowance": toFixedAmount(p.totalAllowance),
      Deductions: toFixedAmount(p.deductions),
      "Net Salary": toFixedAmount(p.netSalary),
      Status: p.status,
      "Payment Method": p.paymentMethod,
      "Payment Date": p.paymentDate ? formatDateForLog(p.paymentDate) : "",
      "Created At": formatDateForLog(p.createdAt),
    }));

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Payrolls");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await logActivity(req, {
      action: "EXPORT",
      actionLabel: `Exported Payroll List (${payrolls.length} records)`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      description: `Exported ${payrolls.length} payroll records to Excel`,
      newData: { count: payrolls.length },
    });

    res.setHeader("Content-Disposition", "attachment; filename=payrolls.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (error) {
    console.error("Export error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to export payrolls" });
  }
});

export default router;
