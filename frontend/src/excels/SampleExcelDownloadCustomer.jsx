import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadCustomer = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customer List");

    // ===== Title Row (Row 1) =====
    worksheet.mergeCells("A1:J1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    // ===== Subtitle Row (Row 2) =====
    worksheet.mergeCells("A2:J2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "Customer List";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // ===== Define Column Structure =====
    worksheet.columns = [
      { key: "customerCode", width: 18 },
      { key: "date", width: 15 },
      { key: "medicalRep", width: 28 },
      { key: "customerName", width: 30 },
      { key: "businessType", width: 22 },
      { key: "customerNumber", width: 20 },
      { key: "customerAddress", width: 55 },
      { key: "zone", width: 18 },
      { key: "location", width: 20 },
      { key: "remark", width: 25 },
    ];

    worksheet.getRow(3).values = [
      "Customer Code",
      "Date",
      "Medical Representative Name",
      "Customer Name in English",
      "Types of Business",
      "Customer Number",
      "Customer Address",
      "Zone",
      "Location",
      "Remark",
    ];
    worksheet.getRow(3).font = { bold: true };
    worksheet.getRow(3).alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(3).height = 20;
    worksheet.getColumn(2).numFmt = "d-mmm-yy"; // Date column (B)

    // ===== Dropdown for "Types of Business" (Column E) =====
    worksheet.getColumn(5).eachCell((cell, rowNumber) => {
      if (rowNumber <= 3) return;
      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Retail,Clinic,Hospital,Pharmacy"'],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid input",
        error: "Choose from the list.",
      };
    });

    // ===== Dropdown for "Zone" (Column H) =====
    worksheet.getColumn(8).eachCell((cell, rowNumber) => {
      if (rowNumber <= 3) return;
      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Olympic,Borverl,Other"'],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid input",
        error: "Choose from the list.",
      };
    });

    // ===== Export File =====
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer_list_sample.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:text text-sm mb-4 block cursor-pointer"
    >
      Click here to download Customer List Sample Excel
    </button>
  );
};

export default SampleExcelDownloadCustomer;
