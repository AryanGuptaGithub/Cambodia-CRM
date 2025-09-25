import React from "react";
import ExcelJS from "exceljs";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const SampleExcelDownloadDailySummaryReport = ({ reportDate }) => {
  const generateExcel = async () => {
    try {
      // ✅ Fetch product names
      const response = await axios.get(`${backendUrl}/api/dailysummary/unique-names`);
      const productNames = response.data.productNames || [];

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Daily Summary");

      // ✅ Title Row
      worksheet.mergeCells("A1:P1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(1).height = 25;

      // ✅ Subtitle Row
      worksheet.mergeCells("A2:P2");
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = "Daily Summary Report";
      subtitleCell.font = { bold: true, size: 14 };
      subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(2).height = 20;

      // ✅ Date Row ("As at 25 Sep 2025")
      worksheet.mergeCells("A3:P3");
      const dateCell = worksheet.getCell("A3");

      const currentDate = new Date();
      const finalDate = reportDate ? new Date(reportDate) : currentDate;

      const options = { day: "2-digit", month: "short", year: "numeric" };
      const formattedDate = finalDate
        .toLocaleDateString("en-GB", options)
        .replace(/ /g, " ");

      dateCell.value = `As at ${formattedDate}`;
      dateCell.font = { italic: true, size: 12 };
      dateCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(3).height = 18;

      worksheet.addRow([]); // Empty spacing row

      // ✅ Generate month-end headers from Sep 2024 to Jul 2025
      const getMonthEndHeaders = () => {
        const headers = [];
        let start = new Date(2024, 8, 1); // Sep 2024
        const end = new Date(2025, 6, 31); // Jul 2025

        while (start <= end) {
          const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0);
          const label = lastDay
            .toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            .replace(/ /g, " ");
          headers.push(label);
          start.setMonth(start.getMonth() + 1);
        }

        return headers;
      };

      const monthEndHeaders = getMonthEndHeaders();

      // ✅ Add header row
      const headerRow = worksheet.addRow([
        "No",
        "Product Name",
        "Sale Quantity",
        "Bonus Quantity",
        "Total Quantity",
        ...monthEndHeaders,
      ]);

      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 20;

      // ✅ Style header cells
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

      // ✅ Set column widths
      const fixedWidths = [
        { key: "no", width: 5 },
        { key: "productName", width: 40 },
        { key: "saleQty", width: 15 },
        { key: "bonusQty", width: 15 },
        { key: "totalQty", width: 15 },
      ];

      const dynamicDateWidths = monthEndHeaders.map((_, i) => ({
        key: `month_${i}`,
        width: 15,
      }));

      worksheet.columns = [...fixedWidths, ...dynamicDateWidths];

      // ✅ Add data rows (just product names, rest empty)
      productNames.forEach((productName, index) => {
        const rowValues = [
          index + 1, // No
          productName, // Product Name
          "", // Sale Quantity
          "", // Bonus Quantity
          "", // Total Quantity
          ...monthEndHeaders.map(() => ""), // Empty cells for each month
        ];
        worksheet.addRow(rowValues);
      });

      // ✅ Download Excel
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `DailySummaryHeader_${formattedDate || "report"}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating Excel:", error);
      alert("Failed to generate Excel report.");
    }
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
