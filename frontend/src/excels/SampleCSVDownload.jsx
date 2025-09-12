import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownload = () => {

  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sample Data");

    // Set columns with fixed widths
    worksheet.columns = [
      { header: "warehouse", key: "warehouse", width: 15 },
      { header: "name", key: "name", width: 20 },
      { header: "phone", key: "phone", width: 15 },
      { header: "email", key: "email", width: 25 },
      { header: "status", key: "status", width: 12 },    // dropdown column
      { header: "password", key: "password", width: 15 },
      { header: "taxNumber", key: "taxNumber", width: 15 },
      { header: "openingBalance", key: "openingBalance", width: 18 },
      { header: "type", key: "type", width: 12 },         // dropdown column
      { header: "creditPeriod", key: "creditPeriod", width: 15 },
      { header: "creditLimit", key: "creditLimit", width: 15 },
    ];

    // Center and style header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 20; // optional height
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Add one empty data row
    worksheet.addRow({
      warehouse: "",
      name: "",
      phone: "",
      email: "",
      status: "",
      password: "",
      taxNumber: "",
      openingBalance: "",
      type: "",
      creditPeriod: "",
      creditLimit: "",
    });

    // Data validation for 'status' (column 5, E)
    worksheet.getColumn(5).eachCell((cell, rowNumber) => {
      if (rowNumber === 1) return;

      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"enabled,disabled"'],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid input",
        error: "Please select from the dropdown list",
      };
    });

    // Data validation for 'type' (column 9, I)
    worksheet.getColumn(9).eachCell((cell, rowNumber) => {
      if (rowNumber === 1) return;

      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"pay,receive"'],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid input",
        error: "Please select from the dropdown list",
      };
    });

    // Generate buffer and create download link
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "sample.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block"
    >
      Click here to download Sample Excel file
    </button>
  );
};

export default SampleExcelDownload;
