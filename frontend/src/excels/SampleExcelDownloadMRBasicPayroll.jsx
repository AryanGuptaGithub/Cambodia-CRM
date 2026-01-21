import React, { useState, useEffect } from "react";
import axios from "axios";
import ExcelJS from "exceljs";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const SampleExcelDownloadMRBasicPayroll = () => {
  const [mrList, setMrList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMrList = async () => {
    try {
      setLoading(true);
      setError(null);

      let response;
      let mrData = [];

      try {
        // Try /api/mrs endpoint first
        response = await axios.get(
          `${backendUrl}/api/mr-basic-payrolls/mrs/list`,
        );
        // Extract data based on the response structure
        if (response.data && response.data.success) {
          // Structure: { success: true, data: [...] }
          mrData = response.data.data || [];
        } else if (response.data && Array.isArray(response.data)) {
          // If response.data is directly an array
          mrData = response.data;
        }
      } catch (err) {
        console.log(
          "Primary endpoint failed, trying staffs endpoint:",
          err.message,
        );

        // Fall back to /api/staffs
        try {
          response = await axios.get(`${backendUrl}/api/staffs`);

          // Extract staff data based on the structure
          let staffs = [];
          if (response.data && response.data.success && response.data.data) {
            // Structure: { success: true, data: [...] }
            staffs = response.data.data;
          } else if (response.data && Array.isArray(response.data)) {
            // Structure: [...]
            staffs = response.data;
          } else if (
            response.data &&
            response.data.data &&
            Array.isArray(response.data.data)
          ) {
            // Structure: { data: [...] }
            staffs = response.data.data;
          }

          // Filter for MRs
          mrData = staffs
            .filter(
              (staff) =>
                staff.designation === "MR" ||
                staff.role === "MR" ||
                staff.medicalRepName ||
                (staff.name &&
                  (staff.name.includes("Mr") || staff.name.includes("Ms"))),
            )
            .map((staff) => ({
              _id: staff._id,
              medicalRepName:
                staff.medicalRepName ||
                staff.name ||
                staff.employeeName ||
                "Unknown",
              teamName: staff.teamName || staff.department || "",
              contactNo: staff.contactNo || staff.phone || staff.mobile || "",
              email: staff.email || "",
              MRId: staff.MRId || staff.employeeId || "",
            }));
        } catch (staffErr) {
          console.error("Staffs endpoint also failed:", staffErr.message);
          throw new Error("Failed to fetch MR list from both endpoints");
        }
      }

      // Filter out invalid/unknown entries
      const validMrs = mrData.filter(
        (mr) => mr.medicalRepName && mr.medicalRepName !== "Unknown",
      );

      if (validMrs.length > 0) {
        setMrList(validMrs);
      } else {
        setMrList([]);
        setError("No Medical Representatives found. Please add MRs first.");
      }
    } catch (err) {
      console.error("Error fetching MR list:", err);
      setError(err.message || "Failed to fetch MR list");
      setMrList([]);
    } finally {
      setLoading(false);
    }
  };

  const generateExcel = async () => {
    if (mrList.length === 0) {
      alert("No MRs available to create sample file");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Import Template
    const importSheet = workbook.addWorksheet("Import Template");
    
    // Title
    importSheet.mergeCells("A1:D1");
    const titleCell = importSheet.getCell("A1");
    titleCell.value = "MR Basic Payroll Import Template";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    importSheet.getRow(1).height = 25;

    // Instructions
    importSheet.mergeCells("A2:D2");
    const instructionCell = importSheet.getCell("A2");
    instructionCell.value = `INSTRUCTIONS: ${mrList.length} MRs available. Each MR should appear only ONCE. Use dropdown in Column A.`;
    instructionCell.font = {
      italic: true,
      size: 10,
      color: { argb: "FF0000FF" },
      bold: true
    };
    instructionCell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    importSheet.getRow(2).height = 40;

    // Warning
    importSheet.mergeCells("A3:D3");
    const warningCell = importSheet.getCell("A3");
    warningCell.value = "⚠️ IMPORTANT: Manual check required! After selecting MRs, verify no duplicates in Column A.";
    warningCell.font = {
      bold: true,
      size: 10,
      color: { argb: "FFFF0000" }
    };
    warningCell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    importSheet.getRow(3).height = 30;

    // Header row (Row 4)
    const headerRow = importSheet.getRow(4);
    headerRow.values = ["MR Name", "Basic Salary", "Remarks", "Validation Helper (DO NOT EDIT)"];

    // Set column widths
    importSheet.columns = [
      { key: "mrName", width: 35 },
      { key: "basicSalary", width: 15 },
      { key: "remarks", width: 30 },
      { key: "validationHelper", width: 40 },
    ];

    // Hide the validation helper column
    importSheet.getColumn(4).hidden = true;

    // Style header row
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 25;
    headerRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF366092" },
      };
    });

    // Get MR names for dropdown
    const mrNames = mrList.map((mr) => mr.medicalRepName);

    // Create a hidden sheet for the full MR list
    const fullListSheet = workbook.addWorksheet("Full_MR_List");
    fullListSheet.state = "veryHidden";
    
    // Add all MR names to the full list sheet
    mrNames.forEach((name, index) => {
      fullListSheet.getCell(`A${index + 1}`).value = name;
    });

    // Create rows equal to number of MRs (starting from row 5)
    const startRow = 5;
    const endRow = startRow + mrList.length ;
    
    // Add formulas in column D (validation helper) that show which MRs are already used above
    for (let row = startRow; row <= endRow; row++) {
      // Create formula that lists all MRs except those already selected in rows above
      // This formula creates a comma-separated list of MRs already used
      const usedListFormula = `TEXTJOIN(", ", TRUE, IF($A$5:A${row-1}<>"", $A$5:A${row-1}, ""))`;
      
      // Put the formula in column D
      importSheet.getCell(`D${row}`).value = { formula: usedListFormula };
      
      // Apply data validation with a custom formula that excludes already used MRs
      const dataValidation = {
        type: "custom",
        allowBlank: false,
        formulae: [`=AND(A${row}<>"", COUNTIF($A$5:$A$${endRow}, A${row})=1, NOT(ISNUMBER(SEARCH(A${row}, D${row}))))`],
        showErrorMessage: true,
        errorTitle: "Duplicate or Invalid Selection",
        error: "This MR has already been selected in another row. Each MR can only be used once.",
        promptTitle: "Select MR Name",
        prompt: `Select MR for row ${row - 4} (${row - 4}/${mrList.length})`,
      };

      // Apply custom validation to MR Name column
      importSheet.getCell(`A${row}`).dataValidation = dataValidation;
      
      // Also add a dropdown for user convenience (shows all MRs but validation will catch duplicates)
      const dropdownValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`Full_MR_List!$A$1:$A$${mrNames.length}`],
        showDropDown: true
      };
      
      // Apply dropdown validation
      importSheet.getCell(`A${row}`).dataValidation = dropdownValidation;
      
      // Apply currency format to Basic Salary column
      importSheet.getCell(`B${row}`).numFmt = "#,##0.00";
      
      // Add sample data for first row only
      if (row === startRow && mrNames.length > 0) {
        importSheet.getCell(`A${row}`).value = mrNames[0];
        importSheet.getCell(`B${row}`).value = 0;
        importSheet.getCell(`C${row}`).value = "Enter remarks";
      }
      
      // Add borders to all cells in this row
      ["A", "B", "C", "D"].forEach((col) => {
        const cell = importSheet.getCell(`${col}${row}`);
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });
    }

    // Add duplicate check section
    const checkRow = endRow + 2;
    importSheet.mergeCells(`A${checkRow}:C${checkRow}`);
    const checkCell = importSheet.getCell(`A${checkRow}`);
    checkCell.value = `⚠️ DUPLICATE PROTECTION: The template will prevent selecting the same MR twice. Column D (hidden) tracks selections.`;
    checkCell.font = { 
      bold: true, 
      size: 9, 
      color: { argb: "FFFF0000" } 
    };
    checkCell.alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
    };
    checkCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFE6E6" },
    };
    importSheet.getRow(checkRow).height = 30;

    // Add instructions for Excel 2016+ users
    const formulaRow = checkRow + 1;
    importSheet.mergeCells(`A${formulaRow}:C${formulaRow}`);
    const formulaCell = importSheet.getCell(`A${formulaRow}`);
    formulaCell.value = `📝 Note: TEXTJOIN() function requires Excel 2016 or later. If using older Excel, manually check for duplicates.`;
    formulaCell.font = { 
      italic: true, 
      size: 8, 
      color: { argb: "FF666666" }
    };
    importSheet.getRow(formulaRow).height = 20;

    // Add footer note
    const footerRow = formulaRow + 1;
    importSheet.mergeCells(`A${footerRow}:C${footerRow}`);
    const footerCell = importSheet.getCell(`A${footerRow}`);
    footerCell.value = `✅ ${mrList.length} MRs available. ${mrList.length} rows created (one per MR). Dropdowns show all MRs but validation prevents duplicates.`;
    footerCell.font = { 
      italic: true, 
      size: 9, 
      color: { argb: "FF2E75B5" },
      bold: true 
    };
    footerCell.alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
    };
    footerCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE6F2FF" },
    };
    importSheet.getRow(footerRow).height = 30;

    // Sheet 2: Available MRs List with Status Tracking
    const mrListSheet = workbook.addWorksheet("MR Tracker");
    
    // Title
    mrListSheet.mergeCells("A1:F1");
    const mrTitleCell = mrListSheet.getCell("A1");
    mrTitleCell.value = "MR SELECTION TRACKER";
    mrTitleCell.font = { bold: true, size: 14, color: { argb: "FF2E75B5" } };
    mrTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    mrListSheet.getRow(1).height = 30;

    // Instructions
    mrListSheet.mergeCells("A2:F2");
    const mrInstructionCell = mrListSheet.getCell("A2");
    mrInstructionCell.value = "MANUAL TRACKING: After selecting an MR in Import Template, mark it as 'USED' here to track selections.";
    mrInstructionCell.font = {
      italic: true,
      size: 10,
      color: { argb: "FF666666" },
    };
    mrInstructionCell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    mrListSheet.getRow(2).height = 30;

    // Header
    const mrHeaderRow = mrListSheet.getRow(3);
    mrHeaderRow.values = ["MR Name", "Team", "Contact", "Used (Yes/No)", "Row Used", "Status"];
    
    // Set column widths
    mrListSheet.columns = [
      { key: "mrName", width: 30 },
      { key: "team", width: 20 },
      { key: "contact", width: 20 },
      { key: "used", width: 15 },
      { key: "rowUsed", width: 15 },
      { key: "status", width: 20 },
    ];

    // Style header row
    mrHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    mrHeaderRow.alignment = { horizontal: "center", vertical: "middle" };
    mrHeaderRow.height = 25;
    mrHeaderRow.eachCell((cell) => {
      cell.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF70AD47" },
      };
    });

    // Add MR data with tracking columns and formulas
    mrList.forEach((mr, index) => {
      const row = mrListSheet.getRow(index + 4);
      
      // Add data validation for "Used" column
      const usedCell = mrListSheet.getCell(`D${index + 4}`);
      usedCell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Yes,No"'],
        showDropDown: true
      };
      
      // Add formula for status column that checks if MR is used
      const statusFormula = `IF(D${index + 4}="Yes", "Already Selected", "Available")`;
      
      row.values = [
        mr.medicalRepName,
        mr.teamName || "N/A",
        mr.contactNo || "N/A",
        "No", // Default "Used" status
        "",    // Empty "Row Used" column
        { formula: statusFormula } // Status formula
      ];
      
      // Style each row
      row.height = 20;
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
        
        // Color code status column
        if (cell.col === 6) { // Status column (F)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF2CC" },
          };
        }
      });
    });

    // Add summary with count formulas
    const summaryRow = mrList.length + 5;
    
    // Available count
    mrListSheet.getCell(`A${summaryRow}`).value = "Available:";
    mrListSheet.getCell(`B${summaryRow}`).value = { 
      formula: `COUNTIF(D4:D${mrList.length + 3}, "No")` 
    };
    mrListSheet.getCell(`B${summaryRow}`).font = { bold: true, color: { argb: "FF2E75B5" } };
    
    // Used count
    mrListSheet.getCell(`C${summaryRow}`).value = "Used:";
    mrListSheet.getCell(`D${summaryRow}`).value = { 
      formula: `COUNTIF(D4:D${mrList.length + 3}, "Yes")` 
    };
    mrListSheet.getCell(`D${summaryRow}`).font = { bold: true, color: { argb: "FFC00000" } };
    
    // Total
    mrListSheet.getCell(`E${summaryRow}`).value = "Total:";
    mrListSheet.getCell(`F${summaryRow}`).value = mrList.length;
    mrListSheet.getCell(`F${summaryRow}`).font = { bold: true };

    // Style summary row
    const summaryRowObj = mrListSheet.getRow(summaryRow);
    summaryRowObj.height = 25;
    summaryRowObj.eachCell((cell) => {
      cell.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F2F2" },
      };
    });

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `MR_Basic_Payroll_Template_${mrList.length}_MRs.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchMrList();
  }, []);

  return (
    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        
        <div className="flex gap-2">
          <button
            onClick={generateExcel}
            disabled={loading || mrList.length === 0}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {loading ? "Loading..." : "Download Template"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
          <p className="text-xs text-red-600">⚠️ {error}</p>
          <button
            onClick={fetchMrList}
            className="mt-1 text-xs text-red-700 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}



      {loading && (
        <div className="mt-2 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <p className="text-xs text-blue-600">Loading MR list...</p>
        </div>
      )}
    </div>
  );
};

export default SampleExcelDownloadMRBasicPayroll;