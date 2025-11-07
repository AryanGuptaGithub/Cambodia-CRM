import React from "react";
import ExcelJS from "exceljs";
import { fetchProductTypes, fetchSuppliers, fetchProductPackingType } from "../pages/ProductManager/common/fetchDropdown";

const SampleExcelDownloadPriceListSimple = () => {
  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Product List");

    // Title
    worksheet.mergeCells("A1:L1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    // Subtitle
    worksheet.mergeCells("A2:L2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "Product List";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // Define columns
    worksheet.columns = [
      { key: "productName", header: "Product Name", width: 50 },
      { key: "type", header: "Type", width: 18 },
      { key: "packing", header: "Packing", width: 20 },
      { key: "sellingPrice", header: "Selling Price (USD)", width: 18 },
      { key: "lc", header: "LC (USD)", width: 12 },
      { key: "fob", header: "FOB (USD)", width: 12 },
      { key: "taxSellingPrice", header: "Tax Selling Price (USD)", width: 22 },
      { key: "qtyPerBox", header: "Quantity per Box/Strip", width: 22 },
      { key: "supplierName", header: "Supplier Name", width: 25 },
      { key: "drugLicense", header: "Drug Registration License #", width: 30 },
      { key: "licenseValidityDate", header: "Drug Registration License Validity Date", width: 45 },
      { key: "remarks", header: "HEALTHCARE SOUTH EAST ASIA", width: 30 },
    ];

    // Header row formatting
    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "Product Name",
      "Type",
      "Packing",
      "Selling Price (USD)",
      "LC (USD)",
      "FOB (USD)",
      "Tax Selling Price (USD)",
      "Quantity per Box/Strip",
      "Supplier Name",
      "Drug Registration License #",
      "Drug Registration License Validity Date",
      "Remarks",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(3).height = 20;

    // Format the date column
    worksheet.getColumn(11).numFmt = "dd-mmm-yyyy";

    // Fetch dropdown data
    try {
      const typesResult = await fetchProductTypes();
      const typeOptions = typesResult.success ? typesResult.data.map(item => item.value) : [];

      const suppliersResult = await fetchSuppliers();
      const supplierOptions = suppliersResult.success ? suppliersResult.data.map(item => item.value) : [];

      const packingResult = await fetchProductPackingType();
      const packingOptions = packingResult.success ? packingResult.data.map(item => item.value) : [];

      // Type dropdown (Column B)
      if (typeOptions.length > 0) {
        worksheet.dataValidations.add("B4:B1000", {
          type: "list",
          allowBlank: true,
          formulae: [`"${typeOptions.join(",")}"`],
        });
      }

      // Packing dropdown (Column C)
      if (packingOptions.length > 0) {
        worksheet.dataValidations.add("C4:C1000", {
          type: "list",
          allowBlank: true,
          formulae: [`"${packingOptions.join(",")}"`],
        });
      }

      // Supplier dropdown (Column I)
      if (supplierOptions.length > 0) {
        worksheet.dataValidations.add("I4:I1000", {
          type: "list",
          allowBlank: true,
          formulae: [`"${supplierOptions.join(",")}"`],
        });
      }
    } catch (error) {
      console.error("Error setting up dropdowns:", error);
    }

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
      Download Product List Sample Excel
    </button>
  );
};

export default SampleExcelDownloadPriceListSimple;
