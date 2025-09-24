import React from "react";
import ExcelJS from "exceljs";

const PurchaseInventoryExcelDownload = ({ data = [] }) => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Purchase Inventory");

    // Spacer
    worksheet.addRow([]);

    // === Title Row ===
    worksheet.mergeCells("A2:Q2"); // Updated: A to Q (17 columns with ID)
    const titleCell = worksheet.getCell("A2");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    // === Subtitle Row ===
    worksheet.mergeCells("A3:Q3"); // A to Q
    const subtitleCell = worksheet.getCell("A3");
    subtitleCell.value = "Purchase Inventory Summary";
    subtitleCell.font = { size: 14, bold: true };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

    worksheet.addRow([]);

    // === Header Row ===
    const headerRow = worksheet.addRow([
      "ID", // ✅ New column
      "Invoice #",
      "Invoice Date",
      "Delivery #",
      "Received Date",
      "Expired Date",
      "Product Name",
      "Type",
      "Packing",
      "QTY Main",
      "Qty",
      "Unit Price (USD)",
      "Amount (USD)",
      "Other Expenses (USD)",
      "Total Amount (USD)",
      "Remark",
    ]);

    // Header styling
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

    // Column widths
    worksheet.columns = [
      { width: 5 }, // ID
      { width: 15 }, // Invoice #
      { width: 15 }, // Invoice Date
      { width: 15 }, // Delivery #
      { width: 15 }, // Received Date
      { width: 15 }, // Expired Date
      { width: 25 }, // Product Name
      { width: 15 }, // Type
      { width: 15 }, // Packing
      { width: 12 }, // QTY Main
      { width: 10 }, // Qty
      { width: 18 }, // Unit Price
      { width: 18 }, // Amount
      { width: 22 }, // Other Expenses
      { width: 22 }, // Total Amount
      { width: 25 }, // Remark
    ];

    // Format date columns
    ["C", "E", "F"].forEach((col) => {
      worksheet.getColumn(col).numFmt = "dd/mm/yyyy";
    });

    // Add data rows
    data.forEach((item) => {
      worksheet.addRow([
        item.id,
        item.invoiceNumber,
        item.invoiceDate,
        item.deliveryNumber,
        item.receivedDate,
        item.expiredDate,
        item.productName,
        item.type,
        item.packing,
        item.qtyMain,
        item.qty,
        item.unitPrice,
        item.amount,
        item.otherExpenses,
        item.totalAmount,
        item.unitCost,
        item.remark,
      ]);
    });

    // Export to Excel
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "PurchaseInventory.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Purchase Inventory Excel
    </button>
  );
};

export default PurchaseInventoryExcelDownload;
