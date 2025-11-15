import express from "express";
import excel from "excel4node";
import mongoose from "mongoose";
import Payroll from "../../models/Hrm/Payroll.js";
import MR from "../../models/staffMember/staff.js";

const router = express.Router();

// Function to format period as "Oct 2025"
function formatPeriod(periodString) {
  const [year, month] = periodString.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

// GET /api/export-mr-data
router.get("/export-mr-data", async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: "Year and month parameters are required",
      });
    }

    // Validate year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid year or month parameters",
      });
    }

    // Format period as "YYYY-MM" for database query (e.g., "2025-10")
    const periodString = `${yearNum}-${monthNum.toString().padStart(2, "0")}`;
    // Format period for display as "Oct 2025"
    const displayPeriod = formatPeriod(periodString);

    // Fetch payroll data for the specified period
    const payrollData = await getPayrollDataForPeriod(periodString);

    // If no data found
    if (!payrollData || payrollData.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No payroll data found for period ${displayPeriod}`,
      });
    }

    // Create workbook and worksheet
    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet("MR Payroll Data");

    // Define styles
    const headerStyle = workbook.createStyle({
      font: {
        bold: true,
        color: "FFFFFF",
        size: 12,
      },
      fill: {
        type: "pattern",
        patternType: "solid",
        fgColor: "4472C4",
      },
      alignment: {
        horizontal: "center",
        vertical: "center",
      },
      border: {
        left: { style: "thin", color: "000000" },
        right: { style: "thin", color: "000000" },
        top: { style: "thin", color: "000000" },
        bottom: { style: "thin", color: "000000" },
      },
    });

    const cellStyle = workbook.createStyle({
      border: {
        left: { style: "thin", color: "000000" },
        right: { style: "thin", color: "000000" },
        top: { style: "thin", color: "000000" },
        bottom: { style: "thin", color: "000000" },
      },
    });

    const numberStyle = workbook.createStyle({
      border: {
        left: { style: "thin", color: "000000" },
        right: { style: "thin", color: "000000" },
        top: { style: "thin", color: "000000" },
        bottom: { style: "thin", color: "000000" },
      },
      numberFormat: "#,##0.00",
    });

    const dateStyle = workbook.createStyle({
      border: {
        left: { style: "thin", color: "000000" },
        right: { style: "thin", color: "000000" },
        top: { style: "thin", color: "000000" },
        bottom: { style: "thin", color: "000000" },
      },
      numberFormat: "dd-mm-yyyy",
    });

    // Define headers
    const headers = [
      "MR Name",
      "Team",
      "Contact No",
      "Email",
      "Joining Date",
      "Status",
      "Basic Salary",
      "House Rent",
      "Conveyance",
      "Medical Allowance",
      "Other Allowances",
      "Total Allowance",
      "Deductions",
      "Net Salary",
      "Payroll Period",
      "Payroll Status",
    ];

    // Write headers
    headers.forEach((header, index) => {
      worksheet
        .cell(1, index + 1)
        .string(header)
        .style(headerStyle);
    });

    // Write data
    payrollData.forEach((item, rowIndex) => {
      const row = rowIndex + 2;
      const mr = item.mrDetails || {};
      const payroll = item.payroll || {};

      // Extract allowance amounts
      const houseRent =
        payroll.allowances?.find((a) => a.type === "House Rent Allowance")
          ?.amount || 0;
      const conveyance =
        payroll.allowances?.find((a) => a.type === "Conveyance")?.amount || 0;
      const medicalAllowance =
        payroll.allowances?.find((a) => a.type === "Medical Allowance")
          ?.amount || 0;
      const otherAllowances = payroll.allowances
        ?.filter(
          (a) =>
            ![
              "House Rent Allowance",
              "Conveyance",
              "Medical Allowance",
            ].includes(a.type)
        )
        .reduce((sum, a) => sum + (a.amount || 0), 0);

      // Convert enabled status to readable string
      const status = mr.enabled ? "Active" : "Inactive";

      worksheet
        .cell(row, 1)
        .string(mr.medicalRepName || "N/A")
        .style(cellStyle);
      worksheet
        .cell(row, 2)
        .string(mr.teamName || "N/A")
        .style(cellStyle);
      worksheet
        .cell(row, 3)
        .string(mr.contactNo || "N/A")
        .style(cellStyle);
      worksheet
        .cell(row, 4)
        .string(mr.email || "N/A")
        .style(cellStyle);

      // Format joining date (using 'date' field from your schema)
      if (mr.date) {
        worksheet.cell(row, 5).date(new Date(mr.date)).style(dateStyle);
      } else {
        worksheet.cell(row, 5).string("N/A").style(cellStyle);
      }

      worksheet.cell(row, 6).string(status).style(cellStyle);
      worksheet
        .cell(row, 7)
        .number(parseFloat(payroll.basicSalary) || 0)
        .style(numberStyle);
      worksheet
        .cell(row, 8)
        .number(parseFloat(houseRent) || 0)
        .style(numberStyle);
      worksheet
        .cell(row, 9)
        .number(parseFloat(conveyance) || 0)
        .style(numberStyle);
      worksheet
        .cell(row, 10)
        .number(parseFloat(medicalAllowance) || 0)
        .style(numberStyle);
      worksheet
        .cell(row, 11)
        .number(parseFloat(otherAllowances) || 0)
        .style(numberStyle);
      worksheet
        .cell(row, 12)
        .number(parseFloat(payroll.totalAllowance) || 0)
        .style(numberStyle);
      worksheet
        .cell(row, 13)
        .number(parseFloat(payroll.deductions) || 0)
        .style(numberStyle);
      worksheet
        .cell(row, 14)
        .number(parseFloat(payroll.netSalary) || 0)
        .style(numberStyle);
      worksheet.cell(row, 15).string(displayPeriod).style(cellStyle);
      worksheet
        .cell(row, 16)
        .string(payroll.status || "N/A")
        .style(cellStyle);
    });

    // Set column widths
    const columnWidths = [
      20, 15, 15, 25, 15, 12, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
    ];
    columnWidths.forEach((width, index) => {
      worksheet.column(index + 1).setWidth(width);
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=MR_Payroll_${displayPeriod.replace(" ", "_")}.xlsx`
    );

    // Send the workbook
    const buffer = await workbook.writeToBuffer();
    res.send(buffer);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// MongoDB query function for payroll data with period filter
async function getPayrollDataForPeriod(periodString) {
  try {
    // Aggregate to join payroll with MR data
    const payrollData = await Payroll.aggregate([
      // Match payrolls for the specific period
      { $match: { period: periodString, enabled: true } },

      // Lookup MR details from staff collection
      {
        $lookup: {
          from: "staffs", // MR collection name
          localField: "employeeId",
          foreignField: "_id",
          as: "mrDetails",
        },
      },

      // Unwind MR details (convert array to object)
      { $unwind: { path: "$mrDetails", preserveNullAndEmptyArrays: true } },

      // Project the final structure - CORRECTED FIELD NAMES
      {
        $project: {
          payroll: {
            period: "$period",
            basicSalary: "$basicSalary",
            allowances: "$allowances",
            totalAllowance: "$totalAllowance",
            deductions: "$deductions",
            netSalary: "$netSalary",
            status: "$status",
          },
          mrDetails: {
            medicalRepName: "$mrDetails.medicalRepName", // Correct field name
            teamName: "$mrDetails.teamName", // Correct field name
            contactNo: "$mrDetails.contactNo",
            email: "$mrDetails.email",
            date: "$mrDetails.date", // Joining date field
            enabled: "$mrDetails.enabled", // Status field
          },
        },
      },
    ]);

    return payrollData;
  } catch (error) {
    console.error("MongoDB aggregation error:", error);
    throw error;
  }
}

export default router;
