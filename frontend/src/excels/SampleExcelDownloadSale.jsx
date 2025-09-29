import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadSale = ({ data = [] }) => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sale Summary");

    // Title
    worksheet.mergeCells("A1:S1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    // Subtitle
    worksheet.mergeCells("A2:S2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "Sale Summary List";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // Define columns
    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "recordingDate", width: 15 },
      { key: "invoiceNumber", width: 15 },
      { key: "invoiceDate", width: 15 },
      { key: "mrName", width: 20 },
      { key: "customerCode", width: 25 },
      { key: "productName", width: 25 },
      { key: "salesQty", width: 15 },
      { key: "bonusQty", width: 15 },
      { key: "sellingPrice", width: 27 },
      { key: "amount", width: 15 },
      { key: "discount", width: 15 },
      { key: "netSellingAmount", width: 25 },
      { key: "averageUnitPrice", width: 25 },
      { key: "profitLoss", width: 15 },
      { key: "creditDays", width: 12 },
      { key: "dueDate", width: 15 },
      { key: "deliveryDate", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 25 },
    ];

    // Set header row manually
    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "No",
      "Recording Date",
      "Invoice #",
      "Invoice Date",
      "MR Name",
      "Customer Code",
      "Product Name",
      "Sales Qty",
      "Bonus Qty",
      "Selling Price (USD)",
      "Amount (USD)",
      "Discount (USD)",
      "Average Unit Price (USD)",
      "Unit Price",
      "LC",
      "Credit Days",
      "Paid Amount",
      "Payment Status",
      "Remarks",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(3).height = 20;

    // Format date columns
    ["recordingDate", "invoiceDate", "dueDate", "deliveryDate"].forEach((key) => {
      const col = worksheet.getColumn(key);
      if (col) col.numFmt = "dd/mm/yyyy";
    });

    // Optional: Add sample data rows
    data.forEach((item, index) => {
      worksheet.addRow({
        no: index + 1,
        ...item,
      });
    });

    // Export to Excel
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "saleSummary.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Sales Summary Sample Excel
    </button>
  );
};

export default SampleExcelDownloadSale;

