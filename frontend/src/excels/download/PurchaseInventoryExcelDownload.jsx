import React, { useState, useEffect, useCallback } from "react";
import ExcelJS from "exceljs";

import { Download } from "lucide-react";
import { useInitialSaleData } from "../../pages/Sale/IntialLoading";
import { showToast } from "../../utils/toast";
import {
  fetchProducts as fetchProductsAPI,
  fetchSuppliers as fetchSuppliersAPI,
} from "../../pages/ProductManager/common/fetchDropdown";

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

  const generateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Purchase Inventory");

      worksheet.mergeCells("A1:L1");
      worksheet.getCell("A1").value = "HEALTHCARE SOUTH EAST ASIA";
      worksheet.getCell("A1").font = { size: 16, bold: true };
      worksheet.getCell("A1").alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      worksheet.mergeCells("A2:L2");
      worksheet.getCell("A2").value = "Purchase Inventory Summary";
      worksheet.getCell("A2").font = { size: 14, bold: true };
      worksheet.getCell("A2").alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      worksheet.addRow([]);

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

      ["B", "D", "G"].forEach(
        (col) => (worksheet.getColumn(col).numFmt = "dd/mm/yyyy")
      );
      ["H", "I", "J"].forEach(
        (col) => (worksheet.getColumn(col).numFmt = "#,##0.00")
      );

      const startRow = 4;
      const endRow = 1000;

      const uniqueProductNames = [
        ...new Set(
          [
            ...productNames.map((p) =>
              typeof p === "object" ? p.name || p.productName || "" : p
            ),
            ...products.map((p) => p.label || p.productName || ""),
          ].filter(Boolean)
        ),
      ];

      const uniqueSupplierNames = [
        ...new Set(
          suppliers
            .map((s) =>
              typeof s === "object" ? s.name || s.supplierName || "" : s
            )
            .filter(Boolean)
        ),
      ];

      if (uniqueProductNames.length || uniqueSupplierNames.length) {
        const dropdownSheet = workbook.addWorksheet("DropdownData");
        dropdownSheet.state = "veryHidden";
        uniqueProductNames.forEach(
          (p, idx) => (dropdownSheet.getCell(`A${idx + 1}`).value = p)
        );
        uniqueSupplierNames.forEach(
          (s, idx) => (dropdownSheet.getCell(`B${idx + 1}`).value = s)
        );

        for (let i = startRow; i <= endRow; i++) {
          worksheet.getCell(`E${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`=DropdownData!$A$1:$A$${uniqueProductNames.length}`],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a valid product",
          };
          worksheet.getCell(`F${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`=DropdownData!$B$1:$B$${uniqueSupplierNames.length}`],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a valid supplier",
          };
        }
      }

      for (let i = startRow; i <= worksheet.rowCount; i++) {
        worksheet.getRow(i).eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }

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
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating Excel:", error);
      showToast("error", "Error generating Excel file. Please try again.");
    }
  };

  const isLoading = productLoading || supplierLoading;

  return (
    <button
      onClick={generateExcel}
      disabled={isLoading}
      className={`flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer ${
        isLoading ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <Download size={16} />
      {isLoading ? "Loading..." : "Download Purchase Inventory"}
    </button>
  );
};

export default PurchaseInventoryExcelDownload;
