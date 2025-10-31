import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadHolidays = () => {
  const generateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Holidays");

      // ✅ Title Row - Centered
      worksheet.mergeCells("A1:D1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(1).height = 25;

      // ✅ Subtitle Row - Centered
      worksheet.mergeCells("A2:D2");
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = "Holiday List";
      subtitleCell.font = { bold: true, size: 14 };
      subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(2).height = 20;

      // ✅ Empty spacing row
      worksheet.addRow([]);

      // ✅ Add header row
      const headerRow = worksheet.addRow([
        "Holiday Name",
        "Start Date",
        "End Date",
        "Description"
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
      worksheet.columns = [
        { key: "holidayName", width: 35 },
        { key: "startDate", width: 15 },
        { key: "endDate", width: 15 },
        { key: "description", width: 40 },
      ];

      // Format Date columns
      worksheet.getColumn(2).numFmt = "dd-mmm-yyyy"; // Start Date
      worksheet.getColumn(3).numFmt = "dd-mmm-yyyy"; // End Date

      // ✅ Add empty rows for data entry (optional - you can remove this if you want completely empty)
      // Adding 5 empty rows for user to fill in
      for (let i = 0; i < 5; i++) {
        const emptyRow = worksheet.addRow(["", "", "", ""]);
        
        // Apply borders to empty rows
        emptyRow.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }

      // ✅ Center align Date columns, left align others
      worksheet.getColumn(2).alignment = { horizontal: "center" }; // Start Date
      worksheet.getColumn(3).alignment = { horizontal: "center" }; // End Date
      worksheet.getColumn(1).alignment = { horizontal: "center" }; // Holiday Name
      worksheet.getColumn(4).alignment = { horizontal: "center" }; // Description

      // ✅ Download Excel
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Holiday_List_Template.xlsx";
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

    } catch (error) {
      console.error("Error generating Excel:", error);
      alert("Failed to generate Excel file.");
    }
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