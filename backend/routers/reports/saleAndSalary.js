// routes/reports/salesSalaryRatio.js
import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import Expense from "../../models/expenses/addExpense.js";
import ExpenseCategory from "../../models/expenses/addExpenseCategary.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import stockinmrhands from "../../models/stock/stockInMRHand.js";

const router = express.Router();

// ─── helpers ──────────────────────────────────────────────────────────────────
const getYearMonthFromDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
};

const getPeriodsFromDateRange = (startDate, endDate) => {
  const periods = [];
  let current = new Date(
    new Date(startDate).getFullYear(),
    new Date(startDate).getMonth(),
    1,
  );
  const end = new Date(endDate);
  while (current <= end) {
    periods.push(
      `${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, "0")}`,
    );
    current.setMonth(current.getMonth() + 1);
  }
  return periods;
};

const normalizeMrName = (name) => {
  if (!name) return "";
  let n = name
    .replace(/^(mr|mrs|ms|miss|dr|prof)\s+/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (n.includes("makara")) n = "makara";
  if (n.includes("phanda")) n = "phanda";
  return n;
};

const normalizeNameInJS = (name) => {
  if (!name) return "";
  let n = name.toLowerCase().trim();
  for (const p of ["mr ", "mrs ", "ms ", "miss ", "dr ", "prof "]) {
    if (n.startsWith(p)) {
      n = n.substring(p.length);
      break;
    }
  }
  n = n.replace(/\s+/g, " ").trim();
  if (n.includes("makara")) n = "makara";
  if (n.includes("phanda")) n = "phanda";
  return n;
};

// ── FIX 2: Salary/Sale (%) = (salary / sale) * 100
// The old formula was (sale / totalExpense) * 100 which is wrong.
const calculateSalarySaleRatio = (salary, sale) =>
  sale === 0 ? 0 : (salary / sale) * 100;

const calculatePerformance = (profit, sale) =>
  sale === 0 ? 0 : (profit / sale) * 100;

// ── FIX 1: Make endDate inclusive by setting it to end-of-day (23:59:59.999)
// Without this, "2026-03-31" parsed as midnight UTC is LESS than records
// recorded on that day in local time, causing the last day to be excluded.
const toEndOfDay = (dateStr) => {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
};

const toStartOfDay = (dateStr) => {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
};

// ─── Get tour-related expense category IDs ────────────────────────────────────
const getTourExpenseCategoryIds = async () => {
  try {
    const allCategories = await ExpenseCategory.find({ isActive: true }).select(
      "_id category",
    );
    const tourExpenseCategoryIds = [];
    const tourAllowanceCategoryIds = [];

    for (const cat of allCategories) {
      const name = (cat.category || "").toLowerCase().trim();
      if (name === "tour allowance") {
        tourAllowanceCategoryIds.push(cat._id);
      } else if (
        name.includes("tour petrol") ||
        name.includes("province marketing") ||
        name === "rent expense - vans" ||
        name.includes("van") ||
        name.includes("petrol")
      ) {
        tourExpenseCategoryIds.push(cat._id);
      }
    }
    return { tourExpenseCategoryIds, tourAllowanceCategoryIds };
  } catch (err) {
    console.error("Error fetching expense categories:", err);
    return { tourExpenseCategoryIds: [], tourAllowanceCategoryIds: [] };
  }
};

// ─── main data function ───────────────────────────────────────────────────────
const fetchSalesSalaryData = async (params) => {
  const {
    page = 1,
    limit = 7,
    search = "",
    startDate,
    endDate,
    period,
    dateFilter = "currentMonth",
    export: isExport = false,
  } = params;

  const pageNum = parseInt(page);
  const limitNum = isExport ? 10000 : parseInt(limit);
  const skip = isExport ? 0 : (pageNum - 1) * limitNum;

  // ── FIX 1: Build date conditions using start-of-day / end-of-day
  // so that the full selected day is always included regardless of timezone.
  const salesDateConditions = {};
  if (startDate && endDate) {
    salesDateConditions.recordingDate = {
      $gte: toStartOfDay(startDate),
      $lte: toEndOfDay(endDate), // ← inclusive end-of-day
    };
  } else {
    const now = new Date();
    const y = now.getFullYear(),
      m = now.getMonth();
    switch (dateFilter) {
      case "today": {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        const t2 = new Date(t);
        t2.setDate(t2.getDate() + 1);
        salesDateConditions.recordingDate = { $gte: t, $lt: t2 };
        break;
      }
      case "currentMonth":
        salesDateConditions.recordingDate = {
          $gte: new Date(y, m, 1, 0, 0, 0, 0),
          $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
        break;
      case "janToPreviousMonth":
        salesDateConditions.recordingDate =
          m === 0
            ? {
                $gte: new Date(y - 1, 0, 1, 0, 0, 0, 0),
                $lte: new Date(y - 1, 11, 31, 23, 59, 59, 999),
              }
            : {
                $gte: new Date(y, 0, 1, 0, 0, 0, 0),
                $lte: new Date(y, m, 0, 23, 59, 59, 999),
              };
        break;
      case "all":
        break;
      default:
        salesDateConditions.recordingDate = {
          $gte: new Date(y, m, 1, 0, 0, 0, 0),
          $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
    }
  }

  // ── expense date filter (same range) ──────────────────────────────────────
  const expenseDateConditions = {};
  if (startDate && endDate) {
    expenseDateConditions.date = {
      $gte: toStartOfDay(startDate),
      $lte: toEndOfDay(endDate), // ← inclusive end-of-day
    };
  } else {
    const now = new Date();
    const y = now.getFullYear(),
      m = now.getMonth();
    switch (dateFilter) {
      case "today": {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        const t2 = new Date(t);
        t2.setDate(t2.getDate() + 1);
        expenseDateConditions.date = { $gte: t, $lt: t2 };
        break;
      }
      case "currentMonth":
        expenseDateConditions.date = {
          $gte: new Date(y, m, 1, 0, 0, 0, 0),
          $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
        break;
      case "janToPreviousMonth":
        expenseDateConditions.date =
          m === 0
            ? {
                $gte: new Date(y - 1, 0, 1, 0, 0, 0, 0),
                $lte: new Date(y - 1, 11, 31, 23, 59, 59, 999),
              }
            : {
                $gte: new Date(y, 0, 1, 0, 0, 0, 0),
                $lte: new Date(y, m, 0, 23, 59, 59, 999),
              };
        break;
      case "all":
        break;
      default:
        expenseDateConditions.date = {
          $gte: new Date(y, m, 1, 0, 0, 0, 0),
          $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
    }
  }

  const salesMatchConditions = { ...salesDateConditions };
  if (search?.trim())
    salesMatchConditions.mrName = new RegExp(search.trim(), "i");

  // ── sales aggregation ────────────────────────────────────────────────────
  const [allSalesForSummary, salesAggregate] = await Promise.all([
    SaleSummary.aggregate([
      { $match: salesMatchConditions },
      {
        $addFields: {
          totalProfit: {
            $reduce: {
              input: "$products",
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.profitLoss", 0] }] },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$totalProfit" },
        },
      },
    ]),
    SaleSummary.aggregate([
      { $match: salesMatchConditions },
      {
        $addFields: {
          saleProfit: {
            $reduce: {
              input: "$products",
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.profitLoss", 0] }] },
            },
          },
        },
      },
      {
        $group: {
          _id: { mrName: "$mrName", mrId: "$mrId" },
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$saleProfit" },
          saleCount: { $sum: 1 },
          customers: { $addToSet: "$customerCode" },
          lastSaleDate: { $max: "$recordingDate" },
        },
      },
      {
        $project: {
          _id: 0,
          mrName: "$_id.mrName",
          mrId: "$_id.mrId",
          sale: "$totalSales",
          profit: "$totalProfit",
          saleCount: 1,
          customerCount: { $size: "$customers" },
          lastSaleDate: 1,
        },
      },
      { $sort: { sale: -1 } },
    ]),
  ]);

  const totalSalesFromAllRecords = allSalesForSummary[0]?.totalSales || 0;
  const totalProfitFromAllRecords = allSalesForSummary[0]?.totalProfit || 0;

  // ── group duplicate MR names ─────────────────────────────────────────────
  const groupedSales = {};
  salesAggregate.forEach((rec) => {
    const key = normalizeNameInJS(rec.mrName);
    if (!groupedSales[key]) {
      groupedSales[key] = {
        ...rec,
        normalizedName: key,
        originalNames: [rec.mrName],
        records: [rec],
      };
    } else {
      groupedSales[key].sale += parseFloat(rec.sale) || 0;
      groupedSales[key].profit += parseFloat(rec.profit) || 0;
      groupedSales[key].saleCount += parseInt(rec.saleCount) || 0;
      groupedSales[key].customerCount = Math.max(
        groupedSales[key].customerCount,
        parseInt(rec.customerCount) || 0,
      );
      if (
        rec.lastSaleDate &&
        (!groupedSales[key].lastSaleDate ||
          rec.lastSaleDate > groupedSales[key].lastSaleDate)
      )
        groupedSales[key].lastSaleDate = rec.lastSaleDate;
      if (rec.mrName && !groupedSales[key].originalNames.includes(rec.mrName))
        groupedSales[key].originalNames.push(rec.mrName);
      groupedSales[key].records.push(rec);
    }
  });
  const salesAggregateGrouped = Object.values(groupedSales);

  // ── staff map ────────────────────────────────────────────────────────────
  const allStaffMembers = await Staff.find({}).select(
    "_id medicalRepName employeeId",
  );
  const staffMap = { idToName: {}, nameToId: {}, normalizedNameToId: {} };
  allStaffMembers.forEach((s) => {
    const id = s._id.toString();
    if (s.medicalRepName) {
      staffMap.idToName[id] = s.medicalRepName;
      staffMap.normalizedNameToId[normalizeMrName(s.medicalRepName)] = id;
      staffMap.nameToId[s.medicalRepName.toLowerCase().trim()] = id;
    }
  });

  // ── Get tour expense category IDs ────────────────────────────────────────
  const { tourExpenseCategoryIds, tourAllowanceCategoryIds } =
    await getTourExpenseCategoryIds();

  // ── Tour expenses grouped by mrId ─────────────────────────────────────────
  const tourExpenseByMR = {};
  const tourAllowanceByMR = {};

  if (tourExpenseCategoryIds.length > 0) {
    const tourExpMatchConditions = {
      ...expenseDateConditions,
      mrId: { $ne: null, $exists: true },
      category: { $in: tourExpenseCategoryIds },
    };
    const tourExpAgg = await Expense.aggregate([
      { $match: tourExpMatchConditions },
      {
        $group: {
          _id: "$mrId",
          totalTourExpense: { $sum: "$amount" },
          mrName: { $first: "$mrName" },
        },
      },
    ]);
    tourExpAgg.forEach((r) => {
      if (r._id)
        tourExpenseByMR[r._id.toString()] = {
          total: r.totalTourExpense,
          mrName: r.mrName,
        };
    });
  }

  if (tourAllowanceCategoryIds.length > 0) {
    const tourAllowMatchConditions = {
      ...expenseDateConditions,
      mrId: { $ne: null, $exists: true },
      category: { $in: tourAllowanceCategoryIds },
    };
    const tourAllowAgg = await Expense.aggregate([
      { $match: tourAllowMatchConditions },
      {
        $group: {
          _id: "$mrId",
          totalTourAllowance: { $sum: "$amount" },
          mrName: { $first: "$mrName" },
        },
      },
    ]);
    tourAllowAgg.forEach((r) => {
      if (r._id)
        tourAllowanceByMR[r._id.toString()] = {
          total: r.totalTourAllowance,
          mrName: r.mrName,
        };
    });
  }

  // ── Summary tour totals (all expenses, not just per-MR) ──────────────────
  const summaryTourExpMatchConditions = { ...expenseDateConditions };
  const tourOrConditions = [];
  if (tourExpenseCategoryIds.length > 0)
    tourOrConditions.push({ category: { $in: tourExpenseCategoryIds } });
  tourOrConditions.push({ remarks: { $regex: /tour/i } });
  summaryTourExpMatchConditions.$or = tourOrConditions;

  const [summaryTourExpAgg, summaryTourAllowAgg] = await Promise.all([
    Expense.aggregate([
      { $match: summaryTourExpMatchConditions },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    tourAllowanceCategoryIds.length > 0
      ? Expense.aggregate([
          {
            $match: {
              ...expenseDateConditions,
              category: { $in: tourAllowanceCategoryIds },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
      : Promise.resolve([]),
  ]);

  const summaryTotalTourExpense = summaryTourExpAgg[0]?.total || 0;
  const summaryTotalTourAllowance = summaryTourAllowAgg[0]?.total || 0;

  // ── payroll aggregation ──────────────────────────────────────────────────
  let payrollAggregate = [];
  const allStaffIds = allStaffMembers.map(
    (s) => new mongoose.Types.ObjectId(s._id),
  );

  if (allStaffIds.length > 0) {
    const payrollMatchConditions = { employeeId: { $in: allStaffIds } };

    if (period) {
      payrollMatchConditions.period = period;
    } else if (startDate && endDate) {
      payrollMatchConditions.period = {
        $in: getPeriodsFromDateRange(startDate, endDate),
      };
    } else {
      const now = new Date();
      const currentPeriod = getYearMonthFromDate(now);
      switch (dateFilter) {
        case "today":
        case "currentMonth":
          payrollMatchConditions.period = currentPeriod;
          break;
        case "janToPreviousMonth": {
          const y = now.getFullYear(),
            m = now.getMonth();
          const periods = [];
          if (m === 0) {
            for (let i = 1; i <= 12; i++)
              periods.push(`${y - 1}-${i.toString().padStart(2, "0")}`);
          } else {
            for (let i = 1; i <= m; i++)
              periods.push(`${y}-${i.toString().padStart(2, "0")}`);
          }
          payrollMatchConditions.period = { $in: periods };
          break;
        }
        case "all":
          break;
      }
    }

    payrollAggregate = await Payroll.aggregate([
      { $match: payrollMatchConditions },
      {
        $addFields: {
          effectiveSalary: {
            $cond: {
              if: {
                $and: [
                  { $eq: ["$payrollType", "current"] },
                  { $gt: [{ $ifNull: ["$adjustedBasicSalary", 0] }, 0] },
                ],
              },
              then: "$adjustedBasicSalary",
              else: "$basicSalary",
            },
          },
          allowanceBuckets: {
            $reduce: {
              input: { $ifNull: ["$allowances", []] },
              initialValue: { incentive: 0, other: 0 },
              in: {
                incentive: {
                  $cond: {
                    if: {
                      $eq: [
                        {
                          $toLower: {
                            $trim: { input: { $ifNull: ["$$this.type", ""] } },
                          },
                        },
                        "incentive",
                      ],
                    },
                    then: {
                      $add: [
                        "$$value.incentive",
                        { $ifNull: ["$$this.amount", 0] },
                      ],
                    },
                    else: "$$value.incentive",
                  },
                },
                other: {
                  $cond: {
                    if: {
                      $and: [
                        {
                          $ne: [
                            {
                              $toLower: {
                                $trim: {
                                  input: { $ifNull: ["$$this.type", ""] },
                                },
                              },
                            },
                            "incentive",
                          ],
                        },
                        {
                          $ne: [
                            {
                              $toLower: {
                                $trim: {
                                  input: { $ifNull: ["$$this.type", ""] },
                                },
                              },
                            },
                            "travel allowance",
                          ],
                        },
                        {
                          $ne: [
                            {
                              $toLower: {
                                $trim: {
                                  input: { $ifNull: ["$$this.type", ""] },
                                },
                              },
                            },
                            "tour allowance",
                          ],
                        },
                      ],
                    },
                    then: {
                      $add: [
                        "$$value.other",
                        { $ifNull: ["$$this.amount", 0] },
                      ],
                    },
                    else: "$$value.other",
                  },
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$employeeId",
          salary: { $sum: "$effectiveSalary" },
          incentive: { $sum: "$allowanceBuckets.incentive" },
          allowance: { $sum: "$allowanceBuckets.other" },
          payrollCount: { $sum: 1 },
        },
      },
    ]);
  }

  // ── payroll summary ──────────────────────────────────────────────────────
  const totalPayrollSummary = payrollAggregate.reduce(
    (acc, p) => ({
      totalSalary: acc.totalSalary + (parseFloat(p.salary) || 0),
      totalIncentive: acc.totalIncentive + (parseFloat(p.incentive) || 0),
      totalAllowance: acc.totalAllowance + (parseFloat(p.allowance) || 0),
    }),
    { totalSalary: 0, totalIncentive: 0, totalAllowance: 0 },
  );

  const totalExpenseFromAllRecords =
    totalPayrollSummary.totalSalary +
    totalPayrollSummary.totalIncentive +
    totalPayrollSummary.totalAllowance +
    summaryTotalTourExpense +
    summaryTotalTourAllowance;

  const ratio =
    totalSalesFromAllRecords > 0
      ? parseFloat(
          (totalExpenseFromAllRecords / totalSalesFromAllRecords).toFixed(4),
        )
      : 0;

  const summary = {
    totalSales: parseFloat(totalSalesFromAllRecords) || 0,
    totalSalary: parseFloat(totalPayrollSummary.totalSalary) || 0,
    totalExpense: parseFloat(totalExpenseFromAllRecords) || 0,
    totalProfit: parseFloat(totalProfitFromAllRecords) || 0,
    totalTourExpense: parseFloat(summaryTotalTourExpense) || 0,
    totalTourAllowance: parseFloat(summaryTotalTourAllowance) || 0,
    totalIncentive: parseFloat(totalPayrollSummary.totalIncentive) || 0,
    ratio,
  };

  // ── join sales + payroll + tour expenses per MR ────────────────────────────
  const payrollByStaffId = {};
  payrollAggregate.forEach((p) => {
    payrollByStaffId[p._id.toString()] = p;
  });

  const matchStaff = (record) => {
    const normSales = record.normalizedName;
    if (normSales && staffMap.normalizedNameToId[normSales])
      return staffMap.normalizedNameToId[normSales];
    for (const [sn, sid] of Object.entries(staffMap.normalizedNameToId)) {
      if (sn.includes(normSales) || normSales.includes(sn)) return sid;
    }
    for (const name of record.originalNames || []) {
      if (!name) continue;
      const sid = staffMap.nameToId[name.toLowerCase().trim()];
      if (sid) return sid;
    }
    return null;
  };

  let combinedData = salesAggregateGrouped.map((record) => {
    const staffId = matchStaff(record);
    const payroll = staffId ? payrollByStaffId[staffId] || {} : {};

    const salary = parseFloat(payroll.salary) || 0;
    const incentive = parseFloat(payroll.incentive) || 0;
    const allowance = parseFloat(payroll.allowance) || 0;

    const mrIdFromSale = record.records?.[0]?.mrId;
    const tourExpKey =
      staffId || (mrIdFromSale ? mrIdFromSale.toString() : null);
    const tourExpense = tourExpKey
      ? tourExpenseByMR[tourExpKey]?.total || 0
      : 0;
    const tourAllowance = tourExpKey
      ? tourAllowanceByMR[tourExpKey]?.total || 0
      : 0;

    const sale = parseFloat(record.sale) || 0;
    const profit = parseFloat(record.profit) || 0;
    const totalExpense =
      salary + incentive + allowance + tourExpense + tourAllowance;

    return {
      srDate: record.lastSaleDate || "",
      mrName: record.mrName || "",
      mrId: record.mrId || staffId || "",
      sale,
      profit,
      salary,
      incentive,
      allowance,
      tourExpense,
      tourAllowance,
      totalExpense,
      // FIX 2: (salary / sale) * 100 — was (sale / totalExpense) * 100
      salarySaleRatio: parseFloat(
        calculateSalarySaleRatio(salary, sale).toFixed(2),
      ),
      performance: parseFloat(calculatePerformance(profit, sale).toFixed(2)),
      saleCount: parseInt(record.saleCount) || 0,
      customerCount: parseInt(record.customerCount) || 0,
    };
  });

  // Add staff with payroll but no sales
  Object.entries(staffMap.normalizedNameToId).forEach(([normName, staffId]) => {
    const payroll = payrollByStaffId[staffId];
    if (
      payroll &&
      !combinedData.find((d) => normalizeNameInJS(d.mrName) === normName)
    ) {
      const salary = parseFloat(payroll.salary) || 0;
      const incentive = parseFloat(payroll.incentive) || 0;
      const allowance = parseFloat(payroll.allowance) || 0;
      const tourExpense = tourExpenseByMR[staffId]?.total || 0;
      const tourAllowance = tourAllowanceByMR[staffId]?.total || 0;
      const totalExpense =
        salary + incentive + allowance + tourExpense + tourAllowance;
      const staffEntry = allStaffMembers.find(
        (s) => s._id.toString() === staffId,
      );
      combinedData.push({
        srDate: new Date(),
        mrName: staffEntry?.medicalRepName || normName,
        mrId: staffId,
        sale: 0,
        profit: 0,
        salary,
        incentive,
        allowance,
        tourExpense,
        tourAllowance,
        totalExpense,
        salarySaleRatio: 0,
        performance: 0,
        saleCount: 0,
        customerCount: 0,
      });
    }
  });

  combinedData.sort((a, b) => b.sale - a.sale);

  const totalRecords = combinedData.length;
  const totalPages = Math.ceil(totalRecords / limitNum);

  if (isExport)
    return { success: true, data: { summary, records: combinedData } };
  return {
    success: true,
    data: { summary, records: combinedData.slice(skip, skip + limitNum) },
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalRecords,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
};

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    res.status(200).json(await fetchSalesSalaryData(req.query));
  } catch (error) {
    console.error("Error in sales salary ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales salary ratio data",
      error: error.message,
    });
  }
});

// ─── GET /export ──────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const result = await fetchSalesSalaryData({
      ...req.query,
      export: "true",
      limit: 10000,
    });
    if (!result.success) throw new Error("Failed to fetch data for export");

    const { summary, records } = result.data;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Sales Salary Ratio Report");

    ws.columns = [
      { header: "Sr. No", key: "srNo", width: 8 },
      { header: "MR Name", key: "mrName", width: 25 },
      { header: "Sale ($)", key: "sale", width: 15 },
      { header: "Profit ($)", key: "profit", width: 15 },
      { header: "Salary ($)", key: "salary", width: 15 },
      { header: "Incentive ($)", key: "incentive", width: 15 },
      { header: "Allowance ($)", key: "allowance", width: 15 },
      {
        header: "Tour Expense ($)\nVans+Petrol+Province Mktg",
        key: "tourExpense",
        width: 22,
      },
      {
        header: "Tour Allowance ($)\nDaily Allow. MRs/Drivers",
        key: "tourAllowance",
        width: 22,
      },
      { header: "Total Expense ($)", key: "totalExpense", width: 15 },
      // Updated header to reflect correct formula: salary / sale * 100
      {
        header: "Salary/Sale (%)\n(Salary ÷ Sale × 100)",
        key: "salarySaleRatio",
        width: 22,
      },
      { header: "Performance (%)", key: "performance", width: 15 },
      { header: "Sale Count", key: "saleCount", width: 12 },
      { header: "Customer Count", key: "customerCount", width: 12 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    headerRow.height = 40;

    records.forEach((rec, i) => {
      const row = ws.addRow({
        srNo: i + 1,
        mrName: rec.mrName || "N/A",
        sale: parseFloat(rec.sale) || 0,
        profit: parseFloat(rec.profit) || 0,
        salary: parseFloat(rec.salary) || 0,
        incentive: parseFloat(rec.incentive) || 0,
        allowance: parseFloat(rec.allowance) || 0,
        tourExpense: parseFloat(rec.tourExpense) || 0,
        tourAllowance: parseFloat(rec.tourAllowance) || 0,
        totalExpense: parseFloat(rec.totalExpense) || 0,
        salarySaleRatio: parseFloat(rec.salarySaleRatio) || 0,
        performance: parseFloat(rec.performance) || 0,
        saleCount: rec.saleCount || 0,
        customerCount: rec.customerCount || 0,
      });
      [
        "sale",
        "profit",
        "salary",
        "incentive",
        "allowance",
        "tourExpense",
        "tourAllowance",
        "totalExpense",
      ].forEach((c) => {
        row.getCell(c).numFmt = "$#,##0.00";
      });
      const src = row.getCell("salarySaleRatio");
      src.numFmt = '0.00"%"';
      src.font = {
        color: {
          argb:
            (parseFloat(rec.salarySaleRatio) || 0) > 100
              ? "FFDC2626"
              : "FF16A34A",
        },
      };
      const pfc = row.getCell("performance");
      pfc.numFmt = '0.00"%"';
      pfc.font = {
        color: {
          argb:
            (parseFloat(rec.performance) || 0) >= 0 ? "FF16A34A" : "FFDC2626",
        },
      };
    });

    ws.addRow({});
    const sumRow = ws.addRow({
      mrName: "TOTAL SUMMARY",
      sale: summary.totalSales,
      profit: summary.totalProfit,
      salary: summary.totalSalary,
      tourExpense: summary.totalTourExpense,
      tourAllowance: summary.totalTourAllowance,
      totalExpense: summary.totalExpense,
      salarySaleRatio:
        summary.totalSales > 0
          ? (summary.totalSalary / summary.totalSales) * 100 // FIX 2 applied in export too
          : 0,
    });
    sumRow.font = { bold: true };
    sumRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF3C7" },
    };
    [
      "sale",
      "profit",
      "salary",
      "tourExpense",
      "tourAllowance",
      "totalExpense",
    ].forEach((c) => {
      sumRow.getCell(c).numFmt = "$#,##0.00";
    });
    sumRow.getCell("salarySaleRatio").numFmt = '0.00"%"';

    ws.columns.forEach((col) => {
      col.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });

    const filename = `sales-salary-ratio-${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
  } catch (error) {
    console.error("Error in export:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

// ─── GET /mrs ─────────────────────────────────────────────────────────────────
router.get("/mrs", async (req, res) => {
  try {
    const mrList = await stockinmrhands.aggregate([
      {
        $match: {
          productsInHand: { $exists: true, $ne: [] },
          "productsInHand.quantity": { $gt: 0 },
        },
      },
      {
        $addFields: {
          cleanedMrName: {
            $trim: {
              input: {
                $replaceAll: { input: "$mrName", find: "  ", replacement: " " },
              },
            },
          },
        },
      },
      { $sort: { cleanedMrName: 1 } },
    ]);
    res.status(200).json({ success: true, data: mrList, count: mrList.length });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR list",
      error: error.message,
    });
  }
});

export default router;
