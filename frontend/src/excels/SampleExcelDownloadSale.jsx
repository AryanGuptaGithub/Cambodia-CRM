import React from "react";
import ExcelJS from "exceljs";
import { useInitialSaleData } from "../pages/Sale/IntialLoading";
import {
  fetchMRList,
  fetchCustomerList,
} from "../pages/ProductManager/common/fetchDropdown";

const SampleExcelDownloadSale = ({ data = [] }) => {
  const { statuses = [], productNames = [], loading } =
    useInitialSaleData();

  const [mrList, setMrList] = React.useState([]);
  const [customerList, setCustomerList] = React.useState([]);
  const [mrLoading, setMrLoading] = React.useState(false);
  const [customerLoading, setCustomerLoading] = React.useState(false);

  // ===== Fetch MR list =====
  const fetchMRData = async () => {
    try {
      setMrLoading(true);
      const res = await fetchMRList();
      if (res?.success) setMrList(res.data || []);
    } catch (err) {
      console.error("MR fetch error:", err);
    } finally {
      setMrLoading(false);
    }
  };

  // ===== Fetch Customer list =====
  const fetchCustomerData = async () => {
    try {
      setCustomerLoading(true);
      const res = await fetchCustomerList();
      if (res?.success) setCustomerList(res.data || []);
    } catch (err) {
      console.error("Customer fetch error:", err);
    } finally {
      setCustomerLoading(false);
    }
  };

  React.useEffect(() => {
    fetchMRData();
    fetchCustomerData();
  }, []);

  const generateExcel = async () => {
    if (loading || mrLoading || customerLoading) return;

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sale Summary");

      // ===== Titles =====
      worksheet.mergeCells("A1:N1");
      worksheet.getCell("A1").value = "HEALTHCARE SOUTH EAST ASIA";
      worksheet.getCell("A1").font = { bold: true, size: 16 };
      worksheet.getCell("A1").alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      worksheet.mergeCells("A2:N2");
      worksheet.getCell("A2").value = "Sale Summary List";
      worksheet.getCell("A2").font = { bold: true, size: 14 };
      worksheet.getCell("A2").alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      // ===== Columns (Customer Code) =====
      worksheet.columns = [
        { key: "recordingDate", width: 15 },
        { key: "invoiceNumber", width: 15 },
        { key: "invoiceDate", width: 15 },
        { key: "mrName", width: 20 },
        { key: "customerCode", width: 22 }, // ✅ CUSTOMER CODE
        { key: "productName", width: 25 },
        { key: "salesQty", width: 12 },
        { key: "bonusQty", width: 12 },
        { key: "sellingPrice", width: 18 },
        { key: "discount", width: 15 },
        { key: "creditDays", width: 12 },
        { key: "paidAmount", width: 15 },
        { key: "paymentStatus", width: 15 },
        { key: "remark", width: 25 },
      ];

      // ===== Header Row =====
      const headerRow = worksheet.getRow(3);
      headerRow.values = [
        "Recording Date",
        "Invoice #",
        "Invoice Date",
        "MR Name",
        "Customer Code", // ✅
        "Product Name",
        "Sales Qty",
        "Bonus Qty",
        "Selling Price",
        "Discount",
        "Credit Days",
        "Paid Amount",
        "Payment Status",
        "Remarks",
      ];
      headerRow.font = { bold: true };
      headerRow.alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      // ===== Date format =====
      ["recordingDate", "invoiceDate"].forEach((key) => {
        worksheet.getColumn(key).numFmt = "dd/mm/yyyy";
      });

      // ===== Data Rows =====
      data.forEach((item) => {
        worksheet.addRow({
          recordingDate: item.recordingDate
            ? new Date(item.recordingDate)
            : null,
          invoiceNumber: item.invoiceNumber || "",
          invoiceDate: item.invoiceDate
            ? new Date(item.invoiceDate)
            : null,
          mrName: item.mrName || "",
          customerCode: item.customerCode || "", // ✅
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
      });

      // ===== Dropdown Sheet =====
      const dropdownSheet = workbook.addWorksheet("DropdownValues");
      dropdownSheet.state = "veryHidden";

      const paymentStatusList = statuses
        .map((s) => (typeof s === "string" ? s : s.type))
        .filter(Boolean);

      const productList = [
        ...new Set(
          productNames.map((p) =>
            typeof p === "string" ? p : p.name
          )
        ),
      ];

      const mrNames = mrList
        .map((m) => m.name || m.staffName || "")
        .filter(Boolean);

      const customerCodes = customerList
        .map((c) => c.customerCode || c.code || "")
        .filter(Boolean);

      paymentStatusList.forEach((v, i) => (dropdownSheet.getCell(`A${i + 1}`).value = v));
      productList.forEach((v, i) => (dropdownSheet.getCell(`B${i + 1}`).value = v));
      mrNames.forEach((v, i) => (dropdownSheet.getCell(`C${i + 1}`).value = v));
      customerCodes.forEach((v, i) => (dropdownSheet.getCell(`D${i + 1}`).value = v));

      // ===== Apply dropdowns =====
      for (let i = 4; i <= 1000; i++) {
        worksheet.getCell(`D${i}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`=DropdownValues!$C$1:$C$${mrNames.length}`],
        };

        worksheet.getCell(`E${i}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`=DropdownValues!$D$1:$D$${customerCodes.length}`],
        };

        worksheet.getCell(`F${i}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`=DropdownValues!$B$1:$B$${productList.length}`],
        };

        worksheet.getCell(`M${i}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`=DropdownValues!$A$1:$A$${paymentStatusList.length}`],
        };
      }

      // ===== Export =====
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "saleSummary.xlsx";
      link.click();
    } catch (err) {
      console.error("Excel error:", err);
      alert("Failed to generate Excel");
    }
  };

  if (loading || mrLoading || customerLoading)
    return <p>Loading sample data...</p>;

  return (
    <button
      onClick={generateExcel}
      className="text-blue-600 hover:underline text-sm"
    >
      Download Sales Summary Sample Excel
    </button>
  );
};

export default SampleExcelDownloadSale;
