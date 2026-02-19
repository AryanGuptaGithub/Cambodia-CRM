import React from "react";
import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";

const SampleExcelDownloadSale = ({ importSaleType = "normal" }) => {
  const handleDownload = () => {
    const headers = [
      "Recording Date", "Invoice #", "Invoice Date", "MR Name",
      "Customer Code", "Product Name", "Sales Qty", "Bonus Qty",
      "Selling Price", "Discount", "Credit Days", "Paid Amount",
      "Payment Status", "Remarks",
    ];

    const numCols = headers.length;

    // Dynamic subtitle based on tab
    const subtitle =
      importSaleType === "mr" ? "MR Sale Summary List" : "Normal Sale Summary List";

    // Dynamic filename
    const fileName =
      importSaleType === "mr"
        ? "mrSaleSummary_template.xlsx"
        : "normalSaleSummary_template.xlsx";

    const wb = XLSX.utils.book_new();

    const sheetData = [
      ["HEALTHCARE SOUTH EAST ASIA", ...Array(numCols - 1).fill("")],
      [subtitle,                      ...Array(numCols - 1).fill("")],
      Array(numCols).fill(""),
      headers,
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Merge title and subtitle across all columns
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } },
    ];

    const thinBorder = {
      top:    { style: "thin", color: { rgb: "AAAAAA" } },
      bottom: { style: "thin", color: { rgb: "AAAAAA" } },
      left:   { style: "thin", color: { rgb: "AAAAAA" } },
      right:  { style: "thin", color: { rgb: "AAAAAA" } },
    };

    const grayFill = { patternType: "solid", fgColor: { rgb: "D9D9D9" } };

    const titleStyle = {
      font:      { name: "Arial", bold: true, sz: 14 },
      alignment: { horizontal: "center", vertical: "center" },
      fill:      grayFill,
      border:    thinBorder,
    };

    const subtitleStyle = {
      font:      { name: "Arial", bold: true, sz: 12 },
      alignment: { horizontal: "center", vertical: "center" },
      fill:      grayFill,
      border:    thinBorder,
    };

    const headerStyle = {
      font:      { name: "Arial", bold: true, sz: 11 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      fill:      grayFill,
      border:    thinBorder,
    };

    for (let c = 0; c < numCols; c++) {
      const r0 = XLSX.utils.encode_cell({ r: 0, c });
      const r1 = XLSX.utils.encode_cell({ r: 1, c });
      const r3 = XLSX.utils.encode_cell({ r: 3, c });

      if (!ws[r0]) ws[r0] = { t: "s", v: "" };
      if (!ws[r1]) ws[r1] = { t: "s", v: "" };

      ws[r0].s = titleStyle;
      ws[r1].s = subtitleStyle;
      if (ws[r3]) ws[r3].s = headerStyle;
    }

    ws["!cols"] = [
      { wch: 18 }, // Recording Date
      { wch: 16 }, // Invoice #
      { wch: 16 }, // Invoice Date
      { wch: 20 }, // MR Name
      { wch: 18 }, // Customer Code
      { wch: 26 }, // Product Name
      { wch: 14 }, // Sales Qty
      { wch: 14 }, // Bonus Qty
      { wch: 16 }, // Selling Price
      { wch: 14 }, // Discount
      { wch: 14 }, // Credit Days
      { wch: 16 }, // Paid Amount
      { wch: 18 }, // Payment Status
      { wch: 24 }, // Remarks
    ];

    ws["!rows"] = [
      { hpt: 28 }, // Company name row
      { hpt: 22 }, // Subtitle row
      { hpt: 6  }, // Empty spacer
      { hpt: 24 }, // Header row
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Sale Summary");
    XLSX.writeFile(wb, fileName);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="mt-3 flex items-center gap-2 text-sm text-green-700 hover:text-green-900 underline cursor-pointer"
    >
      <Download size={14} />
      Download Sample Excel Template
    </button>
  );
};

export default SampleExcelDownloadSale;
