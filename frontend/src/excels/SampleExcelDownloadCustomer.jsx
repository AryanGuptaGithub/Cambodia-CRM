import React, { useState, useEffect } from "react";
import ExcelJS from "exceljs";
import {
  fetchProvinces,
  fetchZones,
  fetchBusinessTypes,
  fetchMRList,
  EXCEL_CONFIG,
} from "../utils/customerUtil";

const SampleExcelDownloadCustomer = () => {
  const [dropdownData, setDropdownData] = useState({
    provinces: [],
    zones: [],
    businessTypes: [],
    mrList: [],
  });
  const [loading, setLoading] = useState(false);

  const fetchAllDropdownData = async () => {
    try {
      setLoading(true);

      const [provincesResult, zonesResult, businessTypesResult, mrListResult] =
        await Promise.all([
          fetchProvinces(),
          fetchZones(),
          fetchBusinessTypes(),
          fetchMRList(),
        ]);

      const newDropdownData = {
        provinces: [],
        zones: [],
        businessTypes: [],
        mrList: [],
      };

      if (provincesResult.success) {
        newDropdownData.provinces = provincesResult.data || [];
      } else {
        console.warn("Failed to fetch provinces:", provincesResult.error);
      }

      if (zonesResult.success) {
        newDropdownData.zones = zonesResult.data || [];
      }

      if (businessTypesResult.success) {
        newDropdownData.businessTypes = businessTypesResult.data || [];
      } else {
        console.warn(
          "Failed to fetch business types:",
          businessTypesResult.error
        );
      }

      if (mrListResult.success) {
        newDropdownData.mrList = mrListResult.data || [];
      } else {
        console.warn("Failed to fetch MR list:", mrListResult.error);
      }

      setDropdownData(newDropdownData);
    } catch (error) {
      console.error("Error fetching dropdown data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllDropdownData();
  }, []);

  const generateExcel = async () => {
    if (loading) {
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customer List");

    // ===== Title Row (Row 1) =====
    worksheet.mergeCells("A1:I1"); // Changed from J1 to I1 (9 columns now)
    const titleCell = worksheet.getCell("A1");
    titleCell.value = EXCEL_CONFIG.title;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    // ===== Subtitle Row (Row 2) =====
    worksheet.mergeCells("A2:I2"); // Changed from J2 to I2 (9 columns now)
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = EXCEL_CONFIG.subtitle;
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // ===== Define Column Structure =====
    worksheet.columns = EXCEL_CONFIG.columns.map((col) => ({
      key: col.key,
      width: col.width,
    }));

    // ===== Header Row (Row 3) =====
    worksheet.getRow(3).values = EXCEL_CONFIG.columns.map((col) => col.header);
    worksheet.getRow(3).font = { bold: true };
    worksheet.getRow(3).alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    worksheet.getRow(3).height = 20;
    worksheet.getColumn(1).numFmt = "d-mmm-yy"; // Date column (A) - changed from column 2 to 1

    // ===== Create a hidden dropdown sheet =====
    const dropdownSheet = workbook.addWorksheet(EXCEL_CONFIG.dropdownSheetName);
    dropdownSheet.state = "veryHidden";

    // ===== Prepare dropdown values =====
    const { provinces, zones, businessTypes, mrList } = dropdownData;

    // Extract names for dropdowns
    const provinceNames = provinces
      .map((province) =>
        typeof province === "string"
          ? province
          : province.name || province.provinceName || ""
      )
      .filter(Boolean);

    const zoneNames = zones
      .map((zone) =>
        typeof zone === "string" ? zone : zone.name || zone.zoneName || ""
      )
      .filter(Boolean);

    const businessTypeNames = businessTypes
      .map((type) =>
        typeof type === "string" ? type : type.name || type.typeName || ""
      )
      .filter(Boolean);

    const mrNames = mrList
      .map((mr) => {
        if (typeof mr === "string") return mr;

        // Handle different possible field names for MR name
        const name =
          mr.name ||
          mr.staffName ||
          mr.medicalRepName ||
          `${mr.firstName || ""} ${mr.lastName || ""}`.trim();
        return name;
      })
      .filter(Boolean);

    // ===== Write dropdown values to hidden sheet =====

    // Business Types (Column A)
    businessTypeNames.forEach((type, index) => {
      dropdownSheet.getCell(`A${index + 1}`).value = type;
    });

    // Zones (Column B)
    zoneNames.forEach((zone, index) => {
      dropdownSheet.getCell(`B${index + 1}`).value = zone;
    });

    // Provinces (Column C)
    provinceNames.forEach((province, index) => {
      dropdownSheet.getCell(`C${index + 1}`).value = province;
    });

    // Medical Representatives (Column D)
    mrNames.forEach((mr, index) => {
      dropdownSheet.getCell(`D${index + 1}`).value = mr;
    });

    // ===== Set up dropdowns for all rows =====
    const { dataStartRow, dataEndRow } = EXCEL_CONFIG;

    for (let i = dataStartRow; i <= dataEndRow; i++) {
      try {
        // Medical Representative dropdown (Column B) - changed from C to B
        if (mrNames.length > 0) {
          worksheet.getCell(`B${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [
              `=${EXCEL_CONFIG.dropdownSheetName}!$D$1:$D$${mrNames.length}`,
            ],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a medical representative from the list",
            showDropDown: true,
          };
        }

        // Business Type dropdown (Column D) - changed from E to D
        if (businessTypeNames.length > 0) {
          worksheet.getCell(`D${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [
              `=${EXCEL_CONFIG.dropdownSheetName}!$A$1:$A$${businessTypeNames.length}`,
            ],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a business type from the list",
            showDropDown: true,
          };
        }

        // Zone dropdown (Column G) - changed from H to G
        if (zoneNames.length > 0) {
          worksheet.getCell(`G${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [
              `=${EXCEL_CONFIG.dropdownSheetName}!$B$1:$B$${zoneNames.length}`,
            ],
            showErrorMessage: true,
            errorTitle: "Invalid Input",
            error: "Please select a zone from the list",
            showDropDown: true,
          };
        }

        // Province dropdown (Column H) - changed from I to H
        if (provinceNames.length > 0) {
          worksheet.getCell(`H${i}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [
              `=${EXCEL_CONFIG.dropdownSheetName}!$C$1:$C$${provinceNames.length}`,
            ],
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
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = EXCEL_CONFIG.fileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Error generating Excel file:", error);
    }
  };

  return (
    <button
      onClick={generateExcel}
      disabled={loading}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer
       disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading
        ? "Loading dropdown data..."
        : "Click here to download Customer List Sample Excel"}
    </button>
  );
};

export default SampleExcelDownloadCustomer;