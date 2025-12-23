import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
} from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { handleAxiosError } from "../../utils/errorHandler";
import * as XLSX from "xlsx";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { data, useNavigate } from "react-router-dom";
import SaleExcelDownload from "../../excels/download/ExcelDownload";
import { useInitialSaleData } from "./IntialLoading.jsx";
import {
  fetchMRList,
  fetchCustomerList,
  fetchProducts,
} from "../../pages/ProductManager/common/fetchDropdown.jsx";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const ProgressBreakdownModal = ({
  importResult,
  onClose,
  onDownloadFailedReport,
}) => {
  if (!importResult) {
    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[100]">
        <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>
          <div className="text-center py-6">
            <div className="mb-4 text-red-500">
              <AlertCircle size={48} className="mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              No Import Data Available
            </h3>
            <p className="text-gray-600 mb-4">
              The import process did not return any data to display.
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const {
    summary = {},
    insufficientStockProducts = [],
    detailedErrors = {},
  } = importResult;

  const failedInvoices = [];

  if (Array.isArray(detailedErrors.validationErrors)) {
    failedInvoices.push(...detailedErrors.validationErrors);
  }

  if (Array.isArray(detailedErrors.importErrors)) {
    failedInvoices.push(...detailedErrors.importErrors);
  }

  if (Array.isArray(insufficientStockProducts)) {
    insufficientStockProducts.forEach((stockIssue, index) => {
      failedInvoices.push({
        invoiceNumber:
          stockIssue.affectedInvoiceNumbers?.[0] || `Stock-Error-${index + 1}`,
        row: stockIssue.row || index + 1,
        error: `Insufficient stock for ${stockIssue.productName}. Required: ${
          stockIssue.requiredForImport || stockIssue.required
        }, Available: ${stockIssue.currentStock || stockIssue.available}`,
        type: "insufficient_stock",
        productName: stockIssue.productName,
        requiredQty: stockIssue.requiredForImport || stockIssue.required,
        availableQty: stockIssue.currentStock || stockIssue.available,
        deficit: stockIssue.deficit || stockIssue.shortage,
        affectedInvoices: stockIssue.affectedInvoices || 1,
      });
    });
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[100]">
      <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Import Summary
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Complete breakdown of the import process
          </p>

          {summary.successfullyImported > 0 && failedInvoices.length === 0 && (
            <div className="mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle
                    className="text-green-500 mt-0.5 flex-shrink-0"
                    size={20}
                  />
                  <div>
                    <h4 className="font-medium text-green-800 mb-1">
                      Import Completed Successfully!
                    </h4>
                    <p className="text-sm text-green-700">
                      All {summary.successfullyImported} invoices were imported
                      successfully.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-sm font-medium text-green-800 mb-1">
                Successful
              </div>
              <div className="text-2xl font-bold text-green-600">
                {summary.successfullyImported || 0}
              </div>
              <div className="text-xs text-green-700">Invoices imported</div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm font-medium text-red-800 mb-1">
                Failed
              </div>
              <div className="text-2xl font-bold text-red-600">
                {failedInvoices.length || summary.failed || 0}
              </div>
              <div className="text-xs text-red-700">
                {
                  failedInvoices.filter(
                    (inv) => inv.type === "insufficient_stock"
                  ).length
                }{" "}
                stock issues
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-800 mb-1">
                Total Amount
              </div>
              <div className="text-2xl font-bold text-blue-600">
                ${summary.totalAmount || 0}
              </div>
              <div className="text-xs text-blue-700">Total sales value</div>
            </div>
          </div>

          {/* Failed Invoices Preview */}
          {failedInvoices.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-gray-700">
                  Failed Invoices ({failedInvoices.length} total)
                </h3>
                <button
                  onClick={onDownloadFailedReport}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer text-sm"
                >
                  <Download size={14} />
                  Download Report
                </button>
              </div>
              <div className="space-y-2">
                {failedInvoices.slice(0, 5).map((error, idx) => (
                  <div
                    key={`error-preview-${idx}`}
                    className="p-3 bg-red-50 border border-red-200 rounded-lg"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-gray-700">
                        {error.invoiceNumber || `Error ${idx + 1}`}
                      </span>
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                        {error.type === "insufficient_stock"
                          ? "Stock"
                          : "Validation"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {error.error || error.message || "Unknown error"}
                    </p>
                    {error.row && (
                      <div className="text-xs text-gray-500 mt-1">
                        Row: {error.row}
                      </div>
                    )}
                  </div>
                ))}
                {failedInvoices.length > 5 && (
                  <p className="text-sm text-gray-500 mt-2">
                    ... and {failedInvoices.length - 5} more failed invoices
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-between border-t border-gray-300 pt-4">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
          >
            Close Summary
          </button>
          {failedInvoices.length > 0 && (
            <button
              onClick={onDownloadFailedReport}
              className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer"
            >
              <Download size={16} />
              Download Full Report
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

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
  const [importProgress, setImportProgress] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [importErrorDetails, setImportErrorDetails] = useState([]);
  const [validParsedData, setValidParsedData] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [showProgressBreakdown, setShowProgressBreakdown] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [importStep, setImportStep] = useState("");
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const abortControllerRef = useRef(null);
  const [activeImportType, setActiveImportType] = useState(null); // 'all' or 'valid'
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showParsedSection, setShowParsedSection] = useState(false);

  const parseExcelQuantity = (value) => {
    if (value === null || value === undefined) return 0;
    const str = String(value).trim();
    const num = parseFloat(str.replace(/,/g, ""));
    return isNaN(num) ? 0 : Math.abs(num);
  };

  const handleProductImport = async (dataToImport, importType = "all") => {
    if (!dataToImport?.length) {
      showToast("error", "No data to import");
      return;
    }

    setIsImporting(true);
    setIsCancelled(false);
    setActiveImportType(importType);
    setImportProgress(0);
    setImportStep(importType === "all" ? "Preparing all data for import..." : "Preparing valid data for import...");
    setProcessedCount(0);
    setTotalToProcess(dataToImport.length);

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
      }));

      setImportStep("Validating data with server...");
      setImportProgress(10);

      // Check if backend endpoint exists
      try {
        const testRes = await fetch(`${backendUrl}/api/sales/check-import`, {
          method: "HEAD",
        });
        if (!testRes.ok) {
          throw new Error("Import endpoint not available");
        }
      } catch (error) {
        console.warn("Import endpoint check failed:", error);
      }

      setImportStep("Sending data to server...");
      setImportProgress(20);

      // ACTUAL API CALL - Send all data at once
      const res = await axios.post(
        `${backendUrl}/api/sales/import`,
        { invoices: transformedInvoices },
        {
          timeout: 300000,
          signal: abortControllerRef.current.signal,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 60) / progressEvent.total
              );
              setImportProgress(20 + percentCompleted);
            }
          },
        }
      );

      const result = res.data;

      setImportProgress(90);
      setImportStep("Processing server response...");

      setImportResult({
        summary: {
          successfullyImported:
            result.successCount ||
            result.importedCount ||
            result.validInvoices ||
            0,
          failed: result.failedCount || result.invalidInvoices || 0,
          totalAmount:
            result.totalAmount ||
            transformedInvoices.reduce(
              (sum, inv) => sum + (inv.totalAmount || 0),
              0
            ),
        },
        detailedErrors: {
          importErrors: result.failedInvoices || result.errors || [],
        },
      });

      setImportProgress(100);
      setImportStep(importType === "all" ? "All data import completed!" : "Valid data import completed!");
      setProcessedCount(transformedInvoices.length);

      if (onImportSuccess) {
        setTimeout(() => {
          onImportSuccess();
        }, 1000);
      }

      showToast(
        "success",
        `Successfully imported ${
          result.successCount ||
          result.importedCount ||
          result.validInvoices ||
          0
        } invoices`
      );
      setImportComplete(true);
    } catch (err) {
      if (axios.isCancel(err) || isCancelled) {
        setImportStep("Import cancelled!");
        setImportMessage("Import was cancelled by user");
        showToast("info", "Import cancelled");
      } else {
        console.error("Import error:", err);
        setImportStep("Import failed!");
        setImportMessage(
          err.response?.data?.message || err.message || "Import failed"
        );
        showToast(
          "error",
          err.response?.data?.message || err.message || "Import failed"
        );
      }
    } finally {
      setIsImporting(false);
      setActiveImportType(null);
      abortControllerRef.current = null;
    }
  };

  const handleImportAllData = async () => {
    console.log('handleImportAllData called');
    await handleProductImport(parsedData, "all");
  };

  const handleImportValidOnly = async () => {
    console.log('handleImportValidOnly called');
    await handleProductImport(validParsedData, "valid");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast("error", "File size too large. Maximum size is 20MB.");
      return;
    }

    setImportMessage("Reading file...");
    setImportProgress(10);
    setIsUploading(true);
    setIsProcessingFile(true);
    setImportErrorDetails([]);
    setValidParsedData([]);
    setImportResult(null);
    setImportComplete(false);
    setShowValidationErrors(false);
    setShowParsedSection(false);

    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      setImportProgress(30);
      setImportMessage("Processing Excel data...");

      const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      setImportProgress(50);
      setImportMessage("Parsing data...");

      // Find header row
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i].map((c) => String(c || "").trim());
        if (row.some((cell) => cell.toLowerCase().includes("invoice"))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        showToast("error", "Header row not found in first 20 rows");
        setImportProgress(null);
        setIsUploading(false);
        setIsProcessingFile(false);
        return;
      }

      const headers = rows[headerIdx].map((h) => String(h || "").trim());
      const dataRows = rows
        .slice(headerIdx + 1)
        .filter((row) =>
          row.some(
            (cell) =>
              cell !== null && cell !== undefined && String(cell).trim() !== ""
          )
        );

      const getColIndex = (colName) =>
        headers.findIndex((h) =>
          h.toLowerCase().includes(colName.toLowerCase())
        );

      const groupedInvoices = {};
      const validationErrors = [];
      let rowCount = 0;

      for (const row of dataRows) {
        rowCount++;

        const invoiceNumber = String(
          row[getColIndex("Invoice #")] || row[getColIndex("Invoice")] || ""
        ).trim();

        const customerName = String(
          row[getColIndex("Customer Name")] || ""
        ).trim();

        const customerCode = String(
          row[getColIndex("Customer Code")] || ""
        ).trim();

        const productName = String(
          row[getColIndex("Product Name")] || ""
        ).trim();

        const salesQty = parseExcelQuantity(row[getColIndex("Sales Qty")]);
        const bonusQty = parseExcelQuantity(row[getColIndex("Bonus Qty")]) || 0;
        const sellingPrice = Number(row[getColIndex("Selling Price")]) || 0;

        const rowErrors = [];

        if (!invoiceNumber) rowErrors.push("Invoice number is required");
        if (!customerName) rowErrors.push("Customer name is required");
        if (!productName) rowErrors.push("Product name is required");

        const totalQty = salesQty + bonusQty;
        if (totalQty <= 0) {
          rowErrors.push(
            `Sales quantity + Bonus quantity must be greater than 0`
          );
        }

        if (sellingPrice < 0) {
          rowErrors.push(`Selling price cannot be negative`);
        }

        if (rowErrors.length > 0) {
          validationErrors.push({
            row: rowCount + headerIdx + 1,
            type: "Validation Error",
            message: rowErrors.join(", "),
            invoiceNumber: invoiceNumber || "N/A",
            customerName: customerName || "N/A",
            productName: productName || "N/A",
            salesQty,
            bonusQty,
            sellingPrice,
          });
          continue;
        }

        if (!groupedInvoices[invoiceNumber]) {
          const creditDays = Number(row[getColIndex("Credit Days")]) || 0;
          const currentDate = new Date();
          const dueDate = new Date(currentDate);
          dueDate.setDate(currentDate.getDate() + creditDays);

          groupedInvoices[invoiceNumber] = {
            recordingDate: new Date().toISOString().split("T")[0],
            invoiceNumber,
            invoiceDate: new Date().toISOString().split("T")[0],
            mrName: String(row[getColIndex("MR Name")] || "").trim(),
            customerName,
            customerCode,
            customerId: "",
            creditDays,
            paidAmount: Number(row[getColIndex("Paid Amount")]) || 0,
            paymentStatus: "Credit",
            remark: String(row[getColIndex("Remarks")] || "").trim(),
            products: [],
            totalAmount: 0,
            dueAmount: 0,
            dueDate: dueDate.toISOString().split("T")[0],
            deliveryDate: new Date().toISOString().split("T")[0],
          };
        }

        const discount = Number(row[getColIndex("Discount")]) || 0;
        const amount = sellingPrice * Math.abs(salesQty);
        const netSellingAmount = amount - discount;
        const averageUnitPrice =
          totalQty !== 0 ? netSellingAmount / Math.abs(totalQty) : 0;

        groupedInvoices[invoiceNumber].products.push({
          productName,
          salesQty,
          bonusQty,
          totalQty,
          sellingPrice,
          amount,
          discount,
          netSellingAmount,
          averageUnitPrice,
          lc: 0,
          profitLoss: 0,
          isProductAccept: true,
          remark: "",
        });

        groupedInvoices[invoiceNumber].totalAmount += netSellingAmount;
      }

      Object.values(groupedInvoices).forEach((inv) => {
        inv.dueAmount = inv.totalAmount - inv.paidAmount;
      });

      const invoices = Object.values(groupedInvoices);
      setParsedData(invoices);
      setValidParsedData(invoices);
      setImportErrorDetails(validationErrors);

      if (validationErrors.length > 0) {
        setShowValidationErrors(true);
        showToast(
          "warning",
          `Found ${validationErrors.length} validation errors`
        );
      } else {
        showToast("success", "Excel imported successfully");
      }

      setShowParsedSection(true);
    } catch (error) {
      console.error("Error processing file:", error);
      showToast("error", "Failed to process Excel file: " + error.message);
    } finally {
      setImportProgress(null);
      setIsUploading(false);
      setIsProcessingFile(false);
    }
  };

  const downloadValidationErrorsReport = () => {
    try {
      if (!importErrorDetails || importErrorDetails.length === 0) {
        showToast("warning", "No validation errors to download");
        return;
      }

      const headers = [
        "Excel Row",
        "Invoice Number",
        "Customer Name",
        "Product Name",
        "Error Message",
      ];

      const csvRows = [headers.join(",")];

      importErrorDetails.forEach((error) => {
        const row = [
          error.row || "N/A",
          `"${error.invoiceNumber || "N/A"}"`,
          `"${error.customerName || "N/A"}"`,
          `"${error.productName || "N/A"}"`,
          `"${(error.message || "").replace(/"/g, '""')}"`,
        ];

        csvRows.push(row.join(","));
      });

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date()
        .toISOString()
        .split("T")[0]
        .replace(/-/g, "");
      const filename = `validation_errors_${timestamp}.csv`;

      link.href = url;
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      showToast(
        "success",
        `Downloaded ${importErrorDetails.length} validation errors`
      );
    } catch (error) {
      console.error("Error downloading validation errors report:", error);
      showToast(
        "error",
        "Failed to download validation errors: " + error.message
      );
    }
  };

  const resetModal = () => {
    setParsedData([]);
    setValidParsedData([]);
    setImportErrorDetails([]);
    setImportResult(null);
    setImportComplete(false);
    setImportProgress(null);
    setIsImporting(false);
    setIsCancelled(false);
    setIsUploading(false);
    setIsProcessingFile(false);
    setImportSummary(null);
    setShowValidationErrors(false);
    setImportStep("");
    setProcessedCount(0);
    setTotalToProcess(0);
    setActiveImportType(null);
    setShowParsedSection(false);
  };

  const resetParsedData = () => {
    setParsedData([]);
    setValidParsedData([]);
    setImportErrorDetails([]);
    setImportResult(null);
    setImportComplete(false);
    setShowValidationErrors(false);
    setShowParsedSection(false);
  };

  const handleCancelImport = () => {
    setIsCancelled(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsImporting(false);
    setImportProgress(null);
    setImportStep("Import cancelled by user");
    setActiveImportType(null);
    showToast("info", "Import cancelled");
  };

  const handleClose = () => {
    if (isImporting || isUploading || isProcessingFile) {
      if (
        window.confirm(
          "Import/Upload is in progress. Are you sure you want to cancel and close?"
        )
      ) {
        handleCancelImport();
        setTimeout(() => {
          resetModal();
          onClose();
        }, 500);
      }
    } else {
      resetModal();
      onClose();
    }
  };

  const getImportButtonText = () => {
    if (activeImportType === "all") {
      return "Importing All Data...";
    } else if (activeImportType === "valid") {
      return "Importing Valid Data...";
    }
    return "";
  };

  // Debug log to check state
  console.log('ImportSalesModal state:', {
    isProcessingFile,
    isUploading,
    parsedDataLength: parsedData.length,
    showParsedSection,
    isImporting,
    activeImportType
  });

  if (!isOpen) return null;

  return (
    <>
      {showProgressBreakdown && (
        <ProgressBreakdownModal
          importResult={importResult}
          onClose={() => setShowProgressBreakdown(false)}
          onDownloadFailedReport={downloadValidationErrorsReport}
        />
      )}

      {ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              disabled={isImporting || isUploading || isProcessingFile}
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Import Sales Data
            </h2>

            {/* File Upload Progress Bar */}
            {(isUploading || isProcessingFile) && (
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-blue-800">
                    {isUploading ? "Uploading File" : "Processing File"}
                  </h3>
                  {importProgress !== null && (
                    <span className="text-sm font-medium text-blue-600">
                      {importProgress}%
                    </span>
                  )}
                </div>

                {importProgress !== null && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    ></div>
                  </div>
                )}

                <div className="text-sm text-gray-600">{importMessage}</div>
              </div>
            )}

            {/* Import Complete Success Message */}
            {importComplete && importSummary && (
              <div className="mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="text-green-600" size={24} />
                    <div>
                      <h3 className="font-medium text-green-800">
                        Import Completed Successfully!
                      </h3>
                      <p className="text-sm text-green-700">
                        {importSummary.successfullyImported || 0} invoices
                        imported
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!importComplete ? (
              <>
                {/* Initial Upload Section - Only show when no data is parsed */}
                {(!showParsedSection || parsedData.length === 0) && !isUploading && !isProcessingFile ? (
                  <div className="mb-6">
                    {isSampleFile && <SampleExcelDownloadSale />}

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload Excel/CSV File
                      </label>
                      <input
                        type="file"
                        accept=".csv, .xlsx, .xls"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        disabled={isUploading || isProcessingFile}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Supports .csv, .xlsx, .xls files (Max 20MB)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6">
                    {/* File Successfully Parsed Section - ALWAYS SHOWS when parsed */}
                    {showParsedSection && parsedData.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-green-800 mb-1">
                              File Successfully Parsed
                            </h3>
                            <p className="text-sm text-green-700 mb-2">
                              Found {parsedData.length} invoices
                            </p>
                            {importErrorDetails.length > 0 && (
                              <div className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded mb-2">
                                ⚠️ Found {importErrorDetails.length} validation
                                issues
                              </div>
                            )}
                          </div>
                          {!isImporting && (
                            <button
                              onClick={resetParsedData}
                              className="text-sm text-gray-600 hover:text-gray-800 cursor-pointer px-3 py-1"
                              disabled={isUploading || isProcessingFile}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Import Progress Bar - Shows DURING import */}
                    {isImporting && (
                      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-blue-800">
                            {getImportButtonText() || "Importing Data"}
                          </h3>
                          <span className="text-sm font-medium text-blue-600">
                            {importProgress}%
                          </span>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                          <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${importProgress}%` }}
                          ></div>
                        </div>

                        <div className="text-sm text-gray-600 mb-4">
                          {importStep}
                          {totalToProcess > 0 && processedCount > 0 && (
                            <span className="ml-2">
                              ({processedCount}/{totalToProcess})
                            </span>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={handleCancelImport}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer text-sm"
                          >
                            Cancel Import
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Import Buttons - Show when NOT importing and data is parsed */}
                    {!isImporting && showParsedSection && parsedData.length > 0 && (
                      <>
                        <div className="flex flex-col gap-2 mb-4">
                          <button
                            onClick={handleImportAllData}
                            disabled={isUploading || isProcessingFile}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Import All Data
                          </button>
                          <button
                            onClick={handleImportValidOnly}
                            disabled={
                              isUploading ||
                              isProcessingFile ||
                              validParsedData.length === 0
                            }
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Import Valid Only ({validParsedData.length})
                          </button>
                        </div>

                        {importErrorDetails.length > 0 && (
                          <div className="border border-red-200 rounded-lg overflow-hidden mb-4">
                            <div className="bg-red-50 p-3 flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <AlertCircle
                                  className="text-red-600"
                                  size={18}
                                />
                                <h3 className="font-medium text-red-800">
                                  Validation Errors ({importErrorDetails.length}
                                  )
                                </h3>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    setShowValidationErrors(
                                      !showValidationErrors
                                    )
                                  }
                                  className="text-sm text-red-600 hover:text-red-800 cursor-pointer px-3 py-1 border border-red-300 rounded"
                                  disabled={isUploading || isProcessingFile}
                                >
                                  {showValidationErrors
                                    ? "Hide Details"
                                    : "Show Details"}
                                </button>
                                <button
                                  onClick={downloadValidationErrorsReport}
                                  className="text-sm bg-red-600 hover:bg-red-700 text-white cursor-pointer px-3 py-1 rounded flex items-center gap-1"
                                  disabled={isUploading || isProcessingFile}
                                >
                                  <Download size={14} />
                                  Download CSV
                                </button>
                              </div>
                            </div>

                            {showValidationErrors && (
                              <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                      <th className="p-2 text-left border-b">
                                        Excel Row
                                      </th>
                                      <th className="p-2 text-left border-b">
                                        Invoice #
                                      </th>
                                      <th className="p-2 text-left border-b">
                                        Customer
                                      </th>
                                      <th className="p-2 text-left border-b">
                                        Error Message
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {importErrorDetails
                                      .slice(0, 10)
                                      .map((error, index) => (
                                        <tr
                                          key={`validation-error-${index}`}
                                          className="hover:bg-red-50 border-b"
                                        >
                                          <td className="p-2 font-mono text-gray-700">
                                            {error.row}
                                          </td>
                                          <td className="p-2">
                                            {error.invoiceNumber || "N/A"}
                                          </td>
                                          <td className="p-2">
                                            {error.customerName || "N/A"}
                                          </td>
                                          <td className="p-2 text-red-600">
                                            {error.message}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Close Button */}
                <div className="flex justify-end items-center gap-3">
                  <button
                    onClick={handleClose}
                    disabled={isUploading || isProcessingFile}
                    className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              /* Import Complete - Show Close Button */
              <div className="flex justify-end mt-6 pt-4 border-t border-gray-300">
                <button
                  onClick={handleClose}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
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
      }
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
    document.body
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
  const inputRef = useRef(null);
  const { statuses, loading } = useInitialSaleData();
  const [errors, setErrors] = useState({});

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

        // ✅ Handle MR list - FIXED: Check if mrs.data exists and is array
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
            .filter(Boolean); // removes null / empty values

          setMrList(mrNames);
        } else {
          console.warn("MR data not in expected format:", mrs);
          setMrList([]);
        }

        // ✅ Handle customer list
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
    []
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
    []
  );

  const filteredSales = useMemo(() => {
    if (!Array.isArray(sales)) return [];

    const lowerSearch = searchTerm.trim().toLowerCase();
    const selectedTabLower = selectedTab.toLowerCase();

    return sales.filter((sale) => {
      const paymentStatus = (sale.paymentStatus || "").toLowerCase();

      if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
        return false;
      }

      if (!lowerSearch) return true;

      const fields = [sale.invoiceNumber, sale.customerName, sale.mrName];
      return fields.some((f) =>
        (f ?? "").toString().toLowerCase().includes(lowerSearch)
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
            `Sale ${sale.invoiceNumber} deleted successfully`
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
      { totalAmount: 0, totalDiscount: 0, netAmount: 0, totalProfitLoss: 0 }
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
        updatedForm
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
    }, 1000);
  };

  const showMRCustomerWarning = useMemo(() => {
    // FIXED: Check if arrays exist and have items
    const hasMRs = mrList && mrList.length > 0;
    const hasCustomers = customerList && customerList.length > 0;

    return !hasMRs && !hasCustomers;
  }, [mrList, customerList]);

  if (loading) return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-6">
      <ImportSalesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={handleImportSuccess}
        mrList={mrList}
        customerList={customerList}
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
          document.body
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
          document.body
        )}

      {/* Main Content */}
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => navigate("/salelayout/sale/new")}
              disabled={showMRCustomerWarning}
              title={
                showMRCustomerWarning
                  ? "Please add MR and Customer data first"
                  : "Create new sale"
              }
            >
              <UserPlus size={18} /> Add New Sales
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={showMRCustomerWarning}
              title={
                showMRCustomerWarning
                  ? "Please add MR and Customer data first"
                  : "Import sales data"
              }
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

        {showMRCustomerWarning && (
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
                {["All", "Cash", "Credit"].map((tab) => (
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
                                  (s) => s.id === sale._id
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
                  )
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
