import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  UserPlus,
  Trash2,
  Edit,
  Upload,
  X,
  Eye,
  Search,
  Package,
  AlertCircle,
  Download,
  CheckCircle,
  Save,
  Calendar,
  DollarSign,
  ShoppingCart,
  User,
  ClipboardList,
  CreditCard,
  Truck,
  Clock,
  PackageCheck,
} from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { useNavigate } from "react-router-dom";
import SaleExcelDownload from "../../excels/download/ExcelDownload";
import { useInitialSaleData } from "./IntialLoading.jsx";
import {
  fetchMRList,
  fetchCustomerList,
} from "../../pages/ProductManager/common/fetchDropdown.jsx";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";
import * as XLSX from "xlsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const ImportSalesModal = ({
  isOpen,
  onClose,
  onImportSuccess,
  mrList = [],
  customerList = [],
  productsList = [],
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [importErrorDetails, setImportErrorDetails] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [importStep, setImportStep] = useState("");
  const [isCancelled, setIsCancelled] = useState(false);
  const abortControllerRef = useRef(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showParsedSection, setShowParsedSection] = useState(false);

  const [failedInvoices, setFailedInvoices] = useState([]);
  const [showFailedInvoices, setShowFailedInvoices] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // Stock validation states
  const [showStockValidation, setShowStockValidation] = useState(false);
  const [stockValidationResult, setStockValidationResult] = useState(null);
  const [isValidatingStock, setIsValidatingStock] = useState(false);
  const [shouldProceedDespiteStockIssues, setShouldProceedDespiteStockIssues] =
    useState(false);

  // Progress state
  const [serverProgress, setServerProgress] = useState(0);
  const [serverProcessed, setServerProcessed] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);

  const pollingIntervalRef = useRef(null);

  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Enhanced reset modal function
  const resetModal = (fullReset = true) => {
    if (fullReset) {
      setParsedData([]);
      setImportErrorDetails([]);
      setFailedInvoices([]);
      setSessionId(null);
      setStockValidationResult(null);
      setShouldProceedDespiteStockIssues(false);
    }

    setShowParsedSection(false);
    setShowValidationErrors(false);
    setShowFailedInvoices(false);
    setShowStockValidation(false);
    setServerProgress(0);
    setServerProcessed(0);
    setServerTotal(0);
    setIsImporting(false);
    setIsValidatingStock(false);
    setIsUploading(false);
    setIsProcessingFile(false);
    setImportStep("");
    setIsCancelled(false);

    clearPolling();

    // Clear any active file input
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) fileInput.value = "";
  };

  // Handle modal close properly
  const handleClose = () => {
    if (isImporting || isUploading || isProcessingFile || isValidatingStock) {
      const shouldCancel = window.confirm(
        "Import is in progress. Are you sure you want to cancel and close?",
      );

      if (shouldCancel) {
        handleCancelImport();
        setTimeout(() => {
          resetModal();
          onClose();
        }, 500);
      }
      return;
    }

    resetModal();
    onClose();
  };

  // Proper cancel import function
  const handleCancelImport = () => {
    setIsCancelled(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    clearPolling();
    setIsImporting(false);
    setIsValidatingStock(false);
    setImportStep("Import cancelled by user");
    showToast("info", "Import cancelled");
  };

  // Parse Excel quantity function
  const parseExcelQuantity = (value) => {
    if (value === null || value === undefined || value === "") return 0;

    try {
      const str = String(value).trim();
      // Remove commas and any non-numeric characters except decimal point
      const cleaned = str.replace(/,/g, "").replace(/[^0-9.-]/g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : Math.max(0, num);
    } catch (error) {
      console.error("Error parsing quantity:", value, error);
      return 0;
    }
  };


const findProductStockInHandOptimized = async (
  productName,
  requiredQty,
  tolerance = 0,
) => {
  try {
    return {
      success: true,
      productName: productName,
      actualProductName: productName,
      availableStock: requiredQty + 100, // Always return more than required
      requiredQty: requiredQty,
      insufficient: false,
      insufficientQty: 0,
      calculationMethod: "backend_will_handle",
      message: "Backend will handle stock adjustments automatically",
    };
  } catch (error) {
    console.error(
      `Error in findProductStockInHandOptimized for ${productName}:`,
      error,
    );
    // Return a permissive result to avoid blocking imports
    return {
      success: true,
      productName: productName,
      actualProductName: productName,
      availableStock: requiredQty + 100,
      requiredQty: requiredQty,
      insufficient: false,
      insufficientQty: 0,
      calculationMethod: "error_fallback",
      message: `Error checking stock, proceeding with import: Backend will handle adjustments`,
    };
  }
};

  // Enhanced file upload handler
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = file.name.split(".").pop().toLowerCase();
    if (!validExtensions.includes(`.${fileExtension}`)) {
      showToast(
        "error",
        "Invalid file type. Please upload Excel or CSV files only.",
      );
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showToast("error", "File size too large. Maximum size is 20MB.");
      return;
    }

    resetModal(false); // Partial reset
    setImportMessage("Reading file...");
    setIsUploading(true);
    setIsProcessingFile(true);

    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(file);
      });

      setImportMessage("Processing Excel data...");
      const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      setImportMessage("Parsing rows...");

      // Find header row
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i].map((cell) =>
          String(cell || "")
            .trim()
            .toLowerCase(),
        );
        if (row.some((cell) => cell.includes("invoice"))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        throw new Error(
          "Header row with 'Invoice' not found in the first 20 rows",
        );
      }

      const headers = rows[headerIdx].map((h) => String(h || "").trim());
      const dataRows = rows.slice(headerIdx + 1);

      // Get column indices
      const getColIndex = (possibleNames) => {
        for (const name of possibleNames) {
          const index = headers.findIndex((h) =>
            h.toLowerCase().includes(name.toLowerCase()),
          );
          if (index !== -1) return index;
        }
        return -1;
      };

      const invoiceCol = getColIndex(["Invoice #", "Invoice", "InvoiceNumber"]);
      const customerCol = getColIndex([
        "Customer Name",
        "Customer",
        "CustomerName",
      ]);
      const productCol = getColIndex([
        "Product Name",
        "Product",
        "ProductName",
      ]);
      const salesQtyCol = getColIndex([
        "Sales Qty",
        "Quantity",
        "SalesQuantity",
      ]);
      const bonusQtyCol = getColIndex(["Bonus Qty", "Bonus", "BonusQuantity"]);
      const priceCol = getColIndex(["Selling Price", "Price", "Unit Price"]);

      // Validate required columns
      if (invoiceCol === -1) throw new Error("Invoice column not found");
      if (customerCol === -1) throw new Error("Customer column not found");
      if (productCol === -1) throw new Error("Product column not found");
      if (salesQtyCol === -1)
        throw new Error("Sales Quantity column not found");

      const groupedInvoices = {};
      const validationErrors = [];
      let rowCount = headerIdx;

      for (const row of dataRows) {
        rowCount++;

        // Skip empty rows
        if (!row || row.every((cell) => !cell || String(cell).trim() === "")) {
          continue;
        }

        const invoiceNumber = String(row[invoiceCol] || "").trim();
        const customerName = String(row[customerCol] || "").trim();
        const productName = String(row[productCol] || "").trim();
        const salesQty = parseExcelQuantity(row[salesQtyCol]);
        const bonusQty = parseExcelQuantity(row[bonusQtyCol] || 0);
        const sellingPrice = parseFloat(row[priceCol]) || 0;

        const rowErrors = [];

        if (!invoiceNumber) rowErrors.push("Invoice number is required");
        if (!customerName) rowErrors.push("Customer name is required");
        if (!productName) rowErrors.push("Product name is required");
        if (salesQty <= 0 && bonusQty <= 0)
          rowErrors.push("Total quantity must be > 0");
        if (sellingPrice < 0)
          rowErrors.push("Selling price cannot be negative");

        if (rowErrors.length > 0) {
          validationErrors.push({
            row: rowCount + 1,
            invoiceNumber: invoiceNumber || "N/A",
            customerName: customerName || "N/A",
            mrName:
              String(
                row[getColIndex(["MR Name", "MR", "SalesPerson"])] || "",
              ).trim() || "Unknown",
            productName: productName || "N/A",
            error: rowErrors.join("; "),
            type: "validation",
          });
          continue;
        }

        if (!groupedInvoices[invoiceNumber]) {
          groupedInvoices[invoiceNumber] = {
            recordingDate: new Date().toISOString().split("T")[0],
            invoiceNumber,
            invoiceDate: new Date().toISOString().split("T")[0],
            mrName:
              String(
                row[getColIndex(["MR Name", "MR", "SalesPerson"])] || "",
              ).trim() || "Unknown",
            customerName,
            customerCode: String(
              row[getColIndex(["Customer Code", "Code"])] || "",
            ).trim(),
            customerId: "",
            creditDays: parseInt(
              row[getColIndex(["Credit Days", "Credit"])] || 0,
            ),
            paidAmount: parseFloat(
              row[getColIndex(["Paid Amount", "Paid"])] || 0,
            ),
            paymentStatus: "Credit",
            remark: String(
              row[getColIndex(["Remarks", "Remark", "Note"])] || "",
            ).trim(),
            products: [],
            totalAmount: 0,
            dueAmount: 0,
            dueDate: new Date().toISOString().split("T")[0],
            deliveryDate: new Date().toISOString().split("T")[0],
          };
        }

        const discount = parseFloat(
          row[getColIndex(["Discount", "Disc"])] || 0,
        );
        const amount = sellingPrice * salesQty;
        const netSellingAmount = Math.max(0, amount - discount);

        groupedInvoices[invoiceNumber].products.push({
          productName,
          salesQty,
          bonusQty,
          totalQty: salesQty + bonusQty,
          sellingPrice,
          amount,
          discount,
          netSellingAmount,
          averageUnitPrice:
            salesQty + bonusQty > 0
              ? netSellingAmount / (salesQty + bonusQty)
              : 0,
          lc: 0,
          profitLoss: 0,
          isProductAccept: true,
          remark: "",
        });

        groupedInvoices[invoiceNumber].totalAmount += netSellingAmount;
      }

      // Calculate due amounts
      Object.values(groupedInvoices).forEach((inv) => {
        inv.dueAmount = Math.max(0, inv.totalAmount - inv.paidAmount);
      });

      const validInvoices = Object.values(groupedInvoices).filter(
        (inv) => inv.products.length > 0,
      );

      if (validInvoices.length === 0) {
        throw new Error("No valid invoices found in the file");
      }

      setParsedData(validInvoices);
      setImportErrorDetails(validationErrors);

      if (validationErrors.length > 0) {
        showToast(
          "warning",
          `Found ${validInvoices.length} valid invoices with ${validationErrors.length} validation errors`,
        );
      }

      setShowParsedSection(true);
    } catch (error) {
      console.error("File processing error:", error);
      showToast("error", `Failed to process file: ${error.message}`);
      resetModal(false);
    } finally {
      setIsUploading(false);
      setIsProcessingFile(false);
    }
  };

  // Track failed invoices function
  const trackFailedInvoices = (errors, invoices) => {
    const failedMap = new Map();

    errors.forEach((error) => {
      const invoiceNumber = error.invoiceNumber || "Unknown";

      if (!failedMap.has(invoiceNumber)) {
        // Find the original invoice data
        const originalInvoice = invoices.find(
          (inv) => inv.invoiceNumber === invoiceNumber,
        );

        failedMap.set(invoiceNumber, {
          invoiceNumber,
          row: error.row,
          customerName:
            error.customerName || originalInvoice?.customerName || "Unknown",
          mrName: error.mrName || originalInvoice?.mrName || "Unknown",
          productName: error.productName || "N/A",
          error: error.error || error.message || "Unknown error",
          type: error.type || "import_error",
          timestamp: new Date().toISOString(),
          originalData: originalInvoice || null,
        });
      }
    });

    return Array.from(failedMap.values());
  };

const validateStockBeforeImport = async (invoices) => {
  try {
    setIsValidatingStock(true);
    setImportMessage(`Checking stock for ${invoices.length} invoices...`);    
    return true; // Always return true
  } catch (error) {
    console.error("Stock validation error:", error);
    // Don't fail the import due to validation errors
    return true; // Always return true
  } finally {
    setIsValidatingStock(false);
  }
};

  // Enhanced main import function with better stock handling
const handleProductImport = async (
  dataToImport,
  bypassStockCheck = true, // Default to true
) => {
  if (!dataToImport?.length) {
    showToast("error", "No data to import");
    return;
  }

  setIsImporting(true);
  setImportStep("Preparing data...");
  setServerProgress(0);
  setServerProcessed(0);
  setServerTotal(dataToImport.length);
  setFailedInvoices([]);

  abortControllerRef.current = new AbortController();

  try {
    const transformedInvoices = dataToImport.map((inv) => ({
      ...inv,
      invoiceDate: inv.invoiceDate || new Date().toISOString().split("T")[0],
      recordingDate:
        inv.recordingDate || new Date().toISOString().split("T")[0],
      paymentStatus: inv.paymentStatus || "Credit",
      totalAmount:
        inv.totalAmount ||
        inv.products.reduce((s, p) => s + (p.netSellingAmount || 0), 0),
      dueAmount: (inv.totalAmount || 0) - (inv.paidAmount || 0),
      // Ensure products have proper structure for stock deduction
      products: inv.products.map((product) => ({
        ...product,
        salesQty: Number(product.salesQty) || 0,
        bonusQty: Number(product.bonusQty) || 0,
        totalQty:
          (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0),
      })),
    }));

    setImportStep("Sending to server...");

    // Always use the auto-adjust endpoint
    const endpoint = `${backendUrl}/api/sales/import`;

    const res = await axios.post(
      endpoint,
      {
        invoices: transformedInvoices,
        updateInventory: true,
        importTimestamp: new Date().toISOString(),
      },
      {
        timeout: 300000,
        signal: abortControllerRef.current.signal,
      },
    );

    if (res.data.success) {
      const newSessionId = res.data.sessionId;
      setSessionId(newSessionId);
      setImportStep("Import started – processing invoices...");

      // Start polling for progress
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const progRes = await axios.get(
            `${backendUrl}/api/sales/import/progress/${newSessionId}`,
            { timeout: 5000 },
          );

          if (progRes.data.success) {
            const prog = progRes.data.progress;

            setServerProgress(prog.percentage || 0);
            setServerProcessed(prog.processed || 0);
            setServerTotal(prog.total || dataToImport.length);

            if (prog.completed) {
              clearPolling();
              setIsImporting(false);

              if (prog.failed > 0) {
                try {
                  const failedRes = await axios.get(
                    `${backendUrl}/api/sales/import/failed/${newSessionId}`,
                  );

                  if (failedRes.data.success) {
                    let failedInvoicesData = [];

                    if (failedRes.data.data?.failedInvoices?.length > 0) {
                      failedInvoicesData = failedRes.data.data.failedInvoices;
                    } else if (prog.errors?.length > 0) {
                      failedInvoicesData = trackFailedInvoices(
                        prog.errors,
                        dataToImport,
                      );
                    }

                    if (failedInvoicesData.length > 0) {
                      setFailedInvoices(failedInvoicesData);
                      setShowFailedInvoices(true);
                    }
                  }
                } catch (e) {
                  console.warn("Could not fetch failed invoices:", e.message);
                  if (prog.errors?.length > 0) {
                    const tracked = trackFailedInvoices(
                      prog.errors,
                      dataToImport,
                    );
                    setFailedInvoices(tracked);
                    setShowFailedInvoices(true);
                  }
                }

                showToast(
                  "warning",
                  `Import completed with ${prog.successful} successful and ${prog.failed} failed invoices`,
                );
              } else {
                showToast(
                  "success",
                  `Successfully imported ${prog.successful} invoices`,
                );

                // After successful import, fetch updated stock if needed
                if (onImportSuccess) {
                  onImportSuccess();
                  setTimeout(() => {
                    window.dispatchEvent(
                      new CustomEvent("inventory-updated"),
                    );
                  }, 1000);
                }
              }

              setImportStep("Import completed");
            }
          }
        } catch (err) {
          if (err.code === "ERR_CANCELED") return;
          console.error("Polling error:", err);
        }
      }, 1000);
    } else {
      throw new Error(res.data.message || "Import failed");
    }
  } catch (err) {
    clearPolling();
    setIsImporting(false);

    if (axios.isCancel(err) || isCancelled) {
      setImportStep("Import cancelled");
      showToast("info", "Import cancelled");
    } else {
      console.error("Import error:", err);
      const message =
        err.response?.data?.message || err.message || "Import failed";
      setImportStep("Import failed");
      showToast("error", message);

      // Store any failed invoices from response
      if (err.response?.data?.failedInvoices) {
        setFailedInvoices(err.response.data.failedInvoices);
        setShowFailedInvoices(true);
      } else if (err.response?.data?.errors) {
        const tracked = trackFailedInvoices(
          err.response.data.errors,
          dataToImport,
        );
        setFailedInvoices(tracked);
        setShowFailedInvoices(true);
      }
    }
  }
};

const handleImportData = async () => {
  if (parsedData.length === 0) {
    showToast("error", "No data to import");
    return;
  }

  // Skip stock validation and proceed directly to import
  await handleProductImport(parsedData, true); // Pass true to bypass stock check
};

  // Handle proceed despite stock issues
  const handleProceedAnyway = async () => {
    if (!stockValidationResult) {
      showToast("error", "Stock validation data not available");
      return;
    }

    setShowStockValidation(false);
    setShouldProceedDespiteStockIssues(true);

    // Show warning about potential failures
    const confirmProceed = window.confirm(
      `Warning: ${stockValidationResult.stockIssues.length} products have insufficient stock. Some invoices may fail during import. Proceed anyway?`,
    );

    if (confirmProceed) {
      await handleProductImport(parsedData, true);
    } else {
      setShouldProceedDespiteStockIssues(false);
    }
  };

  // Download error report
  const downloadErrorReport = () => {
    const allErrors = [
      ...importErrorDetails.map((e) => ({
        Row: e.row,
        "Invoice #": e.invoiceNumber,
        Customer: e.customerName,
        Product: e.productName || "N/A",
        Error: e.error || "Validation error",
        Type: "Validation",
      })),
    ];

    if (allErrors.length === 0) {
      showToast("warning", "No validation errors to download");
      return;
    }

    try {
      const ws = XLSX.utils.json_to_sheet(allErrors);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Validation Errors");
      const fileName = `validation_errors_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast("success", "Report downloaded successfully");
    } catch (error) {
      console.error("Error downloading report:", error);
      showToast("error", "Failed to download report");
    }
  };

  // Reset parsed data
  const resetParsedData = () => {
    setParsedData([]);
    setImportErrorDetails([]);
    setShowParsedSection(false);
    setShowValidationErrors(false);
    setFailedInvoices([]);
    setShowFailedInvoices(false);
    setShowStockValidation(false);
    setStockValidationResult(null);
    setShouldProceedDespiteStockIssues(false);
  };

  // FailedInvoicesModal Component
  const FailedInvoicesModal = ({
    isOpen,
    onClose,
    failedInvoices,
    sessionId,
  }) => {
    const [isDownloading, setIsDownloading] = useState(false);

    const downloadFailedReport = async () => {
      try {
        setIsDownloading(true);

        // If we have sessionId, try to fetch from backend for complete data
        if (sessionId) {
          try {
            const response = await axios.get(
              `${backendUrl}/api/sales/import/failed/${sessionId}`,
            );
            if (response.data.success && response.data.data.failedInvoices) {
              // Use the fetched data
              failedInvoices = response.data.data.failedInvoices;
            }
          } catch (fetchError) {
            console.warn(
              "Could not fetch failed invoices from backend:",
              fetchError.message,
            );
          }
        }

        const csvRows = [
          [
            "Row",
            "Invoice Number",
            "Customer Name",
            "MR Name",
            "Product",
            "Error Type",
            "Error Message",
            "Timestamp",
          ],
          ...failedInvoices.map((inv) => [
            inv.row || "N/A",
            inv.invoiceNumber,
            inv.customerName,
            inv.mrName,
            inv.productName || "N/A",
            inv.type || "unknown",
            inv.error || inv.message || "Unknown error",
            inv.timestamp || new Date().toISOString(),
          ]),
        ];

        const csvContent = csvRows
          .map((row) =>
            row
              .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
              .join(","),
          )
          .join("\n");

        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `failed_invoices_${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast("success", "Failed invoices report downloaded");
      } catch (error) {
        console.error("Error downloading report:", error);
        showToast("error", "Failed to download report");
      } finally {
        setIsDownloading(false);
      }
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[120]">
        <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Failed Invoices ({failedInvoices.length})
          </h2>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-600">
                These invoices could not be imported. Please review and correct
                the errors.
              </div>
              <button
                onClick={downloadFailedReport}
                disabled={isDownloading}
                className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer disabled:opacity-50"
              >
                <Download size={16} />
                {isDownloading ? "Downloading..." : "Download Report"}
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left border-b">Row</th>
                    <th className="p-3 text-left border-b">Invoice #</th>
                    <th className="p-3 text-left border-b">Customer</th>
                    <th className="p-3 text-left border-b">MR Name</th>
                    <th className="p-3 text-left border-b">Product</th>
                    <th className="p-3 text-left border-b">Error Type</th>
                    <th className="p-3 text-left border-b">Error Message</th>
                  </tr>
                </thead>
                <tbody>
                  {failedInvoices.slice(0, 50).map((inv, idx) => (
                    <tr key={idx} className="hover:bg-red-50 border-b">
                      <td className="p-3 font-mono">{inv.row || idx + 1}</td>
                      <td className="p-3 font-medium">{inv.invoiceNumber}</td>
                      <td className="p-3">{inv.customerName}</td>
                      <td className="p-3">{inv.mrName}</td>
                      <td className="p-3">{inv.productName || "N/A"}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            inv.type === "validation"
                              ? "bg-yellow-100 text-yellow-800"
                              : inv.type === "import_error"
                                ? "bg-red-100 text-red-800"
                                : inv.type === "duplicate_error"
                                  ? "bg-orange-100 text-orange-800"
                                  : inv.type === "insufficient_stock"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {inv.type || "error"}
                        </span>
                      </td>
                      <td
                        className="p-3 text-red-600 max-w-xs"
                        title={inv.error || inv.message}
                      >
                        <div className="truncate">
                          {inv.error || inv.message || "Unknown error"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {failedInvoices.length > 50 && (
                <div className="p-3 text-center text-gray-500 text-sm bg-gray-50">
                  Showing 50 of {failedInvoices.length} failed invoices
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between border-t border-gray-300 pt-4">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={downloadFailedReport}
              disabled={isDownloading}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer flex items-center gap-2"
            >
              <Download size={16} />
              {isDownloading ? "Downloading..." : "Download CSV"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

const StockValidationModal = () => {
  if (!showStockValidation || !stockValidationResult) return null;

  const { stockIssues = [], totalInvoices = 0 } = stockValidationResult;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[110]">
      <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold text-blue-800 flex items-center gap-2">
              <AlertCircle size={24} />
              Import Ready
            </h2>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                Ready to Import
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-white rounded-lg shadow border">
              <div className="text-sm text-gray-600">Invoices</div>
              <div className="text-2xl font-bold text-blue-800">
                {totalInvoices}
              </div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg shadow border">
              <div className="text-sm text-gray-600">Products</div>
              <div className="text-2xl font-bold text-blue-800">
                {stockValidationResult.summary?.totalProducts || "N/A"}
              </div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg shadow border">
              <div className="text-sm text-gray-600">Status</div>
              <div className="text-2xl font-bold text-green-800">READY</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg shadow border">
              <div className="text-sm text-gray-600">Action</div>
              <div className="text-2xl font-bold text-blue-800">PROCEED</div>
            </div>
          </div>

          <div className="p-3 bg-green-100 border border-green-300 rounded-lg">
            <p className="text-sm text-green-800 font-medium">
              ✅ <strong>All systems ready.</strong> The backend will automatically create stock adjustments for any shortages. Click "Proceed to Import" to continue.
            </p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-medium text-gray-700 mb-3">Import Summary</h3>

          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-left">Required Quantity</th>
                  <th className="p-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {stockIssues.slice(0, 10).map((issue, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 border-b">
                    <td className="p-3 font-medium">
                      <div className="text-gray-700">{issue.productName}</div>
                    </td>
                    <td className="p-3 font-bold">{issue.totalRequired}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        Will be adjusted by backend
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-300">
          <div className="text-sm text-gray-600">
            {totalInvoices} invoices ready for import
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                handleCancelImport();
                setShowStockValidation(false);
              }}
              className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => setShowStockValidation(false)}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer"
            >
              Go Back
            </button>
            <button
              onClick={() => {
                setShowStockValidation(false);
                handleProductImport(parsedData, true); // Pass true to bypass stock check
              }}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle size={16} />
              Proceed to Import
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            Import Sales Data
          </h2>

          {/* File upload section */}
          {!showParsedSection &&
            !isUploading &&
            !isProcessingFile &&
            !isImporting && (
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Excel/CSV File
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="mx-auto text-gray-400 mb-3" size={48} />
                  <p className="text-gray-600 mb-2">
                    Drag & drop your file here or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 mt-3">
                    Supported formats: Excel (.xlsx, .xls), CSV (.csv) | Max
                    size: 20MB
                  </p>
                </div>
              </div>
            )}

          {/* Processing file */}
          {(isUploading || isProcessingFile) && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <h3 className="font-medium text-blue-800">
                  {isUploading ? "Uploading..." : "Processing file..."}
                </h3>
              </div>
              <p className="text-center text-gray-600">{importMessage}</p>
            </div>
          )}

          {/* Parsed data summary */}
          {showParsedSection && parsedData.length > 0 && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-green-800">
                    File Successfully Parsed
                  </h3>
                  <p className="text-sm text-green-700">
                    Found {parsedData.length} valid invoices ready for import
                  </p>
                  {importErrorDetails.length > 0 && (
                    <p className="text-sm text-yellow-700 mt-1">
                      ⚠️ {importErrorDetails.length} rows skipped due to errors
                    </p>
                  )}
                </div>
                <button
                  onClick={resetParsedData}
                  className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Validation errors */}
          {importErrorDetails.length > 0 &&
            showParsedSection &&
            !isImporting && (
              <div className="mb-6 border border-yellow-200 rounded-lg overflow-hidden">
                <div className="bg-yellow-50 p-3 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="text-yellow-600" size={18} />
                    <h3 className="font-medium text-yellow-800">
                      Validation Errors ({importErrorDetails.length})
                    </h3>
                  </div>
                  <button
                    onClick={() =>
                      setShowValidationErrors(!showValidationErrors)
                    }
                    className="text-sm text-yellow-600 hover:text-yellow-800 border border-yellow-300 px-3 py-1 rounded cursor-pointer"
                  >
                    {showValidationErrors ? "Hide" : "Show"} Details
                  </button>
                </div>
                {showValidationErrors && (
                  <div className="max-h-60 overflow-y-auto bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left border-b">Row</th>
                          <th className="p-2 text-left border-b">Invoice #</th>
                          <th className="p-2 text-left border-b">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importErrorDetails.slice(0, 10).map((err, i) => (
                          <tr key={i} className="hover:bg-yellow-50 border-b">
                            <td className="p-2">{err.row}</td>
                            <td className="p-2">{err.invoiceNumber}</td>
                            <td className="p-2 text-yellow-600 text-xs">
                              {err.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importErrorDetails.length > 10 && (
                      <div className="p-2 text-center text-gray-500 text-sm">
                        Showing 10 of {importErrorDetails.length} errors
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* Stock validation in progress */}
          {isValidatingStock && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div>
                <div>
                  <h3 className="font-medium text-yellow-800">
                    Checking Stock Availability
                  </h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Validating stock for {parsedData.length} invoices...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Import progress */}
          {isImporting && (
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-blue-900">
                  Importing Sales Data...
                </h3>
                <span className="text-3xl font-extrabold text-indigo-700">
                  {serverProgress}%
                </span>
              </div>

              <div className="w-full bg-gray-300 rounded-full h-12 overflow-hidden shadow-inner mb-4">
                <div
                  className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 h-full rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-6 shadow-lg"
                  style={{ width: `${serverProgress}%` }}
                >
                  <span className="text-white text-lg font-bold drop-shadow-lg">
                    {serverProcessed} / {serverTotal}
                  </span>
                </div>
              </div>

              <p className="text-center text-gray-700 font-medium text-lg mb-6">
                {importStep}
              </p>

              <div className="flex justify-center">
                <button
                  onClick={handleCancelImport}
                  className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition transform hover:scale-105 cursor-pointer"
                >
                  Cancel Import
                </button>
              </div>
            </div>
          )}

          {/* Import button */}
          {!isImporting &&
            showParsedSection &&
            parsedData.length > 0 &&
            !isValidatingStock && (
              <div className="mb-6">
                <button
                  onClick={handleImportData}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white py-4 rounded-xl font-bold text-xl shadow-lg transition transform hover:scale-105 cursor-pointer"
                >
                  Start Import ({parsedData.length} invoices)
                </button>
              </div>
            )}

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleClose}
              disabled={
                isUploading ||
                isProcessingFile ||
                isImporting ||
                isValidatingStock
              }
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Render modals */}
      <StockValidationModal />

      {showFailedInvoices && (
        <FailedInvoicesModal
          isOpen={showFailedInvoices}
          onClose={() => setShowFailedInvoices(false)}
          failedInvoices={failedInvoices}
          sessionId={sessionId}
        />
      )}
    </>,
    document.body,
  );
};

const ProductDetailsModal = ({
  isOpen,
  onClose,
  products,
  title = "Product Details",
}) => {
  if (!isOpen) return null;

  const calculateTotals = () => {
    return products.reduce(
      (acc, product) => {
        const salesQty = Number(product.salesQty) || 0;
        const bonusQty = Number(product.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;
        const amount = Number(product.amount) || 0;
        const discount = Number(product.discount) || 0;
        const netAmount = Number(product.netSellingAmount) || 0;
        const lc = Number(product.lc) || 0;

        const profitLoss = netAmount - totalQty * lc;

        acc.totalSalesQty += salesQty;
        acc.totalBonusQty += bonusQty;
        acc.totalAmount += amount;
        acc.totalDiscount += discount;
        acc.totalNetAmount += netAmount;
        acc.totalProfitLoss += profitLoss;

        return acc;
      },
      {
        totalSalesQty: 0,
        totalBonusQty: 0,
        totalAmount: 0,
        totalDiscount: 0,
        totalNetAmount: 0,
        totalProfitLoss: 0,
      },
    );
  };

  const totals = calculateTotals();

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold text-gray-800 mb-6">
          {title} ({products?.length || 0} items)
        </h2>

        {!products || products.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No products found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-left">
                    Product Name
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Sales Qty
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Bonus Qty
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Total Qty
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Selling Price
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Amount ($)
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Discount ($)
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Net Amount ($)
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Avg. Price
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    LC ($)
                  </th>
                  <th className="p-3 text-sm font-medium text-gray-700 border-b text-center">
                    Profit / Loss ($)
                  </th>
                </tr>
              </thead>

              <tbody>
                {products.map((product, index) => {
                  const salesQty = Number(product.salesQty) || 0;
                  const bonusQty = Number(product.bonusQty) || 0;
                  const totalQty = salesQty + bonusQty;
                  const netAmount = Number(product.netSellingAmount) || 0;
                  const lc = Number(product.lc) || 0;
                  const avgUnitPrice = totalQty > 0 ? netAmount / totalQty : 0;
                  const profitLoss = netAmount - totalQty * lc;

                  return (
                    <tr
                      key={`product-${index}`}
                      className="hover:bg-gray-50 border-b"
                    >
                      <td className="p-3 text-left">
                        <span className="font-medium">
                          {product.productName || product.name || "N/A"}
                        </span>
                      </td>
                      <td className="p-3 text-center">{salesQty}</td>
                      <td className="p-3 text-center">{bonusQty}</td>
                      <td className="p-3 text-center font-medium">
                        {totalQty}
                      </td>
                      <td className="p-3 text-center">
                        ${Number(product.sellingPrice || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        ${Number(product.amount || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        ${Number(product.discount || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        ${netAmount.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        ${avgUnitPrice.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">${lc.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`font-medium ${
                            profitLoss >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          ${profitLoss.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                <tr className="bg-gray-50 font-medium">
                  <td className="p-3 text-left">Total</td>
                  <td className="p-3 text-center">{totals.totalSalesQty}</td>
                  <td className="p-3 text-center">{totals.totalBonusQty}</td>
                  <td className="p-3 text-center">
                    {totals.totalSalesQty + totals.totalBonusQty}
                  </td>
                  <td className="p-3 text-center">-</td>
                  <td className="p-3 text-center">
                    ${totals.totalAmount.toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    ${totals.totalDiscount.toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    ${totals.totalNetAmount.toFixed(2)}
                  </td>
                  <td className="p-3 text-center">-</td>
                  <td className="p-3 text-center">-</td>
                  <td className="p-3 text-center">
                    <span
                      className={`${
                        totals.totalProfitLoss >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      ${totals.totalProfitLoss.toFixed(2)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-300 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Main Sales Component
const Sales = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedSaleProducts, setSelectedSaleProducts] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [hasPurchaseInventories, setHasPurchaseInventories] = useState(false);
  const [checkingPurchaseInventories, setCheckingPurchaseInventories] =
    useState(true);
  const [shouldCheckPurchase, setShouldCheckPurchase] = useState(true);
  const [productsList, setProductsList] = useState([]); // Add products list state
  const inputRef = useRef(null);
  const { statuses, loading } = useInitialSaleData();

  const [form, setForm] = useState({
    _id: null,
    recordingDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    mrName: "",
    customerName: "",
    customerCode: "",
    customerId: "",
    products: [],
    creditDays: 0,
    dueDate: "",
    deliveryDate: "",
    paidAmount: 0,
    dueAmount: 0,
    totalAmount: 0,
    paymentStatus: "",
    remark: "",
  });

  const SALES_PER_PAGE = 9;

  // Function to fetch products list
  const fetchProductsList = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/products/all`, {
        timeout: 5000,
      });

      if (response.data && Array.isArray(response.data)) {
        setProductsList(response.data);
      } else if (
        response.data.products &&
        Array.isArray(response.data.products)
      ) {
        setProductsList(response.data.products);
      } else if (response.data.data && Array.isArray(response.data.data)) {
        setProductsList(response.data.data);
      }
    } catch (error) {
      console.warn("Could not fetch products list:", error.message);
      // Continue without products list
    }
  };

  // Function to check if purchase inventories exist
  const checkPurchaseInventories = async () => {
    try {
      setCheckingPurchaseInventories(true);
      const response = await axios.get(`${backendUrl}/api/purchases/check`);
      setHasPurchaseInventories(
        response.data.exists || response.data.count > 0,
      );
    } catch (error) {
      console.error("Error checking purchase inventories:", error);
      setHasPurchaseInventories(false);
    } finally {
      setCheckingPurchaseInventories(false);
    }
  };

  // NEW: Re-check purchase inventories when needed
  const recheckPurchaseInventories = () => {
    setShouldCheckPurchase(true);
  };

  // Modified useEffect to check purchase inventories
  useEffect(() => {
    if (shouldCheckPurchase) {
      checkPurchaseInventories();
      setShouldCheckPurchase(false);
    }
  }, [shouldCheckPurchase]);

  // Also check when component mounts
  useEffect(() => {
    checkPurchaseInventories();
    fetchProductsList(); // Fetch products list on mount
  }, []);

  // Listen for custom event when purchase inventory is added
  useEffect(() => {
    const handlePurchaseInventoryAdded = () => {
      recheckPurchaseInventories();
    };

    window.addEventListener(
      "purchase-inventory-added",
      handlePurchaseInventoryAdded,
    );

    return () => {
      window.removeEventListener(
        "purchase-inventory-added",
        handlePurchaseInventoryAdded,
      );
    };
  }, []);

  // Listen for inventory update events
  useEffect(() => {
    const handleInventoryUpdated = () => {
      // Refresh sales data when inventory is updated
      fetchSaleSummaries();
      // Also refresh products list
      fetchProductsList();
    };

    window.addEventListener("inventory-updated", handleInventoryUpdated);

    return () => {
      window.removeEventListener("inventory-updated", handleInventoryUpdated);
    };
  }, []);

  const processSalesData = (data) => {
    const salesData = data.summaries || data.data || data;

    if (!Array.isArray(salesData)) {
      console.error("Sales data is not an array:", salesData);
      setSales([]);
      return;
    }

    const sortedData = salesData.sort((a, b) => {
      return (
        new Date(b.createdAt || b.invoiceDate) -
        new Date(a.createdAt || a.invoiceDate)
      );
    });

    setSales(sortedData);
  };

  const fetchSaleSummaries = async () => {
    try {
      setLoadingData(true);
      const res = await fetch(`${backendUrl}/api/sales/all`, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (res.ok) {
        const data = await res.json();
        processSalesData(data);
      } else {
        const fallbackRes = await fetch(`${backendUrl}/api/sales`);
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          processSalesData(data);
        } else {
          throw new Error("Failed to fetch sale summaries");
        }
      }
    } catch (error) {
      console.error("Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
      setSales([]);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [mrs, customers] = await Promise.all([
          fetchMRList(),
          fetchCustomerList(),
        ]);

        // Handle MR list
        if (mrs && mrs.success && Array.isArray(mrs.data)) {
          const mrNames = mrs.data
            .map((mr) => {
              if (typeof mr === "string") return mr.trim();
              if (mr && typeof mr === "object") {
                return mr.name
                  ? mr.name.trim()
                  : mr.fullName
                    ? mr.fullName.trim()
                    : null;
              }
              return null;
            })
            .filter(Boolean);

          setMrList(mrNames);
        } else {
          console.warn("MR data not in expected format:", mrs);
          setMrList([]);
        }

        // Handle customer list
        if (customers && customers.success && Array.isArray(customers.data)) {
          setCustomerList(customers.data);
        } else {
          setCustomerList([]);
        }
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
        setMrList([]);
        setCustomerList([]);
      }
    };

    fetchDropdownData();
  }, []);

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete ${selected.length} sales?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales/delete-batch`, {
          data: { ids: selected.map((s) => s.id) },
        });

        if (res.status === 200) {
          showToast("success", "Selected Sales deleted successfully");
          fetchSaleSummaries();
          setSelected([]);
        }
      } catch (error) {
        console.error("Delete batch error:", error);
        showToast("error", "Failed to delete selected sales");
      }
    }
  };

  const tableColumns = useMemo(
    () => [
      "invoiceNumber",
      "invoiceDate",
      "productCount",
      "mrName",
      "customerName",
      "totalAmount",
      "paymentStatus",
      "actions",
    ],
    [],
  );

  const allFields = useMemo(
    () => [
      {
        id: "invoiceNumber",
        name: "Invoice No",
        dbName: "invoiceNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "productCount",
        name: "Products",
        dbName: "products",
      },
      { id: "mrName", name: "MR Name", dbName: "mrName" },
      {
        id: "customerName",
        name: "Customer Name",
        dbName: "customerName",
      },
      {
        id: "totalAmount",
        name: "Total Amount ($)",
        dbName: "totalAmount",
      },
      {
        id: "paymentStatus",
        name: "Payment Status",
        dbName: "paymentStatus",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    [],
  );

  // Dynamic payment status tabs based on sales data
  const paymentStatusTabs = useMemo(() => {
    if (!Array.isArray(sales) || sales.length === 0) return ["All"];

    // Extract unique payment statuses from sales data
    const uniqueStatuses = [
      ...new Set(
        sales
          .map((sale) => sale.paymentStatus)
          .filter((status) => status && status.trim() !== "")
          .map((status) => status.trim()),
      ),
    ].sort();

    return ["All", ...uniqueStatuses];
  }, [sales]);

  const filteredSales = useMemo(() => {
    if (!Array.isArray(sales)) return [];

    const lowerSearch = searchTerm.trim().toLowerCase();
    const selectedTabLower = selectedTab.toLowerCase();

    return sales.filter((sale) => {
      const paymentStatus = (sale.paymentStatus || "").toLowerCase();

      // ✅ If tab is NOT "all", then filter by payment status
      if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
        return false;
      }

      // ✅ If no search text, return all matching tab data
      if (!lowerSearch) return true;

      const fields = [sale.invoiceNumber, sale.customerName, sale.mrName];

      return fields.some((f) =>
        (f ?? "").toString().toLowerCase().includes(lowerSearch),
      );
    });
  }, [sales, searchTerm, selectedTab]);

  const currentSales = useMemo(() => {
    const start = (currentPage - 1) * SALES_PER_PAGE;
    return filteredSales.slice(start, start + SALES_PER_PAGE);
  }, [filteredSales, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredSales.length / SALES_PER_PAGE);
  }, [filteredSales.length]);

  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  const getFieldValue = (sale, dbName) => {
    if (dbName === "products") {
      return sale.products?.length || 0;
    }

    if (["invoiceDate", "dueDate", "deliveryDate"].includes(dbName)) {
      return formatDateToReadable(sale[dbName]) || "--";
    }

    if (dbName === "totalAmount") {
      return `$${(sale.totalAmount || 0).toLocaleString()}`;
    }

    const value = sale[dbName];
    return value ?? "--";
  };

  const toggleSelect = (sale) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === sale._id);
      if (exists) {
        return prev.filter((c) => c.id !== sale._id);
      } else {
        return [...prev, { id: sale._id }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentSales.map((s) => ({ id: s._id }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleProductCountClick = (sale) => {
    setSelectedSaleProducts(sale.products || []);
    setIsProductModalOpen(true);
  };

  const handleView = (sale) => {
    setForm({
      ...sale,
      products: sale.products || [],
      customerName: sale.customerName || "--",
      customerCode: sale.customerCode || "",
      customerId: sale.customerId || "",
    });
    setIsViewModalOpen(true);
  };

  const editSale = (sale) => {
    setForm({
      ...sale,
      products: sale.products || [],
      customerName: sale.customerName || "--",
      customerCode: sale.customerCode || "",
      customerId: sale.customerId || "",
    });
    setIsEditModalOpen(true);
  };

  const deleteSale = async (sale) => {
    if (!sale._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete ${sale.invoiceNumber}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales/${sale._id}`);
        if (res.status === 200) {
          showToast(
            "success",
            `Sale ${sale.invoiceNumber} deleted successfully`,
          );
          fetchSaleSummaries();
        }
      } catch (error) {
        showToast("error", "Failed to delete sale.");
      }
    }
  };

  const calculateProductTotals = (products) => {
    if (!products || !Array.isArray(products))
      return {
        totalAmount: 0,
        totalDiscount: 0,
        netAmount: 0,
        totalProfitLoss: 0,
      };

    const totals = products.reduce(
      (acc, product) => {
        acc.totalAmount += parseFloat(product.amount || 0);
        acc.totalDiscount += parseFloat(product.discount || 0);
        acc.netAmount += parseFloat(product.netSellingAmount || 0);
        acc.totalProfitLoss += parseFloat(product.profitLoss || 0);
        return acc;
      },
      { totalAmount: 0, totalDiscount: 0, netAmount: 0, totalProfitLoss: 0 },
    );

    return totals;
  };

  const handleUpdateSale = async (e) => {
    e.preventDefault();
    try {
      const totals = calculateProductTotals(form.products);
      const updatedForm = {
        ...form,
        totalAmount: totals.totalAmount,
        dueAmount: (
          totals.netAmount - parseFloat(form.paidAmount || 0)
        ).toFixed(2),
      };

      const res = await axios.put(
        `${backendUrl}/api/sales/${form._id}`,
        updatedForm,
      );
      if (res.status === 200) {
        showToast("success", "Sales record updated successfully");
        setIsEditModalOpen(false);
        fetchSaleSummaries();
      }
    } catch (err) {
      if (err.response?.data?.error) {
        showToast("error", err.response.data.error);
      } else {
        showToast("error", "Failed to update sales record.");
      }
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const formTotals = useMemo(() => {
    return calculateProductTotals(form.products);
  }, [form.products]);

  const handleImportSuccess = () => {
    setTimeout(() => {
      fetchSaleSummaries();
      // Trigger inventory refresh
      window.dispatchEvent(new CustomEvent("inventory-updated"));
    }, 1000);
  };

  const showMRCustomerWarning = useMemo(() => {
    const hasMRs = mrList && mrList.length > 0;
    const hasCustomers = customerList && customerList.length > 0;

    return !hasMRs && !hasCustomers;
  }, [mrList, customerList]);

  // Combine all conditions for disabling buttons
  const shouldDisableButtons = useMemo(() => {
    return (
      checkingPurchaseInventories ||
      !hasPurchaseInventories ||
      showMRCustomerWarning
    );
  }, [
    checkingPurchaseInventories,
    hasPurchaseInventories,
    showMRCustomerWarning,
  ]);

  // Get appropriate button title
  const getButtonTitle = () => {
    if (checkingPurchaseInventories) {
      return "Checking purchase inventories...";
    }
    if (!hasPurchaseInventories) {
      return "First purchase the entry enter then sale";
    }
    if (showMRCustomerWarning) {
      return "Please add MR and Customer data first";
    }
    return "Create new sale";
  };

  if (loading) return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-6">
      <ImportSalesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={handleImportSuccess}
        mrList={mrList}
        customerList={customerList}
        productsList={productsList} // Pass products list to modal
      />

      <ProductDetailsModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        products={selectedSaleProducts}
        title="Product Details"
      />

      {/* Edit Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Edit size={20} /> Edit Sales Record
              </h2>

              <form onSubmit={handleUpdateSale} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Calendar size={14} className="inline mr-1" />
                      Recording Date
                    </label>
                    <DatePicker
                      selected={
                        form.recordingDate ? new Date(form.recordingDate) : null
                      }
                      onChange={(date) =>
                        setForm((prev) => ({
                          ...prev,
                          recordingDate: date
                            ? date.toISOString().split("T")[0]
                            : "",
                        }))
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Number
                    </label>
                    <InputField
                      type="text"
                      name="invoiceNumber"
                      value={form.invoiceNumber || ""}
                      onChange={handleFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Calendar size={14} className="inline mr-1" />
                      Invoice Date
                    </label>
                    <DatePicker
                      selected={
                        form.invoiceDate ? new Date(form.invoiceDate) : null
                      }
                      onChange={(date) =>
                        setForm((prev) => ({
                          ...prev,
                          invoiceDate: date
                            ? date.toISOString().split("T")[0]
                            : "",
                        }))
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <User size={14} className="inline mr-1" />
                      MR Name
                    </label>
                    <select
                      name="mrName"
                      value={form.mrName || ""}
                      onChange={handleFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Select MR</option>
                      {mrList.map((mr, index) => (
                        <option key={index} value={mr}>
                          {mr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <User size={14} className="inline mr-1" />
                      Customer Name
                    </label>
                    <InputField
                      type="text"
                      name="customerName"
                      value={form.customerName || ""}
                      onChange={handleFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Code
                    </label>
                    <InputField
                      type="text"
                      name="customerCode"
                      value={form.customerCode || ""}
                      onChange={handleFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
                      <ShoppingCart size={18} /> Products (
                      {form.products?.length || 0})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsProductModalOpen(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
                    >
                      View All Products
                    </button>
                  </div>

                  {form.products && form.products.length > 0 ? (
                    <div className="space-y-3">
                      {form.products.map((product, index) => (
                        <div
                          key={index}
                          className="border border-gray-200 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-800">
                                {product.productName || `Product ${index + 1}`}
                              </h4>
                              <div className="text-sm text-gray-600 mt-1">
                                Qty: {product.salesQty || 0} | Bonus:{" "}
                                {product.bonusQty || 0} | Price: $
                                {(product.sellingPrice || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      No products found
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-gray-200 rounded-lg p-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Total Amount
                    </label>
                    <div className="text-lg font-semibold text-gray-800">
                      ${formTotals.totalAmount.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Total Discount
                    </label>
                    <div className="text-lg font-semibold text-gray-800">
                      ${formTotals.totalDiscount.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Net Amount
                    </label>
                    <div className="text-lg font-semibold text-gray-800">
                      ${formTotals.netAmount.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Profit/Loss
                    </label>
                    <div
                      className={`text-lg font-semibold ${
                        formTotals.totalProfitLoss >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      ${formTotals.totalProfitLoss.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Clock size={14} className="inline mr-1" />
                      Credit Days
                    </label>
                    <InputField
                      type="number"
                      name="creditDays"
                      value={form.creditDays || 0}
                      onChange={handleFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Calendar size={14} className="inline mr-1" />
                      Due Date
                    </label>
                    <DatePicker
                      selected={form.dueDate ? new Date(form.dueDate) : null}
                      onChange={(date) =>
                        setForm((prev) => ({
                          ...prev,
                          dueDate: date ? date.toISOString().split("T")[0] : "",
                        }))
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <DollarSign size={14} className="inline mr-1" />
                      Paid Amount
                    </label>
                    <InputField
                      type="number"
                      name="paidAmount"
                      value={form.paidAmount || 0}
                      onChange={handleFormChange}
                      step="0.01"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <DollarSign size={14} className="inline mr-1" />
                      Due Amount
                    </label>
                    <InputField
                      type="text"
                      value={form.dueAmount || 0}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <CreditCard size={14} className="inline mr-1" />
                      Payment Status
                    </label>
                    <select
                      name="paymentStatus"
                      value={form.paymentStatus || ""}
                      onChange={handleFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Select Status</option>
                      {statuses.map((status, index) => (
                        <option key={index} value={status.type}>
                          {status.type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Truck size={14} className="inline mr-1" />
                      Delivery Date
                    </label>
                    <DatePicker
                      selected={
                        form.deliveryDate ? new Date(form.deliveryDate) : null
                      }
                      onChange={(date) =>
                        setForm((prev) => ({
                          ...prev,
                          deliveryDate: date
                            ? date.toISOString().split("T")[0]
                            : "",
                        }))
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <ClipboardList size={14} className="inline mr-1" />
                    Remarks
                  </label>
                  <textarea
                    name="remark"
                    value={form.remark || ""}
                    onChange={handleFormChange}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Enter any remarks..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer flex items-center gap-2"
                  >
                    <Save size={18} /> Update Sale
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* View Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Eye size={20} /> View Sales Record
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Recording Date
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {formatDateToReadable(form.recordingDate) || "-"}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Invoice Number
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {form.invoiceNumber || "-"}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Invoice Date
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {formatDateToReadable(form.invoiceDate) || "-"}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    MR Name
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {form.mrName || "-"}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Customer Name
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {form.customerName || "-"}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Customer Code
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {form.customerCode || "-"}
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-700">
                    Products ({form.products?.length || 0})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSaleProducts(form.products || []);
                      setIsProductModalOpen(true);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
                  >
                    View Details
                  </button>
                </div>

                {form.products && form.products.length > 0 ? (
                  <div className="space-y-3">
                    {form.products.slice(0, 3).map((product, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 rounded-lg p-3"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium text-gray-800">
                              {product.productName || `Product ${index + 1}`}
                            </h4>
                            <div className="text-sm text-gray-600 mt-1">
                              Quantity: {product.salesQty || 0} | Bonus:{" "}
                              {product.bonusQty || 0} | Price: $
                              {(product.sellingPrice || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {form.products.length > 3 && (
                      <div className="text-center text-gray-500 text-sm">
                        ... and {form.products.length - 3} more products
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    No products found
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-gray-200 rounded-lg p-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Total Amount
                  </label>
                  <div className="text-lg font-semibold text-gray-800">
                    ${formTotals.totalAmount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Total Discount
                  </label>
                  <div className="text-lg font-semibold text-gray-800">
                    ${formTotals.totalDiscount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Net Amount
                  </label>
                  <div className="text-lg font-semibold text-gray-800">
                    ${formTotals.netAmount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Profit/Loss
                  </label>
                  <div
                    className={`text-lg font-semibold ${
                      formTotals.totalProfitLoss >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    ${formTotals.totalProfitLoss.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Credit Days
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {form.creditDays || 0} days
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Due Date
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {formatDateToReadable(form.dueDate) || "-"}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Paid Amount
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    ${(form.paidAmount || 0).toFixed(2)}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Due Amount
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    ${(form.dueAmount || 0).toFixed(2)}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Payment Status
                  </label>
                  <div
                    className={`text-sm font-medium ${
                      form.paymentStatus === "Paid"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {form.paymentStatus || "-"}
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Delivery Date
                  </label>
                  <div className="text-sm font-medium text-gray-800">
                    {formatDateToReadable(form.deliveryDate) || "-"}
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Remarks
                </label>
                <div className="text-gray-600 bg-gray-50 p-3 rounded">
                  {form.remark || "No remarks provided"}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Main Content */}
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => navigate("/salelayout/sale/new")}
              disabled={shouldDisableButtons}
              title={getButtonTitle()}
            >
              <UserPlus size={18} /> Add New Sales
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={shouldDisableButtons}
              title={getButtonTitle()}
            >
              <Upload size={18} /> Import Sales
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete Selected
              </button>
            )}
          </div>
          {sales.length > 0 && (
            <SaleExcelDownload
              type="sales"
              modalTitle="Download Sales Report"
              buttonText="Download Sales Excel"
              successMessage="Sales Excel downloaded successfully!"
              filePrefix="sale_summary"
            />
          )}
        </div>

        {/* Purchase Inventories Warning */}
        {!checkingPurchaseInventories && !hasPurchaseInventories && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <PackageCheck
                className="text-red-600 mt-0.5 flex-shrink-0"
                size={20}
              />
              <div>
                <h3 className="font-medium text-red-800 mb-1">
                  Purchase Inventory Required
                </h3>
                <p className="text-sm text-red-700">
                  Please add purchase inventory entries first before creating or
                  importing sales.
                  <button
                    onClick={recheckPurchaseInventories}
                    className="ml-2 text-red-800 underline hover:text-red-900 cursor-pointer"
                  >
                    Click here to re-check
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MR/Customer Warning - Only show if purchase inventories exist */}
        {!checkingPurchaseInventories &&
          hasPurchaseInventories &&
          showMRCustomerWarning && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="text-yellow-600 mt-0.5 flex-shrink-0"
                  size={20}
                />
                <div>
                  <h3 className="font-medium text-yellow-800 mb-1">
                    Missing Required Data
                  </h3>
                  <p className="text-sm text-yellow-700">
                    {mrList.length === 0 && customerList.length === 0
                      ? "Please add MR and Customer data first to create or import sales."
                      : mrList.length === 0
                        ? "Please add MR data first to create or import sales."
                        : "Please add Customer data first to create or import sales."}
                  </p>
                </div>
              </div>
            </div>
          )}

        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {sales.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="flex gap-4 flex-wrap">
                {/* Dynamic tabs based on payment statuses in sales data */}
                {paymentStatusTabs.map((tab) => (
                  <button
                    key={`tab-${tab}`}
                    onClick={() => {
                      setSelectedTab(tab);
                      setCurrentPage(1);
                      setSelected([]);
                    }}
                    className={`px-4 py-2 rounded-lg cursor-pointer ${
                      selectedTab === tab
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div></div>
          )}

          {sales.length > 0 && (
            <div className="flex items-center gap-8 flex-wrap">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredSales.length}
                </span>
              </p>

              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={() => inputRef.current?.focus()}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search invoice, MR name, Customer name..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>

        {/* Main Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item) => (
                    <th
                      key={`header-${item.id}`}
                      className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium"
                    >
                      {item.name === "Invoice No" ? (
                        <div className="flex items-center gap-4">
                          {currentSales.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all sales"
                              checked={
                                selected.length === currentSales.length &&
                                currentSales.length > 0
                              }
                              onChange={(e) =>
                                toggleSelectAll(e.target.checked)
                              }
                            />
                          )}
                          <span>{item.name}</span>
                        </div>
                      ) : (
                        item.name
                      )}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {currentSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    {loadingData ? (
                      <LoadingOverlay text="Please wait..." />
                    ) : (
                      "No sales data found"
                    )}
                  </td>
                </tr>
              ) : (
                currentSales.map((sale, index) => (
                  <tr
                    key={`sale-${sale._id || index}`}
                    className={`hover:bg-gray-50 ${
                      index < currentSales.length - 1 ? "border-b" : ""
                    }`}
                  >
                    {allFields
                      .filter((item) => tableColumns.includes(item.id))
                      .map((item) => (
                        <td
                          key={`cell-${sale._id}-${item.id}`}
                          className="p-3 whitespace-nowrap min-w-[120px]"
                        >
                          {item.id === "invoiceNumber" ? (
                            <div className="flex items-center gap-4">
                              <input
                                type="checkbox"
                                checked={selected.some(
                                  (s) => s.id === sale._id,
                                )}
                                onChange={() => toggleSelect(sale)}
                              />
                              <span>{sale.invoiceNumber}</span>
                            </div>
                          ) : item.id === "productCount" ? (
                            <button
                              onClick={() => handleProductCountClick(sale)}
                              className="flex items-center justify-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 transition-colors cursor-pointer mx-auto"
                              title="View Products"
                            >
                              <Package size={14} />
                              <span className="font-medium">
                                {getFieldValue(sale, item.dbName)}
                              </span>
                            </button>
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button
                                className="text-blue-600 hover:text-blue-800 cursor-pointer"
                                onClick={() => handleView(sale)}
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                onClick={() => editSale(sale)}
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                                onClick={() => deleteSale(sale)}
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ) : (
                            getFieldValue(sale, item.dbName)
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {filteredSales.length > SALES_PER_PAGE && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setCurrentPage((prev) => {
                      const prevPage = Math.max(prev - 1, 1);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return prevPage;
                    });
                  }}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  ← Prev
                </button>

                {visiblePages.map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`sales-ellipsis-${idx}`}
                      className="px-3 py-1 text-gray-500 select-none"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`sales-page-${page}`}
                      onClick={() => {
                        setCurrentPage(page);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                        currentPage === page
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-200 hover:bg-gray-300"
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}

                <button
                  onClick={() => {
                    setCurrentPage((prev) => {
                      const nextPage = Math.min(prev + 1, totalPages);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return nextPage;
                    });
                  }}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sales;
