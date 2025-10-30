import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadHolidays = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Holidays");

    // ===== Title Row (Row 1) =====
    worksheet.mergeCells("A1:C1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 30;

    // ===== Subtitle Row (Row 2) =====
    worksheet.mergeCells("A2:C2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "Holiday List";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 25;

    // ===== Define Columns =====
    worksheet.columns = [
      { header: "Sr No", key: "srNo", width: 10 },
      { header: "Holiday Name", key: "holidayName", width: 35 },
      { header: "Holiday Date", key: "holidayDate", width: 18 },
    ];

    // Style header row (Row 3)
    const headerRow = worksheet.getRow(3);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 25;

    // Format Date column
    worksheet.getColumn(3).numFmt = "dd-mmm-yyyy"; // e.g., 25-Dec-2025

    // Optional: Add sample data (you can remove if not needed)
    worksheet.addRows([
      { srNo: 1, holidayName: "New Year's Day", holidayDate: new Date("2025-01-01") },
      { srNo: 2, holidayName: "Chinese New Year", holidayDate: new Date("2025-01-29") },
      { srNo: 3, holidayName: "Good Friday", holidayDate: new Date("2025-04-18") },
    ]);

    // Auto-number Sr No if adding more rows dynamically (optional)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 3) {
        const srNoCell = row.getCell(1);
        srNoCell.value = rowNumber - 3;
      }
    });

    // Apply borders to all used cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });
    });

    // Center align Sr No and Date columns
    worksheet.getColumn(1).alignment = { horizontal: "center" };
    worksheet.getColumn(3).alignment = { horizontal: "center" };

    // ===== Export File =====
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "holidays_sample.xlsx";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Click here to download Holiday List Sample Excel
    </button>
  );
};

export default SampleExcelDownloadHolidays;