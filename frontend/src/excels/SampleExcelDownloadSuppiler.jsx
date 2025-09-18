import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadSuppiler = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Supplier List");

    // Merge and center the main title across A1:E1
    worksheet.mergeCells("A1:E1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HSCL Manufacturers /Supplier List";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 20;

    // Remove subtitle row (A2:E2)

    // Header row (now in row 2 instead of 3)
    const headerRow = worksheet.getRow(2);
    headerRow.values = [
      "Sr No",
      "Product Name",
      "Address",
      "Site Registration Date",
      "Site Registration Expiry Date",
    ];

    worksheet.columns = [
      { key: "srNo", width: 8 },
      { key: "productName", width: 30 },
      { key: "address", width: 40 },
      { key: "regDate", width: 25 },
      { key: "expiryDate", width: 25 },
    ];

    // Style header
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
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

    // Optional: Add spacing row after header
    worksheet.getRow(3).height = 18;

    // Generate and trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "supplier_list_sample.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:text text-sm mb-4 block cursor-pointer"
    >
      Click here to download Supplier Excel sample
    </button>
  );
};

export default SampleExcelDownloadSuppiler;
