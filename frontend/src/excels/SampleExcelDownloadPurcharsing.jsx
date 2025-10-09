import React, { useState, useEffect, useCallback } from "react";
import ExcelJS from "exceljs";
import { useInitialSaleData } from "../pages/Sale/IntialLoading";
import axios from "axios";
import { showToast } from "../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const PurchaseInventoryExcelDownload = ({ data = [] }) => {
  const { productNames = [], loading: productLoading } = useInitialSaleData();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    try {
      setSupplierLoading(true);
      const response = await axios.get(`${backendUrl}/api/suppliers`);
      setSuppliers(response.data);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      showToast("error", "Failed to fetch suppliers");
    } finally {
      setSupplierLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  console.log("Product names from hook:", productNames);
  console.log("Suppliers from API:", suppliers);

  const generateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Purchase Inventory");

      // === Title Row ===
      worksheet.mergeCells("A1:N1"); // Expanded to N for 14 columns
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { size: 16, bold: true };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };

      // === Subtitle Row ===
      worksheet.mergeCells("A2:N2"); // Expanded to N for 14 columns
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = "Purchase Inventory Summary";
      subtitleCell.font = { size: 14, bold: true };
      subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

      worksheet.addRow([]);

      // === Header Row ===
      const headerRow = worksheet.addRow([
        "NO",
        "Invoice Number",
        "Invoice Date",
        "Delivery No.",
        "Received Date",
        "Product Name",
        "Supplier Name", // New column added
        "Expiry Date",
        "Qty Box",
        "Qty per Carton",
        "FOB",
        "CIF",
        "LC Number",
        "Remarks",
      ]);

      // Header styling
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

      // Column widths
      worksheet.columns = [
        { width: 5 }, // NO
        { width: 25 }, // Invoice Number
        { width: 25 }, // Invoice Date
        { width: 25 }, // Delivery Note No.
        { width: 25 }, // Received Date
        { width: 25 }, // Product Name
        { width: 25 }, // Supplier Name (new column)
        { width: 25 }, // Expiry Date
        { width: 15 }, // Qty Box
        { width: 15 }, // Qty per Carton
        { width: 15 }, // FOB
        { width: 15 }, // CIF
        { width: 15 }, // LC Number
        { width: 35 }, // Remarks
      ];

      // Format date columns (adjusted for new column positions)
      ["C", "E", "H"].forEach((col) => {
        worksheet.getColumn(col).numFmt = "dd/mm/yyyy";
      });

      // Format numeric columns (adjusted for new column positions)
      ["I", "J", "K", "L"].forEach((col) => {
        worksheet.getColumn(col).numFmt = "#,##0.00";
      });

      const startRow = 4;
      const endRow = 1000;

      // Process product names for dropdown
      const uniqueProductNames = [
        ...new Set(
          productNames
            .map((p) => {
              if (typeof p === "string") return p;
              if (p && typeof p === "object") {
                return p.name || p.productName || p.label || p.value || "";
              }
              return "";
            })
            .filter((name) => name && name.trim() !== "")
        ),
      ];

      console.log("Unique product names for dropdown:", uniqueProductNames);

      // Process supplier names for dropdown - extract names from API response
      const uniqueSupplierNames = [
        ...new Set(
          suppliers
            .map((s) => {
              if (typeof s === "string") return s;
              if (s && typeof s === "object") {
                return s.name || s.supplierName || s.label || s.value || "";
              }
              return "";
            })
            .filter((name) => name && name.trim() !== "")
        ),
      ];

      console.log("Unique supplier names for dropdown:", uniqueSupplierNames);

      // Create hidden dropdown sheets if we have data
      if (uniqueProductNames.length > 0 || uniqueSupplierNames.length > 0) {
        const dropdownSheet = workbook.addWorksheet("DropdownData");
        dropdownSheet.state = "veryHidden";

        // Write product names to dropdown sheet starting from column A
        if (uniqueProductNames.length > 0) {
          uniqueProductNames.forEach((product, index) => {
            dropdownSheet.getCell(`A${index + 1}`).value = product;
          });
          console.log(
            `Product dropdown values written: ${uniqueProductNames.length} products`
          );
        }

        // Write supplier names to dropdown sheet starting from column B
        if (uniqueSupplierNames.length > 0) {
          uniqueSupplierNames.forEach((supplier, index) => {
            dropdownSheet.getCell(`B${index + 1}`).value = supplier;
          });
          console.log(
            `Supplier dropdown values written: ${uniqueSupplierNames.length} suppliers`
          );
        }

        // Set up dropdown for Product Name column (Column F)
        if (uniqueProductNames.length > 0) {
          for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
            try {
              const cell = worksheet.getCell(`F${rowNum}`);
              cell.dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [
                  `=DropdownData!$A$1:$A$${uniqueProductNames.length}`,
                ],
                showErrorMessage: true,
                errorTitle: "Invalid Input",
                error: "Please select a product from the list",
                promptTitle: "Select Product",
                prompt: "Choose a product from the dropdown list",
                showDropDown: true,
                showInputMessage: true,
              };
            } catch (error) {
              console.warn(
                `Failed to set dropdown for Product Name at row ${rowNum}:`,
                error
              );
            }
          }
          console.log("Product name dropdown setup completed");
        }

        // Set up dropdown for Supplier Name column (Column G)
        if (uniqueSupplierNames.length > 0) {
          for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
            try {
              const cell = worksheet.getCell(`G${rowNum}`);
              cell.dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [
                  `=DropdownData!$B$1:$B$${uniqueSupplierNames.length}`,
                ],
                showErrorMessage: true,
                errorTitle: "Invalid Input",
                error: "Please select a supplier from the list",
                promptTitle: "Select Supplier",
                prompt: "Choose a supplier from the dropdown list",
                showDropDown: true,
                showInputMessage: true,
              };
            } catch (error) {
              console.warn(
                `Failed to set dropdown for Supplier Name at row ${rowNum}:`,
                error
              );
            }
          }
          console.log("Supplier name dropdown setup completed");
        }
      } else {
        console.warn("No product or supplier names available for dropdown");
      }

      // === Apply borders to all data cells ===
      for (let i = 4; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        if (row) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        }
      }

      // Format numeric cells in data rows (adjusted for new column positions)
      for (let i = startRow; i <= endRow; i++) {
        ["I", "J", "K", "L"].forEach((col) => {
          const cell = worksheet.getCell(`${col}${i}`);
          if (
            cell.value !== null &&
            cell.value !== undefined &&
            cell.value !== ""
          ) {
            cell.numFmt = "#,##0.00";
          }
        });
      }

      // Set row heights for better visibility
      worksheet.getRow(1).height = 25;
      worksheet.getRow(2).height = 20;
      worksheet.getRow(4).height = 20; // Header row

      // === Export to Excel ===
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

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Error generating Excel file:", error);
      alert("Error generating Excel file. Please try again.");
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
