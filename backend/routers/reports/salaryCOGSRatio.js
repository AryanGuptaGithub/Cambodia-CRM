// routes/reports/salaryCOGSRatio.js
import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import Expense from "../../models/expenses/addExpense.js";
import ExpenseCategory from "../../models/expenses/addExpenseCategary.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";

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

// ─── COGS expression ───────────────────────────────────────────────────────────
const cogsExpr = {
  $reduce: {
    input: "$products",
    initialValue: 0,
    in: {
      $add: [
        "$$value",
        {
          $cond: [
            {
              $and: [
                { $ifNull: ["$$this.lc", false] },
                { $ifNull: ["$$this.totalQty", false] },
              ],
            },
            { $multiply: ["$$this.lc", "$$this.totalQty"] },
            {
              $cond: [
                {
                  $and: [
                    { $ifNull: ["$$this.amount", false] },
                    { $ifNull: ["$$this.profitLoss", false] },
                  ],
                },
                { $subtract: ["$$this.amount", "$$this.profitLoss"] },
                0,
              ],
            },
          ],
        },
      ],
    },
  },
};

// ─── Get tour-related expense category IDs ────────────────────────────────────
const getTourExpenseCategoryIds = async () => {
  try {
    const allCategories = await ExpenseCategory.find({ isActive: true }).select(
      "_id category",
    );
    const tourExpenseCategoryIds = []; // Rent Expense-Vans, Tour Petrol Expense, Province Marketing
    const tourAllowanceCategoryIds = []; // Tour Allowance

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

// ─── main fetch ───────────────────────────────────────────────────────────────
const fetchSalaryCOGSData = async (params) => {
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

  // ── sales date filter ──────────────────────────────────────────────────────
  const salesDateConditions = {};
  if (startDate && endDate) {
    salesDateConditions.recordingDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
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
          $gte: new Date(y, m, 1),
          $lte: new Date(y, m + 1, 0),
        };
        break;
      case "janToPreviousMonth":
        salesDateConditions.recordingDate =
          m === 0
            ? { $gte: new Date(y - 1, 0, 1), $lte: new Date(y - 1, 11, 31) }
            : { $gte: new Date(y, 0, 1), $lte: new Date(y, m, 0) };
        break;
      case "all":
        break;
      default:
        salesDateConditions.recordingDate = {
          $gte: new Date(y, m, 1),
          $lte: new Date(y, m + 1, 0),
        };
    }
  }

  // ── expense date filter (same range) ──────────────────────────────────────
  const expenseDateConditions = {};
  if (startDate && endDate) {
    expenseDateConditions.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
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
          $gte: new Date(y, m, 1),
          $lte: new Date(y, m + 1, 0),
        };
        break;
      case "janToPreviousMonth":
        expenseDateConditions.date =
          m === 0
            ? { $gte: new Date(y - 1, 0, 1), $lte: new Date(y - 1, 11, 31) }
            : { $gte: new Date(y, 0, 1), $lte: new Date(y, m, 0) };
        break;
      case "all":
        break;
      default:
        expenseDateConditions.date = {
          $gte: new Date(y, m, 1),
          $lte: new Date(y, m + 1, 0),
        };
    }
  }

  const salesMatchConditions = { ...salesDateConditions };
  if (search?.trim())
    salesMatchConditions.mrName = new RegExp(search.trim(), "i");

  // ── sales aggregations ────────────────────────────────────────────────────
  const [allSalesForSummary, salesAggregate] = await Promise.all([
    SaleSummary.aggregate([
      { $match: salesMatchConditions },
      { $addFields: { totalCOGS: cogsExpr } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalCOGS: { $sum: "$totalCOGS" },
          totalProfit: { $sum: "$totalProfitLoss" },
        },
      },
    ]),
    SaleSummary.aggregate([
      { $match: salesMatchConditions },
      { $addFields: { saleCOGS: cogsExpr } },
      {
        $group: {
          _id: { mrName: "$mrName", mrId: "$mrId" },
          totalSales: { $sum: "$totalAmount" },
          totalCOGS: { $sum: "$saleCOGS" },
          totalProfit: { $sum: "$totalProfitLoss" },
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
          totalSales: 1,
          totalCOGS: 1,
          totalProfit: 1,
          saleCount: 1,
          customerCount: { $size: "$customers" },
          lastSaleDate: 1,
        },
      },
      { $sort: { totalSales: -1 } },
    ]),
  ]);

  const totalSalesFromAllRecords = allSalesForSummary[0]?.totalSales || 0;
  const totalCOGSFromAllRecords = allSalesForSummary[0]?.totalCOGS || 0;
  const totalProfitFromAllRecords = allSalesForSummary[0]?.totalProfit || 0;

  // ── group by normalised MR name ───────────────────────────────────────────
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
      groupedSales[key].totalSales += parseFloat(rec.totalSales) || 0;
      groupedSales[key].totalCOGS += parseFloat(rec.totalCOGS) || 0;
      groupedSales[key].totalProfit += parseFloat(rec.totalProfit) || 0;
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

  // ── staff map ─────────────────────────────────────────────────────────────
  const allStaffMembers = await Staff.find({}).select("_id medicalRepName");
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

  // ── Tour expenses from Expense collection, grouped by mrId ───────────────
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

  // ── Also get expenses NOT linked to any MR for summary totals ──
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

  // ── payroll aggregation ───────────────────────────────────────────────────
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

  // ── summary totals ────────────────────────────────────────────────────────
  const totalPayrollSummary = payrollAggregate.reduce(
    (acc, p) => ({
      totalSalary: acc.totalSalary + (parseFloat(p.salary) || 0),
      totalIncentive: acc.totalIncentive + (parseFloat(p.incentive) || 0),
      totalAllowance: acc.totalAllowance + (parseFloat(p.allowance) || 0),
    }),
    { totalSalary: 0, totalIncentive: 0, totalAllowance: 0 },
  );

  // totalExpense = salary + incentive + allowance + tour expenses + tour allowance
  const totalExpenseFromAllRecords =
    totalPayrollSummary.totalSalary +
    totalPayrollSummary.totalIncentive +
    totalPayrollSummary.totalAllowance +
    summaryTotalTourExpense +
    summaryTotalTourAllowance;

  const salaryCOGSRatio =
    totalCOGSFromAllRecords > 0
      ? parseFloat(
          (totalPayrollSummary.totalSalary / totalCOGSFromAllRecords).toFixed(
            4,
          ),
        )
      : 0;
  const expenseCOGSRatio =
    totalCOGSFromAllRecords > 0
      ? parseFloat(
          (totalExpenseFromAllRecords / totalCOGSFromAllRecords).toFixed(4),
        )
      : 0;
  const salarySaleRatio =
    totalSalesFromAllRecords > 0
      ? parseFloat(
          (totalPayrollSummary.totalSalary / totalSalesFromAllRecords).toFixed(
            4,
          ),
        )
      : 0;
  const profitMargin =
    totalSalesFromAllRecords > 0
      ? parseFloat(
          (
            (totalProfitFromAllRecords / totalSalesFromAllRecords) *
            100
          ).toFixed(2),
        )
      : 0;
  const cogsPercentage =
    totalSalesFromAllRecords > 0
      ? parseFloat(
          ((totalCOGSFromAllRecords / totalSalesFromAllRecords) * 100).toFixed(
            2,
          ),
        )
      : 0;

  const summary = {
    totalSalary: totalPayrollSummary.totalSalary,
    totalCOGS: totalCOGSFromAllRecords,
    totalSales: totalSalesFromAllRecords,
    totalProfit: totalProfitFromAllRecords,
    totalExpense: totalExpenseFromAllRecords,
    salaryCOGSRatio,
    expenseCOGSRatio,
    salarySaleRatio,
    totalAllowance: totalPayrollSummary.totalAllowance,
    totalIncentive: totalPayrollSummary.totalIncentive,
    totalTourExpense: summaryTotalTourExpense,
    totalTourAllowance: summaryTotalTourAllowance,
    profitMargin,
    cogsPercentage,
  };

  // ── join sales + payroll + expenses ──────────────────────────────────────
  const payrollByStaffId = {};
  payrollAggregate.forEach((p) => {
    payrollByStaffId[p._id.toString()] = p;
  });

  const matchStaff = (record) => {
    const norm = record.normalizedName;
    if (norm && staffMap.normalizedNameToId[norm])
      return staffMap.normalizedNameToId[norm];
    for (const [sn, sid] of Object.entries(staffMap.normalizedNameToId)) {
      if (sn.includes(norm) || norm.includes(sn)) return sid;
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
    const cogs = parseFloat(record.totalCOGS) || 0;
    const sales = parseFloat(record.totalSales) || 0;
    const profit = parseFloat(record.totalProfit) || 0;

    // ── Tour data from Expense collection ──
    const mrIdFromSale = record.records?.[0]?.mrId;
    const tourExpKey =
      staffId || (mrIdFromSale ? mrIdFromSale.toString() : null);
    const tourExpense = tourExpKey
      ? tourExpenseByMR[tourExpKey]?.total || 0
      : 0;
    const tourAllowance = tourExpKey
      ? tourAllowanceByMR[tourExpKey]?.total || 0
      : 0;

    const totalExpense = salary + incentive + allowance + tourExpense + tourAllowance;

    return {
      srDate: record.lastSaleDate || new Date(),
      mrName: record.mrName || "",
      mrId: record.mrId || staffId || "",
      cogs,
      totalSales: sales,
      profit,
      salary,
      incentive,
      allowance,
      tourExpense,
      tourAllowance,
      totalExpense,
      salaryCOGSRatio: cogs > 0 ? parseFloat((salary / cogs).toFixed(4)) : 0,
      expenseCOGSRatio:
        cogs > 0 ? parseFloat((totalExpense / cogs).toFixed(4)) : 0,
      salarySaleRatio: sales > 0 ? parseFloat((salary / sales).toFixed(4)) : 0,
      profitMargin:
        sales > 0 ? parseFloat(((profit / sales) * 100).toFixed(2)) : 0,
      cogsPercentage:
        sales > 0 ? parseFloat(((cogs / sales) * 100).toFixed(2)) : 0,
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
      const totalExpense = salary + incentive + allowance + tourExpense + tourAllowance;
      const staffEntry = allStaffMembers.find(
        (s) => s._id.toString() === staffId,
      );
      combinedData.push({
        srDate: new Date(),
        mrName: staffEntry?.medicalRepName || normName,
        mrId: staffId,
        cogs: 0,
        totalSales: 0,
        profit: 0,
        salary,
        incentive,
        allowance,
        tourExpense,
        tourAllowance,
        totalExpense,
        salaryCOGSRatio: 0,
        expenseCOGSRatio: 0,
        salarySaleRatio: 0,
        profitMargin: 0,
        cogsPercentage: 0,
        saleCount: 0,
        customerCount: 0,
      });
    }
  });

  combinedData.sort((a, b) => b.totalSales - a.totalSales);

  const totalRecords = combinedData.length;
  const totalPages = Math.ceil(totalRecords / limitNum);

  if (isExport) {
    return { success: true, data: { summary, records: combinedData } };
  }
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
    res.status(200).json(await fetchSalaryCOGSData(req.query));
  } catch (error) {
    console.error("Error in salary-cogs-ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch salary COGS ratio data",
      error: error.message,
    });
  }
});

// ─── GET /export ──────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const result = await fetchSalaryCOGSData({
      ...req.query,
      export: "true",
      limit: 10000,
    });
    if (!result.success) throw new Error("Failed to fetch data for export");

    const { summary, records } = result.data;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Salary COGS Ratio Report");

    ws.columns = [
      { header: "Sr. No", key: "srNo", width: 8 },
      { header: "Date", key: "date", width: 15 },
      { header: "MR Name", key: "mrName", width: 25 },
      { header: "COGS ($)", key: "cogs", width: 15 },
      { header: "Sales ($)", key: "sales", width: 15 },
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
      { header: "Total Expense ($)", key: "totalExpense", width: 16 },
      { header: "Salary/COGS Ratio", key: "salaryCOGSRatio", width: 15 },
      { header: "Expense/COGS Ratio", key: "expenseCOGSRatio", width: 16 },
      { header: "Salary/Sale Ratio", key: "salarySaleRatio", width: 15 },
      { header: "Profit Margin (%)", key: "profitMargin", width: 15 },
      { header: "Sale Count", key: "saleCount", width: 12 },
      { header: "Customer Count", key: "customerCount", width: 13 },
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
        date: rec.srDate ? new Date(rec.srDate).toLocaleDateString() : "",
        mrName: rec.mrName || "N/A",
        cogs: parseFloat(rec.cogs) || 0,
        sales: parseFloat(rec.totalSales) || 0,
        profit: parseFloat(rec.profit) || 0,
        salary: parseFloat(rec.salary) || 0,
        incentive: parseFloat(rec.incentive) || 0,
        allowance: parseFloat(rec.allowance) || 0,
        tourExpense: parseFloat(rec.tourExpense) || 0,
        tourAllowance: parseFloat(rec.tourAllowance) || 0,
        totalExpense: parseFloat(rec.totalExpense) || 0,
        salaryCOGSRatio: parseFloat(rec.salaryCOGSRatio) || 0,
        expenseCOGSRatio: parseFloat(rec.expenseCOGSRatio) || 0,
        salarySaleRatio: parseFloat(rec.salarySaleRatio) || 0,
        profitMargin: parseFloat(rec.profitMargin) || 0,
        saleCount: rec.saleCount || 0,
        customerCount: rec.customerCount || 0,
      });
      [
        "cogs",
        "sales",
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
      ["salaryCOGSRatio", "expenseCOGSRatio", "salarySaleRatio"].forEach(
        (c) => {
          row.getCell(c).numFmt = "0.0000";
        },
      );
      const pm = row.getCell("profitMargin");
      pm.numFmt = '0.00"%"';
      pm.font = {
        color: {
          argb:
            (parseFloat(rec.profitMargin) || 0) >= 0 ? "FF16A34A" : "FFDC2626",
        },
      };
    });

    ws.addRow({});
    const sumRow = ws.addRow({
      mrName: "TOTAL SUMMARY",
      cogs: summary.totalCOGS,
      sales: summary.totalSales,
      profit: summary.totalProfit,
      salary: summary.totalSalary,
      incentive: summary.totalIncentive,
      allowance: summary.totalAllowance,
      tourExpense: summary.totalTourExpense,
      tourAllowance: summary.totalTourAllowance,
      totalExpense: summary.totalExpense,
      salaryCOGSRatio: summary.salaryCOGSRatio,
      expenseCOGSRatio: summary.expenseCOGSRatio,
    });
    sumRow.font = { bold: true };
    sumRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF3C7" },
    };
    [
      "cogs",
      "sales",
      "profit",
      "salary",
      "incentive",
      "allowance",
      "tourExpense",
      "tourAllowance",
      "totalExpense",
    ].forEach((c) => {
      sumRow.getCell(c).numFmt = "$#,##0.00";
    });
    ["salaryCOGSRatio", "expenseCOGSRatio"].forEach((c) => {
      sumRow.getCell(c).numFmt = "0.0000";
    });

    ws.columns.forEach((col) => {
      col.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });

    const filename = `salary-cogs-ratio-${new Date().toISOString().split("T")[0]}.xlsx`;
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

export default router;