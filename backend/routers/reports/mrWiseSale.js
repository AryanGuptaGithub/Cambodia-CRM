import express from "express";
import ExcelJS from 'exceljs';
import mongoose from "mongoose";
import SaleSummary from "../../models/sale/saleSummary.js";
import MRStockInHand from "../../models/sale/mrStockHand.js";
import Staff from "../../models/staffMember/staff.js";

const router = express.Router();

// ==========================================
// 🔥 CRITICAL: ALL SPECIFIC ROUTES MUST COME BEFORE PARAMETERIZED ROUTES
// ==========================================

// --------------------------------------------------------------
// ✅ MR WISE SALES REPORTING ENDPOINTS - MUST BE FIRST
// --------------------------------------------------------------

// Helper function to generate MR ID
const generateMRId = (index) => {
  return `MR${String(index + 1).padStart(3, "0")}`;
};

/**
 * ✅ FIXED: /sales endpoint - MUST come before all other routes
 */
router.get("/sales", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      matchConditions.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // Base aggregation pipeline for all sales
    const basePipeline = [
      { $match: matchConditions },

      // Group by MR to get sales summary
      {
        $group: {
          _id: "$mrName",
          totalSalesAmount: {
            $sum: {
              $ifNull: [
                "$netSellingAmount",
                "$totalAmount",
                "$amount",
                "$salesAmount",
                0
              ]
            }
          },
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      // Calculate average order value
      {
        $addFields: {
          averageOrderValue: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalOrders", 0] },
                  { $divide: ["$totalSalesAmount", "$totalOrders"] },
                  0
                ]
              },
              2
            ]
          }
        }
      },

      // Lookup staff details
      {
        $lookup: {
          from: "staffs",
          let: { mrName: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$medicalRepName", "$$mrName"] },
                    { $eq: ["$enabled", true] },
                  ],
                },
              },
            },
            {
              $project: {
                medicalRepName: 1,
                teamName: 1,
                contactNo: 1,
                email: 1,
              },
            },
          ],
          as: "staffDetails",
        },
      },

      // Format output
      {
        $project: {
          mrName: { $ifNull: ["$_id", "Unknown"] },
          totalSalesAmount: {
            $round: [
              { $ifNull: ["$totalSalesAmount", 0] },
              2
            ]
          },
          totalOrders: { $ifNull: ["$totalOrders", 0] },
          averageOrderValue: { $ifNull: ["$averageOrderValue", 0] },
          totalCustomers: {
            $cond: {
              if: { $isArray: "$uniqueCustomers" },
              then: { $size: "$uniqueCustomers" },
              else: 0
            }
          },
          staff: {
            $cond: {
              if: { $gt: [{ $size: "$staffDetails" }, 0] },
              then: { $arrayElemAt: ["$staffDetails", 0] },
              else: {
                medicalRepName: "$_id",
                contactNo: "Not Available",
                email: "Not Available",
                teamName: "Not Available",
              },
            },
          },
        },
      },

      { $sort: { totalSalesAmount: -1 } },
    ];

    // Execute aggregations in parallel
    const [countResult, mrData, summaryResult] = await Promise.all([
      SaleSummary.aggregate([...basePipeline, { $count: "totalCount" }]),

      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),

      // Summary aggregation
      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$mrName",
            totalSalesAmount: {
              $sum: {
                $ifNull: [
                  "$netSellingAmount",
                  "$totalAmount",
                  "$amount",
                  "$salesAmount",
                  0
                ]
              }
            },
            totalOrders: { $sum: 1 },
            uniqueCustomers: { $addToSet: "$customerCode" },
          },
        },
        {
          $group: {
            _id: null,
            totalSalesAmount: {
              $sum: {
                $round: [
                  { $ifNull: ["$totalSalesAmount", 0] },
                  2
                ]
              }
            },
            totalOrders: { $sum: "$totalOrders" },
            totalCustomers: {
              $sum: {
                $cond: {
                  if: { $isArray: "$uniqueCustomers" },
                  then: { $size: "$uniqueCustomers" },
                  else: 0
                }
              }
            },
            totalMRs: { $sum: 1 },
          },
        },
        {
          $addFields: {
            averageOrderValue: {
              $round: [
                {
                  $cond: [
                    { $gt: ["$totalOrders", 0] },
                    { $divide: ["$totalSalesAmount", "$totalOrders"] },
                    0
                  ]
                },
                2
              ]
            }
          }
        }
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    const records = mrData.map((mr, index) => ({
      mrId: generateMRId(skip + index),
      mrName: mr.mrName || "Not Available",
      totalSalesAmount: parseFloat(mr.totalSalesAmount || 0),
      totalOrders: parseInt(mr.totalOrders || 0),
      averageOrderValue: parseFloat(mr.averageOrderValue || 0),
      totalCustomers: parseInt(mr.totalCustomers || 0),
      staff: mr.staff || {},
      region: mr.staff?.teamName || "Not Available",
      email: mr.staff?.email || "Not Available",
      contactNumber: mr.staff?.contactNo || "Not Available",
    }));

    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalMRs: 0,
      averageOrderValue: 0,
    };

    const formattedSummary = {
      totalSalesAmount: parseFloat(summary.totalSalesAmount),
      totalOrders: parseInt(summary.totalOrders),
      totalCustomers: parseInt(summary.totalCustomers),
      totalMRs: parseInt(summary.totalMRs),
      averageOrderValue: parseFloat(summary.averageOrderValue),
    };

    res.json({
      data: {
        summary: formattedSummary,
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
  } catch (err) {
    console.error("Error in /sales:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

/**
 * ✅ FIXED: /export/excel endpoint - MUST come before /:mrId
 */
router.get("/export/excel", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    const matchConditions = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      matchConditions.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // Get all MR sales data without pagination for export
    const mrData = await SaleSummary.aggregate([
      { $match: matchConditions },

      {
        $group: {
          _id: "$mrName",
          totalSalesAmount: {
            $sum: {
              $ifNull: [
                "$netSellingAmount",
                "$totalAmount",
                "$amount",
                "$salesAmount",
                0
              ]
            }
          },
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      {
        $addFields: {
          averageOrderValue: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalOrders", 0] },
                  { $divide: ["$totalSalesAmount", "$totalOrders"] },
                  0
                ]
              },
              2
            ]
          }
        }
      },

      {
        $lookup: {
          from: "staffs",
          let: { mrName: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$medicalRepName", "$$mrName"] },
                    { $eq: ["$enabled", true] },
                  ],
                },
              },
            },
            {
              $project: {
                medicalRepName: 1,
                teamName: 1,
                contactNo: 1,
                email: 1,
              },
            },
          ],
          as: "staffDetails",
        },
      },

      {
        $project: {
          mrName: { $ifNull: ["$_id", "Unknown"] },
          totalSalesAmount: {
            $round: [
              { $ifNull: ["$totalSalesAmount", 0] },
              2
            ]
          },
          totalOrders: { $ifNull: ["$totalOrders", 0] },
          averageOrderValue: { $ifNull: ["$averageOrderValue", 0] },
          totalCustomers: {
            $cond: {
              if: { $isArray: "$uniqueCustomers" },
              then: { $size: "$uniqueCustomers" },
              else: 0
            }
          },
          staff: {
            $cond: {
              if: { $gt: [{ $size: "$staffDetails" }, 0] },
              then: { $arrayElemAt: ["$staffDetails", 0] },
              else: {
                medicalRepName: "$_id",
                contactNo: "Not Available",
                email: "Not Available",
                teamName: "Not Available",
              },
            },
          },
        },
      },

      { $sort: { totalSalesAmount: -1 } },
    ]);

    const totalSales = mrData.reduce((sum, mr) => {
      return sum + parseFloat(mr.totalSalesAmount || 0);
    }, 0);

    const totalOrders = mrData.reduce((sum, mr) => {
      return sum + (mr.totalOrders || 0);
    }, 0);

    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MR Wise Sales System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('MR Wise Sales');

    worksheet.mergeCells('A1:G1');
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = 'MR Wise Sales Report';
    titleRow.getCell(1).font = { bold: true, size: 16 };
    titleRow.getCell(1).alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:C3');
    worksheet.getCell('A3').value = `Total Sales: $${parseFloat(totalSales).toFixed(2)}`;
    worksheet.getCell('A3').font = { bold: true, size: 12 };

    worksheet.mergeCells('A4:C4');
    worksheet.getCell('A4').value = `Total Orders: ${totalOrders}`;
    worksheet.getCell('A4').font = { bold: true, size: 12 };

    worksheet.mergeCells('A5:C5');
    worksheet.getCell('A5').value = `Avg Order Value: $${parseFloat(avgOrderValue).toFixed(2)}`;
    worksheet.getCell('A5').font = { bold: true, size: 12 };

    worksheet.addRow({});

    const headerRowNum = 7;
    worksheet.getCell(`A${headerRowNum}`).value = 'Sr.No';
    worksheet.getCell(`B${headerRowNum}`).value = 'MR Name';
    worksheet.getCell(`C${headerRowNum}`).value = 'Region';
    worksheet.getCell(`D${headerRowNum}`).value = 'Total Orders';
    worksheet.getCell(`E${headerRowNum}`).value = 'Total Sales';
    worksheet.getCell(`F${headerRowNum}`).value = 'Avg Order Value';

    const headerRow = worksheet.getRow(headerRowNum);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    };
    headerRow.height = 25;

    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    mrData.forEach((mr, index) => {
      const rowNum = headerRowNum + index + 1;
      const row = worksheet.getRow(rowNum);

      row.getCell(1).value = index + 1;
      row.getCell(2).value = mr.mrName || 'N/A';
      row.getCell(3).value = mr.staff?.teamName || 'Not Available';
      row.getCell(4).value = mr.totalOrders || 0;
      row.getCell(5).value = parseFloat(mr.totalSalesAmount || 0);
      row.getCell(5).numFmt = '$#,##0.00';
      row.getCell(6).value = parseFloat(mr.averageOrderValue || 0);
      row.getCell(6).numFmt = '$#,##0.00';

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
    });

    worksheet.columns = [
      { key: 'serialNo', width: 10 },
      { key: 'mrName', width: 25 },
      { key: 'region', width: 20 },
      { key: 'totalOrders', width: 15 },
      { key: 'totalSales', width: 20 },
      { key: 'avgOrderValue', width: 18 },
    ];

    const dataEndRow = headerRowNum + mrData.length;
    for (let i = headerRowNum; i <= dataEndRow; i++) {
      const row = worksheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];

    let fileName = 'mr-wise-sales';
    if (startDate && endDate) {
      fileName = `mr-wise-sales-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}`;
    } else {
      fileName = `mr-wise-sales-${formattedDate.replace(/-/g, '')}`;
    }
    fileName += '.xlsx';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);

  } catch (err) {
    console.error("Error in /export/excel:", err);
    res.status(500).json({
      error: "Failed to generate Excel export",
      message: err.message,
    });
  }
});

/**
 * ✅ FIXED: /debug-sales-data endpoint - MUST come before /:mrId
 */
router.get("/debug-sales-data", async (req, res) => {
  try {
    const sampleDocs = await SaleSummary.find({}).limit(5);

    const fieldAnalysis = sampleDocs.map(doc => {
      const docObj = doc.toObject();
      return {
        _id: doc._id,
        mrName: doc.mrName,
        fields: Object.keys(docObj).filter(key =>
          key.toLowerCase().includes('amount') ||
          key.toLowerCase().includes('total') ||
          key.toLowerCase().includes('price')
        ).map(key => ({
          field: key,
          value: docObj[key],
          type: typeof docObj[key]
        }))
      };
    });

    res.json({
      success: true,
      sampleCount: sampleDocs.length,
      fieldAnalysis,
      allFields: sampleDocs.length > 0 ? Object.keys(sampleDocs[0].toObject()) : []
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --------------------------------------------------------------
// ✅ MR STOCK ENDPOINTS – SPECIFIC ROUTES
// --------------------------------------------------------------

router.get("/mrs-with-stock", async (req, res) => {
  try {
    const mrStocks = await MRStockInHand.find()
      .populate('mrId', 'medicalRepName MRId')
      .lean();

    const mrsWithStock = mrStocks
      .filter(mrStock => mrStock.productsInHand?.some(p => p.quantity > 0))
      .map(mrStock => ({
        _id: mrStock.mrId?._id || mrStock.mrId,
        mrName: mrStock.mrName,
        medicalRepName: mrStock.mrName,
        totalProducts: mrStock.productsInHand.filter(p => p.quantity > 0).length,
        totalQuantity: mrStock.productsInHand.reduce((sum, p) => sum + (p.quantity || 0), 0)
      }));

    res.json({
      success: true,
      data: mrsWithStock,
      count: mrsWithStock.length
    });
  } catch (error) {
    console.error("Error fetching MRs with stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MRs with stock",
      error: error.message
    });
  }
});

router.get("/products/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid MR ID format"
      });
    }

    const mrStock = await MRStockInHand.findOne({ mrId }).lean();

    if (!mrStock) {
      return res.json({
        success: true,
        products: [],
        mrName: null
      });
    }

    const availableProducts = (mrStock.productsInHand || [])
      .filter(p => p.quantity > 0)
      .map(p => ({
        productName: p.productName,
        quantity: p.quantity,
        lc: p.lc || 0
      }));

    res.json({
      success: true,
      products: availableProducts,
      mrName: mrStock.mrName,
      count: availableProducts.length
    });
  } catch (error) {
    console.error("Error fetching MR products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR products",
      error: error.message
    });
  }
});

router.post("/deduct", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrId, productName, salesQty, bonusQty } = req.body;

    if (!mrId || !productName) {
      throw new Error("MR ID and product name are required");
    }

    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      throw new Error("Invalid MR ID format");
    }

    const totalQty = fixPrecision((parseFloat(salesQty) || 0) + (parseFloat(bonusQty) || 0));

    if (totalQty <= 0) {
      throw new Error("Total quantity must be greater than 0");
    }

    const mrStock = await MRStockInHand.findOne({ mrId }).session(session);

    if (!mrStock) {
      throw new Error("MR stock not found");
    }

    const productIndex = mrStock.productsInHand.findIndex(
      p => p.productName.toLowerCase().trim() === productName.toLowerCase().trim()
    );

    if (productIndex === -1) {
      throw new Error(`Product "${productName}" not found in ${mrStock.mrName}'s stock`);
    }

    const product = mrStock.productsInHand[productIndex];

    if (product.quantity < totalQty) {
      throw new Error(
        `Insufficient stock for ${productName}. ` +
        `Available: ${product.quantity}, Required: ${totalQty}, ` +
        `Short by: ${fixPrecision(totalQty - product.quantity)}`
      );
    }

    mrStock.productsInHand[productIndex].quantity = fixPrecision(product.quantity - totalQty);
    mrStock.productsInHand[productIndex].lastUpdated = new Date();

    if (mrStock.productsInHand[productIndex].quantity === 0) {
      mrStock.productsInHand.splice(productIndex, 1);
    }

    mrStock.updatedAt = new Date();
    await mrStock.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Stock deducted successfully",
      deductedQty: totalQty,
      remainingQty: mrStock.productsInHand[productIndex]?.quantity || 0,
      mrName: mrStock.mrName,
      productName: productName
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error deducting MR stock:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to deduct stock",
      error: error.message
    });
  }
});

router.post("/restore", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrId, productName, quantity, lc } = req.body;

    if (!mrId || !productName || !quantity) {
      throw new Error("MR ID, product name, and quantity are required");
    }

    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      throw new Error("Invalid MR ID format");
    }

    const restoreQty = fixPrecision(parseFloat(quantity));

    if (restoreQty <= 0) {
      throw new Error("Quantity must be greater than 0");
    }

    let mrStock = await MRStockInHand.findOne({ mrId }).session(session);

    if (!mrStock) {
      const mr = await Staff.findById(mrId).session(session);
      if (!mr) {
        throw new Error("MR not found");
      }

      mrStock = new MRStockInHand({
        mrId: mrId,
        mrName: mr.medicalRepName,
        productsInHand: [{
          productName: productName,
          quantity: restoreQty,
          lc: lc || 0,
          lastUpdated: new Date()
        }]
      });
    } else {
      const productIndex = mrStock.productsInHand.findIndex(
        p => p.productName.toLowerCase().trim() === productName.toLowerCase().trim()
      );

      if (productIndex === -1) {
        mrStock.productsInHand.push({
          productName: productName,
          quantity: restoreQty,
          lc: lc || 0,
          lastUpdated: new Date()
        });
      } else {
        mrStock.productsInHand[productIndex].quantity = fixPrecision(
          mrStock.productsInHand[productIndex].quantity + restoreQty
        );
        mrStock.productsInHand[productIndex].lastUpdated = new Date();
      }
    }

    mrStock.updatedAt = new Date();
    await mrStock.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Stock restored successfully",
      restoredQty: restoreQty,
      mrName: mrStock.mrName,
      productName: productName
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error restoring MR stock:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to restore stock",
      error: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const mrStocks = await MRStockInHand.find()
      .populate('mrId', 'medicalRepName MRId')
      .sort({ mrName: 1 })
      .lean();

    res.json({
      success: true,
      data: mrStocks,
      count: mrStocks.length
    });
  } catch (error) {
    console.error("Error fetching MR stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR stock",
      error: error.message
    });
  }
});

// --------------------------------------------------------------
// ⚠️ PARAMETERIZED ROUTES - MUST BE LAST
// --------------------------------------------------------------

router.get("/:mrId/:productName", async (req, res) => {
  try {
    const { mrId, productName } = req.params;
    const decodedProductName = decodeURIComponent(productName);

    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid MR ID format"
      });
    }

    const mrStock = await MRStockInHand.findOne({ mrId }).lean();

    if (!mrStock) {
      return res.status(404).json({
        success: false,
        message: "MR stock not found"
      });
    }

    const product = mrStock.productsInHand.find(
      p => p.productName.toLowerCase().trim() === decodedProductName.toLowerCase().trim()
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product "${decodedProductName}" not found in ${mrStock.mrName}'s stock`
      });
    }

    res.json({
      success: true,
      stock: {
        productName: product.productName,
        quantity: product.quantity,
        lc: product.lc || 0,
        lastUpdated: product.lastUpdated
      },
      mrName: mrStock.mrName
    });
  } catch (error) {
    console.error("Error fetching MR product stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR product stock",
      error: error.message
    });
  }
});

router.get("/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid MR ID format"
      });
    }

    const mrStock = await MRStockInHand.findOne({ mrId })
      .populate('mrId', 'medicalRepName MRId')
      .lean();

    if (!mrStock) {
      return res.status(404).json({
        success: false,
        message: "MR stock not found"
      });
    }

    res.json({
      success: true,
      data: mrStock
    });
  } catch (error) {
    console.error("Error fetching MR stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR stock",
      error: error.message
    });
  }
});

// ==========================================
// HELPER FUNCTION
// ==========================================
const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

export default router;