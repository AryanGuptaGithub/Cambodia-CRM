import express from "express";
import Customer from "../../models/master/customer.js";
import Staff from "../../models/staffMember/staff.js";
import ExcelJS from "exceljs";

const router = express.Router();

/**
 * GET /
 * Get new customers report
 * Accessible at: /api/reports/new-customers
 */
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 7,
      search = "",
      reportType = "MR Wise",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let matchStage = { isNew: true, enabled: true };
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      if (reportType === "MR Wise") {
        matchStage.medicalRepName = searchRegex;
      } else {
        matchStage.zone = searchRegex;
      }
    }

    let records = [];
    let totalRecords = 0;
    let summary = {};

    if (reportType === "MR Wise") {
      const allStaff = await Staff.find({}).lean();
      const staffMap = new Map();

      allStaff.forEach((staff, index) => {        
        if (staff._id) {
          const staffId = staff._id.toString();
          staffMap.set(staffId, {
            MRId: staff.MRId,
            contactNo: staff.contactNo,
            email: staff.email,
            teamName: staff.teamName,
            originalName: staff.medicalRepName,
            staffId: staffId
          });
        } 
      });

      const customerAggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { 
              $ifNull: [
                "$medicalRepId", 
                { $ifNull: ["$medicalRepName", "Unknown MR"] }
              ] 
            },
            mrName: { $first: "$medicalRepName" },
            medicalRepId: { $first: "$medicalRepId" },
            zone: { $first: "$zone" },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" },
          },
        },
        { $sort: { newCustomers: -1 } },
        {
          $facet: {
            paginatedResults: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "total" }],
          },
        },
      ];

      const [result] = await Customer.aggregate(customerAggregationPipeline);
      records = result.paginatedResults.map((item, index) => {
        const mrName = item.mrName || "Unknown MR";
        let staffDetails = null;
        
        if (item.medicalRepId) {
          const staffId = item.medicalRepId.toString();
          staffDetails = staffMap.get(staffId);
        } 
        
        if (!staffDetails && mrName && mrName !== "Unknown MR") {
          const normalizedMRName = mrName.toLowerCase().trim();
          
          for (let [key, staff] of staffMap.entries()) {
            if (staff.originalName && staff.originalName.toLowerCase().trim() === normalizedMRName) {
              staffDetails = staff;
              break;
            }
          }
        }

        // Check what MRId we should use
        let mrIdToUse = "N/A";
        if (staffDetails?.MRId) {
          mrIdToUse = staffDetails.MRId;
        } else if (item.medicalRepId) {
          mrIdToUse = item.medicalRepId.toString();
        } else if (item._id) {
          mrIdToUse = typeof item._id === 'object' ? item._id.toString() : item._id;
        }
        
        const record = {
          srNo: index + 1,
          mrId: mrIdToUse,
          mrName: staffDetails?.originalName || mrName,
          contactNo: staffDetails?.contactNo || "N/A",
          email: staffDetails?.email || "N/A",
          teamName: staffDetails?.teamName || "N/A",
          zone: item.zone || "N/A",
          newCustomers: item.newCustomers,
          date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : new Date().toLocaleDateString(),
          medicalRepId: item.medicalRepId ? item.medicalRepId.toString() : "N/A"
        };
        return record;
      });

      totalRecords = result.totalCount[0]?.total || 0;
    } else {
      const allStaff = await Staff.find({ enabled: true }).lean();
      const staffMap = new Map();
      allStaff.forEach((staff) => {
        if (staff._id) {
          const staffId = staff._id.toString();
          staffMap.set(staffId, {
            MRId: staff.MRId,
            contactNo: staff.contactNo,
            email: staff.email,
            teamName: staff.teamName,
            originalName: staff.medicalRepName,
          });
        }
      });

      const aggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { $ifNull: ["$zone", "Unknown Zone"] },
            zoneName: { $first: "$zone" },
            totalMRs: { 
              $addToSet: { 
                $ifNull: [
                  { $toString: "$medicalRepId" }, 
                  { $ifNull: ["$medicalRepName", "Unknown MR"] }
                ] 
              } 
            },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" },
            medicalRepIds: { $addToSet: "$medicalRepId" },
          },
        },
        {
          $project: {
            zoneName: { $ifNull: ["$zoneName", "Unknown Zone"] },
            totalMRs: { $size: "$totalMRs" },
            newCustomers: 1,
            averagePerMR: {
              $cond: [
                { $gt: [{ $size: "$totalMRs" }, 0] },
                { $divide: ["$newCustomers", { $size: "$totalMRs" }] },
                0,
              ],
            },
            latestDate: 1,
            medicalRepIds: 1,
          },
        },
        { $sort: { newCustomers: -1 } },
        {
          $facet: {
            paginatedResults: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "total" }],
          },
        },
      ];

      const [result] = await Customer.aggregate(aggregationPipeline);
      
      records = result.paginatedResults.map((item, index) => {
        let primaryContact = null;
        let contactMR = "N/A";
        let contactNo = "N/A";
        
        if (item.medicalRepIds && item.medicalRepIds.length > 0) {
          for (const medicalRepId of item.medicalRepIds) {
            if (medicalRepId) {
              const staffId = medicalRepId.toString();
              const staffDetails = staffMap.get(staffId);
              if (staffDetails && staffDetails.contactNo) {
                primaryContact = staffDetails;
                contactMR = staffDetails.originalName || "N/A";
                contactNo = staffDetails.contactNo;
                break;
              }
            }
          }
        }

        return {
          srNo: index + 1,
          zoneId: item._id || "N/A",
          zoneName: item.zoneName || "Unknown Zone",
          totalMRs: item.totalMRs || 0,
          newCustomers: item.newCustomers || 0,
          averagePerMR: item.averagePerMR || 0,
          contactNo: contactNo,
          contactMR: contactMR,
          date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : new Date().toLocaleDateString(),
        };
      });

      totalRecords = result.totalCount[0]?.total || 0;
    }

    // Get summary statistics with null handling
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalNewCustomers: { $sum: 1 },
          totalMRs: { 
            $addToSet: { 
              $ifNull: [
                { $toString: "$medicalRepId" }, 
                { $ifNull: ["$medicalRepName", "Unknown MR"] }
              ] 
            } 
          },
          totalZones: { $addToSet: { $ifNull: ["$zone", "Unknown Zone"] } },
        },
      },
      {
        $project: {
          totalNewCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          totalZones: { $size: "$totalZones" },
          averageCustomersPerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalNewCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          },
        },
      },
    ]);

    summary = summaryResult[0] || {
      totalNewCustomers: 0,
      totalMRs: 0,
      totalZones: 0,
      averageCustomersPerMR: 0,
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
      data: { summary, records },
      pagination,
    });
  } catch (error) {
    console.error("❌ Error fetching new customers:", error);
    console.error("🔍 Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch new customer data",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * GET /export
 * Excel Export Endpoint
 * Accessible at: /api/reports/new-customers/export
 */
router.get("/export", async (req, res) => {
  try {
    const {
      search = "",
      reportType = "MR Wise",
    } = req.query;

    let matchStage = { isNew: true, enabled: true };
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      if (reportType === "MR Wise") {
        matchStage.medicalRepName = searchRegex;
      } else {
        matchStage.zone = searchRegex;
      }
    }

    let records = [];
    let summary = {};

    if (reportType === "MR Wise") {
      const allStaff = await Staff.find({}).lean();
      const staffMap = new Map();

      allStaff.forEach((staff) => {        
        if (staff._id) {
          const staffId = staff._id.toString();
          staffMap.set(staffId, {
            MRId: staff.MRId,
            contactNo: staff.contactNo,
            email: staff.email,
            teamName: staff.teamName,
            originalName: staff.medicalRepName,
            staffId: staffId
          });
        } 
      });

      const customerAggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { 
              $ifNull: [
                "$medicalRepId", 
                { $ifNull: ["$medicalRepName", "Unknown MR"] }
              ] 
            },
            mrName: { $first: "$medicalRepName" },
            medicalRepId: { $first: "$medicalRepId" },
            zone: { $first: "$zone" },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" },
          },
        },
        { $sort: { newCustomers: -1 } },
      ];

      const result = await Customer.aggregate(customerAggregationPipeline);
      records = result.map((item, index) => {
        const mrName = item.mrName || "Unknown MR";
        let staffDetails = null;
        
        if (item.medicalRepId) {
          const staffId = item.medicalRepId.toString();
          staffDetails = staffMap.get(staffId);
        } 
        
        if (!staffDetails && mrName && mrName !== "Unknown MR") {
          const normalizedMRName = mrName.toLowerCase().trim();
          for (let [key, staff] of staffMap.entries()) {
            if (staff.originalName && staff.originalName.toLowerCase().trim() === normalizedMRName) {
              staffDetails = staff;
              break;
            }
          }
        }

        let mrIdToUse = "N/A";
        if (staffDetails?.MRId) {
          mrIdToUse = staffDetails.MRId;
        } else if (item.medicalRepId) {
          mrIdToUse = item.medicalRepId.toString();
        } else if (item._id) {
          mrIdToUse = typeof item._id === 'object' ? item._id.toString() : item._id;
        }
        
        return {
          'Sr.No': index + 1,
          'MR ID': mrIdToUse,
          'MR Name': staffDetails?.originalName || mrName,
          'Contact': staffDetails?.contactNo || "N/A",
          'Email': staffDetails?.email || "N/A",
          'Team Name': staffDetails?.teamName || "N/A",
          'Zone': item.zone || "N/A",
          'New Customers': item.newCustomers,
          'Date': item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : new Date().toLocaleDateString(),
        };
      });
    } else {
      const allStaff = await Staff.find({ enabled: true }).lean();
      const staffMap = new Map();
      allStaff.forEach((staff) => {
        if (staff._id) {
          const staffId = staff._id.toString();
          staffMap.set(staffId, {
            MRId: staff.MRId,
            contactNo: staff.contactNo,
            email: staff.email,
            teamName: staff.teamName,
            originalName: staff.medicalRepName,
          });
        }
      });

      const aggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { $ifNull: ["$zone", "Unknown Zone"] },
            zoneName: { $first: "$zone" },
            totalMRs: { 
              $addToSet: { 
                $ifNull: [
                  { $toString: "$medicalRepId" }, 
                  { $ifNull: ["$medicalRepName", "Unknown MR"] }
                ] 
              } 
            },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" },
            medicalRepIds: { $addToSet: "$medicalRepId" },
          },
        },
        {
          $project: {
            zoneName: { $ifNull: ["$zoneName", "Unknown Zone"] },
            totalMRs: { $size: "$totalMRs" },
            newCustomers: 1,
            averagePerMR: {
              $cond: [
                { $gt: [{ $size: "$totalMRs" }, 0] },
                { $divide: ["$newCustomers", { $size: "$totalMRs" }] },
                0,
              ],
            },
            latestDate: 1,
            medicalRepIds: 1,
          },
        },
        { $sort: { newCustomers: -1 } },
      ];

      const result = await Customer.aggregate(aggregationPipeline);
      
      records = result.map((item, index) => {
        let primaryContact = null;
        let contactMR = "N/A";
        
        if (item.medicalRepIds && item.medicalRepIds.length > 0) {
          for (const medicalRepId of item.medicalRepIds) {
            if (medicalRepId) {
              const staffId = medicalRepId.toString();
              const staffDetails = staffMap.get(staffId);
              if (staffDetails) {
                primaryContact = staffDetails;
                contactMR = staffDetails.originalName || "N/A";
                break;
              }
            }
          }
        }

        return {
          'Sr.No': index + 1,
          'Zone ID': item._id || "N/A",
          'Zone Name': item.zoneName || "Unknown Zone",
          'Total MRs': item.totalMRs || 0,
          'New Customers': item.newCustomers || 0,
          'Average per MR': item.averagePerMR?.toFixed(1) || 0,
          'Contact MR': contactMR,
          'Date': item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : new Date().toLocaleDateString(),
        };
      });
    }

    // Get summary statistics
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalNewCustomers: { $sum: 1 },
          totalMRs: { 
            $addToSet: { 
              $ifNull: [
                { $toString: "$medicalRepId" }, 
                { $ifNull: ["$medicalRepName", "Unknown MR"] }
              ] 
            } 
          },
          totalZones: { $addToSet: { $ifNull: ["$zone", "Unknown Zone"] } },
        },
      },
      {
        $project: {
          totalNewCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          totalZones: { $size: "$totalZones" },
          averageCustomersPerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalNewCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          },
        },
      },
    ]);

    summary = summaryResult[0] || {
      totalNewCustomers: 0,
      totalMRs: 0,
      totalZones: 0,
      averageCustomersPerMR: 0,
    };

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('New Customer Report');

    // Add report title
    worksheet.mergeCells('A1:H1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = `New Customer Addition - ${reportType} Report`;
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center' };

    // Add summary section
    worksheet.addRow([]);
    worksheet.mergeCells('A3:H3');
    const summaryTitle = worksheet.getCell('A3');
    summaryTitle.value = 'Summary';
    summaryTitle.font = { size: 14, bold: true };

    const summaryRow1 = worksheet.addRow([
      'Total New Customers', summary.totalNewCustomers,
      reportType === 'MR Wise' ? 'Total MRs' : 'Total Zones',
      reportType === 'MR Wise' ? summary.totalMRs : summary.totalZones,
      `Average per ${reportType === 'MR Wise' ? 'MR' : 'Zone'}`,
      summary.averageCustomersPerMR?.toFixed(1) || 0,
      'Generated Date',
      new Date().toLocaleDateString()
    ]);

    summaryRow1.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    worksheet.addRow([]);

    // Add data headers
    if (reportType === "MR Wise") {
      const headers = ['Sr.No', 'MR ID', 'MR Name', 'Contact', 'Email', 'Team Name', 'Zone', 'New Customers', 'Date'];
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        cell.alignment = { horizontal: 'center' };
      });
    } else {
      const headers = ['Sr.No', 'Zone ID', 'Zone Name', 'Total MRs', 'New Customers', 'Average per MR', 'Contact MR', 'Date'];
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
        cell.alignment = { horizontal: 'center' };
      });
    }

    // Add data rows
    records.forEach((record) => {
      const rowData = Object.values(record);
      worksheet.addRow(rowData);
    });

    // Format columns
    worksheet.columns.forEach((column, index) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 30);
    });

    // Set response headers
    const fileName = `New_Customer_Report_${reportType.replace(' ', '_')}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("❌ Error exporting to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;
