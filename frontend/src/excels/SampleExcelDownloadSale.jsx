// import React from "react";
import ExcelJS from "exceljs";
import { useInitialSaleData } from "../pages/Sale/IntialLoading";

const SampleExcelDownloadSale = ({ data = [] }) => {
  const { statuses = [], productNames = [], loading } = useInitialSaleData();

  const generateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sale Summary");

      // === Sheet Titles ===
      worksheet.mergeCells("A1:O1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(1).height = 25;

      worksheet.mergeCells("A2:O2");
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = "Sale Summary List";
      subtitleCell.font = { bold: true, size: 14 };
      subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(2).height = 20;

      // === Define Columns ===
      worksheet.columns = [
        { key: "no", width: 5 },
        { key: "recordingDate", width: 15 },
        { key: "invoiceNumber", width: 15 },
        { key: "invoiceDate", width: 15 },
        { key: "mrName", width: 20 },
        { key: "customerCode", width: 25 },
        { key: "productName", width: 25 },
        { key: "salesQty", width: 15 },
        { key: "bonusQty", width: 15 },
        { key: "sellingPrice", width: 27 },
        { key: "discount", width: 15 },
        { key: "creditDays", width: 12 },
        { key: "paidAmount", width: 12 },
        { key: "paymentStatus", width: 15 },
        { key: "remark", width: 25 },
      ];

      // === Header Row ===
      const headerRow = worksheet.getRow(3);
      headerRow.values = [
        "No",
        "Recording Date",
        "Invoice #",
        "Invoice Date",
        "MR Name",
        "Customer Code",
        "Product Name",
        "Sales Qty",
        "Bonus Qty",
        "Selling Price (USD)",
        "Discount (USD)",
        "Credit Days",
        "Paid Amount",
        "Payment Status",
        "Remarks",
      ];
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(3).height = 20;

      // === Format Date Columns ===
      ["recordingDate", "invoiceDate"].forEach((key) => {
        const col = worksheet.getColumn(key);
        if (col) col.numFmt = "dd/mm/yyyy";
      });

      // === Add Data Rows ===
      if (data && data.length > 0) {
        data.forEach((item, index) => {
          const row = worksheet.addRow({
            no: index + 1,
            recordingDate: item.recordingDate
              ? new Date(item.recordingDate)
              : null,
            invoiceNumber: item.invoiceNumber || "",
            invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : null,
            mrName: item.mrName || "",
            customerCode: item.customerCode || "",
            productName: item.productName || "",
            salesQty: item.salesQty || 0,
            bonusQty: item.bonusQty || 0,
            sellingPrice: item.sellingPrice || 0,
            discount: item.discount || 0,
            creditDays: item.creditDays || 0,
            paidAmount: item.paidAmount || 0,
            paymentStatus: item.paymentStatus || "",
            remark: item.remark || "",
          });

          // Format numeric cells (excluding lc)
          [
            "salesQty",
            "bonusQty",
            "sellingPrice",
            "discount",
            "paidAmount",
          ].forEach((key) => {
            const cell = row.getCell(key);
            if (cell && cell.value !== undefined && cell.value !== null) {
              cell.numFmt = "#,##0.00";
            }
          });
        });
      }

      const startRow = 4;
      const endRow = 1000;

      // Prepare dropdown values for payment status only
      const paymentStatusTypes = statuses
        .map((s) => (typeof s === "string" ? s : s.type || ""))
        .filter(Boolean);

      // Create a hidden dropdown sheet
      const dropdownSheet = workbook.addWorksheet("DropdownValues");
      dropdownSheet.state = "veryHidden";

      paymentStatusTypes.forEach((status, index) => {
        dropdownSheet.getCell(`A${index + 1}`).value = status;
      });

      // Set up dropdown for Payment Status column
      if (paymentStatusTypes.length > 0) {
        for (let i = startRow; i <= endRow; i++) {
          try {
            worksheet.getCell(`N${i}`).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [
                `=DropdownValues!$A$1:$A$${paymentStatusTypes.length}`,
              ],
              showErrorMessage: true,
              errorTitle: "Invalid Input",
              error: "Please select a value from the list",
              showDropDown: true,
            };
          } catch (error) {
            console.warn(
              `Failed to set dropdown for Payment Status at row ${i}:`,
              error
            );
          }
        }

        try {
          worksheet.getColumn("N").eachCell((cell, rowNumber) => {
            if (rowNumber >= startRow) {
              cell.dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [
                  `=DropdownValues!$A$1:$A$${paymentStatusTypes.length}`,
                ],
                showErrorMessage: true,
                errorTitle: "Invalid Input",
                error: "Please select a value from the list",
                showDropDown: true,
              };
            }
          });
        } catch (error) {
          console.warn(
            "Failed to set column-wide data validation for Payment Status:",
            error
          );
        }
      }

      // === Apply borders to all cells ===
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= worksheet.rowCount) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        }
      });

      // === Export Excel File ===
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "saleSummary.xlsx";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Error generating Excel file:", error);
      alert("Error generating Excel file. Please try again.");
    }
  };

  if (loading) return <p>Loading sample data...</p>;

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer"
    >
      Download Sales Summary Sample Excel
    </button>
  );
};

export default SampleExcelDownloadSale;
