import React from "react";
import ExcelJS from "exceljs";

const TransactionExcelDownload = ({
  data = [],
  categoryOptions = [],
  sourceOptions = [],
  destinationOptions = [],
  supplierOptions = [],
  customerOptions = [],
  activeTab = "Cash Balance",
}) => {

  const getOptionLabels = (options = []) => {
    const seen = new Set();
    return options
      .filter(Boolean)
      .map(opt =>
        typeof opt === "object"
          ? opt.name || opt.label || opt.value
          : opt
      )
      .map(v => String(v).trim())
      .filter(v => v && !seen.has(v) && seen.add(v));
  };

  const applyDropdown = (ws, range, list, field) => {
    if (!list.length) return;
    ws.dataValidations.add(range, {
      type: "list",
      allowBlank: true,
      formulae: [`"${list.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Invalid Selection",
      error: `Please select a valid ${field}`,
    });
  };

  const generateExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Transaction Template");

    /** ================= HEADER ================= */
    ws.mergeCells("A1:M1");
    ws.getCell("A1").value = "HEALTHCARE SOUTH EAST ASIA";
    ws.getCell("A1").font = { bold: true, size: 18 };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.mergeCells("A2:M2");
    ws.getCell("A2").value = `Transaction Import Template - ${activeTab}`;
    ws.getCell("A2").alignment = { horizontal: "center" };

    /** ================= COLUMNS ================= */
    const columns = [
      "Invoice Number",
      "Category Type*",
      "Date* (YYYY-MM-DD)",
      "Amount*",
      "Source Account",
      "Destination Account",
      "Supplier Name",
      "Exchange Loss",
      "Final Amount (Auto)",
      "Invoice Date (YYYY-MM-DD)",
      "Customer Name",
      "Customer Address",
      "Remarks",
    ];

    ws.getRow(3).values = columns;
    ws.getRow(3).font = { bold: true };
    ws.columns = columns.map(() => ({ width: 20 }));

    /** ================= FORMATS ================= */
    ws.getColumn(3).numFmt = "yyyy-mm-dd";
    ws.getColumn(10).numFmt = "yyyy-mm-dd";

    ws.getColumn(4).numFmt = "#,##0.00";
    ws.getColumn(8).numFmt = "#,##0.00";
    ws.getColumn(9).numFmt = "#,##0.00";

    /** ================= DROPDOWNS ================= */
    const categories = getOptionLabels(categoryOptions);
    const sources = getOptionLabels(sourceOptions);
    const destinations = getOptionLabels(destinationOptions);
    const suppliers = getOptionLabels(supplierOptions);
    const customers = getOptionLabels(customerOptions);

    applyDropdown(ws, "B4:B1000", categories, "Category");
    applyDropdown(ws, "E4:E1000", sources, "Source");
    applyDropdown(ws, "F4:F1000", destinations, "Destination");
    applyDropdown(ws, "G4:G1000", suppliers, "Supplier");
    applyDropdown(ws, "K4:K1000", customers, "Customer");

    /** ================= VALIDATIONS ================= */
    for (let i = 4; i <= 1000; i++) {

      // Category required
      ws.getCell(`B${i}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`"${categories.join(",")}"`],
        showErrorMessage: true,
        errorTitle: "Required",
        error: "Category Type is required",
      };

      // Date required
      ws.getCell(`C${i}`).dataValidation = {
        type: "custom",
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: "Invalid Date",
        error: "Date must be YYYY-MM-DD",
        formulae: [`=AND(ISNUMBER(C${i}),C${i}>=DATE(1900,1,1))`],
      };

      // Amount required
      ws.getCell(`D${i}`).dataValidation = {
        type: "decimal",
        operator: "greaterThan",
        allowBlank: false,
        formulae: [0],
        showErrorMessage: true,
        errorTitle: "Invalid Amount",
        error: "Amount must be greater than 0",
      };

      // Exchange Loss optional
      ws.getCell(`H${i}`).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        allowBlank: true,
        formulae: [0],
        showErrorMessage: true,
        errorTitle: "Invalid Value",
        error: "Exchange Loss cannot be negative",
      };

      // Invoice Date optional
      ws.getCell(`J${i}`).dataValidation = {
        type: "custom",
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Invalid Date",
        error: "Invoice Date must be YYYY-MM-DD",
        formulae: [`=OR(J${i}="",AND(ISNUMBER(J${i}),J${i}>=DATE(1900,1,1)))`],
      };

      // Auto Final Amount
      ws.getCell(`I${i}`).value = {
        formula: `IF(D${i}="", "", D${i} - IF(H${i}="",0,H${i}))`,
      };
    }

    /** ================= FREEZE HEADER ================= */
    ws.views = [{ state: "frozen", ySplit: 3 }];

    /** ================= EXPORT ================= */
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `transaction-template-${activeTab
      .toLowerCase()
      .replace(/\s+/g, "-")}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <button
      onClick={generateExcel}
      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
    >
      Download Import Template
    </button>
  );
};

export default TransactionExcelDownload;
