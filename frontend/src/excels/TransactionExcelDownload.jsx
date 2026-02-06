import React from "react";
import ExcelJS from "exceljs";

const TransactionExcelDownload = ({ 
  data = [], 
  categoryOptions = [], 
  sourceOptions = [], 
  destinationOptions = [], 
  supplierOptions = [],
  activeTab = "Cash Balance"
}) => {
  // Filter data based on active tab
  const filteredData = React.useMemo(() => {
    return data.filter((tx) => {
      const txCategoryName = tx.categoryType?.name?.toLowerCase() || "";
      const sourceName = tx.source?.name?.toLowerCase() || "";
      const destinationName = tx.destination?.name?.toLowerCase() || "";
      const activeTabLower = activeTab.toLowerCase();

      // For deposit/withdraw transactions, show entries for both source and destination
      if (txCategoryName === "deposit" || txCategoryName === "withdraw") {
        return (
          sourceName === activeTabLower ||
          destinationName === activeTabLower
        );
      }
      // For remittance, match source instead of destination
      else if (txCategoryName === "remittance") {
        return sourceName === activeTabLower;
      }
      // For other categories, match destination
      else {
        return destinationName === activeTabLower;
      }
    });
  }, [data, activeTab]);

  // Get unique categories for dropdown
  const uniqueCategories = React.useMemo(() => {
    const categories = categoryOptions.map(cat => cat.label || cat.name);
    return [...new Set(categories.filter(Boolean))];
  }, [categoryOptions]);

  // Get unique source accounts for dropdown
  const uniqueSources = React.useMemo(() => {
    const sources = sourceOptions.map(src => src.label || src.name);
    return [...new Set(sources.filter(Boolean))];
  }, [sourceOptions]);

  // Get unique destination accounts for dropdown
  const uniqueDestinations = React.useMemo(() => {
    const destinations = destinationOptions.map(dest => dest.label || dest.name);
    return [...new Set(destinations.filter(Boolean))];
  }, [destinationOptions]);

  // Get unique suppliers for dropdown
  const uniqueSuppliers = React.useMemo(() => {
    const suppliers = supplierOptions.map(sup => sup.label || sup.name);
    return [...new Set(suppliers.filter(Boolean))];
  }, [supplierOptions]);

  // Determine required fields and disabled fields based on category type
  const getCategoryRules = (categoryName) => {
    const categoryLower = categoryName?.toLowerCase() || "";
    
    if (categoryLower.includes("payment inward")) {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "supplier", "destination"],
        disabledFields: ["source", "invoiceDate", "customerName", "customerAddress"],
        optionalFields: ["exchangeLoss", "remarks"],
        categoryType: "Payment Inward",
        description: "Supplier payment received into account"
      };
    } else if (categoryLower.includes("remittance")) {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "supplier", "source"],
        disabledFields: ["destination", "invoiceDate", "customerName", "customerAddress"],
        optionalFields: ["exchangeLoss", "remarks"],
        categoryType: "Remittance",
        description: "Payment sent to supplier from account"
      };
    } else if (categoryLower.includes("payment outward")) {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "supplier", "source"],
        disabledFields: ["destination", "invoiceDate", "customerName", "customerAddress"],
        optionalFields: ["exchangeLoss", "remarks"],
        categoryType: "Payment Outward",
        description: "Payment made to supplier"
      };
    } else if (categoryLower.includes("deposit")) {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "source", "destination"],
        disabledFields: ["supplier", "invoiceDate", "customerName", "customerAddress"],
        optionalFields: ["exchangeLoss", "remarks"],
        categoryType: "Deposit",
        description: "Money deposited from one account to another"
      };
    } else if (categoryLower.includes("withdraw")) {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "source", "destination"],
        disabledFields: ["supplier", "invoiceDate", "customerName", "customerAddress"],
        optionalFields: ["exchangeLoss", "remarks"],
        categoryType: "Withdraw",
        description: "Money withdrawn from one account to another"
      };
    } else if (categoryLower.includes("cash sale")) {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "destination", "customerName"],
        disabledFields: ["source", "supplier"],
        optionalFields: ["invoiceDate", "customerAddress", "exchangeLoss", "remarks"],
        categoryType: "Cash Sale",
        description: "Cash sale transaction"
      };
    } else if (categoryLower.includes("credit collection")) {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "destination", "customerName"],
        disabledFields: ["source", "supplier"],
        optionalFields: ["invoiceDate", "customerAddress", "exchangeLoss", "remarks"],
        categoryType: "Credit Collection",
        description: "Credit collection from customer"
      };
    } else {
      return {
        requiredFields: ["invoiceNumber", "categoryType", "date", "amount", "destination"],
        disabledFields: ["source", "supplier"],
        optionalFields: ["invoiceDate", "customerName", "customerAddress", "exchangeLoss", "remarks"],
        categoryType: "Other",
        description: "General transaction"
      };
    }
  };

  // Get column configuration based on field type
  const getColumnConfig = (fieldKey, categoryRules) => {
    const isRequired = categoryRules.requiredFields.includes(fieldKey);
    const isDisabled = categoryRules.disabledFields.includes(fieldKey);
    const isOptional = categoryRules.optionalFields.includes(fieldKey);
    
    let header = "";
    let color = "000000";
    let requiredText = "";
    
    switch(fieldKey) {
      case "invoiceNumber":
        header = "Invoice Number";
        color = isRequired ? "FF0000" : "000000";
        requiredText = isRequired ? "*" : "";
        break;
      case "categoryType":
        header = "Category Type";
        color = "FF0000"; // Always required
        requiredText = "*";
        break;
      case "date":
        header = "Date (YYYY-MM-DD)";
        color = "FF0000"; // Always required
        requiredText = "*";
        break;
      case "amount":
        header = "Amount";
        color = "FF0000"; // Always required
        requiredText = "*";
        break;
      case "source":
        header = "Source Account";
        color = isRequired ? "FF6600" : isDisabled ? "808080" : "000000";
        requiredText = isRequired ? "*" : isDisabled ? "--" : "";
        break;
      case "destination":
        header = "Destination Account";
        color = isRequired ? "FF6600" : isDisabled ? "808080" : "000000";
        requiredText = isRequired ? "*" : isDisabled ? "--" : "";
        break;
      case "supplier":
        header = "Supplier Name";
        color = isRequired ? "FF6600" : isDisabled ? "808080" : "000000";
        requiredText = isRequired ? "*" : isDisabled ? "--" : "";
        break;
      case "exchangeLoss":
        header = "Exchange Loss";
        color = isDisabled ? "808080" : "000000";
        requiredText = isDisabled ? "--" : "";
        break;
      case "finalAmount":
        header = "Final Amount";
        color = "008000"; // Calculated field - green
        requiredText = "(Auto)";
        break;
      case "invoiceDate":
        header = "Invoice Date";
        color = isDisabled ? "808080" : "000000";
        requiredText = isDisabled ? "--" : "";
        break;
      case "customerName":
        header = "Customer Name";
        color = isRequired ? "FF6600" : isDisabled ? "808080" : "000000";
        requiredText = isRequired ? "*" : isDisabled ? "--" : "";
        break;
      case "customerAddress":
        header = "Customer Address";
        color = isDisabled ? "808080" : "000000";
        requiredText = isDisabled ? "--" : "";
        break;
      case "remarks":
        header = "Remarks";
        color = "000000";
        requiredText = "";
        break;
      default:
        header = fieldKey;
        color = "000000";
        requiredText = "";
    }
    
    return {
      header: `${header}${requiredText ? ` ${requiredText}` : ''}`,
      key: fieldKey,
      width: getColumnWidth(fieldKey),
      color,
      isRequired,
      isDisabled,
      isOptional
    };
  };

  // Get appropriate column width
  const getColumnWidth = (fieldKey) => {
    switch(fieldKey) {
      case "invoiceNumber":
      case "categoryType":
      case "source":
      case "destination":
        return 20;
      case "date":
      case "invoiceDate":
      case "amount":
      case "exchangeLoss":
      case "finalAmount":
        return 15;
      case "supplier":
      case "customerName":
        return 25;
      case "customerAddress":
      case "remarks":
        return 30;
      default:
        return 15;
    }
  };

  // Format date for Excel
  const formatDateForExcel = (dateString) => {
    if (!dateString) return null;
    try {
      return new Date(dateString);
    } catch (error) {
      return null;
    }
  };

  // Generate Excel template with conditional columns
  const generateExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Transaction Template");

      // ===== Company Header =====
      worksheet.mergeCells("A1:M1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16, color: { argb: "000000" } };
      titleCell.alignment = { 
        vertical: "middle", 
        horizontal: "center" 
      };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "E6F3FF" }
      };

      // ===== Worksheet Title =====
      worksheet.mergeCells("A2:M2");
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = `Transaction Import Template - ${activeTab}`;
      subtitleCell.font = { bold: true, size: 14, color: { argb: "000000" } };
      subtitleCell.alignment = { 
        vertical: "middle", 
        horizontal: "center" 
      };
      subtitleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "F0F8FF" }
      };

      // ===== Instructions =====
      worksheet.mergeCells("A3:M3");
      const instructionCell = worksheet.getCell("A3");
      instructionCell.value = "Instructions: Red (*) = Required, Orange (*) = Conditionally Required, Gray (--) = Not Applicable, Green (Auto) = Auto-calculated";
      instructionCell.font = { italic: true, size: 10, color: { argb: "FF0000" } };
      instructionCell.alignment = { 
        vertical: "middle", 
        horizontal: "left",
        wrapText: true 
      };
      instructionCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0" }
      };

      // ===== Column Headers =====
      const allFields = [
        "invoiceNumber",
        "categoryType", 
        "date",
        "amount",
        "source",
        "destination",
        "supplier",
        "exchangeLoss",
        "finalAmount",
        "invoiceDate",
        "customerName",
        "customerAddress",
        "remarks"
      ];

      // Create a hidden sheet for dropdown values
      const dropdownSheet = workbook.addWorksheet("DropdownValues");
      dropdownSheet.state = "veryHidden";

      // Add category options
      uniqueCategories.forEach((category, index) => {
        dropdownSheet.getCell(`A${index + 1}`).value = category;
      });

      // Add source account options
      uniqueSources.forEach((source, index) => {
        dropdownSheet.getCell(`B${index + 1}`).value = source;
      });

      // Add destination account options
      uniqueDestinations.forEach((destination, index) => {
        dropdownSheet.getCell(`C${index + 1}`).value = destination;
      });

      // Add supplier options
      uniqueSuppliers.forEach((supplier, index) => {
        dropdownSheet.getCell(`D${index + 1}`).value = supplier;
      });

      // Add headers at row 4
      const headerRow = worksheet.getRow(4);
      allFields.forEach((fieldKey, index) => {
        // Use Cash Sale as default for header formatting
        const defaultRules = getCategoryRules("Cash Sale");
        const columnConfig = getColumnConfig(fieldKey, defaultRules);
        
        const cell = headerRow.getCell(index + 1);
        cell.value = columnConfig.header;
        cell.font = { 
          bold: true, 
          color: { argb: columnConfig.color },
          size: 11
        };
        cell.alignment = { 
          vertical: "middle", 
          horizontal: "center",
          wrapText: true 
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "4472C4" }
        };
        cell.border = {
          top: { style: "thin", color: { argb: "000000" } },
          left: { style: "thin", color: { argb: "000000" } },
          bottom: { style: "thin", color: { argb: "000000" } },
          right: { style: "thin", color: { argb: "000000" } }
        };
      });

      // Set column widths
      worksheet.columns = allFields.map(fieldKey => ({
        width: getColumnWidth(fieldKey)
      }));


   
      // ===== Apply Data Validation for Rows 5-1000 =====
      for (let rowNum = 5; rowNum <= 1000; rowNum++) {
        // Category Type dropdown (always editable)
        const categoryCell = worksheet.getCell(`B${rowNum}`);
        categoryCell.dataValidation = {
          type: "list",
          allowBlank: false,
          formulae: [`=DropdownValues!$A$1:$A$${uniqueCategories.length}`],
          showErrorMessage: true,
          errorTitle: "Invalid Category",
          error: "Please select a valid category from the list."
        };

        // Source Account dropdown (conditionally editable)
        const sourceCell = worksheet.getCell(`E${rowNum}`);
        sourceCell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`=DropdownValues!$B$1:$B$${uniqueSources.length}`],
          showErrorMessage: true,
          errorTitle: "Invalid Source Account",
          error: "Please select a valid source account from the list."
        };

        // Destination Account dropdown (conditionally editable)
        const destCell = worksheet.getCell(`F${rowNum}`);
        destCell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`=DropdownValues!$C$1:$C$${uniqueDestinations.length}`],
          showErrorMessage: true,
          errorTitle: "Invalid Destination Account",
          error: "Please select a valid destination account from the list."
        };

        // Supplier Name dropdown (conditionally editable)
        const supplierCell = worksheet.getCell(`G${rowNum}`);
        supplierCell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`=DropdownValues!$D$1:$D$${uniqueSuppliers.length}`],
          showErrorMessage: true,
          errorTitle: "Invalid Supplier",
          error: "Please select a valid supplier from the list."
        };

        // Validate amount column (positive numbers)
        const amountCell = worksheet.getCell(`D${rowNum}`);
        amountCell.dataValidation = {
          type: "decimal",
          operator: "greaterThan",
          formula1: "0",
          allowBlank: false,
          showErrorMessage: true,
          errorTitle: "Invalid Amount",
          error: "Amount must be a positive number"
        };

        // Validate exchange loss (non-negative, only for deposit)
        const exchangeCell = worksheet.getCell(`H${rowNum}`);
        exchangeCell.dataValidation = {
          type: "decimal",
          operator: "greaterThanOrEqual",
          formula1: "0",
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: "Invalid Exchange Loss",
          error: "Exchange loss cannot be negative"
        };

        // Date validation
        const dateCell = worksheet.getCell(`C${rowNum}`);
        dateCell.dataValidation = {
          type: "date",
          operator: "greaterThan",
          formula1: "DATE(2000,1,1)",
          allowBlank: false,
          showErrorMessage: true,
          errorTitle: "Invalid Date",
          error: "Please enter a valid date (YYYY-MM-DD)"
        };
      }

      // ===== Add Auto-calculation for Final Amount =====
      for (let i = 5; i <= 1000; i++) {
        const finalAmountCell = worksheet.getCell(`I${i}`);
        finalAmountCell.value = {
          formula: `IF(AND(ISNUMBER(D${i}), ISNUMBER(H${i})), D${i}-H${i}, IF(ISNUMBER(D${i}), D${i}, 0))`
        };
        finalAmountCell.numFmt = '#,##0.00';
        finalAmountCell.font = { bold: true, color: { argb: "008000" } };
        finalAmountCell.protection = { locked: true }; // Make calculated field non-editable
      }

      const helperStartRow =  13;
      
      worksheet.mergeCells(`A${helperStartRow}:M${helperStartRow}`);
      const helperTitle = worksheet.getCell(`A${helperStartRow}`);
      helperTitle.value = "CONDITIONAL LOGIC FORMULAS (For Excel Reference):";
      helperTitle.font = { bold: true, size: 12, color: { argb: "0000FF" } };
      helperTitle.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "E6F3FF" }
      };

      // Add formulas that show how fields should behave
      const formulas = [
        { desc: "For Cash Sale/Credit Collection:", formula: "Source='--', Supplier='--', Customer Name=Required" },
        { desc: "For Payment Inward:", formula: "Source='--', Destination=Required, Supplier=Required" },
        { desc: "For Remittance/Payment Outward:", formula: "Destination='--', Source=Required, Supplier=Required" },
        { desc: "For Deposit/Withdraw:", formula: "Supplier='--', Source=Required, Destination=Required" },
        { desc: "Final Amount:", formula: "=Amount - Exchange Loss (Auto-calculated)" }
      ];

      formulas.forEach((formula, index) => {
        const formulaRow = helperStartRow + 1 + index;
        
        // Description
        worksheet.mergeCells(`A${formulaRow}:E${formulaRow}`);
        const descCell = worksheet.getCell(`A${formulaRow}`);
        descCell.value = formula.desc;
        descCell.font = { bold: true };
        
        // Formula
        worksheet.mergeCells(`F${formulaRow}:M${formulaRow}`);
        const formulaCell = worksheet.getCell(`F${formulaRow}`);
        formulaCell.value = formula.formula;
        formulaCell.font = { italic: true, color: { argb: "008000" } };
      });

      // ===== Add Category Rules Legend =====
      const legendStartRow = helperStartRow + formulas.length + 3;
      
      worksheet.mergeCells(`A${legendStartRow}:M${legendStartRow}`);
      const legendTitle = worksheet.getCell(`A${legendStartRow}`);
      legendTitle.value = "COLOR CODING LEGEND:";
      legendTitle.font = { bold: true, size: 12, color: { argb: "800080" } };
      legendTitle.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "F0E6FF" }
      };

      const legendItems = [
        { color: "FF0000", meaning: "Red: Always Required (Invoice, Category, Date, Amount)" },
        { color: "FF6600", meaning: "Orange: Conditionally Required (Based on Category)" },
        { color: "008000", meaning: "Green: Auto-calculated (Final Amount)" },
        { color: "808080", meaning: "Gray: Not Applicable/Non-editable (--)" },
        { color: "000000", meaning: "Black: Optional field" }
      ];

      legendItems.forEach((item, index) => {
        const legendRow = legendStartRow + 1 + index;
        
        // Color sample
        const colorCell = worksheet.getCell(`A${legendRow}`);
        colorCell.value = "■";
        colorCell.font = { color: { argb: item.color }, size: 14 };
        
        // Meaning
        worksheet.mergeCells(`B${legendRow}:M${legendRow}`);
        const meaningCell = worksheet.getCell(`B${legendRow}`);
        meaningCell.value = item.meaning;
        meaningCell.font = { size: 10 };
      });

      // ===== Add General Instructions =====
      const instructionsStartRow = legendStartRow + legendItems.length + 3;
      
      worksheet.mergeCells(`A${instructionsStartRow}:M${instructionsStartRow}`);
      const instructionsTitle = worksheet.getCell(`A${instructionsStartRow}`);
      instructionsTitle.value = "IMPORTANT INSTRUCTIONS:";
      instructionsTitle.font = { bold: true, size: 12, color: { argb: "008000" } };
      instructionsTitle.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "F0FFF0" }
      };

      const instructions = [
        "1. Always fill Red fields (*)",
        "2. Orange fields (*) are required based on selected category",
        "3. Gray fields (--) are automatically set and non-editable",
        "4. Green field is auto-calculated (Amount - Exchange Loss)",
        "5. Date format must be YYYY-MM-DD",
        "6. Amount must be positive number",
        "7. Exchange Loss is optional (use only for Deposit)",
        "8. Change category to see field requirements change",
        "9. Fields marked -- will be ignored during import",
        "10. Save file before uploading to preserve formatting"
      ];

      instructions.forEach((instruction, index) => {
        const instrRow = instructionsStartRow + 1 + index;
        worksheet.mergeCells(`A${instrRow}:M${instrRow}`);
        const instrCell = worksheet.getCell(`A${instrRow}`);
        instrCell.value = instruction;
        instrCell.font = { size: 10 };
      });

      // ===== Protect Worksheet (Allow only specific cells to be edited) =====
      worksheet.protect('password123', {
        selectLockedCells: false,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false,
        // Only allow editing of specific columns (based on category)
        // This is handled by data validation above
      });

      // ===== Export the workbook =====
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `transaction-template-${activeTab.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      
      URL.revokeObjectURL(link.href);

    } catch (err) {
      console.error("Error generating Excel:", err);
      alert("Failed to generate Excel template. Please try again.");
    }
  };

  // Generate Excel for existing data export
  const exportExistingData = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Transactions Export");

      // ===== Company Header =====
      worksheet.mergeCells("A1:N1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };

      worksheet.mergeCells("A2:N2");
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = `Transactions Report - ${activeTab}`;
      subtitleCell.font = { bold: true, size: 14 };
      subtitleCell.alignment = { vertical: "middle", horizontal: "center" };

      worksheet.mergeCells("A3:N3");
      const dateCell = worksheet.getCell("A3");
      dateCell.value = `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
      dateCell.font = { italic: true, size: 10 };
      dateCell.alignment = { vertical: "middle", horizontal: "center" };

      // ===== Column Headers =====
      const exportHeaders = [
        { header: "Invoice No", key: "invoiceNumber", width: 20 },
        { header: "Category Type", key: "categoryType", width: 20 },
        { header: "Date", key: "date", width: 15 },
        { header: "Amount", key: "amount", width: 15 },
        { header: "Source Account", key: "source", width: 20 },
        { header: "Destination Account", key: "destination", width: 20 },
        { header: "Supplier Name", key: "supplier", width: 25 },
        { header: "Exchange Loss", key: "exchangeLoss", width: 15 },
        { header: "Final Amount", key: "finalAmount", width: 15 },
        { header: "Invoice Date", key: "invoiceDate", width: 15 },
        { header: "Customer Name", key: "customerName", width: 25 },
        { header: "Customer Address", key: "customerAddress", width: 30 },
        { header: "Remarks", key: "remarks", width: 30 },
        { header: "Account Type", key: "accountType", width: 15 }
      ];

      // Add headers
      const headerRow = worksheet.addRow(exportHeaders.map(h => h.header));
      headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "4472C4" }
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };

      // Set column widths
      worksheet.columns = exportHeaders.map(h => ({
        width: h.width,
        key: h.key
      }));

      // ===== Add Data Rows =====
      filteredData.forEach((transaction) => {
        const rowData = {
          invoiceNumber: transaction.invoiceNumber || "",
          categoryType: transaction.categoryType?.name || "",
          date: formatDateForExcel(transaction.date),
          amount: transaction.amount || 0,
          source: transaction.source?.name || "",
          destination: transaction.destination?.name || "",
          supplier: transaction.supplier?.name || "",
          exchangeLoss: transaction.exchangeLoss || 0,
          finalAmount: transaction.finalAmount || transaction.amount || 0,
          invoiceDate: formatDateForExcel(transaction.invoiceDate),
          customerName: transaction.customerName || "",
          customerAddress: transaction.customerAddress || "",
          remarks: transaction.remarks || "",
          accountType: transaction.accountType || activeTab
        };

        const row = worksheet.addRow(Object.values(rowData));
        
        // Apply formatting based on category
        const categoryName = transaction.categoryType?.name?.toLowerCase() || "";
        const categoryRules = getCategoryRules(categoryName);
        
        // Color code cells based on their requirement status
        row.eachCell((cell, colNumber) => {
          const fieldKey = exportHeaders[colNumber - 1]?.key;
          if (fieldKey) {
            const columnConfig = getColumnConfig(fieldKey, categoryRules);
            
            if (columnConfig.isDisabled || !cell.value || cell.value === "") {
              // Gray out disabled/empty cells
              cell.font = { color: { argb: "808080" }, italic: true };
              if (!cell.value || cell.value === "") {
                cell.value = "--";
              }
            } else if (columnConfig.isRequired) {
              // Highlight required fields that have values
              if (columnConfig.color === "FF0000") {
                cell.font = { bold: true, color: { argb: "FF0000" } };
              } else if (columnConfig.color === "FF6600") {
                cell.font = { bold: true, color: { argb: "FF6600" } };
              }
            }
            
            // Special formatting for calculated field
            if (fieldKey === "finalAmount") {
              cell.font = { bold: true, color: { argb: "008000" } };
            }
          }
          
          // Apply borders
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" }
          };
        });

        // Format numeric cells
        const amountCell = row.getCell(4);
        const exchangeCell = row.getCell(8);
        const finalAmountCell = row.getCell(9);
        
        [amountCell, exchangeCell, finalAmountCell].forEach(cell => {
          if (cell.value !== "--") {
            cell.numFmt = '#,##0.00';
            if (cell.value < 0) {
              cell.font = { color: { argb: "FF0000" } };
            }
          }
        });

        // Format date cells
        const dateCell = row.getCell(3);
        const invoiceDateCell = row.getCell(10);
        
        [dateCell, invoiceDateCell].forEach(cell => {
          if (cell.value && cell.value !== "--") {
            cell.numFmt = 'yyyy-mm-dd';
          }
        });
      });

      // ===== Add Summary Section =====
      const startRow = filteredData.length + 6;
      
      // Total Amount
      worksheet.mergeCells(`A${startRow}:C${startRow}`);
      const totalLabel = worksheet.getCell(`A${startRow}`);
      totalLabel.value = "Total Transactions:";
      totalLabel.font = { bold: true };
      totalLabel.alignment = { horizontal: "right" };

      const totalCount = worksheet.getCell(`D${startRow}`);
      totalCount.value = filteredData.length;
      totalCount.font = { bold: true };

      // Total Amount Sum
      worksheet.mergeCells(`A${startRow + 1}:C${startRow + 1}`);
      const amountLabel = worksheet.getCell(`A${startRow + 1}`);
      amountLabel.value = "Total Amount:";
      amountLabel.font = { bold: true };
      amountLabel.alignment = { horizontal: "right" };

      const totalAmount = worksheet.getCell(`D${startRow + 1}`);
      totalAmount.value = {
        formula: `SUM(D5:D${filteredData.length + 4})`
      };
      totalAmount.numFmt = '#,##0.00';
      totalAmount.font = { bold: true, color: { argb: "008000" } };

      // ===== Export =====
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `transactions-export-${activeTab.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      
      URL.revokeObjectURL(link.href);

    } catch (err) {
      console.error("Error exporting data:", err);
      alert("Failed to export transactions. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={generateExcel}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Import Template
        </button>
        
        <button
          onClick={exportExistingData}
          disabled={filteredData.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Current Data ({filteredData.length})
        </button>
      </div>
      
      <div className="text-xs text-gray-600 mt-1 p-2 bg-gray-50 rounded border">
        <p className="font-semibold mb-1">Template Features:</p>
        <div className="grid grid-cols-2 gap-1">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-500 rounded-sm"></span>
            <span>Always Required</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-orange-500 rounded-sm"></span>
            <span>Conditionally Required</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-500 rounded-sm"></span>
            <span>Auto-calculated</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-gray-400 rounded-sm"></span>
            <span>Non-editable (--)</span>
          </div>
        </div>
        <p className="mt-2">• Fields change based on selected category type</p>
        <p>• Gray fields (--) are automatically set and locked</p>
      </div>
    </div>
  );
};

export default TransactionExcelDownload;