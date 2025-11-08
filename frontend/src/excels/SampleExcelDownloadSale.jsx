import React from "react";
import ExcelJS from "exceljs";
import { useInitialSaleData } from "../pages/Sale/IntialLoading";
import { fetchMRList, fetchCustomerList } from "../pages/ProductManager/common/fetchDropdown";

const SampleExcelDownloadSale = ({ data = [] }) => {
  const { statuses = [], productNames = [], loading } = useInitialSaleData();
  const [mrList, setMrList] = React.useState([]);
  const [customerList, setCustomerList] = React.useState([]);
  const [mrLoading, setMrLoading] = React.useState(false);
  const [customerLoading, setCustomerLoading] = React.useState(false);

  // Fetch MR list
  const fetchMRData = async () => {
    try {
      setMrLoading(true);
      const mrListResult = await fetchMRList();
      
      if (mrListResult.success) {
        setMrList(mrListResult.data || []);
      } else {
        console.warn("Failed to fetch MR list:", mrListResult.error);
      }
    } catch (error) {
      console.error("Error fetching MR list:", error);
    } finally {
      setMrLoading(false);
    }
  };

  // Fetch Customer list
  const fetchCustomerData = async () => {
    try {
      setCustomerLoading(true);
      const customerListResult = await fetchCustomerList();
      
      if (customerListResult.success) {
        setCustomerList(customerListResult.data || []);
      } else {
        console.warn("Failed to fetch customer list:", customerListResult.error);
      }
    } catch (error) {
      console.error("Error fetching customer list:", error);
    } finally {
      setCustomerLoading(false);
    }
  };

  React.useEffect(() => {
    fetchMRData();
    fetchCustomerData();
  }, []);

  const generateExcel = async () => {
    if (loading || mrLoading || customerLoading) {
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Sale Summary");

      // === Sheet Titles ===
      worksheet.mergeCells("A1:N1"); // Changed from O1 to N1 (14 columns now)
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(1).height = 25;

      worksheet.mergeCells("A2:N2"); // Changed from O2 to N2 (14 columns now)
      const subtitleCell = worksheet.getCell("A2");
      subtitleCell.value = "Sale Summary List";
      subtitleCell.font = { bold: true, size: 14 };
      subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(2).height = 20;

      // === Define Columns (removed "no" column) ===
      worksheet.columns = [
        { key: "recordingDate", width: 15 },
        { key: "invoiceNumber", width: 15 },
        { key: "invoiceDate", width: 15 },
        { key: "mrName", width: 20 },
        { key: "customerName", width: 25 },
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

      // === Header Row (removed "No" column) ===
      const headerRow = worksheet.getRow(3);
      headerRow.values = [
        "Recording Date",
        "Invoice #",
        "Invoice Date",
        "MR Name",
        "Customer Name",
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

      // === Add Data Rows (removed "no" column) ===
      if (data && data.length > 0) {
        data.forEach((item, index) => {
          const row = worksheet.addRow({
            recordingDate: item.recordingDate
              ? new Date(item.recordingDate)
              : null,
            invoiceNumber: item.invoiceNumber || "",
            invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : null,
            mrName: item.mrName || "",
            customerName: item.customerName || item.customerCode || "",
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

          // Format numeric cells
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

      // Create a hidden dropdown sheet
      const dropdownSheet = workbook.addWorksheet("DropdownValues");
      dropdownSheet.state = "veryHidden";

      // Prepare dropdown values for payment status
      const paymentStatusTypes = statuses
        .map((s) => (typeof s === "string" ? s : s.type || ""))
        .filter(Boolean);

      // Prepare dropdown values for product names (unique)
      const uniqueProductNames = [...new Set(productNames
        .map((p) => (typeof p === "string" ? p : p.name || ""))
        .filter(Boolean)
      )];

      // Prepare MR names dropdown values
      const mrNames = mrList
        .map((mr) => {
          if (typeof mr === "string") return mr;
          const name =
            mr.name ||
            mr.staffName ||
            mr.medicalRepName ||
            `${mr.firstName || ""} ${mr.lastName || ""}`.trim();
          return name;
        })
        .filter(Boolean);

      // Prepare Customer names dropdown values
      const customerNames = customerList
        .map((customer) => {
          if (typeof customer === "string") return customer;
          const name =
            customer.name ||
            customer.customerName ||
            customer.companyName ||
            `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
          return name;
        })
        .filter(Boolean);

      // Write dropdown values to hidden sheet
      // Payment Status (Column A)
      paymentStatusTypes.forEach((status, index) => {
        dropdownSheet.getCell(`A${index + 1}`).value = status;
      });

      // Product Name (Column B)
      uniqueProductNames.forEach((product, index) => {
        dropdownSheet.getCell(`B${index + 1}`).value = product;
      });

      // MR Names (Column C)
      mrNames.forEach((mr, index) => {
        dropdownSheet.getCell(`C${index + 1}`).value = mr;
      });

      // Customer Names (Column D)
      customerNames.forEach((customer, index) => {
        dropdownSheet.getCell(`D${index + 1}`).value = customer;
      });

      // ===== Set up dropdowns for all rows (updated column references) =====
      for (let i = startRow; i <= endRow; i++) {
        try {
          // MR Name dropdown (now Column D instead of E)
          if (mrNames.length > 0) {
            worksheet.getCell(`D${i}`).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownValues!$C$1:$C$${mrNames.length}`],
              showErrorMessage: true,
              errorTitle: "Invalid Input",
              error: "Please select a medical representative from the list",
              showDropDown: true,
            };
          }

          // Customer Name dropdown (now Column E instead of F)
          if (customerNames.length > 0) {
            worksheet.getCell(`E${i}`).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownValues!$D$1:$D$${customerNames.length}`],
              showErrorMessage: true,
              errorTitle: "Invalid Input",
              error: "Please select a customer from the list",
              showDropDown: true,
            };
          }

          // Product Name dropdown (now Column F instead of G)
          if (uniqueProductNames.length > 0) {
            worksheet.getCell(`F${i}`).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownValues!$B$1:$B$${uniqueProductNames.length}`],
              showErrorMessage: true,
              errorTitle: "Invalid Input",
              error: "Please select a product from the list",
              showDropDown: true,
            };
          }

          // Payment Status dropdown (now Column M instead of N)
          if (paymentStatusTypes.length > 0) {
            worksheet.getCell(`M${i}`).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`=DropdownValues!$A$1:$A$${paymentStatusTypes.length}`],
              showErrorMessage: true,
              errorTitle: "Invalid Input",
              error: "Please select a payment status from the list",
              showDropDown: true,
            };
          }
        } catch (error) {
          console.warn(`Failed to set dropdowns for row ${i}:`, error);
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

  const isLoading = loading || mrLoading || customerLoading;

  if (isLoading) return <p>Loading sample data...</p>;

  return (
    <button
      onClick={generateExcel}
      disabled={isLoading}
      className="text-blue-600 hover:underline text-sm mb-4 block cursor-pointer
       disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading
        ? "Loading dropdown data..."
        : "Download Sales Summary Sample Excel"}
    </button>
  );
};

export default SampleExcelDownloadSale;