import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadSupplier = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Supplier List");

    // ===== Title Row (Row 1): HEALTHCARE SOUTH EAST ASIA =====
    worksheet.mergeCells("A1:D1"); // 4 columns now (A–D)
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 25;

    // ===== Subtitle Row (Row 2): HSCL Manufacturers / Supplier List =====
    worksheet.mergeCells("A2:D2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "HSCL Manufacturers / Supplier List";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(2).height = 20;

    // ===== Header Row (Row 3) =====
    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "Supplier Name",
      "Address",
      "Site Registration Date",
      "Site Registration Expiry Date",
    ];

    worksheet.columns = [
      { key: "suppilerName", width: 30 },
      { key: "address", width: 40 },
      { key: "regDate", width: 25 },
      { key: "expiryDate", width: 25 },
    ];

    // Style header row
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

    // Optional spacing row after header (Row 4)
    worksheet.getRow(4).height = 18;

    // ===== Generate and trigger download =====
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
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Click here to download Supplier Excel sample
    </button>
  );
};

export default SampleExcelDownloadSupplier;
