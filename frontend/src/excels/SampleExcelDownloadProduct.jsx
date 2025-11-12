import React from "react";
import ExcelJS from "exceljs";
import {
  fetchProductTypes,
  fetchSuppliers,
  fetchProductPackingType,
} from "../pages/ProductManager/common/fetchDropdown";

const SampleExcelDownloadPriceListSimple = () => {
  const generateExcel = async () => {
    try {
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
        {
          key: "licenseValidityDate",
          header: "Drug Registration License Validity Date",
          width: 45,
        },
        { key: "remarks", header: "Remarks", width: 30 },
      ];

      // Header
      const headerRow = worksheet.getRow(3);
      headerRow.values = worksheet.columns.map((col) => col.header);
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(3).height = 20;

      // Date column format
      worksheet.getColumn(11).numFmt = "dd-mmm-yyyy";

      // Fetch dropdown data
      console.log("🔄 Fetching dropdown data...");
      const [typesResult, suppliersResult, packingResult] = await Promise.all([
        fetchProductTypes(),
        fetchSuppliers(),
        fetchProductPackingType(),
      ]);

      const typeOptions = typesResult?.success
        ? typesResult.data.map((item) =>
            String(item.value).replace(/["',\n\r]/g, "").trim()
          )
        : [];
      const supplierOptions = suppliersResult?.success
        ? suppliersResult.data.map((item) =>
            String(item.value).replace(/["',\n\r]/g, "").trim()
          )
        : [];
      const packingOptions = packingResult?.success
        ? packingResult.data.map((item) =>
            String(item.value).replace(/["',\n\r]/g, "").trim()
          )
        : [];

      console.log("✅ Type options:", typeOptions);
      console.log("✅ Supplier options:", supplierOptions);
      console.log("✅ Packing options:", packingOptions);

      // Helper to safely apply dropdown lists
      const applyDropdown = (range, options) => {
        if (!options.length) return;

        // Excel formula for list must not exceed 255 chars
        const validOptions = options.filter((v) => v && v.trim() !== "");
        const safeOptions = [];
        let current = "";

        // Split long lists into chunks under 255 characters
        for (const opt of validOptions) {
          if ((current + opt + ",").length > 250) {
            safeOptions.push(current.slice(0, -1));
            current = "";
          }
          current += opt + ",";
        }
        if (current) safeOptions.push(current.slice(0, -1));

        safeOptions.forEach((chunk) => {
          worksheet.dataValidations.add(range, {
            type: "list",
            allowBlank: true,
            formulae: [`"${chunk}"`],
          });
        });
      };

      // Apply dropdowns
      applyDropdown("B4:B1000", typeOptions);
      applyDropdown("C4:C1000", packingOptions);
      applyDropdown("I4:I1000", supplierOptions);

      // Generate Excel file safely
      console.log("💾 Generating Excel file...");
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "product.xlsx";
      link.click();
      URL.revokeObjectURL(link.href);

      console.log("✅ Excel download triggered successfully.");
    } catch (error) {
      console.error("❌ Error generating Excel:", error);
      alert(
        "Something went wrong while generating the Excel file. Please check console logs for details."
      );
    }
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
