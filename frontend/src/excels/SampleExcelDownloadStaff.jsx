import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadStaff = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("List");

    // Merge and center "MR List" title
    worksheet.mergeCells("A1:F1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "MR List";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 25;

    // Merge and center "Medical Representative" subtitle
    worksheet.mergeCells("A2:F2");
    const mrTitleCell = worksheet.getCell("A2");
    mrTitleCell.value = "Medical Representative";
    mrTitleCell.font = { bold: true, size: 12 };
    mrTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(2).height = 20;

    // Combined Instructions and Note row (Row 3)
    worksheet.mergeCells("A3:F3");
    const instructionCell = worksheet.getCell("A3");
    instructionCell.value =
      "Instructions: Fill all columns. Joining Date can be in any format (e.g., 12-Mar-2025, 13/03/2025, 13 Mar 2025). Note: All fields are required. Password must be at least 8 characters.";
    instructionCell.font = {
      italic: true,
      size: 9,
      color: { argb: "FF666666" },
    };
    instructionCell.alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
    };
    worksheet.getRow(3).height = 30; // Increased height for wrapped text

    // Header row (now row 4)
    const headerRow = worksheet.getRow(4);
    headerRow.values = [
      "MR Name",
      "Team Name",
      "Contact No",
      "Email",
      "Joining Date",
      "Password",
    ];

    // Updated column definitions including PASSWORD
    worksheet.columns = [
      { key: "mrName", width: 25 },
      { key: "teamName", width: 15 },
      { key: "contactNo", width: 20 },
      { key: "email", width: 30 },
      {
        key: "joiningDate",
        width: 20,
        style: {
          numFmt: "dd-mmm-yyyy", // Set date format for the column
        },
      },
      { key: "password", width: 20 },
    ];

    // Style header row
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" },
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "medical_representative_template.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up memory
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:text-blue-800 text-sm mb-4 block cursor-pointer"
    >
      Download Medical Representative Sample
    </button>
  );
};

export default SampleExcelDownloadStaff;
