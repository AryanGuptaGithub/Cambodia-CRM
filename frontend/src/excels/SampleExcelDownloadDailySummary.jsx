import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadDailySummaryReport = ({ data = [], reportDate }) => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Daily Summary");

    // 1. Title row (merged)
    worksheet.mergeCells("A1:D1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    // 2. Subtitle row: “Daily Summary Report”
    worksheet.mergeCells("A2:D2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "Daily Summary Report";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // 3. Date row: e.g. “As at 30/Nov/2024”
    worksheet.mergeCells("A3:D3");
    const dateCell = worksheet.getCell("A3");
    const dateText =
      reportDate instanceof Date
        ? reportDate.toLocaleDateString("en-GB")
        : reportDate; // assume string
    dateCell.value = `As at ${dateText}`;
    dateCell.font = { italic: true, size: 12 };
    dateCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(3).height = 18;

    // Add an empty row before header
    worksheet.addRow([]);

    // 4. Header row
    const headerRow = worksheet.addRow([
      "No",
      "Product Name",
      "Sale Quantity",
      "Bonus Quantity",
      "Total Quantity",
    ]);

    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" },
      };
    });

    // 5. Set column widths
    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "productName", width: 30 },
      { key: "saleQty", width: 15 },
      { key: "bonusQty", width: 15 },
      { key: "totalQty", width: 15 },
    ];

    // 6. Add data rows
    data.forEach((item, index) => {
      // item should contain productName, saleQty, bonusQty (or 0), totalQty
      worksheet.addRow({
        no: index + 1,
        productName: item.productName,
        saleQty: item.saleQty ?? 0,
        bonusQty: item.bonusQty ?? 0,
        totalQty:
          (item.saleQty ?? 0) + (item.bonusQty ?? 0), // or read from item if provided
      });
    });

    // 7. Export to Excel
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DailySummary_${dateText || "report"}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Daily Summary Report
    </button>
  );
};

export default SampleExcelDownloadDailySummaryReport;
