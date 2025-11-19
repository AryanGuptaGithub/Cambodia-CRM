import React, { useState, useEffect, useCallback } from "react";
import ExcelJS from "exceljs";
import { Download } from "lucide-react"; // ✅ Download icon
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

  /* -------------------------------------------------------------------------- */
  /*                           🔹 Fetch Suppliers                               */
  /* -------------------------------------------------------------------------- */
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
  /*                           🔹 Fetch Products                                */
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
  /*                       🔹 Excel Generation Logic                            */
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

      // === Header Row ===
      const headerRow = worksheet.addRow([
        "Invoice Number",
        "Invoice Date",
        "Delivery No.",
        "Received Date",
        "Product Name",
        "Supplier Name",
        "Expiry Date",
        "Quantity per Box/Strip",
        "FOB (USD)",
        "CIF (USD)",
        "LC (USD)",
        "Remarks",
      ]);

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
        { width: 25 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 30 },
        { width: 25 },
        { width: 20 },
        { width: 25 },
        { width: 15 },
        { width: 15 },
        { width: 20 },
        { width: 30 },
      ];

      // === Date Format Columns ===
      ["B", "D", "G"].forEach((col) => {
        worksheet.getColumn(col).numFmt = "dd/mm/yyyy";
      });

      // === Numeric Format Columns ===
      ["H", "I", "J"].forEach((col) => {
        worksheet.getColumn(col).numFmt = "#,##0.00";
      });

      const startRow = 4;
      const endRow = 1000;

      /* -------------------------------------------------------------------------- */
      /*                      🔹 Prepare Dropdown Data                              */
      /* -------------------------------------------------------------------------- */
      const uniqueProductNames = [
        ...new Set(
          [
            ...productNames.map((p) =>
              typeof p === "object"
                ? p.name || p.productName || p.label || p.value
                : p
            ),
            ...products.map((p) => p.label || p.productName || ""),
          ].filter(Boolean)
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
            .filter(Boolean)
        ),
      ];

      /* -------------------------------------------------------------------------- */
      /*                    🔹 Hidden Dropdown Sheet                                */
      /* -------------------------------------------------------------------------- */
      if (uniqueProductNames.length || uniqueSupplierNames.length) {
        const dropdownSheet = workbook.addWorksheet("DropdownData");
        dropdownSheet.state = "veryHidden";

        uniqueProductNames.forEach((name, idx) => {
          dropdownSheet.getCell(`A${idx + 1}`).value = name;
        });

        uniqueSupplierNames.forEach((name, idx) => {
          dropdownSheet.getCell(`B${idx + 1}`).value = name;
        });

        // Product dropdown (column E)
        for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
          worksheet.getCell(`E${rowNum}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`=DropdownData!$A$1:$A$${uniqueProductNames.length}`],
          };
        }

        // Supplier dropdown (column F)
        for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
          worksheet.getCell(`F${rowNum}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`=DropdownData!$B$1:$B$${uniqueSupplierNames.length}`],
          };
        }
      }

      // === Borders for data ===
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
      showToast("error", "Error generating Excel file.");
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                               🔹 Loading UI                                 */
  /* -------------------------------------------------------------------------- */
  const isLoading = productLoading || supplierLoading;

  if (isLoading) {
    return (
      <button
        disabled
        className="bg-gray-300 text-gray-600 px-4 py-2 rounded-xl cursor-not-allowed"
      >
        Loading...
      </button>
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                               🔹 FINAL BUTTON                               */
  /* -------------------------------------------------------------------------- */
  return (
    <button
      onClick={generateExcel}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
    >
      <Download size={18} /> Download Excel
    </button>
  );
};

export default PurchaseInventoryExcelDownload;
