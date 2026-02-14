import express from "express";
import Customer from "../../models/master/customer.js";
import ExcelJS from "exceljs";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 7,
      search = "",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let matchStage = { enabled: true };

    // Add search filter
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchStage.$or = [
        { zone: searchRegex },
        { name: searchRegex },
        { customerCode: searchRegex },
        { medicalRepName: searchRegex }
      ];
    }

    // First, get zones with basic info (without pushing all customer data)
    const zonesAggregation = [
      { $match: matchStage },
      {
        $group: {
          _id: "$zone",
          zoneName: { $first: "$zone" },
          totalCustomers: { $sum: 1 },
          totalMRs: { $addToSet: "$medicalRepName" },
        }
      },
      {
        $project: {
          zoneName: 1,
          totalCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          averagePerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          }
        }
      },
      { $sort: { totalCustomers: -1 } },
      {
        $facet: {
          paginatedResults: [
            { $skip: skip },
            { $limit: limitNum }
          ],
          totalCount: [
            { $count: "total" }
          ]
        }
      }
    ];

    // Execute with allowDiskUse to prevent memory issues
    const [zonesResult] = await Customer.aggregate(zonesAggregation).allowDiskUse(true);
    
    const totalRecords = zonesResult.totalCount[0]?.total || 0;

    // Now get customers for each zone separately to avoid memory issues
    const records = [];
    
    for (const zoneData of zonesResult.paginatedResults) {
      const zoneName = zoneData._id;
      
      // Get customers for this specific zone
      const zoneCustomers = await Customer.find({
        ...matchStage,
        zone: zoneName
      })
      .select('_id customerCode name typeOfBusiness customerNumber address medicalRepName province isNew createdAt remark')
      .sort({ name: 1 })
      .lean();

      records.push({
        zoneId: zoneName ? zoneName.replace(/\s+/g, '_').toUpperCase() : "UNKNOWN_ZONE",
        zoneName: zoneData.zoneName || "Unknown Zone",
        totalMRs: zoneData.totalMRs || 0,
        totalCustomers: zoneData.totalCustomers || 0,
        averagePerMR: parseFloat((zoneData.averagePerMR || 0).toFixed(1)),
        customers: zoneCustomers.map(customer => ({
          customerId: customer._id,
          customerCode: customer.customerCode,
          customerName: customer.name,
          typeOfBusiness: customer.typeOfBusiness,
          contactNumber: customer.customerNumber,
          address: customer.address,
          medicalRepName: customer.medicalRepName,
          province: customer.province,
          isNew: customer.isNew,
          createdAt: customer.createdAt,
          remark: customer.remark
        }))
      });
    }

    // Get summary statistics (optimized)
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalZones: { $addToSet: "$zone" },
          totalMRs: { $addToSet: "$medicalRepName" },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          totalZones: { $size: "$totalZones" },
          totalMRs: { $size: "$totalMRs" },
          averageCustomersPerZone: {
            $cond: [
              { $gt: [{ $size: "$totalZones" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalZones" }] },
              0,
            ],
          },
        },
      },
    ]).allowDiskUse(true);

    const summary = summaryResult[0] || {
      totalCustomers: 0,
      totalZones: 0,
      totalMRs: 0,
      averageCustomersPerZone: 0,
    };

    // Format summary numbers
    const formattedSummary = {
      totalCustomers: summary.totalCustomers || 0,
      totalZones: summary.totalZones || 0,
      totalMRs: summary.totalMRs || 0,
      averageCustomersPerZone: parseFloat((summary.averageCustomersPerZone || 0).toFixed(1))
    };

    // Pagination info
    const totalPages = Math.ceil(totalRecords / limitNum);
    const pagination = {
      currentPage: pageNum,
      totalPages,
      totalRecords,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    };

    // Final Response
    res.json({
      success: true,
      data: {
        summary: formattedSummary,
        records: records,
      },
      pagination: pagination,
    });

  } catch (error) {
    console.error("❌ Error fetching zone wise customers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch zone wise customer data",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

router.get("/export", async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    
    let matchStage = { enabled: true };

    // Add search filter
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchStage.$or = [
        { zone: searchRegex },
        { name: searchRegex },
        { customerCode: searchRegex },
        { medicalRepName: searchRegex }
      ];
    }

    // Get all zones with customers (optimized for export)
    const zonesAggregation = [
      { $match: matchStage },
      {
        $group: {
          _id: "$zone",
          zoneName: { $first: "$zone" },
          totalCustomers: { $sum: 1 },
          totalMRs: { $addToSet: "$medicalRepName" },
        }
      },
      {
        $project: {
          zoneName: 1,
          totalCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          averagePerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          }
        }
      },
      { $sort: { totalCustomers: -1 } }
    ];

    const zones = await Customer.aggregate(zonesAggregation).allowDiskUse(true);

    // Get summary statistics
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalZones: { $addToSet: "$zone" },
          totalMRs: { $addToSet: "$medicalRepName" },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          totalZones: { $size: "$totalZones" },
          totalMRs: { $size: "$totalMRs" },
          averageCustomersPerZone: {
            $cond: [
              { $gt: [{ $size: "$totalZones" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalZones" }] },
              0,
            ],
          },
        },
      },
    ]).allowDiskUse(true);

    const summary = summaryResult[0] || {
      totalCustomers: 0,
      totalZones: 0,
      totalMRs: 0,
      averageCustomersPerZone: 0,
    };

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    
    // 1. SUMMARY SHEET
    const summarySheet = workbook.addWorksheet('Summary');
    
    // Title
    summarySheet.mergeCells('A1:D1');
    summarySheet.getCell('A1').value = 'ZONE WISE CUSTOMERS REPORT';
    summarySheet.getCell('A1').font = { bold: true, size: 16 };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };
    
    summarySheet.addRow([]); // Empty row
    
    // Report Info
    summarySheet.addRow(['Report Date:', new Date().toLocaleDateString()]);
    summarySheet.addRow(['Generated At:', new Date().toLocaleTimeString()]);
    if (search) {
      summarySheet.addRow(['Search Filter:', search]);
    }
    
    summarySheet.addRow([]); // Empty row
    
    // Summary Header
    summarySheet.addRow(['SUMMARY']);
    summarySheet.mergeCells('A6:D6');
    summarySheet.getRow(6).font = { bold: true, size: 14, color: { argb: 'FF0000FF' } };
    summarySheet.getRow(6).alignment = { horizontal: 'center' };
    
    // Summary Data
    const summaryHeaders = summarySheet.addRow(['Metric', 'Value', '', '']);
    summaryHeaders.font = { bold: true };
    summaryHeaders.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });
    
    const summaryData = [
      ['Total Customers', summary.totalCustomers],
      ['Total Zones', summary.totalZones],
      ['Total Medical Representatives', summary.totalMRs],
      ['Average Customers per Zone', parseFloat(summary.averageCustomersPerZone.toFixed(1))],
      ['', ''],
      ['Search Applied', search || 'None']
    ];
    
    summaryData.forEach(row => {
      summarySheet.addRow(row);
    });
    
    // Format summary sheet
    summarySheet.columns = [
      { width: 30 },
      { width: 20 },
      { width: 10 },
      { width: 10 }
    ];
    
    // 2. ZONES SHEET
    const zonesSheet = workbook.addWorksheet('Zones');
    
    // Title
    zonesSheet.mergeCells('A1:E1');
    zonesSheet.getCell('A1').value = 'ZONE WISE SUMMARY';
    zonesSheet.getCell('A1').font = { bold: true, size: 16 };
    zonesSheet.getCell('A1').alignment = { horizontal: 'center' };
    zonesSheet.addRow([]);
    
    // Zone Headers
    const zoneHeaders = [
      'Sr. No.',
      'Zone Name',
      'Total Customers',
      'Medical Representatives',
      'Average per MR'
    ];
    
    const zoneHeaderRow = zonesSheet.addRow(zoneHeaders);
    zoneHeaderRow.font = { bold: true };
    zoneHeaderRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center' };
    });
    
    // Zone Data
    zones.forEach((zone, index) => {
      const row = zonesSheet.addRow([
        index + 1,
        zone.zoneName || 'Unknown Zone',
        zone.totalCustomers,
        zone.totalMRs,
        parseFloat(zone.averagePerMR.toFixed(1))
      ]);
      
      // Add borders
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      
      // Alternate row colors
      if (index % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9F9F9' }
          };
        });
      }
    });
    
    // Format zones sheet
    zonesSheet.columns = [
      { width: 10 },
      { width: 35 },
      { width: 18 },
      { width: 25 },
      { width: 18 }
    ];
    
    // 3. CUSTOMERS SHEET (Get customers in batches to avoid memory issues)
    const customersSheet = workbook.addWorksheet('Customers');
    
    // Title
    customersSheet.mergeCells('A1:L1');
    customersSheet.getCell('A1').value = 'CUSTOMER DETAILS';
    customersSheet.getCell('A1').font = { bold: true, size: 16 };
    customersSheet.getCell('A1').alignment = { horizontal: 'center' };
    customersSheet.addRow([]);
    
    // Customer Headers
    const customerHeaders = [
      'Sr. No.',
      'Zone',
      'Customer Code',
      'Customer Name',
      'Type of Business',
      'Contact Number',
      'Medical Representative',
      'Province',
      'Address',
      'Status',
      'Created Date',
      'Remarks'
    ];
    
    const customerHeaderRow = customersSheet.addRow(customerHeaders);
    customerHeaderRow.font = { bold: true };
    customerHeaderRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Get all customers (paginated to avoid memory issues)
    let customerCounter = 1;
    const batchSize = 1000;
    let skip = 0;
    let hasMoreCustomers = true;
    
    while (hasMoreCustomers) {
      const customers = await Customer.find(matchStage)
        .select('zone customerCode name typeOfBusiness customerNumber address medicalRepName province isNew createdAt remark')
        .sort({ zone: 1, name: 1 })
        .skip(skip)
        .limit(batchSize)
        .lean();
      
      if (customers.length === 0) {
        hasMoreCustomers = false;
        break;
      }
      
      // Add customers to sheet
      customers.forEach(customer => {
        const row = customersSheet.addRow([
          customerCounter++,
          customer.zone || 'N/A',
          customer.customerCode || 'N/A',
          customer.name || 'N/A',
          customer.typeOfBusiness || 'N/A',
          customer.customerNumber || 'N/A',
          customer.medicalRepName || 'N/A',
          customer.province || 'N/A',
          customer.address || 'N/A',
          customer.isNew ? 'New' : 'Existing',
          customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A',
          customer.remark || ''
        ]);
        
        // Add borders
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
        
        // Alternate row colors
        if (customerCounter % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF9F9F9' }
            };
          });
        }
      });
      
      skip += batchSize;
    }
    
    // Format customers sheet
    customersSheet.columns = [
      { width: 10 },  // Sr. No.
      { width: 25 },  // Zone
      { width: 20 },  // Customer Code
      { width: 30 },  // Customer Name
      { width: 20 },  // Type of Business
      { width: 20 },  // Contact Number
      { width: 25 },  // Medical Representative
      { width: 15 },  // Province
      { width: 40 },  // Address
      { width: 12 },  // Status
      { width: 15 },  // Created Date
      { width: 30 }   // Remarks
    ];
    
    // Auto-filter
    customersSheet.autoFilter = 'A1:L1';
    
    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="zone_wise_customers_${Date.now()}.xlsx"`
    );
    
    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('❌ Excel export error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

router.get("/export-customers", async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    
    let matchStage = { enabled: true };

    // Add search filter
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchStage.$or = [
        { zone: searchRegex },
        { name: searchRegex },
        { customerCode: searchRegex },
        { medicalRepName: searchRegex }
      ];
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customer List');
    
    // Title
    worksheet.mergeCells('A1:L1');
    worksheet.getCell('A1').value = 'CUSTOMER LIST';
    worksheet.getCell('A1').font = { bold: true, size: 16 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.addRow([]);
    
    // Report Info
    worksheet.addRow(['Report Date:', new Date().toLocaleDateString()]);
    worksheet.addRow(['Generated At:', new Date().toLocaleTimeString()]);
    if (search) {
      worksheet.addRow(['Search Filter:', search]);
    }
    worksheet.addRow([]);
    
    // Get total count for summary
    const totalCustomers = await Customer.countDocuments(matchStage);
    worksheet.addRow(['Total Customers:', totalCustomers]);
    worksheet.addRow([]);
    
    // Headers
    const headers = [
      'Sr. No.',
      'Zone',
      'Customer Code',
      'Customer Name',
      'Type of Business',
      'Contact Number',
      'Medical Representative',
      'Province',
      'Address',
      'Status',
      'Created Date',
      'Remarks'
    ];
    
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    
    // Get customers in batches
    let customerCounter = 1;
    const batchSize = 2000;
    let skip = 0;
    let hasMoreCustomers = true;
    
    while (hasMoreCustomers) {
      const customers = await Customer.find(matchStage)
        .select('zone customerCode name typeOfBusiness customerNumber address medicalRepName province isNew createdAt remark')
        .sort({ zone: 1, name: 1 })
        .skip(skip)
        .limit(batchSize)
        .lean();
      
      if (customers.length === 0) {
        hasMoreCustomers = false;
        break;
      }
      
      // Add customers to sheet
      customers.forEach(customer => {
        const row = worksheet.addRow([
          customerCounter++,
          customer.zone || 'N/A',
          customer.customerCode || 'N/A',
          customer.name || 'N/A',
          customer.typeOfBusiness || 'N/A',
          customer.customerNumber || 'N/A',
          customer.medicalRepName || 'N/A',
          customer.province || 'N/A',
          customer.address || 'N/A',
          customer.isNew ? 'New' : 'Existing',
          customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A',
          customer.remark || ''
        ]);
        
        // Add borders
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
        
        // Alternate row colors
        if (customerCounter % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF9F9F9' }
            };
          });
        }
      });
      
      skip += batchSize;
    }
    
    // Format columns
    worksheet.columns = [
      { width: 10 },
      { width: 25 },
      { width: 20 },
      { width: 30 },
      { width: 20 },
      { width: 20 },
      { width: 25 },
      { width: 15 },
      { width: 40 },
      { width: 12 },
      { width: 15 },
      { width: 30 }
    ];
    
    // Auto-filter
    worksheet.autoFilter = 'A1:L1';
    
    // Freeze header row
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];
    
    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="customer_list_${Date.now()}.xlsx"`
    );
    
    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('❌ Customer list export error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to export customer list",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
