import express from "express";
import ExcelJS from "exceljs";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Helper function to parse local date strings (YYYY-MM-DD) as local dates
const parseLocalDateStart = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  // Create date at LOCAL midnight (00:00:00)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const parseLocalDateEnd = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  // Create date at LOCAL end of day (23:59:59.999)
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
};

// Helper function
const generateFallbackMRId = (index) => {
  return `MR${String(index + 1).padStart(3, "0")}`;
};

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const skip = (page - 1) * limit;

    const matchConditions = { dueAmount: { $gt: 0 } };

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // Use proper local date parsing
    if (startDate && endDate) {
      const start = parseLocalDateStart(startDate);
      const end = parseLocalDateEnd(endDate);

      if (start && end) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const pipeline = [
      { $match: matchConditions },
      {
        $addFields: {
          _mrNameNormalized: {
            $toLower: { $trim: { input: "$mrName" } },
          },
        },
      },
      {
        $group: {
          _id: "$_mrNameNormalized",
          mrName: { $first: "$mrName" },
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },
      {
        $lookup: {
          from: "staffs",
          let: { name: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toLower: { $trim: { input: "$medicalRepName" } } },
                    "$$name",
                  ],
                },
              },
            },
          ],
          as: "staff",
        },
      },
      {
        $project: {
          mrName: 1,
          totalOutstandingAmount: 1,
          totalCustomers: { $size: "$uniqueCustomers" },
          staff: { $arrayElemAt: ["$staff", 0] },
        },
      },
      { $sort: { totalOutstandingAmount: -1 } },
    ];

    const data = await SaleSummary.aggregate([
      ...pipeline,
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    const totalCount = await SaleSummary.aggregate([
      ...pipeline,
      { $count: "count" },
    ]);

    // Grand totals across ALL MRs (not just current page)
    const grandTotals = await SaleSummary.aggregate([
      ...pipeline,
      {
        $group: {
          _id: null,
          totalOutstandingAmount: { $sum: "$totalOutstandingAmount" },
          totalCustomers: { $sum: "$totalCustomers" },
        },
      },
    ]);

    res.json({
      data: {
        records: data.map((mr, i) => ({
          mrId: mr.staff?.MRId
            ? String(mr.staff.MRId).padStart(3, "0")
            : generateFallbackMRId(i),
          mrName: mr.mrName,
          totalOutstandingAmount: mr.totalOutstandingAmount,
          totalCustomers: mr.totalCustomers,
          staff: {
            contactNo: mr.staff?.contactNo || "Not Available",
            email: mr.staff?.email || "Not Available",
          },
        })),
        summary: {
          totalOutstandingAmount: grandTotals[0]?.totalOutstandingAmount || 0,
          totalCustomers: grandTotals[0]?.totalCustomers || 0,
          totalMRs: totalCount[0]?.count || 0,
        },
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil((totalCount[0]?.count || 0) / limit),
        totalRecords: totalCount[0]?.count || 0,
        hasNext:
          parseInt(page) < Math.ceil((totalCount[0]?.count || 0) / limit),
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/customers/:mrName", async (req, res) => {
  try {
    const decodedMrName = decodeURIComponent(req.params.mrName).trim();
    const { startDate, endDate } = req.query;

    const matchConditions = {
      dueAmount: { $gt: 0 },
      mrName: { $regex: new RegExp(`^${decodedMrName}$`, "i") },
    };

    // Use proper local date parsing
    if (startDate && endDate) {
      const start = parseLocalDateStart(startDate);
      const end = parseLocalDateEnd(endDate);

      if (start && end) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const invoices = await SaleSummary.aggregate([
      { $match: matchConditions },

      // Convert customerId string → ObjectId so lookup works correctly
      {
        $addFields: {
          _customerObjId: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$customerId", null] },
                  { $ne: ["$customerId", ""] },
                ],
              },
              then: { $toObjectId: "$customerId" },
              else: null,
            },
          },
        },
      },

      // Lookup 1: by customerId → _id (ObjectId match)
      {
        $lookup: {
          from: "customers",
          localField: "_customerObjId",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                customerNumber: 1,
                phone: 1,
                mobile: 1,
                address: 1,
                province: 1,
                name: 1,
                customerCode: 1,
              },
            },
          ],
          as: "customerById",
        },
      },

      // Lookup 2: by customerCode (fallback when customerId is null)
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          pipeline: [
            {
              $project: {
                customerNumber: 1,
                phone: 1,
                mobile: 1,
                address: 1,
                province: 1,
                name: 1,
                customerCode: 1,
              },
            },
            { $limit: 1 },
          ],
          as: "customerByCode",
        },
      },

      // Pick best customer doc: prefer Id match, fallback to Code match
      {
        $addFields: {
          customerDoc: {
            $cond: {
              if: { $gt: [{ $size: "$customerById" }, 0] },
              then: { $arrayElemAt: ["$customerById", 0] },
              else: { $arrayElemAt: ["$customerByCode", 0] },
            },
          },
        },
      },

      {
        $project: {
          invoiceNumber: 1,
          invoiceDate: 1,
          customerCode: 1,
          customerName: { $ifNull: ["$customerName", "N/A"] },
          totalAmount: { $ifNull: ["$totalAmount", 0] },
          collectedAmount: { $ifNull: ["$paidAmount", 0] },
          pendingAmount: { $ifNull: ["$dueAmount", 0] },
          customerAddress: {
            $ifNull: ["$customerDoc.address", { $ifNull: ["$address", "N/A"] }],
          },
          contact: {
            $ifNull: [
              "$customerDoc.customerNumber",
              {
                $ifNull: [
                  "$customerDoc.phone",
                  { $ifNull: ["$customerDoc.mobile", "N/A"] },
                ],
              },
            ],
          },
          province: { $ifNull: ["$customerDoc.province", "N/A"] },
        },
      },

      { $sort: { pendingAmount: -1, invoiceDate: -1 } },
    ]);

    res.json({ success: true, data: invoices });
  } catch (err) {
    console.error("Error in /customers/:mrName →", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/export/excel", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;

    const matchConditions = {};
    matchConditions.dueAmount = { $gt: 0 };

    if (search && search.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // Use proper local date parsing
    if (startDate && endDate) {
      const start = parseLocalDateStart(startDate);
      const end = parseLocalDateEnd(endDate);

      if (start && end) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const data = await SaleSummary.aggregate([
      { $match: matchConditions },

      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          pipeline: [
            {
              $project: {
                address: 1,
                customerNumber: 1,
                phone: 1,
                mobile: 1,
                province: 1,
              },
            },
          ],
          as: "customerInfo",
        },
      },

      {
        $addFields: {
          customer: { $arrayElemAt: ["$customerInfo", 0] },
        },
      },

      {
        $project: {
          mrName: { $ifNull: ["$mrName", "N/A"] },
          invoiceNumber: { $ifNull: ["$invoiceNumber", "N/A"] },
          customerName: { $ifNull: ["$customerName", "N/A"] },
          customerAddress: {
            $ifNull: ["$customer.address", { $ifNull: ["$address", "N/A"] }],
          },
          totalAmount: { $ifNull: ["$totalAmount", 0] },
          collectedAmount: { $ifNull: ["$paidAmount", 0] },
          pendingAmount: { $ifNull: ["$dueAmount", 0] },
          contact: {
            $ifNull: [
              "$customer.customerNumber",
              {
                $ifNull: [
                  "$customer.phone",
                  { $ifNull: ["$customer.mobile", "N/A"] },
                ],
              },
            ],
          },
          province: { $ifNull: ["$customer.province", "N/A"] },
        },
      },

      { $sort: { mrName: 1, pendingAmount: -1 } },
    ]);

    if (!data || data.length === 0) {
      return res.status(404).json({
        message: "No data found for export. Check filters or database.",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("MR Customer Outstanding");

    worksheet.columns = [
      { header: "Sr.No", key: "sr", width: 8 },
      { header: "MR Name", key: "mrName", width: 25 },
      { header: "Invoice Number", key: "invoiceNumber", width: 20 },
      { header: "Customer Name", key: "customerName", width: 30 },
      { header: "Customer Address", key: "customerAddress", width: 35 },
      { header: "Total Amount ($)", key: "totalAmount", width: 18 },
      { header: "Collected Amount ($)", key: "collectedAmount", width: 20 },
      { header: "Pending Amount ($)", key: "pendingAmount", width: 18 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    data.forEach((item, index) => {
      const row = worksheet.addRow({
        sr: index + 1,
        mrName: item.mrName,
        invoiceNumber: item.invoiceNumber,
        customerName: item.customerName,
        customerAddress: item.customerAddress,
        totalAmount: item.totalAmount,
        collectedAmount: item.collectedAmount,
        pendingAmount: item.pendingAmount,
      });
      row.alignment = { vertical: "middle" };
    });

    ["totalAmount", "collectedAmount", "pendingAmount"].forEach((col) => {
      worksheet.getColumn(col).numFmt = "$#,##0.00";
    });

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=mr-customer-outstanding.xlsx",
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error("EXPORT ERROR:", error);
    res.status(500).json({
      error: "Excel export failed",
      message: error.message,
    });
  }
});

// NEW ROUTE: Export MR-specific invoice details to Excel
router.get("/export/mr-excel", async (req, res) => {
  try {
    const { mrName, startDate, endDate } = req.query;

    if (!mrName) {
      return res.status(400).json({ error: "MR name is required" });
    }

    const matchConditions = {
      dueAmount: { $gt: 0 },
      mrName: { $regex: new RegExp(`^${decodeURIComponent(mrName)}$`, "i") },
    };

    // Apply date filters if provided
    if (startDate && endDate) {
      const start = parseLocalDateStart(startDate);
      const end = parseLocalDateEnd(endDate);

      if (start && end) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const data = await SaleSummary.aggregate([
      { $match: matchConditions },

      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          pipeline: [
            {
              $project: {
                address: 1,
                customerNumber: 1,
                phone: 1,
                mobile: 1,
                province: 1,
                name: 1,
              },
            },
          ],
          as: "customerInfo",
        },
      },

      {
        $addFields: {
          customer: { $arrayElemAt: ["$customerInfo", 0] },
        },
      },

      {
        $project: {
          mrName: { $ifNull: ["$mrName", "N/A"] },
          invoiceNumber: { $ifNull: ["$invoiceNumber", "N/A"] },
          invoiceDate: 1,
          customerName: { $ifNull: ["$customerName", "N/A"] },
          customerAddress: {
            $ifNull: ["$customer.address", { $ifNull: ["$address", "N/A"] }],
          },
          totalAmount: { $ifNull: ["$totalAmount", 0] },
          collectedAmount: { $ifNull: ["$paidAmount", 0] },
          pendingAmount: { $ifNull: ["$dueAmount", 0] },
          contact: {
            $ifNull: [
              "$customer.customerNumber",
              {
                $ifNull: [
                  "$customer.phone",
                  { $ifNull: ["$customer.mobile", "N/A"] },
                ],
              },
            ],
          },
          province: { $ifNull: ["$customer.province", "N/A"] },
        },
      },

      { $sort: { pendingAmount: -1, invoiceDate: -1 } },
    ]);

    if (!data || data.length === 0) {
      return res.status(404).json({
        message: "No data found for this MR. Check filters or database.",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${mrName} - Outstanding Invoices`);

    worksheet.columns = [
      { header: "Sr.No", key: "sr", width: 8 },
      { header: "Invoice Number", key: "invoiceNumber", width: 20 },
      { header: "Invoice Date", key: "invoiceDate", width: 15 },
      { header: "Customer Name", key: "customerName", width: 30 },
      { header: "Customer Address", key: "customerAddress", width: 35 },
      { header: "Contact", key: "contact", width: 15 },
      { header: "Province", key: "province", width: 15 },
      { header: "Total Amount ($)", key: "totalAmount", width: 18 },
      { header: "Collected Amount ($)", key: "collectedAmount", width: 20 },
      { header: "Pending Amount ($)", key: "pendingAmount", width: 18 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    // Add summary info before the data
    const summaryRow = worksheet.addRow([`MR Name: ${mrName}`]);
    summaryRow.font = { bold: true };
    worksheet.addRow([`Generated: ${new Date().toLocaleString()}`]);
    worksheet.addRow([]); // Empty row

    // Calculate totals
    const totals = data.reduce(
      (acc, item) => {
        acc.totalAmount += item.totalAmount;
        acc.collectedAmount += item.collectedAmount;
        acc.pendingAmount += item.pendingAmount;
        return acc;
      },
      { totalAmount: 0, collectedAmount: 0, pendingAmount: 0 },
    );

    data.forEach((item, index) => {
      const row = worksheet.addRow({
        sr: index + 1,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : "",
        customerName: item.customerName,
        customerAddress: item.customerAddress,
        contact: item.contact,
        province: item.province,
        totalAmount: item.totalAmount,
        collectedAmount: item.collectedAmount,
        pendingAmount: item.pendingAmount,
      });
      row.alignment = { vertical: "middle" };

      // Format invoice date
      const dateCell = row.getCell("invoiceDate");
      dateCell.numFmt = "dd-mm-yyyy";
    });

    // Add totals row
    worksheet.addRow([]);
    const totalsRow = worksheet.addRow([
      "",
      "",
      "",
      "",
      "",
      "",
      "GRAND TOTAL:",
      `$${totals.totalAmount.toFixed(2)}`,
      `$${totals.collectedAmount.toFixed(2)}`,
      `$${totals.pendingAmount.toFixed(2)}`,
    ]);
    totalsRow.font = { bold: true };
    totalsRow.getCell(7).alignment = { horizontal: "right" };

    // Format number columns
    ["totalAmount", "collectedAmount", "pendingAmount"].forEach((col) => {
      worksheet.getColumn(col).numFmt = "$#,##0.00";
    });

    // Add borders
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    const fileName = `${mrName.replace(/\s/g, "_")}_outstanding_invoices.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error("MR Excel Export Error:", error);
    res.status(500).json({
      error: "Excel export failed",
      message: error.message,
    });
  }
});

export default router;
