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

// Utility helpers
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
  const d = new Date(date);
  return d.toISOString().split("T")[0];
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
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
    return result[0]?.total || 0;
  } catch {
    return 0;
  }
};

const calculateSalaryForPeriod = async (employeeId, period, session = null) => {
  const employee = await Staff.findById(employeeId).session(session);
  if (!employee) throw new Error("Employee not found in staff records");

  const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
    session,
  );
  if (!basicPayroll)
    throw new Error("Basic payroll record not found for employee");

  const fullBasicSalary = parseFloat(basicPayroll.currentBasicSalary || 0);

  const [year, month] = period.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const actualDaysInMonth = new Date(year, month, 0).getDate();
  const perDaySalary = fullBasicSalary / actualDaysInMonth;
  const perMinuteSalary = perDaySalary / (8 * 60);

  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const calculationEndDate = isCurrentMonth
    ? (() => {
        const d = new Date(now);
        d.setUTCHours(23, 59, 59, 999);
        return d;
      })()
    : year < now.getFullYear() || month < now.getMonth() + 1
      ? endDate
      : startDate;

  let totalWorkingDaysInMonth = 0;
  let workingDaysUntilCalculation = 0;
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      totalWorkingDaysInMonth++;
      if (d <= calculationEndDate) workingDaysUntilCalculation++;
    }
  }

  const attendanceRecords = await Attendance.find({
    userId: employeeId,
    loginTime: { $gte: startDate, $lte: calculationEndDate },
  }).session(session || null);

  const leaveRecords = await Leave.find({
    userId: employeeId,
    leaveDate: { $gte: startDate, $lte: calculationEndDate },
    status: "approved",
  }).session(session || null);

  let totalLeaveDays = 0,
    paidLeaveDays = 0,
    unpaidLeaveDays = 0,
    swapLeaveDays = 0;
  const leaveDatesSet = new Set();
  for (const leave of leaveRecords) {
    const leaveDate = new Date(leave.leaveDate);
    const dateStr = leaveDate.toISOString().split("T")[0];
    const dow = leaveDate.getUTCDay();
    if (dow !== 0 && dow !== 6 && !leaveDatesSet.has(dateStr)) {
      leaveDatesSet.add(dateStr);
      totalLeaveDays++;
      if (leave.leaveType === "unpaid") unpaidLeaveDays++;
      else if (leave.leaveType === "paid") paidLeaveDays++;
      else if (leave.leaveType === "swapleave") {
        swapLeaveDays++;
        paidLeaveDays++;
      } else if (["holiday", "sunday"].includes(leave.leaveType))
        paidLeaveDays++;
    }
  }

  const presentDaysSet = new Set();
  attendanceRecords.forEach((r) =>
    presentDaysSet.add(r.loginTime.toISOString().split("T")[0]),
  );
  const presentDays = presentDaysSet.size;

  let totalExtraMinutes = 0;
  const attendanceByDate = {};
  attendanceRecords.forEach((r) => {
    const ds = r.loginTime.toISOString().split("T")[0];
    if (!attendanceByDate[ds]) attendanceByDate[ds] = [];
    attendanceByDate[ds].push(r);
  });
  Object.values(attendanceByDate).forEach((records) => {
    const totalMinutes = records.reduce(
      (sum, r) =>
        r.loginTime && r.logoutTime
          ? sum + (new Date(r.logoutTime) - new Date(r.loginTime)) / 60000
          : sum,
      0,
    );
    if (totalMinutes > 480) totalExtraMinutes += totalMinutes - 480;
  });

  const extraTimeAmount = totalExtraMinutes * perMinuteSalary;
  const daysWorked = presentDays - unpaidLeaveDays;

  const adjustedBasicSalary =
    (daysWorked / actualDaysInMonth) * fullBasicSalary;

  const advanceDeduction = await getPendingAdvance(employeeId, session);

  let totalSalary = adjustedBasicSalary + extraTimeAmount - advanceDeduction;
  if (totalSalary < 0) totalSalary = 0;

  return {
    employee: {
      id: employee._id,
      name: employee.medicalRepName,
      basicSalary: fullBasicSalary,
    },
    period,
    isCurrentMonth,
    salaryCalculation: {
      basicSalary: fullBasicSalary,
      perDaySalary,
      perMinuteSalary,
      actualDaysInMonth,
      totalDaysInMonth: actualDaysInMonth,
      totalWorkingDaysInMonth,
      workingDaysUntilCalculation,
      presentDays,
      totalLeaves: totalLeaveDays,
      paidLeaves: paidLeaveDays,
      unpaidLeaves: unpaidLeaveDays,
      swapLeaves: swapLeaveDays,
      leaveDeduction: unpaidLeaveDays * perDaySalary,
      adjustedBasicSalary,
      extraMinutes: totalExtraMinutes,
      extraTimeAmount,
      advanceDeduction,
      totalSalary,
      calculationStartDate: startDate.toISOString().split("T")[0],
      calculationEndDate: calculationEndDate.toISOString().split("T")[0],
      isCurrentMonth,
    },
  };
};

// ─────────────────────────────────────────────
// HELPER: Get "Withdraw" category
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

// ─────────────────────────────────────────────
// HELPER: Get "Salary" category
// ─────────────────────────────────────────────
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
      _salaryCategory = {
        _id: category._id,
        name: category.category,
      };
      return _salaryCategory;
    }

    console.warn(
      "⚠️ 'Salary Expenses' category not found, falling back to Withdraw",
    );
    return await getWithdrawCategory(session);
  } catch (err) {
    console.warn("Could not load ExpenseCategory model:", err.message);
    return await getWithdrawCategory(session);
  }
};

// ─────────────────────────────────────────────
// HELPER: Create Cash & Bank Transaction + Expense
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
  const payrollDate = new Date();
  const remarks = `Salary payment - ${employeeName} (${period})`;

  const withdrawCategory = await getWithdrawCategory(session);
  const salaryCategory = await getSalaryCategory(session);

  // ── 1. One Transaction per source account ─────────────────────────────
  for (const { account, amount } of sourceAccounts) {
    const txn = new Transaction({
      categoryType: withdrawCategory.name,
      sourceAccount: account.name || account.code || "Unknown Account",
      source: account._id,
      destination: null,
      supplier: employeeId,
      date: payrollDate,
      amount: amount,
      exchangeLoss: 0,
      finalAmount: amount,
      accountType: "Company Account",
      remarks: remarks,
      description: remarks,
      invoiceNo: "NA",
      isConversionLoss: false,
      transactionType: "payment outward",
      importStatus: "imported",
      importErrors: [],
    });

    await txn.save({ session });
    console.log(
      `✅ Transaction created | Account: ${account.name} | Amount: ${amount} | ID: ${txn._id}`,
    );
  }

  // ── 2. Single Expense entry (net salary only) ──
  const resolvedCategoryId = salaryCategory._id || withdrawCategory._id;

  if (resolvedCategoryId) {
    const resolvedSourceAccountId = sourceAccounts[0]?.account?._id || null;

    const expenseAmount = Number(payrollNetSalary).toFixed(2);

    const expense = new Expense({
      category: resolvedCategoryId,
      categoryType: resolvedCategoryId,
      amount: parseFloat(expenseAmount),
      finalAmount: parseFloat(expenseAmount),
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
      sourceAccount: resolvedSourceAccountId,
      sources: sourceAccounts.map(({ account, amount }) => ({
        accountId: account._id,
        accountName: account.name || account.code || "Unknown Account",
        amount: amount,
        finalAmount: amount,
      })),
    });

    await expense.save({ session });
    console.log(
      `✅ Expense created | Category: ${salaryCategory.name} | Payroll: ${payrollCode} | Amount: ${expense.amount} | ID: ${expense._id}`,
    );
  } else {
    console.warn(
      `⚠️ No valid Salary/Withdraw category found. Skipping expense for payroll ${payrollCode}.`,
    );
  }
};

// ─────────────────────────────────────────────
// ROUTES
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
        currentBasicSalary: basicPayroll.currentBasicSalary || 0,
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

router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      period = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    const pageNum = parseInt(page),
      limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

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

    const payrolls = await Payroll.find(finalConditions)
      .populate(
        "employeeId",
        "medicalRepName teamName contactNo email date enabled MRId",
      )
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const employeeIds = payrolls.map((p) => p.employeeId?._id).filter(Boolean);
    const basicPayrolls = await MrBasicPayroll.find({
      employeeId: { $in: employeeIds },
    }).lean();
    const basicSalaryMap = {};
    basicPayrolls.forEach(
      (bp) => (basicSalaryMap[bp.employeeId] = bp.currentBasicSalary || 0),
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
      obj.displayBasicSalary =
        obj.payrollType === "current" && obj.adjustedBasicSalary != null
          ? obj.adjustedBasicSalary
          : obj.basicSalary;
      return obj;
    });

    const total = await Payroll.countDocuments(finalConditions);
    const nextPayrollCode = await generateNextPayrollCode();
    res.status(200).json({
      success: true,
      data: transformedPayrolls,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
      nextPayrollCode,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payrolls",
      error: error.message,
    });
  }
});

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
      (bp) => (basicSalaryMap[bp.employeeId] = bp.currentBasicSalary || 0),
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
      obj.displayBasicSalary =
        obj.payrollType === "current" && obj.adjustedBasicSalary != null
          ? obj.adjustedBasicSalary
          : obj.basicSalary;
      obj.allowancesCSV = obj.allowances
        ? obj.allowances.map((a) => `${a.type}: $${a.amount}`).join("; ")
        : "";
      return obj;
    });
    const fields = [
      { label: "Payroll Code", value: "payrollCode" },
      { label: "Employee Name", value: "employeeName" },
      { label: "Team", value: "teamName" },
      { label: "Period", value: "period" },
      { label: "Basic Salary", value: "basicSalary" },
      { label: "Adjusted Basic", value: "displayBasicSalary" },
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

router.get("/calculate/:employeeId/:period", async (req, res) => {
  try {
    const { employeeId, period } = req.params;
    if (!/^\d{4}-\d{2}$/.test(period))
      return res
        .status(400)
        .json({ success: false, message: "Period must be YYYY-MM" });
    const calculation = await calculateSalaryForPeriod(employeeId, period);
    res.status(200).json({ success: true, data: calculation });
  } catch (error) {
    if (
      [
        "Employee not found in staff records",
        "Basic payroll record not found for employee",
      ].includes(error.message)
    )
      return res.status(404).json({ success: false, message: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to calculate salary",
      error: error.message,
    });
  }
});

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
      label: `${account.name || account.code || "Account"} ($${(account.totalAmount || account.balance || 0).toFixed(2)})`,
      balance: account.totalAmount || account.balance || 0,
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
      data.employeeBasicSalary = basicPayroll?.currentBasicSalary || 0;
    }
    data.displayBasicSalary =
      data.payrollType === "current" && data.adjustedBasicSalary != null
        ? data.adjustedBasicSalary
        : data.basicSalary;
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
// POST / — Create payroll with activity logging
// ─────────────────────────────────────────────
router.post("/", protect, allowAdminOnly, async (req, res) => {
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
      paymentDate,
      remarks,
      sources,
    } = req.body;

    if (!employeeId || !period) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and period are required",
      });
    }

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res
        .status(400)
        .json({ success: false, message: "Period must be YYYY-MM" });
    }

    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one source account is required",
      });
    }

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (!src.accountId) {
        return res.status(400).json({
          success: false,
          message: `Source at index ${i} missing accountId`,
        });
      }
      if (!mongoose.Types.ObjectId.isValid(src.accountId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid accountId at index ${i}: ${src.accountId}`,
        });
      }
      if (src.amount === undefined || src.amount === null) {
        return res.status(400).json({
          success: false,
          message: `Source at index ${i} missing amount`,
        });
      }
      const amountNum = parseFloat(src.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          success: false,
          message: `Source at index ${i} must have a positive amount`,
        });
      }
    }

    const employee = await Staff.findById(employeeId).session(session);
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
      session,
    );
    if (!basicPayroll) {
      return res.status(404).json({
        success: false,
        message: "Basic payroll not found. Set basic salary first.",
      });
    }

    const existingPayroll = await Payroll.findOne({
      employeeId,
      period,
    }).session(session);
    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message: "Payroll already exists for this employee in this period",
      });
    }

    const salaryData = await calculateSalaryForPeriod(
      employeeId,
      period,
      session,
    );
    const sc = salaryData.salaryCalculation;
    const adjustedBasicSalaryNum = sc.adjustedBasicSalary;
    const fullBasicSalaryNum = sc.basicSalary;
    const advanceDeduction = sc.advanceDeduction;
    const leaveDeduction = sc.leaveDeduction;
    const extraTimeAmount = sc.extraTimeAmount;

    let totalAllowance = 0;
    const processedAllowances = [];
    if (allowances && Array.isArray(allowances)) {
      for (const allowance of allowances) {
        if (!allowance.type || allowance.amount === undefined) {
          return res.status(400).json({
            success: false,
            message: "Each allowance must have type and amount",
          });
        }
        const amt = parseFloat(allowance.amount);
        if (isNaN(amt) || amt < 0) {
          return res.status(400).json({
            success: false,
            message: "Allowance amount must be non-negative",
          });
        }
        totalAllowance += amt;
        processedAllowances.push({ type: allowance.type.trim(), amount: amt });
      }
    }

    const deductionsNum = parseFloat(deductions) || 0;

    const calculatedNetSalary = Math.max(
      0,
      adjustedBasicSalaryNum +
        extraTimeAmount +
        totalAllowance -
        deductionsNum -
        advanceDeduction,
    );

    const sourcesTotal = sources.reduce(
      (s, src) => s + (parseFloat(src.amount) || 0),
      0,
    );

    const netSalary = calculatedNetSalary;

    // Deduct from each source account balance
    const sourceAccounts = [];
    for (const src of sources) {
      const account = await Account.findById(src.accountId).session(session);
      if (!account)
        throw new Error(`Source account ${src.accountId} not found`);
      const amount = parseFloat(src.amount);
      if (account.totalAmount < amount) {
        throw new Error(
          `Insufficient balance in ${account.name}. Available: ${account.totalAmount}, Required: ${amount}`,
        );
      }
      account.totalAmount -= amount;
      await account.save({ session });
      sourceAccounts.push({ account, amount });
    }

    const payrollCode = await generateNextPayrollCode(session);

    const payroll = new Payroll({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      period: period,
      basicSalary: fullBasicSalaryNum,
      adjustedBasicSalary: adjustedBasicSalaryNum,
      extraTimeAmount: extraTimeAmount || 0,
      allowances: processedAllowances,
      totalAllowance: totalAllowance,
      deductions: deductionsNum,
      netSalary: netSalary,
      status: status || "pending",
      paymentMethod: paymentMethod || "bank",
      bankAccount: bankAccount || "",
      paymentDate: paymentDate || null,
      remarks: remarks || "",
      payrollCode: payrollCode,
      payrollType: "current",
      source: null,
      createdBy: req.user?._id
        ? new mongoose.Types.ObjectId(req.user._id)
        : null,
      attendanceInfo: {
        totalWorkingDays: sc.totalWorkingDaysInMonth || 0,
        workingDaysUntilCalculationDate: sc.workingDaysUntilCalculation || 0,
        presentDays: sc.presentDays || 0,
        totalLeaves: sc.totalLeaves || 0,
        paidLeaves: sc.paidLeaves || 0,
        unpaidLeaves: sc.unpaidLeaves || 0,
        swapLeaves: sc.swapLeaves || 0,
        perDaySalary: sc.perDaySalary || 0,
        perMinuteSalary: sc.perMinuteSalary || 0,
        leaveDeduction: leaveDeduction || 0,
        extraMinutes: sc.extraMinutes || 0,
        extraTimeAmount: extraTimeAmount || 0,
        calculationDate: sc.calculationEndDate || null,
      },
    });

    await payroll.save({ session });

    const savedNetSalary = netSalary;
    const savedPayrollCode = payroll.payrollCode;
    const savedPayrollId = payroll._id;
    const savedEmployeeId = payroll.employeeId;
    const savedCreatedBy = payroll.createdBy;

    if (advanceDeduction > 0) {
      await MrAdvance.updateMany(
        { employeeId, status: "pending" },
        { $set: { status: "adjusted" } },
        { session },
      );
    }

    await createPayrollFinancialRecords({
      payrollNetSalary: savedNetSalary,
      payrollCode: savedPayrollCode,
      payrollId: savedPayrollId,
      employeeId: savedEmployeeId,
      employeeName: employee.medicalRepName,
      period: period,
      sourceAccounts: sourceAccounts,
      createdBy: savedCreatedBy,
      session: session,
    });

    await session.commitTransaction();

    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
    );

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Payroll: ${payrollCode} for ${toTitleCase(employee.medicalRepName)}`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      recordId: payroll._id,
      referenceNumber: payrollCode,
      newData: payroll.toObject(),
      description: `Payroll ${payrollCode} created for ${toTitleCase(employee.medicalRepName)} for period ${period}. Net Salary: ₹${netSalary.toFixed(2)}`,
      refField: "payrollCode",
    });

    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
      responseData.employeeBasicSalary = basicPayroll.currentBasicSalary;
    }
    responseData.displayBasicSalary = adjustedBasicSalaryNum;

    res.status(201).json({
      success: true,
      message:
        "Payroll created successfully. Cash & bank statement and expense entry recorded.",
      data: responseData,
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    console.error("Payroll creation error:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((v) => v.message),
      });
    }
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Payroll already exists for this period",
      });
    }
    if (error.message.includes("Insufficient balance")) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message.includes("not found")) {
      return res.status(404).json({ success: false, message: error.message });
    }
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
// POST /bulk — Create multiple payrolls with activity logging
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

      const basicNum = parseFloat(basicSalary) || 0;
      const allowanceNum = parseFloat(totalAllowance) || 0;
      const deductionNum = parseFloat(deductions) || 0;

      let netSalaryValue;
      if (
        netSalary !== undefined &&
        netSalary !== null &&
        !isNaN(parseFloat(netSalary))
      ) {
        netSalaryValue = parseFloat(netSalary);
      } else {
        netSalaryValue = basicNum + allowanceNum - deductionNum;
      }

      if (netSalaryValue < 0) netSalaryValue = 0;

      const processedAllowances = Array.isArray(allowances)
        ? allowances
            .filter(
              (a) => a?.type && a?.amount !== undefined && a?.amount !== null,
            )
            .map((a) => ({
              type: String(a.type).trim(),
              amount: parseFloat(a.amount) || 0,
            }))
        : [];

      const finalTotalAllowance =
        allowanceNum > 0
          ? allowanceNum
          : processedAllowances.reduce((sum, a) => sum + a.amount, 0);

      try {
        const payroll = new Payroll({
          employeeId: new mongoose.Types.ObjectId(employeeId),
          period: period,
          basicSalary: basicNum,
          adjustedBasicSalary: basicNum,
          extraTimeAmount: 0,
          allowances: processedAllowances,
          totalAllowance: finalTotalAllowance,
          deductions: deductionNum,
          netSalary: netSalaryValue,
          status: status || "pending",
          paymentMethod: paymentMethod || "bank",
          bankAccount: bankAccount || "",
          remarks: remarks || "",
          payrollType: payrollType || "previous",
          source: null,
        });

        await payroll.save({ session });
        results.push({
          id: payroll._id,
          code: payroll.payrollCode,
          employee: employee.medicalRepName,
        });
      } catch (saveError) {
        console.error(`Save error for record ${i + 1}:`, saveError);
        const msg =
          saveError.name === "ValidationError"
            ? Object.values(saveError.errors)
                .map((e) => e.message)
                .join("; ")
            : saveError.message;
        errors.push({
          index: i,
          message: `Record ${i + 1} (${employee.medicalRepName}): ${msg}`,
          details: saveError.errors ? Object.keys(saveError.errors) : undefined,
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

    // Log bulk activity
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
    console.error("Bulk payroll error:", error);
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
// PUT /:id — Update payroll with activity logging
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
      paymentDate,
      remarks,
      enabled,
    } = req.body;

    // Get previous record for logging
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
      payroll.basicSalary = parseFloat(basicSalary);
    if (deductions !== undefined) payroll.deductions = parseFloat(deductions);
    if (status) payroll.status = status;
    if (paymentMethod) payroll.paymentMethod = paymentMethod;
    if (bankAccount !== undefined) payroll.bankAccount = bankAccount;
    if (paymentDate !== undefined) payroll.paymentDate = paymentDate;
    if (remarks !== undefined) payroll.remarks = remarks;
    if (enabled !== undefined) payroll.enabled = enabled;

    if (allowances && Array.isArray(allowances)) {
      payroll.allowances = allowances.map((a) => ({
        type: a.type.trim(),
        amount: parseFloat(a.amount),
      }));
      payroll.totalAllowance = payroll.allowances.reduce(
        (t, a) => t + a.amount,
        0,
      );
    }

    const baseForNet =
      payroll.payrollType === "current" && payroll.adjustedBasicSalary != null
        ? payroll.adjustedBasicSalary
        : payroll.basicSalary;
    let newNetSalary = baseForNet + payroll.totalAllowance - payroll.deductions;
    if (newNetSalary < 0) newNetSalary = 0;
    payroll.netSalary = newNetSalary;

    await payroll.save({ session });
    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
    );
    await session.commitTransaction();

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Payroll: ${payroll.payrollCode}`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      recordId: payroll._id,
      referenceNumber: payroll.payrollCode,
      previousData: previousRecord,
      newData: payroll.toObject(),
      description: `Payroll ${payroll.payrollCode} for ${toTitleCase(payroll.employeeId?.medicalRepName || "Unknown")} was updated. Net Salary changed from ₹${previousRecord.netSalary?.toFixed(2) || 0} to ₹${payroll.netSalary.toFixed(2)}`,
      refField: "payrollCode",
    });

    const basicPayrollRec = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id,
    });
    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
      responseData.employeeBasicSalary =
        basicPayrollRec?.currentBasicSalary || 0;
    }
    responseData.displayBasicSalary =
      responseData.payrollType === "current" &&
      responseData.adjustedBasicSalary != null
        ? responseData.adjustedBasicSalary
        : responseData.basicSalary;
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
// DELETE /:id — Delete single payroll with activity logging
// ─────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    // Get full record before deletion for logging
    const payroll = await Payroll.findById(req.params.id)
      .populate("employeeId", "medicalRepName")
      .lean();
    if (!payroll) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });
    }

    await Payroll.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Payroll: ${payroll.payrollCode}`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      recordId: payroll._id,
      referenceNumber: payroll.payrollCode,
      previousData: payroll,
      description: `Payroll ${payroll.payrollCode} for ${toTitleCase(payroll.employeeId?.medicalRepName || "Unknown")} (${payroll.period}) permanently deleted`,
      refField: "payrollCode",
    });

    res.status(200).json({
      success: true,
      message: "Payroll deleted successfully",
      data: { id: req.params.id },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
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
// DELETE / — Bulk delete payrolls with activity logging
// ─────────────────────────────────────────────
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "Array of payroll IDs required" });
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length)
      return res
        .status(400)
        .json({ success: false, message: "Some IDs are invalid" });

    // Get full records before deletion for logging
    const toDelete = await Payroll.find({ _id: { $in: validIds } })
      .populate("employeeId", "medicalRepName")
      .lean();

    if (toDelete.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "No payrolls found" });

    const result = await Payroll.deleteMany({ _id: { $in: validIds } }).session(
      session,
    );
    await session.commitTransaction();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Payroll(s)`,
      tableName: "payrolls",
      tableLabel: "Payroll",
      previousData: toDelete,
      description: `Deleted ${result.deletedCount} payrolls: ${toDelete.map((p) => p.payrollCode).join(", ")}`,
      refField: "payrollCode",
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} payroll(s) deleted`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
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
// GET /export — Export payrolls with activity logging
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
      "Basic Salary": p.basicSalary,
      "Adjusted Basic": p.adjustedBasicSalary || p.basicSalary,
      "Total Allowance": p.totalAllowance,
      Deductions: p.deductions,
      "Net Salary": p.netSalary,
      Status: p.status,
      "Payment Method": p.paymentMethod,
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
    res.status(500).json({
      success: false,
      message: "Failed to export payrolls",
    });
  }
});

export default router;
