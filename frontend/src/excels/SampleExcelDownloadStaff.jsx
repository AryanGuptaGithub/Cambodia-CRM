import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadStaff = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("List");

    // Merge and center "List" across A1:D1
    worksheet.mergeCells("A1:E1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "MR List";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 20;

    // Merge and center "Medical Representative" across A2:D2
    worksheet.mergeCells("A2:E2");
    const mrTitleCell = worksheet.getCell("A2");
    mrTitleCell.value = "Medical Representative";
    mrTitleCell.font = { bold: true, size: 12 };
    mrTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(2).height = 18;

    // Header row (No, MR Name, Team Name, Contact No, Email)
    worksheet.getRow(3).values = [
      "No",
      "MR Name",
      "Team Name",
      "Contact No",
      "Email",
    ];
    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "mrName", width: 25 },
      { key: "teamName", width: 15 },
      { key: "contactNo", width: 25 },
      { key: "email", width: 30 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(3);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 18;
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
        fgColor: { argb: "FFD9D9D9" }, // light gray background
      };
    });

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "medical_representative_list.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:text-blue-800 text-sm mb-4 block cursor-pointer"
    >
      Click here to download Medical Representative Excel file
    </button>
  );
};

export default SampleExcelDownloadStaff;
