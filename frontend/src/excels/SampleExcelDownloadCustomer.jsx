import React, { useState, useEffect } from "react";
import ExcelJS from "exceljs";
import axios from "axios";

const SampleExcelDownloadCustomer = () => {
  const [provinces, setProvinces] = useState([]);
  const [provincesLoading, setProvincesLoading] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const fetchProvinces = async () => {
    try {
      setProvincesLoading(true);
      const response = await axios.get(`${backendUrl}/api/customers/provinces`);

      if (response.data.success) {
        setProvinces(response.data.data || []);
      } else {
        throw new Error(response.data.message || "Failed to fetch provinces");
      }
    } catch (error) {
      console.error("Error fetching provinces:", error);
    } finally {
      setProvincesLoading(false);
    }
  };

  useEffect(() => {
    fetchProvinces();
  }, []);

  const generateExcel = async () => {
    if (provincesLoading) {
      console.log("Still loading provinces...");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customer List");

    // ===== Title Row (Row 1) =====
    worksheet.mergeCells("A1:J1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    // ===== Subtitle Row (Row 2) =====
    worksheet.mergeCells("A2:J2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = "Customer List";
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // ===== Define Column Structure =====
    worksheet.columns = [
      { key: "customerCode", width: 18 },
      { key: "date", width: 15 },
      { key: "medicalRep", width: 28 },
      { key: "customerName", width: 30 },
      { key: "businessType", width: 22 },
      { key: "customerNumber", width: 20 },
      { key: "customerAddress", width: 55 },
      { key: "zone", width: 18 },
      { key: "province", width: 20 },
      { key: "remark", width: 25 },
    ];

    worksheet.getRow(3).values = [
      "Customer Code",
      "Date",
      "Medical Representative Name",
      "Customer Name in English",
      "Types of Business",
      "Customer Number",
      "Customer Address",
      "Zone",
      "Province",
      "Remark",
    ];
    worksheet.getRow(3).font = { bold: true };
    worksheet.getRow(3).alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    worksheet.getRow(3).height = 20;
    worksheet.getColumn(2).numFmt = "d-mmm-yy"; // Date column (B)

    // ===== Create a hidden dropdown sheet =====
    const dropdownSheet = workbook.addWorksheet("DropdownValues");
    dropdownSheet.state = "veryHidden";

    // ===== Prepare dropdown values =====

    // Business Types
    const businessTypes = ["Retail", "Clinic", "Hospital", "Pharmacy"];

    // Zones
    const zones = ["Olympic", "Borverl", "Other"];

    // Provinces (from API)
    const provinceNames = provinces
      .map((province) =>
        typeof province === "string"
          ? province
          : province.name || province.provinceName || ""
      )
      .filter(Boolean);

    // ===== Write dropdown values to hidden sheet =====

    // Business Types (Column A)
    businessTypes.forEach((type, index) => {
      dropdownSheet.getCell(`A${index + 1}`).value = type;
    });

    // Zones (Column B)
    zones.forEach((zone, index) => {
      dropdownSheet.getCell(`B${index + 1}`).value = zone;
    });

    // Provinces (Column C)
    provinceNames.forEach((province, index) => {
      dropdownSheet.getCell(`C${index + 1}`).value = province;
    });

    // ===== Define dropdown ranges =====
    const startRow = 4;
    const endRow = 1000;

    // ===== Set up dropdown for "Types of Business" (Column E) =====
    if (businessTypes.length > 0) {
      try {
        worksheet.getColumn(5).eachCell((cell, rowNumber) => {
          if (rowNumber >= startRow) {
            cell.dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownValues!$A$1:$A$${businessTypes.length}`],
              showErrorMessage: true,
              errorStyle: "warning",
              errorTitle: "Invalid input",
              error: "Please select a business type from the list.",
              showDropDown: true,
            };
          }
        });
      } catch (error) {
        console.warn(
          "Failed to set column-wide data validation for Business Types:",
          error
        );
      }
    }

    // ===== Set up dropdown for "Zone" (Column H) =====
    if (zones.length > 0) {
      try {
        worksheet.getColumn(8).eachCell((cell, rowNumber) => {
          if (rowNumber >= startRow) {
            cell.dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownValues!$B$1:$B$${zones.length}`],
              showErrorMessage: true,
              errorStyle: "warning",
              errorTitle: "Invalid input",
              error: "Please select a zone from the list.",
              showDropDown: true,
            };
          }
        });
      } catch (error) {
        console.warn(
          "Failed to set column-wide data validation for Zone:",
          error
        );
      }
    }

    // ===== Set up dropdown for "Province" (Column I) =====
    if (provinceNames.length > 0) {
      try {
        worksheet.getColumn(9).eachCell((cell, rowNumber) => {
          if (rowNumber >= startRow) {
            cell.dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownValues!$C$1:$C$${provinceNames.length}`],
              showErrorMessage: true,
              errorStyle: "warning",
              errorTitle: "Invalid input",
              error: "Please select a province from the list.",
              showDropDown: true,
            };
          }
        });
      } catch (error) {
        console.warn(
          "Failed to set column-wide data validation for Province:",
          error
        );
      }
    }

    // ===== Alternative method: Set dropdown for each cell individually =====
    for (let i = startRow; i <= endRow; i++) {
      try {
        // Business Type dropdown (Column E)
        if (businessTypes.length > 0) {
          worksheet.getCell(`E${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`=DropdownValues!$A$1:$A$${businessTypes.length}`],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a business type from the list",
            showDropDown: true,
          };
        }

        // Zone dropdown (Column H)
        if (zones.length > 0) {
          worksheet.getCell(`H${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`=DropdownValues!$B$1:$B$${zones.length}`],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a zone from the list",
            showDropDown: true,
          };
        }

        // Province dropdown (Column I)
        if (provinceNames.length > 0) {
          worksheet.getCell(`I${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`=DropdownValues!$C$1:$C$${provinceNames.length}`],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a province from the list",
            showDropDown: true,
          };
        }
      } catch (error) {
        console.warn(`Failed to set dropdowns for row ${i}:`, error);
      }
    }

    // ===== Apply borders to all cells =====
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

    // ===== Export File =====
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customer_list_sample.xlsx";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };

  return (
    <button
      onClick={generateExcel}
      disabled={provincesLoading}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer
       disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {provincesLoading
        ? "Loading provinces..."
        : "Click here to download Customer List Sample Excel"}
    </button>
  );
};

export default SampleExcelDownloadCustomer;
