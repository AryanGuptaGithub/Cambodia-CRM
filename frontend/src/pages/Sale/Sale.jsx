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
  RefreshCw,
  ArrowLeftRight,
  FileText,
  CheckCircle,
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
import { useNavigate } from "react-router-dom";
import SaleExcelDownload from "../../excels/download/ExcelDownload";
import { useInitialSaleData } from "./IntialLoading.jsx";
import {
  fetchMRList,
  fetchCustomerList,
  fetchProducts,
} from "../../pages/ProductManager/common/fetchDropdown.jsx";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

// Use React's built-in <progress> element for better accessibility
const AccessibleProgressBar = ({ value, max = 100 }) => (
  <progress
    value={value}
    max={max}
    className="w-full h-2 rounded"
    aria-label="Import progress"
  />
);

const parseDateString = (dateStr) => {
  if (!dateStr) return new Date();

  if (dateStr instanceof Date) {
    return dateStr;
  }

  if (typeof dateStr === "string") {
    const isoDate = new Date(dateStr);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    const formats = [
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
      /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/,
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/,
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let day, month, year;

        if (match[1].length === 4) {
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10) - 1;
          day = parseInt(match[3], 10);
        } else {
          day = parseInt(match[1], 10);
          month = parseInt(match[2], 10) - 1;
          year = parseInt(match[3], 10);

          if (year < 100) {
            year += 2000;
          }
        }

        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  return new Date();
};

// View Issues Button Component
const ViewIssuesButton = ({ failedCount, onClick }) => {
  if (!failedCount || failedCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer"
      title={`View ${failedCount} failed invoices`}
    >
      <FileText size={16} />
      View Issues ({failedCount} failed)
    </button>
  );
};

// Progress Breakdown Modal
const ProgressBreakdownModal = ({
  importResult,
  onClose,
  onDownloadFailedReport,
}) => {
  if (!importResult) return null;

  const {
    summary = {},
    insufficientStockProducts = [],
    detailedErrors = {},
  } = importResult;

  const failedInvoices = [
    ...(detailedErrors.importErrors || []),
    ...(detailedErrors.validationErrors || []),
  ];

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
                {summary.failed || 0}
              </div>
              <div className="text-xs text-red-700">Invoices failed</div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-800 mb-1">
                Regular Sales
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {summary.regularTransactions || 0}
              </div>
              <div className="text-xs text-blue-700">Regular transactions</div>
            </div>
          </div>

          {/* Transaction Type Breakdown */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              Transaction Types
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-700">Regular Sales</span>
                </div>
                <span className="font-medium text-gray-900">
                  {summary.regularTransactions || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Stock Issues */}
          {insufficientStockProducts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-gray-700">
                  Stock Issues ({insufficientStockProducts.length} products)
                </h3>
                <span className="text-sm text-orange-600 font-medium">
                  Requires attention
                </span>
              </div>
              <div className="space-y-2">
                {insufficientStockProducts.slice(0, 5).map((product, idx) => (
                  <div
                    key={`stock-${idx}`}
                    className="p-3 bg-orange-50 border border-orange-200 rounded-lg"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-gray-700">
                        {product.productName}
                      </span>
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                        Deficit: {product.deficit || product.shortage || 0}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Required:</span>
                        <span className="ml-2 font-medium">
                          {product.requiredForImport || product.required || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Available:</span>
                        <span className="ml-2 font-medium">
                          {product.currentStock || product.available || 0}
                        </span>
                      </div>
                    </div>
                    {product.affectedInvoices && (
                      <div className="text-xs text-gray-500 mt-2">
                        Affects {product.affectedInvoices} invoice(s)
                      </div>
                    )}
                  </div>
                ))}
                {insufficientStockProducts.length > 5 && (
                  <p className="text-sm text-gray-500 mt-2">
                    ... and {insufficientStockProducts.length - 5} more products
                    with stock issues
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Failed Invoices Preview */}
          {failedInvoices.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-gray-700">
                  Failed Invoices ({failedInvoices.length})
                </h3>
                <button
                  onClick={onDownloadFailedReport}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer text-sm"
                >
                  <FileText size={14} />
                  Download Failed Report
                </button>
              </div>
              <div className="space-y-2">
                {failedInvoices.slice(0, 3).map((error, idx) => (
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
                    <p className="text-sm text-gray-600 truncate">
                      {error.error || error.message || "Unknown error"}
                    </p>
                    {error.row && (
                      <div className="text-xs text-gray-500 mt-1">
                        Row: {error.row}
                      </div>
                    )}
                  </div>
                ))}
                {failedInvoices.length > 3 && (
                  <p className="text-sm text-gray-500 mt-2">
                    ... and {failedInvoices.length - 3} more failed invoices
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

// Import Sales Modal Component
const ImportSalesModal = ({
  isOpen,
  onClose,
  onImportSuccess,
  mrList = [],
  customerList = [],
  productsList = [],
  stockData = {},
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [importProgress, setImportProgress] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [importErrorDetails, setImportErrorDetails] = useState([]);
  const [validParsedData, setValidParsedData] = useState([]);
  const [failedInvoices, setFailedInvoices] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [showProgressBreakdown, setShowProgressBreakdown] = useState(false);
  const [importSessionId, setImportSessionId] = useState(null);
  const [abortController, setAbortController] = useState(null);
  const [progressInterval, setProgressInterval] = useState(null);
  const [detailedProgress, setDetailedProgress] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
        setProgressInterval(null);
      }
    };
  }, [progressInterval]);

  // Parse quantity from Excel
  const parseExcelQuantity = (value) => {
    if (value === null || value === undefined) return 0;

    const str = String(value).trim();

    // Regular positive number only
    const num = parseFloat(str.replace(/,/g, ""));
    return isNaN(num) ? 0 : Math.abs(num);
  };

  // Handle file upload
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
    setImportErrorDetails([]);
    setValidParsedData([]);
    setFailedInvoices([]);
    setImportResult(null);
    setImportComplete(false);

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

      // Helper function to get column index
      const getColIndex = (colName) => {
        const lowerColName = colName.toLowerCase();
        return headers.findIndex((h) => h.toLowerCase().includes(lowerColName));
      };

      // Group by invoice number
      const groupedInvoices = {};
      const validationErrors = [];
      let rowCount = 0;

      for (const row of dataRows) {
        rowCount++;
        if (rowCount % 1000 === 0) {
          setImportMessage(
            `Processing row ${rowCount} of ${dataRows.length}...`
          );
        }

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
        const sellingPrice = Number(row[getColIndex("Selling Price")]) || 0;
        const remark = String(row[getColIndex("Remarks")] || "").trim();
        const paymentStatus = String(
          row[getColIndex("Payment Status")] || ""
        ).trim();

        // Basic validation
        const rowErrors = [];
        if (!invoiceNumber) {
          rowErrors.push("Invoice number is required");
        }
        if (!customerName) {
          rowErrors.push("Customer name is required");
        }
        if (!productName) {
          rowErrors.push("Product name is required");
        }

        // Validate quantity and price
        if (salesQty <= 0) {
          rowErrors.push(
            `Sales quantity must be greater than 0 (found: ${salesQty})`
          );
        }
        if (sellingPrice < 0) {
          rowErrors.push(
            `Selling price cannot be negative (found: ${sellingPrice})`
          );
        }

        if (rowErrors.length > 0) {
          validationErrors.push({
            row: rowCount + headerIdx + 1,
            type: "Validation Error",
            message: rowErrors.join(", "),
            invoiceNumber: invoiceNumber,
            customerName: customerName,
            productName: productName,
          });
          continue;
        }

        // Initialize invoice if not exists
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
            customerName: customerName,
            customerCode: customerCode || "",
            customerId: "",
            creditDays: creditDays,
            paidAmount: Number(row[getColIndex("Paid Amount")]) || 0,
            paymentStatus: paymentStatus || "Credit",
            remark: remark,
            products: [],
            totalAmount: 0,
            dueAmount: 0,
            dueDate: dueDate.toISOString().split("T")[0],
            deliveryDate: new Date().toISOString().split("T")[0],
          };
        }

        const bonusQty = parseExcelQuantity(row[getColIndex("Bonus Qty")]) || 0;
        const discount = Number(row[getColIndex("Discount")]) || 0;

        const finalSalesQty = salesQty;
        const finalBonusQty = bonusQty;

        const totalQty = finalSalesQty + finalBonusQty;
        const amount = sellingPrice * Math.abs(salesQty);
        const netSellingAmount = amount - discount;
        const averageUnitPrice =
          totalQty !== 0 ? netSellingAmount / Math.abs(totalQty) : 0;

        groupedInvoices[invoiceNumber].products.push({
          productName: productName,
          salesQty: finalSalesQty,
          bonusQty: finalBonusQty,
          totalQty: totalQty,
          sellingPrice: sellingPrice,
          amount: amount,
          discount: discount,
          netSellingAmount: netSellingAmount,
          averageUnitPrice: averageUnitPrice,
          lc: 0,
          profitLoss: 0,
          isProductAccept: true,
          remark: "",
        });

        groupedInvoices[invoiceNumber].totalAmount += netSellingAmount;
      }

      // Calculate due amounts for valid invoices
      Object.values(groupedInvoices).forEach((invoice) => {
        invoice.dueAmount = invoice.totalAmount - invoice.paidAmount;
      });

      const invoicesArray = Object.values(groupedInvoices);
      setImportProgress(100);

      // Store valid data
      setValidParsedData(
        invoicesArray.filter(
          (inv) =>
            !validationErrors.some(
              (error) => error.invoiceNumber === inv.invoiceNumber
            )
        )
      );

      setImportErrorDetails(validationErrors);

      if (validationErrors.length > 0) {
        showToast(
          "info",
          `Found ${invoicesArray.length} invoices with ${invoicesArray.reduce(
            (total, inv) => total + (inv.products?.length || 0),
            0
          )} products. ${validationErrors.length} validation issues found.`
        );
      } else {
        showToast(
          "success",
          `Successfully parsed ${
            invoicesArray.length
          } invoices with ${invoicesArray.reduce(
            (total, inv) => total + (inv.products?.length || 0),
            0
          )} products`
        );
      }

      setParsedData(invoicesArray);
    } catch (error) {
      console.error("❌ Error processing file:", error);
      showToast("error", "Failed to process Excel file: " + error.message);
    } finally {
      setImportProgress(null);
      setIsUploading(false);
    }
  };

  // Start progress polling
  const startProgressPolling = (sessionId) => {
    setImportSessionId(sessionId);
    setIsImporting(true);
    setImportProgress(0);
    setImportMessage("Starting import...");

    // Clear any existing interval
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(
          `${backendUrl}/api/import/progress/${sessionId}`
        );

        if (response.data.success) {
          const progress = response.data;

          const progressPercentage = Math.max(
            0,
            Math.min(100, progress.progressPercentage || 0)
          );

          setImportProgress(progressPercentage);
          setDetailedProgress(progress);

          if (progress.message) {
            setImportMessage(progress.message);
          }

          if (progress.completed) {
            clearInterval(pollInterval);
            setProgressInterval(null);
            setIsImporting(false);
            setImportComplete(true);

            const importResult = {
              success: true,
              message: "Import completed",
              summary: {
                totalReceived: progress.totalInvoices || 0,
                successfullyImported: progress.successful || 0,
                failed: progress.failed || 0,
                regularTransactions: progress.transactionTypes?.regular || 0,
              },
              insufficientStockProducts:
                progress.insufficientStockProducts || [],
              detailedErrors: progress.errors || [],
            };

            processImportResult(importResult);

            // Auto-close modal after 3 seconds if successful and no failures
            if (progress.failed === 0) {
              setTimeout(() => {
                onClose();
              }, 3000);
            }
          }
        } else {
          if (response.data.completed || response.data.error) {
            clearInterval(pollInterval);
            setProgressInterval(null);
            setIsImporting(false);
            setImportComplete(true);
            setImportMessage("Import completed or failed");
          }
        }
      } catch (error) {
        console.error("Progress polling error:", error);
        if (error.response?.status === 404) {
          clearInterval(pollInterval);
          setProgressInterval(null);
          setIsImporting(false);
          setImportComplete(true);
          setImportMessage("Import session expired or completed");
        } else {
          setImportMessage("Error checking progress. Please refresh.");
        }
      }
    }, 1000);

    setProgressInterval(pollInterval);
  };

  // Process import result
  const processImportResult = (importResult) => {
    setImportResult(importResult);
    setImportProgress(100);

    // Process failed invoices
    const failed = processFailedInvoices(importResult);
    setFailedInvoices(failed);

    // Show success message
    let message = `Import completed!\n`;

    if (importResult.summary) {
      const summary = importResult.summary;
      message += `✓ ${
        summary.successfullyImported || 0
      } invoices imported successfully\n`;
      message += `✗ ${summary.failed || 0} invoices failed\n`;

      if (summary.regularTransactions > 0) {
        message += `✅ ${summary.regularTransactions} regular sales\n`;
      }
    }

    showToast("success", message);
    setImportSummary(importResult.summary);

    // Refresh sales data
    if (onImportSuccess) {
      onImportSuccess();
    }
  };

  // Process failed invoices
  const processFailedInvoices = (importResult) => {
    const failed = [];

    // Process errors from the errors array
    if (
      importResult.detailedErrors &&
      Array.isArray(importResult.detailedErrors)
    ) {
      importResult.detailedErrors.forEach((error) => {
        let type = "validation";
        const errorMsg = error.error.toLowerCase();
        if (errorMsg.includes("insufficient stock")) {
          type = "insufficient_stock";
        } else if (errorMsg.includes("already exists")) {
          type = "duplicate";
        }
        failed.push({
          invoiceNumber: error.invoiceNumber,
          row: error.index + 1,
          error: error.error,
          type: type,
          customerName: error.customerName,
          products: error.products || [], // Use empty array if products is undefined
        });
      });
    }

    return failed;
  };

  // Handle product import
  const handleProductImport = async (dataToImport = null) => {
    const importData = dataToImport || parsedData;

    if (!importData || importData.length === 0) {
      showToast("warning", "Please upload and validate a file first.");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportMessage("Preparing import...");
    setFailedInvoices([]);
    setImportResult(null);
    setImportComplete(false);

    try {
      const res = await axios.post(
        `${backendUrl}/api/sales/import`,
        importData,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 300000,
        }
      );

      if (res.data.sessionId) {
        // Async import with session ID
        startProgressPolling(res.data.sessionId);
      } else if (res.data.summary) {
        // Direct import result
        processImportResult(res.data);
        setIsImporting(false);
        setImportComplete(true);
      } else {
        // Legacy response structure
        const importResult = {
          success: res.data.success || false,
          message: res.data.message || "Import completed",
          summary: {
            totalReceived: importData.length,
            successfullyImported:
              res.data.successfullyImported || res.data.successful || 0,
            failed: res.data.failed || 0,
            validationErrors: res.data.validationErrors || 0,
            importErrors: res.data.importErrors || 0,
            processingTimeSeconds: res.data.processingTimeSeconds || 0,
            regularTransactions:
              res.data.regularTransactions ||
              res.data.summary?.regularTransactions ||
              0,
          },
          insufficientStockProducts: res.data.insufficientStockProducts || [],
          detailedErrors: res.data.detailedErrors || {},
        };

        processImportResult(importResult);
        setIsImporting(false);
        setImportComplete(true);
      }
    } catch (err) {
      console.error("❌ Import failed:", err);
      showToast("error", "Failed to import data");
      setIsImporting(false);
      setImportComplete(true);
    }
  };

  // Import only valid rows
  const handleImportValidOnly = async () => {
    if (validParsedData.length === 0) {
      showToast("warning", "No valid rows to import.");
      return;
    }

    await handleProductImport(validParsedData);
  };

  // Download failed invoices report - FIXED
  const downloadFailedInvoicesReport = () => {
    if (!failedInvoices || failedInvoices.length === 0) {
      showToast("warning", "No failed invoices to download");
      return;
    }

    try {
      // Create headers for the CSV
      const headers = [
        "Row",
        "Invoice Number",
        "Customer Name",
        "Error Type",
        "Error Message",
        "Products",
        "Sales Qty",
        "Bonus Qty",
      ];

      // Create CSV content
      const csvRows = [];

      // Add headers
      csvRows.push(headers.join(","));

      // Add data rows
      failedInvoices.forEach((invoice) => {
        // Calculate product info
        const productNames =
          invoice.products
            ?.map((p) => p.name || "")
            .filter(Boolean)
            .join("; ") || "";
        const totalSalesQty =
          invoice.products?.reduce(
            (sum, p) => sum + (parseFloat(p.salesQty) || 0),
            0
          ) || 0;
        const totalBonusQty =
          invoice.products?.reduce(
            (sum, p) => sum + (parseFloat(p.bonusQty) || 0),
            0
          ) || 0;

        const row = [
          invoice.row || "",
          `"${invoice.invoiceNumber || ""}"`,
          `"${invoice.customerName || ""}"`,
          `"${invoice.type || "validation"}"`,
          `"${(invoice.error || "").replace(/"/g, '""')}"`,
          `"${productNames}"`,
          totalSalesQty,
          totalBonusQty,
        ];

        csvRows.push(row.join(","));
      });

      // Create CSV content
      const csvContent = csvRows.join("\n");

      // Create blob and download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      // Set filename with timestamp
      const timestamp = new Date()
        .toISOString()
        .split("T")[0]
        .replace(/-/g, "");
      const filename = `failed_invoices_${timestamp}.csv`;

      link.href = url;
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      showToast(
        "success",
        `Downloaded ${failedInvoices.length} failed invoices report`
      );
    } catch (error) {
      console.error("Error downloading failed invoices report:", error);
      showToast("error", "Failed to download report: " + error.message);
    }
  };

  // Cancel import
  const cancelImport = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }

    // Clear progress interval
    if (progressInterval) {
      clearInterval(progressInterval);
      setProgressInterval(null);
    }

    setImportProgress(null);
    setIsImporting(false);
    showToast("info", "Import cancelled");
  };

  // Reset modal state
  const resetModal = () => {
    setParsedData([]);
    setValidParsedData([]);
    setImportErrorDetails([]);
    setFailedInvoices([]);
    setImportResult(null);
    setImportComplete(false);
    setImportProgress(null);
    setIsImporting(false);
    setDetailedProgress(null);
    setImportSummary(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Progress Breakdown Modal */}
      {showProgressBreakdown && (
        <ProgressBreakdownModal
          importResult={importResult}
          onClose={() => setShowProgressBreakdown(false)}
          onDownloadFailedReport={downloadFailedInvoicesReport}
        />
      )}

      {/* Main Import Modal */}
      {ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              disabled={isImporting}
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Import Sales Data
            </h2>

            {/* Import Complete Summary */}
            {importComplete && importSummary && (
              <div className="mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="text-green-500" size={24} />
                    <h3 className="font-medium text-green-800">
                      Import Completed Successfully!
                    </h3>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-green-700">
                        Total Invoices:
                      </span>
                      <span className="font-medium">
                        {importSummary.totalReceived || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-green-700">
                        Successful:
                      </span>
                      <span className="font-medium text-green-600">
                        {importSummary.successfullyImported || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-red-700">Failed:</span>
                      <span className="font-medium text-red-600">
                        {importSummary.failed || 0}
                      </span>
                    </div>
                  </div>

                  {importSummary.failed > 0 && (
                    <div className="mt-4 pt-3 border-t border-green-200">
                      <button
                        onClick={downloadFailedInvoicesReport}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer w-full justify-center"
                      >
                        <Download size={16} />
                        Download Failed Invoices Report ({importSummary.failed})
                      </button>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-green-200">
                    <button
                      onClick={() => setShowProgressBreakdown(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer w-full justify-center"
                    >
                      <FileText size={16} />
                      View Detailed Import Summary
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Import Progress Section */}
            {isImporting && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-3">
                  Importing Sales Data
                </h3>

                <div className="mb-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-blue-700">
                      {importMessage || "Processing..."}
                    </span>
                    <span className="text-sm font-medium text-blue-700">
                      {importProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    ></div>
                  </div>
                </div>

                {detailedProgress && (
                  <div className="text-sm text-gray-600 mb-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Processed Invoices:</span>
                      <span className="font-medium">
                        {detailedProgress.processedInvoices} /{" "}
                        {detailedProgress.totalInvoices}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current Batch:</span>
                      <span className="font-medium">
                        {detailedProgress.currentBatch} /{" "}
                        {detailedProgress.totalBatches}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Successful:</span>
                      <span className="font-medium text-green-600">
                        {detailedProgress.successful}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Failed:</span>
                      <span className="font-medium text-red-600">
                        {detailedProgress.failed}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={cancelImport}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
                  >
                    Cancel Import
                  </button>
                </div>
              </div>
            )}

            {/* File Upload Section (only show when not importing and not complete) */}
            {!isImporting && !importComplete && (
              <>
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
                      disabled={isUploading}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Supports .csv, .xlsx, .xls files (Max 20MB)
                    </p>
                  </div>
                </div>

                {/* Show data validation results */}
                {parsedData.length > 0 && !isUploading && (
                  <div className="mb-6">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-green-800 mb-1">
                            File Successfully Parsed
                          </h3>
                          <p className="text-sm text-green-700 mb-2">
                            Found {parsedData.length} invoices with{" "}
                            {parsedData.reduce(
                              (total, inv) =>
                                total + (inv.products?.length || 0),
                              0
                            )}{" "}
                            products
                          </p>
                          {importErrorDetails.length > 0 && (
                            <div className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                              ⚠️ Found {importErrorDetails.length} validation
                              issues
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleProductImport(parsedData)}
                            disabled={isUploading}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Import All Data
                          </button>
                          {importErrorDetails.length > 0 && (
                            <button
                              onClick={() => handleImportValidOnly()}
                              disabled={
                                isUploading || validParsedData.length === 0
                              }
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Import Valid Only ({validParsedData.length})
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show upload progress */}
                {isUploading && (
                  <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">
                        Uploading...
                      </span>
                      {importProgress !== null && (
                        <span className="text-sm text-blue-700">
                          {Math.round(importProgress)}%
                        </span>
                      )}
                    </div>
                    {importProgress !== null && (
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center gap-3">
                  <div className="text-sm text-gray-500">
                    Ensure your Excel file has the correct columns
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleClose}
                      disabled={isUploading}
                      className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {isUploading ? "Processing..." : "Cancel"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Close button when import is complete */}
            {importComplete && (
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
  const [productsList, setProductsList] = useState([]);
  const inputRef = useRef(null);
  const { statuses, productNames, loading } = useInitialSaleData();
  const [errors, setErrors] = useState({});
  const [stockData, setStockData] = useState({});
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);
  const [failedInvoices, setFailedInvoices] = useState([]);
  const [importResult, setImportResult] = useState(null);

  const [form, setForm] = useState({
    _id: null,
    recordingDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    mrName: "",
    customerCode: "",
    productName: "",
    salesQty: 0,
    bonusQty: 0,
    totalQty: 0,
    sellingPrice: 0.0,
    amount: 0,
    discount: 0,
    netSellingAmount: 0,
    averageUnitPrice: 0,
    profitLoss: 0,
    creditDays: 0,
    dueDate: "",
    deliveryDate: "",
    paidAmount: 0,
    dueAmount: 0,
    paymentStatus: "",
    remark: "",
    products: [],
  });

  const SALES_PER_PAGE = 9;

  // Fetch stock data
  const fetchStockData = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/sales/stock/report-in-hand`,
        { timeout: 30000 }
      );
      if (response.data && Array.isArray(response.data)) {
        const stockMap = {};
        response.data.forEach((item) => {
          if (item.productName) {
            let currentStock = 0;
            if (item.batches && Array.isArray(item.batches)) {
              currentStock = item.batches.reduce(
                (total, batch) => total + (batch.boxes || 0),
                0
              );
            } else if (item.totalBoxes !== undefined) {
              currentStock = item.totalBoxes;
            } else if (item.currentStock !== undefined) {
              currentStock = item.currentStock;
            }
            stockMap[item.productName] = currentStock;
          }
        });
        setStockData(stockMap);
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      if (error.code !== "ECONNABORTED") {
        showToast("error", "Failed to fetch stock data");
      }
    }
  };

  const checkProductStock = (productName, requiredQty) => {
    const availableStock = stockData[productName] || 0;
    return {
      hasSufficientStock: availableStock >= requiredQty,
      availableStock,
      requiredQty,
    };
  };

  const handleImportClick = () => {
    if (!mrList.length || !customerList.length || !productsList.length) {
      showToast(
        "error",
        `Please ensure all required data is loaded before importing sales:
      ${!mrList.length ? "\n• Medical Representatives" : ""}
      ${!customerList.length ? "\n• Customers" : ""}
      ${!productsList.length ? "\n• Products" : ""}`
      );
      return;
    }

    setShowImportModal(true);
  };

  const fetchSaleSummaries = async () => {
    try {
      setLoadingData(true);
      let url = `${backendUrl}/api/sales/all`;

      const res = await fetch(url);
      if (!res.ok) {
        const fallbackRes = await fetch(
          `${backendUrl}/api/sales?page=1&limit=1000`
        );
        if (!fallbackRes.ok) throw new Error("Failed to fetch sale summaries");

        const data = await fallbackRes.json();
        const salesData = data.summaries || data.data || data;

        // Filter out any return or exchange transactions
        const filteredData = salesData.filter(
          (sale) => !sale.isReturn && !sale.isExchange
        );

        setSales(filteredData);
      } else {
        const data = await res.json();
        const salesData = data.summaries || data.data || data;

        // Filter out any return or exchange transactions
        const filteredData = salesData.filter(
          (sale) => !sale.isReturn && !sale.isExchange
        );

        setSales(filteredData);
      }
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
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
        const [mrs, customers, products] = await Promise.all([
          fetchMRList(),
          fetchCustomerList(),
          fetchProducts(),
        ]);

        if (mrs?.success && Array.isArray(mrs.data)) {
          const mrNames = mrs.data
            .map((mr) => {
              if (typeof mr === "string") return mr;
              if (mr && typeof mr === "object") {
                return (
                  mr.medicalRepName ||
                  mr.name ||
                  mr.MRId ||
                  mr._id ||
                  "Unknown MR"
                );
              }
              return "Unknown MR";
            })
            .filter((name) => name && name !== "Unknown MR");

          setMrList(mrNames);
        } else {
          console.warn("MR list data is not in expected format:", mrs);
          setMrList([]);
        }

        if (customers?.success && Array.isArray(customers.data)) {
          const customerOptions = customers.data.map((customer) => ({
            id: customer._id || customer.id,
            code: customer.customerCode || customer.code || "",
            name: customer.name || customer.customerName || "Unknown Customer",
            number: customer.customerNumber || "",
            address: customer.address || "",
            zone: customer.zone || "",
          }));
          setCustomerList(customerOptions);
        } else {
          console.warn(
            "Customer list data is not in expected format:",
            customers
          );
          setCustomerList([]);
        }

        if (products?.success && Array.isArray(products.data)) {
          setProductsList(products.data);
        } else {
          console.warn(
            "Products list data is not in expected format:",
            products
          );
          setProductsList([]);
        }

        await fetchStockData();
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
        showToast("error", "Failed to load dropdown data");
        setMrList([]);
        setCustomerList([]);
        setProductsList([]);
      }
    };

    fetchDropdownData();
  }, []);

  // Handle import success
  const handleImportSuccess = () => {
    fetchSaleSummaries();
    fetchStockData();
  };

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> sales?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales/delete-batch`, {
          data: { ids: selected.map((s) => s.id) },
          timeout: 120000,
        });

        if (res.status === 200) {
          showToast("success", "Selected Sales deleted successfully");
          fetchSaleSummaries();
          setSelected([]);
          await fetchStockData();
        }
      } catch (error) {
        console.error("Delete batch error:", error);
        showToast("error", "Failed to delete selected sales");
      }
    }
  };

  // Table columns and fields
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
    if (!Array.isArray(sales)) {
      console.warn("Sales is not an array:", sales);
      return [];
    }

    const lowerSearch = searchTerm.trim().toLowerCase();
    const selectedTabLower = selectedTab.toLowerCase();

    return sales.filter((sale) => {
      const paymentStatus = (sale.paymentStatus || "pending").toLowerCase();

      if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
        return false;
      }

      if (!lowerSearch) {
        return true;
      }

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

  const capitalizeFirstLetter = (string) => {
    if (!string) return "--";
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  const getFieldValue = (sale, dbName) => {
    if (dbName === "customerName") {
      return sale?.customerName || "--";
    }

    if (dbName === "products") {
      const productCount = sale.products?.length || 0;
      return productCount;
    }

    if (
      ["recordingDate", "dueDate", "deliveryDate", "invoiceDate"].includes(
        dbName
      )
    ) {
      return formatDateToReadable(sale[dbName]) || "--";
    }

    if (dbName === "amount") {
      return Math.ceil(sale.amount || 0);
    }

    if (dbName === "totalAmount") {
      return `${Math.ceil(sale.totalAmount || 0).toLocaleString()}`;
    }

    if (
      dbName === "salesQty" ||
      dbName === "totalQty" ||
      dbName === "bonusQty"
    ) {
      return Math.ceil(sale[dbName] || 0);
    }

    if (dbName === "paymentStatus") {
      return sale.paymentStatus || "--";
    }

    const value = sale[dbName];
    if (value && typeof value === "object") {
      return value.name || value.displayName || JSON.stringify(value);
    }

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
    setForm({ ...sale });
    setIsViewModalOpen(true);
  };

  const editSale = (sale) => {
    setForm({ ...sale });
    setIsEditModalOpen(true);
  };

  const deleteSale = async (sale) => {
    if (!sale._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${sale.invoiceNumber}</b>?`,
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
            `Sale <b>${sale.invoiceNumber}</b> deleted successfully`
          );
          fetchSaleSummaries();
          await fetchStockData();
        }
      } catch (error) {
        showToast("error", "Failed to delete sale.");
      }
    }
  };

  const showMRCustomerWarning = useMemo(() => {
    return mrList.length === 0 || customerList.length === 0;
  }, [mrList, customerList]);

  if (loading) return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-6">
      {/* Import Sales Modal */}
      <ImportSalesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={handleImportSuccess}
        mrList={mrList}
        customerList={customerList}
        productsList={productsList}
        stockData={stockData}
      />

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
                  : ""
              }
            >
              <UserPlus size={18} /> Add New Sales
            </button>

            <button
              onClick={handleImportClick}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={showMRCustomerWarning}
              title={
                showMRCustomerWarning
                  ? "Please add MR and Customer data first"
                  : ""
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

        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {sales.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="flex gap-4 flex-wrap">
                {["All", "Paid", "Credit"].map((tab) => (
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
                    {capitalizeFirstLetter(tab)}
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
                  {filteredSales.length}{" "}
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
                              <span className="capitalize">
                                {sale.invoiceNumber}
                              </span>
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
