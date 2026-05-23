import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import Expense from "../../models/expenses/addExpense.js";
import ExpenseCategory from "../../models/expenses/addExpenseCategary.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import stockinmrhands from "../../models/stock/StockInMRHand.js";

const router = express.Router();

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
    console.log(
      "[CATEGORY] tourExpenseCategoryIds count:",
      tourExpenseCategoryIds.length,
    );
    console.log(
      "[CATEGORY] tourAllowanceCategoryIds count:",
      tourAllowanceCategoryIds.length,
    );
    return { tourExpenseCategoryIds, tourAllowanceCategoryIds };
  } catch (err) {
    console.error("[CATEGORY] Error fetching expense categories:", err);
    return { tourExpenseCategoryIds: [], tourAllowanceCategoryIds: [] };
  }
};

const buildSalesDateConditions = ({ startDate, endDate, dateFilter }) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const buildRange = (gte, lte) => ({
    $or: [
      { invoiceDate: { $gte: gte, $lte: lte } },
      {
        invoiceDate: { $exists: false },
        recordingDate: { $gte: gte, $lte: lte },
      },
    ],
  });

  if (startDate && endDate) {
    return buildRange(toStartOfDay(startDate), toEndOfDay(endDate));
  }

  switch (dateFilter) {
    case "today": {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      const t2 = new Date(t);
      t2.setDate(t2.getDate() + 1);
      return buildRange(t, t2);
    }
    case "currentMonth":
      return buildRange(
        new Date(y, m, 1, 0, 0, 0, 0),
        new Date(y, m + 1, 0, 23, 59, 59, 999),
      );
    case "janToPreviousMonth":
      return m === 0
        ? buildRange(
            new Date(y - 1, 0, 1, 0, 0, 0, 0),
            new Date(y - 1, 11, 31, 23, 59, 59, 999),
          )
        : buildRange(
            new Date(y, 0, 1, 0, 0, 0, 0),
            new Date(y, m, 0, 23, 59, 59, 999),
          );
    case "all":
      return {};
    default:
      return buildRange(
        new Date(y, m, 1, 0, 0, 0, 0),
        new Date(y, m + 1, 0, 23, 59, 59, 999),
      );
  }
};

const buildDateConditions = (dateField, { startDate, endDate, dateFilter }) => {
  const cond = {};
  if (startDate && endDate) {
    cond[dateField] = {
      $gte: toStartOfDay(startDate),
      $lte: toEndOfDay(endDate),
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
        cond[dateField] = { $gte: t, $lt: t2 };
        break;
      }
      case "currentMonth":
        cond[dateField] = {
          $gte: new Date(y, m, 1, 0, 0, 0, 0),
          $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
        break;
      case "janToPreviousMonth":
        cond[dateField] =
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
        cond[dateField] = {
          $gte: new Date(y, m, 1, 0, 0, 0, 0),
          $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
    }
  }
  return cond;
};

// In-memory store for active MR filter
let globalActiveMrFilter = [];

const fetchSalesSalaryData = async (params) => {
  console.log("\n========== [FETCH START] ==========");
  console.log("[PARAMS] Incoming params:", JSON.stringify(params, null, 2));

  const {
    page = 1,
    limit = 7,
    search = "",
    startDate,
    endDate,
    period,
    dateFilter = "currentMonth",
    export: isExport = false,
    mrIds = "",
  } = params;

  // ── Step 1: Parse MR filter ──────────────────────────────────────────────
  console.log("\n--- [STEP 1] Parse MR filter ---");
  const selectedMrIdsRaw = mrIds
    ? mrIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
  console.log("[STEP 1] selectedMrIdsRaw from request:", selectedMrIdsRaw);
  console.log("[STEP 1] globalActiveMrFilter in memory:", globalActiveMrFilter);

  let finalMrIds = selectedMrIdsRaw;
  if (finalMrIds.length === 0 && globalActiveMrFilter.length > 0) {
    finalMrIds = [...globalActiveMrFilter];
    console.log(
      "[STEP 1] Using globalActiveMrFilter because request had no mrIds",
    );
  }

  const selectedMrIdSet = new Set(finalMrIds);
  const hasMrFilter = selectedMrIdSet.size > 0;
  console.log("[STEP 1] finalMrIds:", finalMrIds);
  console.log(
    "[STEP 1] hasMrFilter:",
    hasMrFilter,
    "| Count:",
    selectedMrIdSet.size,
  );

  const pageNum = parseInt(page);
  const limitNum = isExport ? 10000 : parseInt(limit);
  const skip = isExport ? 0 : (pageNum - 1) * limitNum;
  console.log(
    "[STEP 1] pageNum:",
    pageNum,
    "| limitNum:",
    limitNum,
    "| skip:",
    skip,
  );

  const dateParams = { startDate, endDate, dateFilter };
  const expenseDateConditions = buildDateConditions("date", dateParams);
  console.log(
    "[STEP 1] expenseDateConditions:",
    JSON.stringify(expenseDateConditions),
  );

  // ── Step 2: Build sales date conditions (NO mrId filter ever) ────────────
  console.log("\n--- [STEP 2] Build sales conditions (NO mrId filter) ---");
  const baseSalesDateConditions = buildSalesDateConditions(dateParams);
  const salesMatchForSummary = { ...baseSalesDateConditions };
  const salesMatchForRecords = { ...baseSalesDateConditions };

  if (search?.trim()) {
    console.log("[STEP 2] Applying search filter:", search.trim());
    if (salesMatchForRecords.$or) {
      salesMatchForRecords.$and = [
        { $or: salesMatchForRecords.$or },
        { mrName: new RegExp(search.trim(), "i") },
      ];
      delete salesMatchForRecords.$or;
    } else {
      salesMatchForRecords.mrName = new RegExp(search.trim(), "i");
    }
  }
  console.log(
    "[STEP 2] salesMatchForSummary keys:",
    Object.keys(salesMatchForSummary),
  );
  console.log(
    "[STEP 2] salesMatchForRecords keys:",
    Object.keys(salesMatchForRecords),
  );
  // NOTE: neither condition has mrId — this is intentional

  // ── Step 3: Fetch grand totals from ALL MRs ──────────────────────────────
  console.log(
    "\n--- [STEP 3] Fetch grand totals from ALL MRs (no mrId filter) ---",
  );
  const [normalSalesData, normalSalesAggregate] = await Promise.all([
    SaleSummary.aggregate([
      { $match: salesMatchForSummary },
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalSales: { $sum: { $ifNull: ["$products.netSellingAmount", 0] } },
          totalProfit: { $sum: { $ifNull: ["$products.profitLoss", 0] } },
        },
      },
    ]),
    SaleSummary.aggregate([
      { $match: salesMatchForRecords },
      {
        $addFields: {
          saleTotal: {
            $reduce: {
              input: { $ifNull: ["$products", []] },
              initialValue: 0,
              in: {
                $add: ["$$value", { $ifNull: ["$$this.netSellingAmount", 0] }],
              },
            },
          },
          saleProfit: {
            $reduce: {
              input: { $ifNull: ["$products", []] },
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.profitLoss", 0] }] },
            },
          },
        },
      },
      {
        $group: {
          _id: { mrName: "$mrName", mrId: "$mrId" },
          totalSales: { $sum: "$saleTotal" },
          totalProfit: { $sum: "$saleProfit" },
          saleCount: { $sum: 1 },
          customers: { $addToSet: "$customerCode" },
          lastSaleDate: {
            $max: { $ifNull: ["$invoiceDate", "$recordingDate"] },
          },
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

  const totalSalesFromAllRecords = normalSalesData[0]?.totalSales || 0;
  const totalProfitFromAllRecords = normalSalesData[0]?.totalProfit || 0;
  console.log(
    "[STEP 3] DB grand totalSales (ALL MRs):",
    totalSalesFromAllRecords,
  );
  console.log(
    "[STEP 3] DB grand totalProfit (ALL MRs):",
    totalProfitFromAllRecords,
  );
  console.log(
    "[STEP 3] Per-MR sales records count:",
    normalSalesAggregate.length,
  );
  normalSalesAggregate.forEach((r) => {
    console.log(
      `  [STEP 3]   MR: "${r.mrName}" | mrId: ${r.mrId} | sale: ${r.sale} | profit: ${r.profit}`,
    );
  });

  // ── Step 4: Staff map ────────────────────────────────────────────────────
  console.log("\n--- [STEP 4] Build staff map ---");
  const allStaffMembers = await Staff.find({}).select(
    "_id medicalRepName employeeId",
  );
  console.log("[STEP 4] Total staff members fetched:", allStaffMembers.length);
  const staffMap = { idToName: {}, nameToId: {} };
  allStaffMembers.forEach((s) => {
    const id = s._id.toString();
    staffMap.idToName[id] = s.medicalRepName || "Unknown";
    if (s.medicalRepName) {
      staffMap.nameToId[s.medicalRepName.toLowerCase().trim()] = id;
    }
  });
  console.log(
    "[STEP 4] staffMap idToName count:",
    Object.keys(staffMap.idToName).length,
  );

  // ── Step 5: Tour expenses & allowances (ALL MRs, no filter) ─────────────
  console.log("\n--- [STEP 5] Fetch tour expenses & allowances (ALL MRs) ---");
  const { tourExpenseCategoryIds, tourAllowanceCategoryIds } =
    await getTourExpenseCategoryIds();
  const tourExpenseByMR = {};
  const tourAllowanceByMR = {};

  if (tourExpenseCategoryIds.length > 0) {
    const tourExpAgg = await Expense.aggregate([
      {
        $match: {
          ...expenseDateConditions,
          mrId: { $ne: null, $exists: true },
          category: { $in: tourExpenseCategoryIds },
        },
      },
      {
        $group: {
          _id: "$mrId",
          totalTourExpense: { $sum: "$amount" },
          mrName: { $first: "$mrName" },
        },
      },
    ]);
    console.log("[STEP 5] tourExpAgg results count:", tourExpAgg.length);
    tourExpAgg.forEach((r) => {
      if (r._id) {
        tourExpenseByMR[r._id.toString()] = {
          total: r.totalTourExpense,
          mrName: r.mrName,
        };
        console.log(
          `  [STEP 5]   TourExp MR: "${r.mrName}" | mrId: ${r._id} | amount: ${r.totalTourExpense}`,
        );
      }
    });
  }

  if (tourAllowanceCategoryIds.length > 0) {
    const tourAllowAgg = await Expense.aggregate([
      {
        $match: {
          ...expenseDateConditions,
          mrId: { $ne: null, $exists: true },
          category: { $in: tourAllowanceCategoryIds },
        },
      },
      {
        $group: {
          _id: "$mrId",
          totalTourAllowance: { $sum: "$amount" },
          mrName: { $first: "$mrName" },
        },
      },
    ]);
    console.log("[STEP 5] tourAllowAgg results count:", tourAllowAgg.length);
    tourAllowAgg.forEach((r) => {
      if (r._id) {
        tourAllowanceByMR[r._id.toString()] = {
          total: r.totalTourAllowance,
          mrName: r.mrName,
        };
        console.log(
          `  [STEP 5]   TourAllow MR: "${r.mrName}" | mrId: ${r._id} | amount: ${r.totalTourAllowance}`,
        );
      }
    });
  }

  // ── Step 6: Payroll — fetch ALL staff ────────────────────────────────────
  console.log(
    "\n--- [STEP 6] Fetch payroll for ALL staff (no mrId filter) ---",
  );
  const allStaffIds = allStaffMembers.map((s) => s._id);
  console.log("[STEP 6] allStaffIds count:", allStaffIds.length);
  let payrollAggregate = [];

  if (allStaffIds.length > 0) {
    const payrollMatchConditions = {
      employeeId: {
        $in: allStaffIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    };
    if (period) {
      payrollMatchConditions.period = period;
      console.log("[STEP 6] Payroll period filter (explicit):", period);
    } else if (startDate && endDate) {
      const periods = getPeriodsFromDateRange(startDate, endDate);
      payrollMatchConditions.period = { $in: periods };
      console.log("[STEP 6] Payroll period filter (date range):", periods);
    } else {
      const now = new Date();
      switch (dateFilter) {
        case "today":
        case "currentMonth":
          payrollMatchConditions.period = getYearMonthFromDate(now);
          console.log(
            "[STEP 6] Payroll period filter (currentMonth):",
            payrollMatchConditions.period,
          );
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
          console.log(
            "[STEP 6] Payroll period filter (janToPrevMonth):",
            periods,
          );
          break;
        }
        case "all":
          console.log("[STEP 6] Payroll period filter: NONE (all records)");
          break;
      }
    }

    payrollAggregate = await Payroll.aggregate([
      { $match: payrollMatchConditions },
      {
        $addFields: {
          incentiveBucket: {
            $reduce: {
              input: { $ifNull: ["$allowances", []] },
              initialValue: 0,
              in: {
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
                    $add: ["$$value", { $ifNull: ["$$this.amount", 0] }],
                  },
                  else: "$$value",
                },
              },
            },
          },
          otherAllowanceBucket: {
            $reduce: {
              input: { $ifNull: ["$allowances", []] },
              initialValue: 0,
              in: {
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
                    $add: ["$$value", { $ifNull: ["$$this.amount", 0] }],
                  },
                  else: "$$value",
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$employeeId",
          netSalary: { $sum: { $ifNull: ["$netSalary", 0] } },
          incentive: { $sum: "$incentiveBucket" },
          allowance: { $sum: "$otherAllowanceBucket" },
          payrollCount: { $sum: 1 },
        },
      },
    ]);
    console.log("[STEP 6] payrollAggregate count:", payrollAggregate.length);
  }

  const payrollByStaffId = {};
  payrollAggregate.forEach((p) => {
    payrollByStaffId[p._id.toString()] = p;
    console.log(
      `  [STEP 6]   Payroll staffId: ${p._id} | netSalary: ${p.netSalary} | incentive: ${p.incentive} | allowance: ${p.allowance}`,
    );
  });

  // ── Step 7: Build combinedData for ALL MRs ───────────────────────────────
  console.log("\n--- [STEP 7] Build combinedData for ALL MRs ---");
  let combinedData = normalSalesAggregate.map((record) => {
    const mrId = record.mrId ? record.mrId.toString() : null;
    const payroll = mrId ? payrollByStaffId[mrId] || {} : {};

    const salary = parseFloat(payroll.netSalary) || 0;
    const incentive = parseFloat(payroll.incentive) || 0;
    const allowance = parseFloat(payroll.allowance) || 0;
    const tourExpense = mrId ? tourExpenseByMR[mrId]?.total || 0 : 0;
    const tourAllowanceAmt = mrId ? tourAllowanceByMR[mrId]?.total || 0 : 0;
    const sale = parseFloat(record.sale) || 0;
    const profit = parseFloat(record.profit) || 0;
    const totalExpense = salary + tourAllowanceAmt + tourExpense;

    console.log(
      `  [STEP 7]   Sales MR: "${record.mrName}" | mrId: ${mrId} | sale: ${sale} | salary: ${salary} | tourExp: ${tourExpense} | tourAllow: ${tourAllowanceAmt} | totalExp: ${totalExpense}`,
    );

    return {
      srDate: record.lastSaleDate || "",
      mrName: record.mrName || "",
      mrId: mrId || "",
      sale,
      profit,
      salary,
      incentive,
      allowance,
      tourExpense,
      tourAllowance: tourAllowanceAmt,
      totalExpense,
      salarySaleRatio:
        sale === 0 ? 0 : parseFloat(((salary / sale) * 100).toFixed(2)),
      expenseSaleRatio:
        sale === 0 ? 0 : parseFloat(((totalExpense / sale) * 100).toFixed(2)),
      performance:
        sale === 0 ? 0 : parseFloat(((profit / sale) * 100).toFixed(2)),
      saleCount: parseInt(record.saleCount) || 0,
      customerCount: parseInt(record.customerCount) || 0,
    };
  });

  // ── Step 8: Add staff with payroll but NO sales ──────────────────────────
  console.log("\n--- [STEP 8] Add no-sales staff ---");
  const addNoSalesStaff = (staffId, staffName) => {
    const payroll = payrollByStaffId[staffId];
    if (!payroll || Object.keys(payroll).length === 0) return;
    const alreadyExists = combinedData.find((d) => d.mrId === staffId);
    if (alreadyExists) return;

    const salary = parseFloat(payroll.netSalary) || 0;
    const incentive = parseFloat(payroll.incentive) || 0;
    const allowance = parseFloat(payroll.allowance) || 0;
    const tourExpense = tourExpenseByMR[staffId]?.total || 0;
    const tourAllowanceAmt = tourAllowanceByMR[staffId]?.total || 0;
    const totalExpense = salary + tourAllowanceAmt + tourExpense;

    console.log(
      `  [STEP 8]   No-sales staff: "${staffName}" | staffId: ${staffId} | salary: ${salary} | totalExp: ${totalExpense}`,
    );

    combinedData.push({
      srDate: new Date(),
      mrName: staffName,
      mrId: staffId,
      sale: 0,
      profit: 0,
      salary,
      incentive,
      allowance,
      tourExpense,
      tourAllowance: tourAllowanceAmt,
      totalExpense,
      salarySaleRatio: 0,
      expenseSaleRatio: 0,
      performance: 0,
      saleCount: 0,
      customerCount: 0,
    });
  };

  // Always add all staff (so summary is always complete before filtering)
  Object.entries(staffMap.idToName).forEach(([id, name]) => {
    addNoSalesStaff(id, name);
  });
  console.log(
    "[STEP 8] combinedData count (ALL MRs, before any filter):",
    combinedData.length,
  );

  // ── Step 9: Compute summary from ALL MRs (before filtering) ─────────────
  console.log(
    "\n--- [STEP 9] Compute fullSummary from ALL MRs (before filter) ---",
  );
  const fullSummary = combinedData.reduce(
    (acc, row) => {
      acc.totalSalary += parseFloat(row.salary) || 0;
      acc.totalIncentive += parseFloat(row.incentive) || 0;
      acc.totalAllowance += parseFloat(row.allowance) || 0;
      acc.totalTourExpense += parseFloat(row.tourExpense) || 0;
      acc.totalTourAllowance += parseFloat(row.tourAllowance) || 0;
      acc.totalExpense += parseFloat(row.totalExpense) || 0;
      acc.totalSales += parseFloat(row.sale) || 0;
      acc.totalProfit += parseFloat(row.profit) || 0;
      return acc;
    },
    {
      totalSalary: 0,
      totalIncentive: 0,
      totalAllowance: 0,
      totalTourExpense: 0,
      totalTourAllowance: 0,
      totalExpense: 0,
      totalSales: 0,
      totalProfit: 0,
    },
  );
  console.log(
    "[STEP 9] fullSummary (ALL MRs):",
    JSON.stringify(fullSummary, null, 2),
  );

  // ── Step 10: Filter combinedData rows by MR filter ───────────────────────
  console.log("\n--- [STEP 10] Apply MR filter to rows ---");
  if (hasMrFilter) {
    const beforeCount = combinedData.length;
    combinedData = combinedData.filter((d) => selectedMrIdSet.has(d.mrId));
    console.log(
      `[STEP 10] Filtered rows: ${beforeCount} → ${combinedData.length}`,
    );
    combinedData.forEach((row) => {
      console.log(
        `  [STEP 10]   Kept MR: "${row.mrName}" | mrId: ${row.mrId} | sale: ${row.sale} | salary: ${row.salary} | totalExpense: ${row.totalExpense}`,
      );
    });
  } else {
    console.log(
      "[STEP 10] No MR filter active — keeping all",
      combinedData.length,
      "rows",
    );
  }

  // ── Step 11: Compute filteredSummary from filtered rows ──────────────────
  console.log("\n--- [STEP 11] Compute filteredSummary from filtered rows ---");
  const filteredSummary = combinedData.reduce(
    (acc, row) => {
      acc.totalSalary += parseFloat(row.salary) || 0;
      acc.totalIncentive += parseFloat(row.incentive) || 0;
      acc.totalAllowance += parseFloat(row.allowance) || 0;
      acc.totalTourExpense += parseFloat(row.tourExpense) || 0;
      acc.totalTourAllowance += parseFloat(row.tourAllowance) || 0;
      acc.totalExpense += parseFloat(row.totalExpense) || 0;
      acc.totalSales += parseFloat(row.sale) || 0;
      acc.totalProfit += parseFloat(row.profit) || 0;
      return acc;
    },
    {
      totalSalary: 0,
      totalIncentive: 0,
      totalAllowance: 0,
      totalTourExpense: 0,
      totalTourAllowance: 0,
      totalExpense: 0,
      totalSales: 0,
      totalProfit: 0,
    },
  );
  console.log(
    "[STEP 11] filteredSummary (filtered MRs):",
    JSON.stringify(filteredSummary, null, 2),
  );

  // ── Step 12: Pick which totals to use in summary cards ───────────────────
  console.log("\n--- [STEP 12] Decide final summary values ---");
  // When MR filter is active: use filteredSummary so removing an MR subtracts its exact values.
  // When no filter: use DB grand totals for sales/profit accuracy; filteredSummary for salary/expense.
  const useSales = hasMrFilter
    ? filteredSummary.totalSales
    : totalSalesFromAllRecords;
  const useProfit = hasMrFilter
    ? filteredSummary.totalProfit
    : totalProfitFromAllRecords;
  const useSalary = filteredSummary.totalSalary;
  const useTourExp = filteredSummary.totalTourExpense;
  const useTourAllow = filteredSummary.totalTourAllowance;
  const useAllow = filteredSummary.totalAllowance;
  const useInc = filteredSummary.totalIncentive;
  const useExpense = filteredSummary.totalExpense;

  console.log("[STEP 12] hasMrFilter:", hasMrFilter);
  console.log(
    "[STEP 12] useSales:",
    useSales,
    "(from",
    hasMrFilter ? "filteredSummary" : "DB grand total",
    ")",
  );
  console.log("[STEP 12] useProfit:", useProfit);
  console.log("[STEP 12] useSalary:", useSalary);
  console.log("[STEP 12] useTourExp:", useTourExp);
  console.log("[STEP 12] useTourAllow:", useTourAllow);
  console.log("[STEP 12] useAllow:", useAllow);
  console.log("[STEP 12] useInc:", useInc);
  console.log("[STEP 12] useExpense:", useExpense);

  const ratio =
    useSales > 0 ? parseFloat(((useExpense / useSales) * 100).toFixed(4)) : 0;
  console.log("[STEP 12] ratio (expense/sales %):", ratio);

  const finalSummary = {
    totalSales: parseFloat(useSales) || 0,
    totalSalary: parseFloat(useSalary) || 0,
    totalExpense: parseFloat(useExpense) || 0,
    totalProfit: parseFloat(useProfit) || 0,
    totalTourExpense: parseFloat(useTourExp) || 0,
    totalTourAllowance: parseFloat(useTourAllow) || 0,
    totalAllowance: parseFloat(useAllow) || 0,
    totalIncentive: parseFloat(useInc) || 0,
    ratio,
    expenseSaleRatio:
      useSales > 0 ? parseFloat(((useExpense / useSales) * 100).toFixed(2)) : 0,
  };
  console.log("[STEP 12] finalSummary:", JSON.stringify(finalSummary, null, 2));

  combinedData.sort((a, b) => b.sale - a.sale);

  const totalRecords = combinedData.length;
  const totalPages = Math.ceil(totalRecords / limitNum);
  console.log(
    "[STEP 12] totalRecords:",
    totalRecords,
    "| totalPages:",
    totalPages,
  );
  console.log("========== [FETCH END] ==========\n");

  if (isExport)
    return {
      success: true,
      data: { summary: finalSummary, records: combinedData },
    };

  return {
    success: true,
    data: {
      summary: finalSummary,
      records: combinedData.slice(skip, skip + limitNum),
    },
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalRecords,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  console.log("\n[ROUTE GET /] Received request");
  try {
    res.status(200).json(await fetchSalesSalaryData(req.query));
  } catch (error) {
    console.error("[ROUTE GET /] Error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch sales salary ratio data",
        error: error.message,
      });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  console.log("\n[ROUTE GET /export] Received request");
  try {
    const result = await fetchSalesSalaryData({
      ...req.query,
      export: "true",
      limit: 10000,
    });
    if (!result.success) throw new Error("Failed to fetch data for export");

    const { summary, records } = result.data;
    console.log("[EXPORT] Records count:", records.length);
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Sales Salary Ratio Report");

    ws.columns = [
      { header: "Sr. No", key: "srNo", width: 8 },
      { header: "MR Name", key: "mrName", width: 25 },
      { header: "Sale ($)", key: "sale", width: 15 },
      { header: "Profit ($)", key: "profit", width: 15 },
      { header: "Net Salary ($)", key: "salary", width: 15 },
      { header: "Incentive ($)\n(display only)", key: "incentive", width: 18 },
      { header: "Allowance ($)\n(display only)", key: "allowance", width: 22 },
      { header: "Tour Allowance ($)", key: "tourAllowance", width: 18 },
      {
        header: "Tour Expense ($)\nVans+Petrol+Province Mktg",
        key: "tourExpense",
        width: 22,
      },
      {
        header: "Total Expense ($)\n(Net Salary + Tour Allow. + Tour Exp.)",
        key: "totalExpense",
        width: 32,
      },
      {
        header: "Salary/Sale (%)\n(Net Salary ÷ Sale × 100)",
        key: "salarySaleRatio",
        width: 22,
      },
      {
        header: "Expense/Sales (%)\n(Expense ÷ Sale × 100)",
        key: "expenseSaleRatio",
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
        tourAllowance: parseFloat(rec.tourAllowance) || 0,
        tourExpense: parseFloat(rec.tourExpense) || 0,
        totalExpense: parseFloat(rec.totalExpense) || 0,
        salarySaleRatio: parseFloat(rec.salarySaleRatio) || 0,
        expenseSaleRatio: parseFloat(rec.expenseSaleRatio) || 0,
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
        "tourAllowance",
        "tourExpense",
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

      const esr = row.getCell("expenseSaleRatio");
      esr.numFmt = '0.00"%"';
      esr.font = {
        color: {
          argb:
            (parseFloat(rec.expenseSaleRatio) || 0) > 100
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
      incentive: summary.totalIncentive,
      allowance: summary.totalAllowance,
      tourAllowance: summary.totalTourAllowance,
      tourExpense: summary.totalTourExpense,
      totalExpense: summary.totalExpense,
      salarySaleRatio:
        summary.totalSales > 0
          ? (summary.totalSalary / summary.totalSales) * 100
          : 0,
      expenseSaleRatio: summary.expenseSaleRatio,
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
      "incentive",
      "allowance",
      "tourAllowance",
      "tourExpense",
      "totalExpense",
    ].forEach((c) => {
      sumRow.getCell(c).numFmt = "$#,##0.00";
    });
    sumRow.getCell("salarySaleRatio").numFmt = '0.00"%"';
    sumRow.getCell("expenseSaleRatio").numFmt = '0.00"%"';

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
    console.log("[EXPORT] Done:", filename);
  } catch (error) {
    console.error("[ROUTE GET /export] Error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to export data",
        error: error.message,
      });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mrs  — returns ALL active MRs, no implicit limit
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mrs", async (req, res) => {
  console.log("\n[ROUTE GET /mrs] Received request");
  try {
    // .lean() returns plain JS objects (faster, no Mongoose overhead).
    // No .limit() call — returns every document in the collection.
    const [staffList, stockMrList] = await Promise.all([
      Staff.find({ isActive: true })
        .select("_id medicalRepName isActive")
        .lean(),

      // Group by mrName+mrId so we get unique entries with IDs where available.
      // No $limit stage — returns every unique MR name in the stock collection.
      stockinmrhands.aggregate([
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
                  $replaceAll: {
                    input: { $ifNull: ["$mrName", ""] },
                    find: "  ",
                    replacement: " ",
                  },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: {
              mrName: "$cleanedMrName",
              mrId: { $ifNull: ["$mrId", null] },
            },
          },
        },
        { $sort: { "_id.mrName": 1 } },
      ]),
    ]);

    console.log("[/mrs] Raw active staff from DB:", staffList.length);
    console.log("[/mrs] Raw stock MR entries from DB:", stockMrList.length);

    // Log every staff member so we can see who is/isn't showing up
    staffList.forEach((s, i) => {
      console.log(
        `  [/mrs][staff ${i + 1}] _id=${s._id} | medicalRepName="${s.medicalRepName}" | isActive=${s.isActive}`,
      );
    });

    const nameSet = new Set(); // tracks lowercase names already added
    const mrList = [];

    // Priority 1: Active staff members — they always have a valid ObjectId _id
    staffList.forEach((s) => {
      if (!s.medicalRepName || !s.medicalRepName.trim()) {
        console.log(`  [/mrs]   SKIPPED staff (no name): _id=${s._id}`);
        return;
      }
      const key = s.medicalRepName.trim();
      const keyLower = key.toLowerCase();
      if (nameSet.has(keyLower)) {
        console.log(`  [/mrs]   DUPLICATE skipped (staff): "${key}"`);
        return;
      }
      nameSet.add(keyLower);
      mrList.push({ mrId: s._id.toString(), mrName: key });
      console.log(`  [/mrs]   ADDED (staff): mrId=${s._id} | mrName="${key}"`);
    });

    // Priority 2: Stock MRs that have a valid mrId AND aren't already listed
    stockMrList.forEach((r) => {
      const key = (r._id?.mrName || "").trim();
      const rawMrId = r._id?.mrId;
      const stockMrId = rawMrId ? rawMrId.toString() : null;

      if (!key) {
        console.log(`  [/mrs]   SKIPPED stock (empty name)`);
        return;
      }
      if (nameSet.has(key.toLowerCase())) {
        console.log(`  [/mrs]   SKIPPED stock (already listed): "${key}"`);
        return;
      }
      if (!stockMrId || !mongoose.Types.ObjectId.isValid(stockMrId)) {
        console.log(
          `  [/mrs]   SKIPPED stock (no valid mrId): "${key}" rawMrId=${rawMrId}`,
        );
        return;
      }
      nameSet.add(key.toLowerCase());
      mrList.push({ mrId: stockMrId, mrName: key });
      console.log(
        `  [/mrs]   ADDED (stock): mrId=${stockMrId} | mrName="${key}"`,
      );
    });

    mrList.sort((a, b) => a.mrName.localeCompare(b.mrName));

    console.log("[/mrs] Final mrList count:", mrList.length);
    mrList.forEach((m, i) =>
      console.log(`  [/mrs][${i + 1}] mrId=${m.mrId} | mrName="${m.mrName}"`),
    );

    res.status(200).json({ success: true, data: mrList, count: mrList.length });
  } catch (error) {
    console.error("[ROUTE GET /mrs] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR list",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /active-mrs
// ─────────────────────────────────────────────────────────────────────────────
router.post("/active-mrs", async (req, res) => {
  console.log("\n[ROUTE POST /active-mrs] Received request");
  console.log("[POST /active-mrs] req.body:", JSON.stringify(req.body));
  try {
    const { mrIds } = req.body;
    console.log("[POST /active-mrs] Raw mrIds received:", mrIds);

    const validMrIds = (mrIds || [])
      .filter(
        (id) =>
          id && typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
      )
      .map((id) => id.toString());

    console.log("[POST /active-mrs] Valid mrIds after filter:", validMrIds);
    console.log(
      "[POST /active-mrs] Rejected ids (invalid/null):",
      (mrIds || []).filter((id) => !validMrIds.includes(id)),
    );

    globalActiveMrFilter = validMrIds;
    console.log(
      "[POST /active-mrs] globalActiveMrFilter set to:",
      globalActiveMrFilter,
    );

    res
      .status(200)
      .json({
        success: true,
        message: "MR filter saved successfully",
        data: globalActiveMrFilter,
      });
  } catch (error) {
    console.error("[ROUTE POST /active-mrs] Error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to save MR filter",
        error: error.message,
      });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /active-mrs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/active-mrs", async (req, res) => {
  console.log("\n[ROUTE GET /active-mrs] Returning:", globalActiveMrFilter);
  try {
    res.status(200).json({ success: true, data: globalActiveMrFilter });
  } catch (error) {
    console.error("[ROUTE GET /active-mrs] Error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch active MRs",
        error: error.message,
      });
  }
});

export default router;
