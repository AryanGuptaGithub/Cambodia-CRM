import React from "react";
import ExcelJS from "exceljs";

const PaymentReportExcelDownload = ({ data = [] }) => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Payment Report");

    // === Add blank row at the top ===
    worksheet.addRow([]);

    // === Title Row ===
    worksheet.mergeCells("A2:O2");  // Now only 15 columns (A to O)
    const titleCell = worksheet.getCell("A2");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    // === Subtitle Row ===
    worksheet.mergeCells("A3:O3");  // 15 columns
    const subtitleCell = worksheet.getCell("A3");
    subtitleCell.value = "Payment Report";
    subtitleCell.font = { size: 14, bold: true };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    // === Spacer row before headers ===
    worksheet.addRow([]);

    // === Column Headers Row ===
    const headerRow = worksheet.addRow([
      "No",
      "Recording Date",
      "Invoice #",
      "Invoice Date",
      "Delivery Date",
      "Staff Name",
      "Customer Code",
      "Number of Product",
      "Total Qty",
      "Total Amount (USD)",
      "Collected (USD)",
      "Remaining Amount (USD)",
      "Cash Collection (USD)",
      "Balance (USD)",
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
      { width: 5 },   // No
      { width: 15 },  // Recording Date
      { width: 12 },  // Invoice #
      { width: 15 },  // Invoice Date
      { width: 15 },  // Delivery Date
      { width: 18 },  // Staff Name
      { width: 15 },  // Customer Code
      { width: 18 },  // Number of Product
      { width: 12 },  // Total Qty
      { width: 18 },  // Total Amount
      { width: 18 },  // Collected
      { width: 28 },  // Remaining Amount
      { width: 24 },  // Cash Collection
      { width: 15 },  // Balance
      { width: 25 },  // Remark
    ];

    // === Add Data Rows ===
    data.forEach((item, index) => {
      worksheet.addRow([
        index + 1,
        item.recordingDate,
        item.invoiceNumber,
        item.invoiceDate,
        item.deliveryDate,
        item.staffName,
        item.customerCode,
        item.numberOfProduct,
        item.totalQty,
        item.totalAmount,
        item.collected,
        item.remainingAmount,
        item.cashCollection,
        item.balance,
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
    a.download = "PaymentReport.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Payment Report
    </button>
  );
};

export default PaymentReportExcelDownload;
