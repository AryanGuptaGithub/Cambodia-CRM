import React, { useState, useEffect, useCallback } from "react";
import ExcelJS from "exceljs";
import { useInitialSaleData } from "../pages/Sale/IntialLoading";
import { showToast } from "../utils/toast";
import {
  fetchProducts as fetchProductsAPI,
  fetchSuppliers as fetchSuppliersAPI,
} from "../pages/ProductManager/common/fetchDropdown";

const PurchaseInventoryExcelDownload = ({ data = [] }) => {
  const { productNames = [], loading: productLoading } = useInitialSaleData();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [products, setProducts] = useState([]);

  const fetchSuppliers = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const result = await fetchSuppliersAPI();
      if (result.success) {
        setSuppliers(result.data);
      } else {
        showToast("error", result.error || "Failed to fetch suppliers");
      }
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      showToast("error", "Failed to fetch suppliers");
    } finally {
      setSupplierLoading(false);
    }
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                              🔹 Fetch Products                             */
  /* -------------------------------------------------------------------------- */
  const fetchProducts = useCallback(async () => {
    try {
      const result = await fetchProductsAPI();
      if (result.success) {
        setProducts(result.data);
      } else {
        showToast("error", result.error || "Failed to fetch products");
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, [fetchProducts, fetchSuppliers]);

  /* -------------------------------------------------------------------------- */
  /*                          🔹 Excel Generation Logic                         */
  /* -------------------------------------------------------------------------- */
  const generateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Purchase Inventory");

      // === Title Row ===
      worksheet.mergeCells("A1:L1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { size: 16, bold: true };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };

      // === Subtitle Row ===
      worksheet.mergeCells("A2:L2");
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = "Purchase Inventory Summary";
      subtitleCell.font = { size: 14, bold: true };
      subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

      worksheet.addRow([]);

      // === Header Row (Removed NO & Qty per Carton) ===
      const headerRow = worksheet.addRow([
        "Invoice Number",
        "Invoice Date",
        "Delivery No.",
        "Received Date",
        "Product Name",
        "Supplier Name",
        "Expiry Date",
        "Quantity per Box/Strip", // ✅ Updated name
        "FOB (USD)",
        "CIF (USD)",
        "LC (USD)",
        "Remarks",
      ]);

      // === Header Styling ===
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // === Column Widths ===
      worksheet.columns = [
        { width: 25 }, // Invoice Number
        { width: 20 }, // Invoice Date
        { width: 20 }, // Delivery No
        { width: 20 }, // Received Date
        { width: 30 }, // Product Name
        { width: 25 }, // Supplier Name
        { width: 20 }, // Expiry Date
        { width: 25 }, // Quantity per Box/Strip
        { width: 15 }, // FOB
        { width: 15 }, // CIF
        { width: 20 }, // LC Number
        { width: 30 }, // Remarks
      ];

      // === Date Columns ===
      ["B", "D", "G"].forEach((col) => {
        worksheet.getColumn(col).numFmt = "dd/mm/yyyy";
      });

      // === Numeric Columns ===
      ["H", "I", "J"].forEach((col) => {
        worksheet.getColumn(col).numFmt = "#,##0.00";
      });

      const startRow = 4;
      const endRow = 1000;

      /* -------------------------------------------------------------------------- */
      /*                     🔹 Prepare Dropdown Data (Products & Suppliers)         */
      /* -------------------------------------------------------------------------- */
      const uniqueProductNames = [
        ...new Set(
          [
            ...productNames.map(
              (p) =>
                (typeof p === "object"
                  ? p.name || p.productName || p.label || p.value
                  : p) || ""
            ),
            ...products.map((p) => p.label || p.productName || ""),
          ].filter((name) => name && name.trim() !== "")
        ),
      ];

      const uniqueSupplierNames = [
        ...new Set(
          suppliers
            .map((s) =>
              typeof s === "object"
                ? s.name || s.supplierName || s.label || s.value
                : s
            )
            .filter((name) => name && name.trim() !== "")
        ),
      ];

      /* -------------------------------------------------------------------------- */
      /*                     🔹 Add Hidden Dropdown Sheet                           */
      /* -------------------------------------------------------------------------- */
      if (uniqueProductNames.length > 0 || uniqueSupplierNames.length > 0) {
        const dropdownSheet = workbook.addWorksheet("DropdownData");
        dropdownSheet.state = "veryHidden";

        uniqueProductNames.forEach((product, index) => {
          dropdownSheet.getCell(`A${index + 1}`).value = product;
        });

        uniqueSupplierNames.forEach((supplier, index) => {
          dropdownSheet.getCell(`B${index + 1}`).value = supplier;
        });

        // === Product Name Dropdown (Column E) ===
        if (uniqueProductNames.length > 0) {
          for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
            const cell = worksheet.getCell(`E${rowNum}`);
            cell.dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownData!$A$1:$A$${uniqueProductNames.length}`],
              showErrorMessage: true,
              errorTitle: "Invalid Input",
              error: "Please select a valid product",
              promptTitle: "Select Product",
              prompt: "Choose a product from the dropdown list",
              showInputMessage: true,
            };
          }
        }

        // === Supplier Name Dropdown (Column F) ===
        if (uniqueSupplierNames.length > 0) {
          for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
            const cell = worksheet.getCell(`F${rowNum}`);
            cell.dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownData!$B$1:$B$${uniqueSupplierNames.length}`],
              showErrorMessage: true,
              errorTitle: "Invalid Input",
              error: "Please select a valid supplier",
              promptTitle: "Select Supplier",
              prompt: "Choose a supplier from the dropdown list",
              showInputMessage: true,
            };
          }
        }
      }

      // === Borders for Data Area ===
      for (let i = 4; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }

      // === Export File ===
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "PurchaseInventory.xlsx";
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Error generating Excel:", error);
      showToast("error", "Error generating Excel file. Please try again.");
    }
  };

  const isLoading = productLoading || supplierLoading;

  if (isLoading) {
    return (
      <button
        disabled
        className="text-gray-400 text-sm mb-4 block cursor-not-allowed"
      >
        {productLoading
          ? "Loading product data..."
          : "Loading supplier data..."}
      </button>
    );
  }

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Purchase Inventory Excel
    </button>
  );
};

export default PurchaseInventoryExcelDownload;
