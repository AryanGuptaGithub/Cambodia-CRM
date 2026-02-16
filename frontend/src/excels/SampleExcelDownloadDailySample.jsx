import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadDailySample = ({ data = [] }) => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Daily Sample Report");

    // === Add blank row at the top ===
    worksheet.addRow([]);

    // === Title Row ===
    worksheet.mergeCells("A2:G2"); // 7 columns (A to G)
    const titleCell = worksheet.getCell("A2");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    // === Subtitle Row ===
    worksheet.mergeCells("A3:G3");
    const subtitleCell = worksheet.getCell("A3");
    subtitleCell.value = "Daily Sample Report";
    subtitleCell.font = { size: 14, bold: true };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    // === Spacer row before headers ===
    worksheet.addRow([]);

    // === Column Headers Row ===
    const headerRow = worksheet.addRow([
      "No",
      "Date",
      "MR Name",
      "Description",
      "Product Name",
      "Total Qty",
      "Remark",
    ]);

    // === Style header row ===
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // === Set Column Widths ===
    worksheet.columns = [
      { width: 5 },  // No
      { width: 15 }, // Date
      { width: 20 }, // MR Name
      { width: 30 }, // Description
      { width: 25 }, // Product Name
      { width: 12 }, // Total Qty
      { width: 30 }, // Remark
    ];

    // === Add Data Rows ===
    data.forEach((item, index) => {
      worksheet.addRow([
        index + 1,
        item.date,
        item.mrName,
        item.description || "",   // fallback to empty string if undefined
        item.productName,
        item.totalQty,
        item.remark || "",
      ]);
    });

    // === Export the file ===
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "DailySampleReport.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Daily Sample Report
    </button>
  );
};

export default SampleExcelDownloadDailySample;