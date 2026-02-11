import React from "react";
import ExcelJS from "exceljs";
import { Download } from "lucide-react";

const OutstandingCollectionSampleExcelDownload = () => {
  const generateTemplateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(
        "Outstanding Collection Template",
      );

      // ===== Title Section - Updated to A1:D1 (4 columns) =====
      worksheet.mergeCells("A1:D1");
      worksheet.getCell("A1").value = "OUTSTANDING COLLECTION UPDATE TEMPLATE";
      worksheet.getCell("A1").font = {
        bold: true,
        size: 16,
        color: { argb: "FFFFFFFF" },
      };
      worksheet.getCell("A1").alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      worksheet.getCell("A1").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" },
      };
      worksheet.getRow(1).height = 30;

      // ===== Instructions Section - Updated to A2:D2 (4 columns) =====
      worksheet.mergeCells("A2:D2");
      worksheet.getCell("A2").value =
        "Instructions: Fill in the Invoice Number, Total Amount, and Paid Amount. The system will update sales from Cash to Credit status.";
      worksheet.getCell("A2").font = { italic: true, size: 10 };
      worksheet.getCell("A2").alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
      worksheet.getCell("A2").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFEF2CD" },
      };
      worksheet.getRow(2).height = 35;

      // ===== Column Headers - Only 4 columns =====
      worksheet.columns = [
        { key: "invoiceNumber", width: 20 },
        { key: "totalAmount", width: 18 },
        { key: "paidAmount", width: 18 },
        { key: "creditDays", width: 15 },
      ];

      const headerRow = worksheet.getRow(3);
      headerRow.values = [
        "Invoice Number",
        "Total Amount",
        "Paid Amount",
        "Credit Days",
      ];

      headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      // Apply green background to EACH header cell individually (only 4 columns)
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber >= 1 && colNumber <= 4) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF70AD47" }, // Green header ONLY on the 4 columns
          };
        }
      });

      headerRow.height = 25;

      // ===== Add empty rows for data entry - Only 4 columns =====
      for (let i = 4; i <= 100; i++) {
        const row = worksheet.addRow({
          invoiceNumber: "",
          totalAmount: "",
          paidAmount: "",
          creditDays: "",
        });
        row.alignment = { vertical: "middle", horizontal: "center" };

        // Format currency cells for Total Amount and Paid Amount
        row.getCell("totalAmount").numFmt = "$#,##0.00";
        row.getCell("paidAmount").numFmt = "$#,##0.00";
      }

      // ===== Add borders to all cells (only columns A-D) =====
      for (let i = 1; i <= 100; i++) {
        const row = worksheet.getRow(i);
        // Only apply borders to columns 1-4 (A-D)
        for (let j = 1; j <= 4; j++) {
          const cell = row.getCell(j);
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `outstanding_collection_template_${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();

      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Error generating template:", error);
      alert("Failed to generate Excel template");
    }
  };

  return (
    <button
      onClick={generateTemplateExcel}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md cursor-pointer transition-colors"
    >
      <Download size={18} />
      Download Template
    </button>
  );
};

export default OutstandingCollectionSampleExcelDownload;
