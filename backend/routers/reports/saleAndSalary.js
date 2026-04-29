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
import DailySampleReport from "../../models/reports/dailysample.js";

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

const calculateSalarySaleRatio = (salary, sale) =>
  sale === 0 ? 0 : (salary / sale) * 100;

const calculateExpenseSaleRatio = (totalExpense, sale) =>
  sale === 0 ? 0 : (totalExpense / sale) * 100;

const calculatePerformance = (profit, sale) =>
  sale === 0 ? 0 : (profit / sale) * 100;

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
    return { tourExpenseCategoryIds, tourAllowanceCategoryIds };
  } catch (err) {
    console.error("Error fetching expense categories:", err);
    return { tourExpenseCategoryIds: [], tourAllowanceCategoryIds: [] };
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

  const dateParams = { startDate, endDate, dateFilter };
  const salesDateConditions = buildDateConditions("recordingDate", dateParams);
  const expenseDateConditions = buildDateConditions("date", dateParams);
  const mrSaleDateConditions = buildDateConditions("date", dateParams);

  const salesMatchConditions = { ...salesDateConditions };
  if (search?.trim())
    salesMatchConditions.mrName = new RegExp(search.trim(), "i");

  // ✅ FIX: Calculate total sales by summing product amounts, not just totalAmount field
  let totalNormalSales = 0;
  let totalNormalProfit = 0;
  let totalMRSales = 0;
  let totalMRProfit = 0;

  const [normalSalesData, normalSalesAggregate, mrSalesData, mrSalesAggregate] =
    await Promise.all([
      // FIX: Get accurate total sales from products array
      SaleSummary.aggregate([
        { $match: salesMatchConditions },
        { $unwind: "$products" },
        {
          $group: {
            _id: null,
            totalSales: {
              $sum: { $ifNull: ["$products.netSellingAmount", 0] },
            },
            totalProfit: { $sum: { $ifNull: ["$products.profitLoss", 0] } },
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
                in: {
                  $add: ["$$value", { $ifNull: ["$$this.profitLoss", 0] }],
                },
              },
            },
            saleTotal: {
              $reduce: {
                input: "$products",
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    { $ifNull: ["$$this.netSellingAmount", 0] },
                  ],
                },
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
      // FIX: MR sales from DailySampleReport - sum product amounts
      DailySampleReport.aggregate([
        { $match: mrSaleDateConditions },
        { $unwind: "$products" },
        {
          $group: {
            _id: null,
            totalSales: {
              $sum: { $ifNull: ["$products.netSellingAmount", 0] },
            },
            totalProfit: { $sum: { $ifNull: ["$products.profitLoss", 0] } },
          },
        },
      ]),
      DailySampleReport.aggregate([
        { $match: mrSaleDateConditions },
        {
          $addFields: {
            totalSaleFromProducts: {
              $sum: {
                $map: {
                  input: "$products",
                  as: "p",
                  in: { $ifNull: ["$$p.netSellingAmount", 0] },
                },
              },
            },
            totalProfitFromProducts: {
              $sum: {
                $map: {
                  input: "$products",
                  as: "p",
                  in: { $ifNull: ["$$p.profitLoss", 0] },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: { mrName: "$mrName", mrId: "$mrId" },
            totalSales: { $sum: "$totalSaleFromProducts" },
            totalProfit: { $sum: "$totalProfitFromProducts" },
            saleCount: { $sum: 1 },
            customers: { $addToSet: "$customerCode" },
            lastSaleDate: { $max: "$date" },
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
            isMRSale: { $literal: true },
          },
        },
        { $sort: { sale: -1 } },
      ]),
    ]);

  totalNormalSales = normalSalesData[0]?.totalSales || 0;
  totalNormalProfit = normalSalesData[0]?.totalProfit || 0;
  totalMRSales = mrSalesData[0]?.totalSales || 0;
  totalMRProfit = mrSalesData[0]?.totalProfit || 0;

  const totalSalesFromAllRecords = totalNormalSales + totalMRSales;
  const totalProfitFromAllRecords = totalNormalProfit + totalMRProfit;

  const groupedSales = {};
  const groupRecord = (rec, map) => {
    const key = normalizeNameInJS(rec.mrName);
    if (!map[key]) {
      map[key] = {
        ...rec,
        normalizedName: key,
        originalNames: [rec.mrName],
        records: [rec],
      };
    } else {
      map[key].sale += parseFloat(rec.sale) || 0;
      map[key].profit += parseFloat(rec.profit) || 0;
      map[key].saleCount += parseInt(rec.saleCount) || 0;
      map[key].customerCount = Math.max(
        map[key].customerCount,
        parseInt(rec.customerCount) || 0,
      );
      if (
        rec.lastSaleDate &&
        (!map[key].lastSaleDate || rec.lastSaleDate > map[key].lastSaleDate)
      )
        map[key].lastSaleDate = rec.lastSaleDate;
      if (rec.mrName && !map[key].originalNames.includes(rec.mrName))
        map[key].originalNames.push(rec.mrName);
      map[key].records.push(rec);
    }
  };

  normalSalesAggregate.forEach((rec) => groupRecord(rec, groupedSales));
  mrSalesAggregate.forEach((rec) => groupRecord(rec, groupedSales));
  const salesAggregateGrouped = Object.values(groupedSales);

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
    tourExpAgg.forEach((r) => {
      if (r._id)
        tourExpenseByMR[r._id.toString()] = {
          total: r.totalTourExpense,
          mrName: r.mrName,
        };
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
    tourAllowAgg.forEach((r) => {
      if (r._id)
        tourAllowanceByMR[r._id.toString()] = {
          total: r.totalTourAllowance,
          mrName: r.mrName,
        };
    });
  }

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

  const totalMergedAllowance =
    totalPayrollSummary.totalAllowance + summaryTotalTourAllowance;

  const summary = {
    totalSales: parseFloat(totalSalesFromAllRecords) || 0,
    totalSalary: parseFloat(totalPayrollSummary.totalSalary) || 0,
    totalExpense: parseFloat(totalExpenseFromAllRecords) || 0,
    totalProfit: parseFloat(totalProfitFromAllRecords) || 0,
    totalTourExpense: parseFloat(summaryTotalTourExpense) || 0,
    totalAllowance: parseFloat(totalMergedAllowance) || 0,
    totalIncentive: parseFloat(totalPayrollSummary.totalIncentive) || 0,
    ratio,
    expenseSaleRatio:
      totalSalesFromAllRecords > 0
        ? parseFloat(
            (
              (totalExpenseFromAllRecords / totalSalesFromAllRecords) *
              100
            ).toFixed(2),
          )
        : 0,
  };

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
    const payrollAllowance = parseFloat(payroll.allowance) || 0;

    const mrIdFromSale = record.records?.[0]?.mrId;
    const tourExpKey =
      staffId || (mrIdFromSale ? mrIdFromSale.toString() : null);
    const tourExpense = tourExpKey
      ? tourExpenseByMR[tourExpKey]?.total || 0
      : 0;
    const tourAllowanceAmt = tourExpKey
      ? tourAllowanceByMR[tourExpKey]?.total || 0
      : 0;

    const mergedAllowance = payrollAllowance + tourAllowanceAmt;

    const sale = parseFloat(record.sale) || 0;
    const profit = parseFloat(record.profit) || 0;
    const totalExpense = salary + incentive + mergedAllowance + tourExpense;

    return {
      srDate: record.lastSaleDate || "",
      mrName: record.mrName || "",
      mrId: record.mrId || staffId || "",
      sale,
      profit,
      salary,
      incentive,
      allowance: mergedAllowance,
      tourExpense,
      totalExpense,
      salarySaleRatio: parseFloat(
        calculateSalarySaleRatio(salary, sale).toFixed(2),
      ),
      expenseSaleRatio: parseFloat(
        calculateExpenseSaleRatio(totalExpense, sale).toFixed(2),
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
      const payrollAllowance = parseFloat(payroll.allowance) || 0;
      const tourExpense = tourExpenseByMR[staffId]?.total || 0;
      const tourAllowanceAmt = tourAllowanceByMR[staffId]?.total || 0;
      const mergedAllowance = payrollAllowance + tourAllowanceAmt;
      const totalExpense = salary + incentive + mergedAllowance + tourExpense;
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
        allowance: mergedAllowance,
        tourExpense,
        totalExpense,
        salarySaleRatio: 0,
        expenseSaleRatio: 0,
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
      {
        header: "Allowance ($)\n(Payroll + Tour Allow.)",
        key: "allowance",
        width: 24,
      },
      {
        header: "Tour Expense ($)\nVans+Petrol+Province Mktg",
        key: "tourExpense",
        width: 22,
      },
      { header: "Total Expense ($)", key: "totalExpense", width: 15 },
      {
        header: "Salary/Sale (%)\n(Salary ÷ Sale × 100)",
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
      allowance: summary.totalAllowance,
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
      "allowance",
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
  } catch (error) {
    console.error("Error in export:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

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
