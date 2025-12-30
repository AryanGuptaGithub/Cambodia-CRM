import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from 'exceljs';

const router = express.Router();

// ... (your existing cash-sales routes remain the same) ...

// Outstanding Collections Report
router.get("/reports/outstanding-collections", async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      page = 1, 
      limit = 7, 
      search,
      customerCode,
      status 
    } = req.query;

    const matchStage = {
      paymentStatus: { $regex: /^credit$/i },
      isReturn: false,
      isExchange: false,
      dueAmount: { $gt: 0 } // Only include records with due amount > 0
    };

    // Handle date filtering
    if (startDate || endDate) {
      matchStage.deliveryDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        matchStage.deliveryDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format",
          });
        }
        end.setHours(23, 59, 59, 999);
        matchStage.deliveryDate.$lte = end;
      }
    }

    // Handle customer code filter
    if (customerCode) {
      matchStage.customerCode = customerCode;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Calculate overdue based on dueDate if available, otherwise use deliveryDate + creditDays
      {
        $addFields: {
          overdueDate: {
            $cond: [
              { $ne: ["$dueDate", null] },
              "$dueDate",
              {
                $dateAdd: {
                  startDate: "$deliveryDate",
                  unit: "day",
                  amount: "$creditDays"
                }
              }
            ]
          },
          // Calculate if overdue
          isOverdue: {
            $cond: [
              { 
                $and: [
                  { $lt: ["$overdueDate", now] },
                  { $gt: ["$dueAmount", 0] }
                ]
              },
              true,
              false
            ]
          }
        }
      },
      // Group by customer to get summary
      {
        $group: {
          _id: "$customerCode",
          customerCode: { $first: "$customerCode" },
          customerName: { $first: "$customerInfo.name" },
          customerNumber: { $first: "$customerInfo.customerNumber" },
          address: { $first: "$customerInfo.address" },
          totalNetSellingAmount: { $sum: "$netSellingAmount" },
          totalDueAmount: { $sum: "$dueAmount" },
          totalPaidAmount: { $sum: "$paidAmount" },
          overdueAmount: {
            $sum: {
              $cond: [
                { $and: [
                  { $lt: ["$overdueDate", now] },
                  { $gt: ["$dueAmount", 0] }
                ]}, 
                "$dueAmount", 
                0
              ],
            },
          },
          latestDeliveryDate: { $max: "$deliveryDate" },
          invoiceCount: { $sum: 1 },
          overdueInvoices: {
            $sum: {
              $cond: [
                { $and: [
                  { $lt: ["$overdueDate", now] },
                  { $gt: ["$dueAmount", 0] }
                ]}, 
                1, 
                0
              ],
            },
          }
        },
      },
      // Add calculated fields
      {
        $addFields: {
          outstandingAmount: "$totalDueAmount", // This is what should show as "Total Outstanding"
          overdueDays: {
            $cond: [
              { $gt: ["$overdueAmount", 0] },
              {
                $floor: {
                  $divide: [
                    { $subtract: [now, "$latestDeliveryDate"] },
                    1000 * 60 * 60 * 24
                  ]
                }
              },
              0
            ]
          }
        }
      }
    ];

    // Apply search by customer name or customer code
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      pipeline.push({
        $match: {
          $or: [
            { customerName: { $regex: searchRegex } },
            { customerCode: { $regex: searchRegex } },
            { customerNumber: { $regex: searchRegex } }
          ],
        },
      });
    }

    // Add count stage before pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "totalCount" });

    // Continue with main pipeline for data
    pipeline.push({ $sort: { overdueAmount: -1, latestDeliveryDate: -1 } });

    // Add facet for records and summary
    pipeline.push({
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalOutstandingAmount: { $sum: "$outstandingAmount" },
              totalDueAmount: { $sum: "$totalDueAmount" },
              totalOverdueAmount: { $sum: "$overdueAmount" },
              totalCustomers: { $sum: 1 },
              totalInvoices: { $sum: "$invoiceCount" },
              totalOverdueInvoices: { $sum: "$overdueInvoices" }
            },
          },
          {
            $project: {
              _id: 0,
              totalOutstandingAmount: 1,
              totalDueAmount: 1,
              totalOverdueAmount: 1,
              totalCustomers: 1,
              totalInvoices: 1,
              totalOverdueInvoices: 1
            },
          },
        ],
        records: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              _id: 0,
              customerCode: 1,
              customerName: 1,
              phone: "$customerNumber",
              email: "$address",
              totalOutstandingAmount: "$outstandingAmount", // Changed from totalNetSellingAmount
              dueAmount: "$totalDueAmount",
              overdueAmount: 1,
              lastTransactionDate: "$latestDeliveryDate",
              invoiceCount: 1,
              overdueInvoices: 1,
              overdueDays: 1
            },
          },
        ],
      },
    });

    // Execute both pipelines
    const [aggregationResult, countResult] = await Promise.all([
      Sale.aggregate(pipeline),
      Sale.aggregate(countPipeline)
    ]);

    const result = aggregationResult[0];
    const summary = result.summary[0] || {
      totalOutstandingAmount: 0,
      totalDueAmount: 0,
      totalOverdueAmount: 0,
      totalCustomers: 0,
      totalInvoices: 0,
      totalOverdueInvoices: 0
    };

    const records = result.records;
    
    // Use count from countPipeline for accurate pagination
    const totalCount = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    return res.json({
      success: true,
      data: {
        summary: {
          ...summary,
          totalRecords: totalCount
        },
        records: records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      count: records.length,
    });
  } catch (error) {
    console.error("Error in outstanding-collections report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching outstanding collections",
      error: error.message,
    });
  }
});

// Excel Export for Outstanding Collections
router.get("/reports/outstanding-collections/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, customerCode } = req.query;

    console.log("Outstanding collections Excel export request received with params:", {
      startDate,
      endDate,
      search,
      customerCode
    });

    const matchStage = {
      paymentStatus: { $regex: /^credit$/i },
      isReturn: false,
      isExchange: false,
      dueAmount: { $gt: 0 }
    };

    if (startDate || endDate) {
      matchStage.deliveryDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        matchStage.deliveryDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format",
          });
        }
        end.setHours(23, 59, 59, 999);
        matchStage.deliveryDate.$lte = end;
      }
    }

    if (customerCode) {
      matchStage.customerCode = customerCode;
    }

    const now = new Date();

    // Build aggregation pipeline for Excel export
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          overdueDate: {
            $cond: [
              { $ne: ["$dueDate", null] },
              "$dueDate",
              {
                $dateAdd: {
                  startDate: "$deliveryDate",
                  unit: "day",
                  amount: "$creditDays"
                }
              }
            ]
          }
        }
      },
      {
        $group: {
          _id: "$customerCode",
          customerCode: { $first: "$customerCode" },
          customerName: { $first: "$customerInfo.name" },
          customerNumber: { $first: "$customerInfo.customerNumber" },
          address: { $first: "$customerInfo.address" },
          totalNetSellingAmount: { $sum: "$netSellingAmount" },
          totalDueAmount: { $sum: "$dueAmount" },
          totalPaidAmount: { $sum: "$paidAmount" },
          overdueAmount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $lt: ["$overdueDate", now] },
                    { $gt: ["$dueAmount", 0] }
                  ]
                }, 
                "$dueAmount", 
                0
              ],
            },
          },
          latestDeliveryDate: { $max: "$deliveryDate" },
          invoiceCount: { $sum: 1 }
        },
      },
      {
        $addFields: {
          outstandingAmount: "$totalDueAmount",
          overdueDays: {
            $cond: [
              { $gt: ["$overdueAmount", 0] },
              {
                $floor: {
                  $divide: [
                    { $subtract: [now, "$latestDeliveryDate"] },
                    1000 * 60 * 60 * 24
                  ]
                }
              },
              0
            ]
          }
        }
      }
    ];

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      pipeline.push({
        $match: {
          $or: [
            { customerName: { $regex: searchRegex } },
            { customerCode: { $regex: searchRegex } },
            { customerNumber: { $regex: searchRegex } }
          ],
        },
      });
    }

    pipeline.push({ $sort: { overdueAmount: -1, latestDeliveryDate: -1 } });

    const outstandingRecords = await Sale.aggregate(pipeline);

    // Calculate summary totals
    const summary = {
      totalOutstandingAmount: outstandingRecords.reduce((sum, record) => sum + (record.outstandingAmount || 0), 0),
      totalOverdueAmount: outstandingRecords.reduce((sum, record) => sum + (record.overdueAmount || 0), 0),
      totalCustomers: outstandingRecords.length,
      totalInvoices: outstandingRecords.reduce((sum, record) => sum + (record.invoiceCount || 0), 0)
    };

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Outstanding Collections System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Outstanding Collections Report');
    
    // Define columns
    worksheet.columns = [
      { header: 'Sr.No', key: 'serialNo', width: 8 },
      { header: 'Customer Code', key: 'customerCode', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email/Address', key: 'email', width: 30 },
      { header: 'Total Outstanding ($)', key: 'totalOutstandingAmount', width: 20 },
      { header: 'Overdue Amount ($)', key: 'overdueAmount', width: 18 },
      { header: 'Overdue Days', key: 'overdueDays', width: 12 },
      { header: 'Last Transaction Date', key: 'lastTransactionDate', width: 18 },
      { header: 'Total Invoices', key: 'invoiceCount', width: 12 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { 
      horizontal: 'center', 
      vertical: 'middle'
    };
    headerRow.height = 25;
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    outstandingRecords.forEach((record, index) => {
      const row = worksheet.addRow({
        serialNo: index + 1,
        customerCode: record.customerCode || 'N/A',
        customerName: record.customerName || 'N/A',
        phone: record.customerNumber || 'N/A',
        email: record.address || 'N/A',
        totalOutstandingAmount: record.outstandingAmount || 0,
        overdueAmount: record.overdueAmount || 0,
        overdueDays: record.overdueDays || 0,
        lastTransactionDate: record.latestDeliveryDate,
        invoiceCount: record.invoiceCount || 0
      });

      // Style the row
      row.font = { size: 11 };
      row.alignment = { 
        vertical: 'middle',
        horizontal: 'center'
      };

      // Format date cell
      const dateCell = row.getCell('lastTransactionDate');
      dateCell.value = record.latestDeliveryDate ? new Date(record.latestDeliveryDate) : '';
      dateCell.numFmt = 'dd-mm-yyyy';
      
      // Format currency cells
      const outstandingCell = row.getCell('totalOutstandingAmount');
      outstandingCell.numFmt = '$#,##0.00';
      
      const overdueCell = row.getCell('overdueAmount');
      overdueCell.numFmt = '$#,##0.00';
    });

    // Add summary section
    if (outstandingRecords.length > 0) {
      // Add empty row for spacing
      worksheet.addRow({});

      // Add summary header
      const summaryHeader = worksheet.addRow(['SUMMARY']);
      summaryHeader.font = { bold: true, size: 12 };
      summaryHeader.alignment = { horizontal: 'center' };
      summaryHeader.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD0D0D0' }
      };
      worksheet.mergeCells(`A${summaryHeader.number}:J${summaryHeader.number}`);

      // Add summary data
      const summaryData = [
        ['Total Customers:', summary.totalCustomers],
        ['Total Invoices:', summary.totalInvoices],
        ['Total Outstanding Amount:', summary.totalOutstandingAmount],
        ['Total Overdue Amount:', summary.totalOverdueAmount]
      ];

      summaryData.forEach(([label, value]) => {
        const row = worksheet.addRow({
          serialNo: label,
          customerName: value
        });
        row.font = { bold: true };
        
        if (typeof value === 'number' && (label.includes('Amount') || label.includes('Outstanding'))) {
          const valueCell = row.getCell('customerName');
          valueCell.numFmt = '$#,##0.00';
          valueCell.alignment = { horizontal: 'right' };
        }
      });
    }

    // Apply borders to all cells
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Auto-filter on header row
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount }
    };

    // Generate filename
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    
    let fileName = 'outstanding-collections-report';
    if (startDate && endDate) {
      fileName = `outstanding-collections-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}`;
    } else {
      fileName = `outstanding-collections-${formattedDate.replace(/-/g, '')}`;
    }
    fileName += '.xlsx';

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    // Write workbook to buffer and send
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);

  } catch (error) {
    console.error("Error in /reports/outstanding-collections/export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;