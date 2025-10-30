import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadPayroll = () => {
  const generateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Payroll Summary");

      // === Sheet Titles ===
      worksheet.mergeCells("A1:E1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(1).height = 25;

      worksheet.mergeCells("A2:E2");
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = "Payroll Summary";
      subtitleCell.font = { bold: true, size: 14 };
      subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(2).height = 20;

      // === Define Columns ===
      worksheet.columns = [
        { key: "srNo", width: 8 },
        { key: "mrName", width: 25 },
        { key: "basicSalary", width: 15 },
        { key: "incentive", width: 15 },
        { key: "totalSalary", width: 15 },
      ];

      // === Header Row ===
      const headerRow = worksheet.getRow(3);
      headerRow.values = [
        "Sr No.",
        "MR Name",
        "Basic Salary (USD)",
        "Incentive (USD)",
        "Total Salary (USD)",
      ];
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' } // Light lavender background
      };
      worksheet.getRow(3).height = 20;

      // === Sample Data Rows ===
      const sampleData = [
        { mrName: "John Smith", basicSalary: 2500, incentive: 500, totalSalary: 3000 },
        { mrName: "Sarah Johnson", basicSalary: 2800, incentive: 700, totalSalary: 3500 },
        { mrName: "Mike Williams", basicSalary: 2200, incentive: 300, totalSalary: 2500 },
        { mrName: "Emily Brown", basicSalary: 2600, incentive: 600, totalSalary: 3200 },
        { mrName: "David Miller", basicSalary: 2400, incentive: 400, totalSalary: 2800 },
      ];

      // Add sample data rows
      sampleData.forEach((item, index) => {
        const row = worksheet.addRow({
          srNo: index + 1,
          mrName: item.mrName,
          basicSalary: item.basicSalary,
          incentive: item.incentive,
          totalSalary: item.totalSalary,
        });

        // Format numeric cells
        ["basicSalary", "incentive", "totalSalary"].forEach((key) => {
          const cell = row.getCell(key);
          if (cell && cell.value !== undefined && cell.value !== null) {
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right" };
          }
        });

        // Center align the serial number
        row.getCell("srNo").alignment = { horizontal: "center" };
        
        // Left align the MR Name
        row.getCell("mrName").alignment = { horizontal: "left" };
      });

      // === Apply borders to all cells ===
      const startRow = 1;
      const endRow = 3 + sampleData.length; // Header row + data rows

      for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
        const row = worksheet.getRow(rowNum);
        if (row) {
          ['A', 'B', 'C', 'D', 'E'].forEach(col => {
            const cell = row.getCell(col);
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        }
      }

      // === Add summary row ===
      const summaryRow = worksheet.addRow({
        srNo: "Total",
        mrName: "",
        basicSalary: { formula: `SUM(C4:C${3 + sampleData.length})` },
        incentive: { formula: `SUM(D4:D${3 + sampleData.length})` },
        totalSalary: { formula: `SUM(E4:E${3 + sampleData.length})` },
      });

      summaryRow.font = { bold: true };
      summaryRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F8FF' } // Light blue background
      };

      // Format summary row numeric cells
      ["basicSalary", "incentive", "totalSalary"].forEach((key) => {
        const cell = summaryRow.getCell(key);
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right" };
      });

      // Apply borders to summary row
      ['A', 'B', 'C', 'D', 'E'].forEach(col => {
        const cell = summaryRow.getCell(col);
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // === Export Excel File ===
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "payroll_summary.xlsx";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Error generating Excel file:", error);
      alert("Error generating Excel file. Please try again.");
    }
  };

  return (
    <button
      onClick={generateExcel}
      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline text-sm mb-4 cursor-pointer"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Download Payroll Sample Excel
    </button>
  );
};

export default SampleExcelDownloadPayroll;