import React from "react";
import ExcelJS from "exceljs";

const SampleExcelDownloadBrands = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Brands List");

    // Define columns
    worksheet.columns = [
      { header: "Brand Name", key: "brandName", width: 25 },
      { header: "Brand Slug", key: "brandSlug", width: 25 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    headerRow.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "brands_sample.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:text text-sm mb-4 block cursor-pointer"
    >
      Click here to download Brands Sample Excel file
    </button>
  );
};

export default SampleExcelDownloadBrands;
