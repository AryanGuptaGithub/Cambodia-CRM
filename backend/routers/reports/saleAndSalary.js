// routes/salesSalaryRatio.js
import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import stockTransferToMR from "../../models/stock/stockTransferToMR.js";
import mongoose from "mongoose";

const router = express.Router();

router.get("/sales-salary-ratio", async (req, res) => {
  try {
    const { page = 1, limit = 7, search = "" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // 🔍 Step 1: Search filter
    const salesMatchConditions = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      salesMatchConditions.mrName = searchRegex;
    }

    // 📊 Step 2: Aggregate Sales
    const salesAggregate = await SaleSummary.aggregate([
      { $unwind: "$products" },
      { $match: salesMatchConditions },
      {
        $group: {
          _id: {
            mrName: "$mrName",
            mrId: "$mrId",
            recordingDate: {
              $dateToString: { format: "%Y-%m-%d", date: "$recordingDate" },
            },
          },
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$products.profitLoss" },
          totalNetSellingAmount: { $sum: "$products.netSellingAmount" },
          saleCount: { $sum: 1 },
          customers: { $addToSet: "$customerCode" },
        },
      },
      {
        $project: {
          _id: 0,
          srDate: "$_id.recordingDate",
          mrName: "$_id.mrName",
          mrId: "$_id.mrId",
          sale: "$totalSales",
          profit: "$totalProfit",
          gp: "$totalNetSellingAmount",
          saleCount: 1,
          customerCount: { $size: "$customers" },
        },
      },
      { $sort: { srDate: -1, mrName: 1 } },
    ]);

    // 👥 Step 3: Get unique MR names
    const mrNames = [...new Set(salesAggregate.map((r) => r.mrName))];

    let staffMembers = [];
    if (mrNames.length > 0) {
      staffMembers = await Staff.find({
        medicalRepName: { $in: mrNames },
      }).select("_id medicalRepName");
    }

    // 🗺️ Build a map for easy lookup
    const staffNameToId = {};
    const staffIdToName = {};
    staffMembers.forEach((staff) => {
      staffNameToId[staff.medicalRepName] = staff._id.toString();
      staffIdToName[staff._id.toString()] = staff.medicalRepName;
    });

    // 💰 Step 4: Payroll aggregation
    let payrollAggregate = [];
    if (staffMembers.length > 0) {
      const objectIdMrIds = staffMembers.map(
        (s) => new mongoose.Types.ObjectId(s._id)
      );
      payrollAggregate = await Payroll.aggregate([
        { $match: { employeeId: { $in: objectIdMrIds } } },
        {
          $group: {
            _id: "$employeeId",
            salary: { $sum: "$basicSalary" },
            incentive: { $sum: { $ifNull: ["$incentive", 0] } },
            allowance: { $sum: { $ifNull: ["$totalAllowance", 0] } },
            tourExpense: { $sum: { $ifNull: ["$tourExpense", 0] } },
            otherExpense: { $sum: { $ifNull: ["$otherExpense", 0] } },
          },
        },
      ]);
    }

    // 📘 Convert payroll to map by MR name
    const payrollByMrName = {};
    payrollAggregate.forEach((p) => {
      const name = staffIdToName[p._id.toString()];
      if (name) {
        payrollByMrName[name] = p;
      }
    });

    // 🔗 Step 5: Combine sales + payroll
    const combinedData = salesAggregate.map((record) => {
      const payroll = payrollByMrName[record.mrName] || {};

      const totalExpense =
        (payroll.salary || 0) +
        (payroll.incentive || 0) +
        (payroll.allowance || 0) +
        (payroll.tourExpense || 0) +
        (payroll.otherExpense || 0);

      const salarySaleRatio = record.sale > 0 ? totalExpense / record.sale : 0;
      const performance =
        totalExpense > 0 ? (record.profit / totalExpense) * 100 : 0;

      return {
        srDate: record.srDate,
        mrName: record.mrName,
        mrId: record.mrId,
        sale: record.sale || 0,
        profit: record.profit || 0,
        gp: record.gp || 0,
        salary: payroll.salary || 0,
        incentive: payroll.incentive || 0,
        allowance: payroll.allowance || 0,
        tourExpense: payroll.tourExpense || 0,
        otherExpense: payroll.otherExpense || 0,
        totalExpense,
        salarySaleRatio,
        performance,
        saleCount: record.saleCount || 0,
        customerCount: record.customerCount || 0,
      };
    });

    // 📄 Step 6: Pagination
    const totalRecords = combinedData.length;
    const paginatedData = combinedData.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalRecords / limitNum);

    // 📊 Step 7: Summary
    const summary = combinedData.reduce(
      (acc, record) => ({
        totalSales: acc.totalSales + (record.sale || 0),
        totalSalary: acc.totalSalary + (record.salary || 0),
        totalExpense: acc.totalExpense + (record.totalExpense || 0),
        totalProfit: acc.totalProfit + (record.profit || 0),
      }),
      { totalSales: 0, totalSalary: 0, totalExpense: 0, totalProfit: 0 }
    );

    summary.ratio =
      summary.totalSales > 0 ? summary.totalExpense / summary.totalSales : 0;

    // 📤 Step 8: Response
    res.status(200).json({
      success: true,
      data: {
        summary,
        records: paginatedData,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error in /sales-salary-ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales salary ratio data",
      error: error.message,
    });
  }
});

// Alternative version with better performance for large datasets
router.get("/sales-salary-ratio-optimized", async (req, res) => {
  try {
    const { page = 1, limit = 7, search = "" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions
    const matchConditions = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.mrName = searchRegex;
    }

    // Get total count first
    const totalCountAggregate = await SaleSummary.aggregate([
      { $unwind: "$products" },
      { $match: matchConditions },
      {
        $group: {
          _id: {
            mrName: "$mrName",
            recordingDate: {
              $dateToString: { format: "%Y-%m-%d", date: "$recordingDate" },
            },
          },
        },
      },
      { $count: "total" },
    ]);

    const totalRecords = totalCountAggregate[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Get paginated sales data
    const salesAggregate = await SaleSummary.aggregate([
      { $unwind: "$products" },
      { $match: matchConditions },
      {
        $group: {
          _id: {
            mrName: "$mrName",
            mrId: "$mrId",
            recordingDate: {
              $dateToString: { format: "%Y-%m-%d", date: "$recordingDate" },
            },
          },
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$products.profitLoss" },
          totalNetSellingAmount: { $sum: "$products.netSellingAmount" },
          saleCount: { $sum: 1 },
          customers: { $addToSet: "$customerCode" },
        },
      },
      {
        $project: {
          _id: 0,
          srDate: "$_id.recordingDate",
          mrName: "$_id.mrName",
          mrId: "$_id.mrId",
          sale: "$totalSales",
          profit: "$totalProfit",
          gp: "$totalNetSellingAmount",
          saleCount: 1,
          customerCount: { $size: "$customers" },
        },
      },
      { $sort: { srDate: -1, mrName: 1 } },
      { $skip: skip },
      { $limit: limitNum },
    ]);

    // Get MR IDs for the current page
    const mrIds = salesAggregate.map((record) => record.mrId);

    // Get staff information
    let staffMap = {};
    if (mrIds.length > 0) {
      const staffMembers = await Staff.find({
        _id: { $in: mrIds },
      }).select("_id medicalRepName");

      staffMembers.forEach((staff) => {
        staffMap[staff._id.toString()] = staff.medicalRepName;
      });
    }

    // Get payroll data for the current page's MRs
    let payrollAggregate = [];
    if (mrIds.length > 0) {
      payrollAggregate = await Payroll.aggregate([
        {
          $match: {
            employeeId: { $in: mrIds },
          },
        },
        {
          $group: {
            _id: "$employeeId",
            salary: { $sum: "$basicSalary" },
            incentive: { $sum: { $ifNull: ["$incentive", 0] } },
            allowance: { $sum: { $ifNull: ["$totalAllowance", 0] } },
            tourExpense: { $sum: { $ifNull: ["$tourExpense", 0] } },
            otherExpense: { $sum: { $ifNull: ["$otherExpense", 0] } },
          },
        },
      ]);
    }

    // Combine data
    const records = salesAggregate.map((record) => {
      const payroll =
        payrollAggregate.find(
          (p) => p._id.toString() === record.mrId?.toString()
        ) || {};
      const actualMrName = staffMap[record.mrId] || record.mrName;

      const totalExpense =
        (payroll.salary || 0) +
        (payroll.incentive || 0) +
        (payroll.allowance || 0) +
        (payroll.tourExpense || 0) +
        (payroll.otherExpense || 0);

      const salarySaleRatio = record.sale > 0 ? totalExpense / record.sale : 0;
      const performance =
        totalExpense > 0 ? (record.profit / totalExpense) * 100 : 0;

      return {
        srDate: record.srDate,
        mrName: actualMrName,
        mrId: record.mrId,
        sale: record.sale || 0,
        profit: record.profit || 0,
        gp: record.gp || 0,
        salary: payroll.salary || 0,
        incentive: payroll.incentive || 0,
        allowance: payroll.allowance || 0,
        tourExpense: payroll.tourExpense || 0,
        totalExpense: totalExpense,
        salarySaleRatio: salarySaleRatio,
        performance: performance,
        saleCount: record.saleCount || 0,
        customerCount: record.customerCount || 0,
      };
    });

    // Calculate summary from all data
    const allSalesData = await SaleSummary.aggregate([
      { $unwind: "$products" },
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$products.profitLoss" },
        },
      },
    ]);

    const allMrIds = await SaleSummary.distinct("mrId", matchConditions);

    const allPayrollData = await Payroll.aggregate([
      {
        $match: {
          employeeId: { $in: allMrIds },
        },
      },
      {
        $group: {
          _id: null,
          totalSalary: { $sum: "$basicSalary" },
          totalIncentive: { $sum: { $ifNull: ["$incentive", 0] } },
          totalAllowance: { $sum: { $ifNull: ["$totalAllowance", 0] } },
          totalTourExpense: { $sum: { $ifNull: ["$tourExpense", 0] } },
          totalOtherExpense: { $sum: { $ifNull: ["$otherExpense", 0] } },
        },
      },
    ]);

    const totalSales = allSalesData[0]?.totalSales || 0;
    const totalProfit = allSalesData[0]?.totalProfit || 0;
    const totalSalary = allPayrollData[0]?.totalSalary || 0;
    const totalIncentive = allPayrollData[0]?.totalIncentive || 0;
    const totalAllowance = allPayrollData[0]?.totalAllowance || 0;
    const totalTourExpense = allPayrollData[0]?.totalTourExpense || 0;
    const totalOtherExpense = allPayrollData[0]?.totalOtherExpense || 0;

    const totalExpense =
      totalSalary +
      totalIncentive +
      totalAllowance +
      totalTourExpense +
      totalOtherExpense;
    const ratio = totalSales > 0 ? totalExpense / totalSales : 0;

    const summary = {
      totalSales,
      totalSalary,
      totalExpense,
      totalProfit,
      ratio,
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching sales salary ratio data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales salary ratio data",
      error: error.message,
    });
  }
});

router.get("/mrs", async (req, res) => {
  try {
    // Simple aggregation to get only unique MR names
    const mrList = await stockTransferToMR.aggregate([
      {
        $group: {
          _id: "$stockTransferToMr", // Group by MR name
        },
      },
      {
        $project: {
          _id: 0,
          mrName: "$_id",
        },
      },
      { $sort: { mrName: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: mrList,
    });
  } catch (error) {
    console.error("❌ Error fetching MR list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR list",
      error: error.message,
    });
  }
});

export default router;
