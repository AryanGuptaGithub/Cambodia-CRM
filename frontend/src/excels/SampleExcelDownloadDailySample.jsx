import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadDailySample = ({ data = [] }) => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Daily Sample Report");

    // === Add blank row at the top ===
    worksheet.addRow([]);

    // === Title Row ===
    worksheet.mergeCells("A2:K2"); // 11 columns (A to K)
    const titleCell = worksheet.getCell("A2");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    // === Subtitle Row ===
    worksheet.mergeCells("A3:K3"); // 11 columns
    const subtitleCell = worksheet.getCell("A3");
    subtitleCell.value = "Daily Sample Report";
    subtitleCell.font = { size: 14, bold: true };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    // === Spacer row before headers ===
    worksheet.addRow([]);

    // === Column Headers Row ===
    const headerRow = worksheet.addRow([
      "No",
      "Request #",
      "Date",
      "MR Name",
      "Description",
      "Product Name",
      "Quantity (Big Box)",
      "Quantity (Small Box)",
      "Total Qty",
      "Qty per Box (Strip)",
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
      { width: 15 }, // Request #
      { width: 15 }, // Date
      { width: 18 }, // MR Name
      { width: 25 }, // Description
      { width: 20 }, // Product Name
      { width: 20 }, // Quantity (Big Box)
      { width: 20 }, // Quantity (Small Box)
      { width: 15 }, // Total Qty
      { width: 22 }, // Qty per Box (Strip)
      { width: 25 }, // Remark
    ];

    // === Add Data Rows ===
    data.forEach((item, index) => {
      worksheet.addRow([
        index + 1,
        item.requestNumber,
        item.date,
        item.mrName,
        item.description,
        item.productName,
        item.qtyBigBox,
        item.qtySmallBox,
        item.totalQty,
        item.qtyPerBox,
        item.remark,
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
