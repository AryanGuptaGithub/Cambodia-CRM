import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadPriceListSimple = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Product List");

    worksheet.mergeCells("A1:J1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    // Subtitle row
    worksheet.mergeCells("A2:J2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "Product List";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // Define columns based on your fields
    worksheet.columns = [
      { key: "no", header: "No", width: 5 },
      { key: "productName", header: "Product Name", width: 55 },
      { key: "type", header: "Type", width: 18 },
      { key: "packing", header: "Packing", width: 20 },
      { key: "qtyPerBox", header: "Qty per Box", width: 15 },
      { key: "qtyPerCarton", header: "Qty per Carton", width: 18 },
      { key: "supplierName", header: "Supplier Name", width: 25 },
      { key: "drugLicense", header: "Drug Registration License #", width: 25 },
      { key: "licenseValidityDate", header: "Drug Registration License Validity Date", width: 25 },
      { key: "remarks", header: "HEALTHCARE SOUTH EAST ASIA", width: 30 },
    ];

    // Header row formatting
    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "No",
      "Product Name",
      "Type",
      "Packing",
      "Qty per Box",
      "Qty per Carton",
      "Supplier Name",
      "Drug Registration License #",
      "Drug Registration License Validity Date",
      "Remarks",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(3).height = 20;

    // Format the date column for "licenseValidityDate"
    // It's the 9th column here (I is 9)
    worksheet.getColumn(9).numFmt = "dd‑mmm‑yyyy";

    // Export
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "product.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Price List Sample Excel
    </button>
  );
};

export default SampleExcelDownloadPriceListSimple;
