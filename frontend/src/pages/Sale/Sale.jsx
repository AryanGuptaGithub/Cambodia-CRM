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
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
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

// ===================== IMPORT SALES MODAL =====================
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

  // Parse Excel date function - IMPROVED
  const parseExcelDate = (value) => {
    if (value === null || value === undefined || value === "") {
      return new Date().toISOString().split("T")[0];
    }

    try {
      // If it's already a Date object
      if (value instanceof Date && !isNaN(value)) {
        return value.toISOString().split("T")[0];
      }

      // If it's an Excel serial date (number)
      if (typeof value === "number") {
        // Excel incorrectly treats 1900 as a leap year
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + (value - 1) * 86400000);
        return date.toISOString().split("T")[0];
      }

      // If it's a string
      if (typeof value === "string") {
        const str = value.trim();

        // Remove any time portion
        const dateStr = str.split(" ")[0].split("T")[0];

        // Try direct parsing first
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split("T")[0];
        }

        // Try common date formats
        const formats = [
          // DD/MM/YYYY or MM/DD/YYYY
          /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
          // YYYY-MM-DD
          /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
          // DD-MMM-YY
          /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/i,
          // YYYY/MM/DD
          /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
        ];

        for (const format of formats) {
          const match = dateStr.match(format);
          if (match) {
            let year, month, day;

            if (format === formats[0]) {
              // DD/MM/YYYY or MM/DD/YYYY
              const part1 = parseInt(match[1]);
              const part2 = parseInt(match[2]);
              year = parseInt(match[3]);

              if (part1 > 31) {
                // Must be YYYY-MM-DD
                year = part1;
                month = part2 - 1;
                day = parseInt(match[3]);
              } else if (part2 > 12) {
                // DD/MM/YYYY
                day = part1;
                month = part2 - 1;
              } else {
                // Ambiguous, try to guess
                if (part1 <= 12 && part2 <= 31) {
                  // Assume MM/DD/YYYY
                  month = part1 - 1;
                  day = part2;
                } else {
                  // Assume DD/MM/YYYY
                  day = part1;
                  month = part2 - 1;
                }
              }
            } else if (format === formats[1] || format === formats[3]) {
              // YYYY-MM-DD or YYYY/MM/DD
              year = parseInt(match[1]);
              month = parseInt(match[2]) - 1;
              day = parseInt(match[3]);
            } else if (format === formats[2]) {
              // DD-MMM-YY
              day = parseInt(match[1]);
              const monthNames = {
                jan: 0,
                feb: 1,
                mar: 2,
                apr: 3,
                may: 4,
                jun: 5,
                jul: 6,
                aug: 7,
                sep: 8,
                oct: 9,
                nov: 10,
                dec: 11,
              };
              const monthAbbr = match[2].toLowerCase().substring(0, 3);
              month = monthNames[monthAbbr];
              year = parseInt(match[3]);
              if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
              }
            }

            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split("T")[0];
            }
          }
        }
      }

      // Final fallback
      return new Date().toISOString().split("T")[0];
    } catch (error) {
      return new Date().toISOString().split("T")[0];
    }
  };

  const StockValidationModal = () => {
    if (!showStockValidation || !stockValidationResult) return null;

    const { stockIssues = [], summary = {} } = stockValidationResult;

    // Download stock issues as Excel
    const downloadStockIssuesExcel = () => {
      try {
        const excelData = stockIssues.map((issue, index) => ({
          "S.No": index + 1,
          "Product Name": issue.productName,
          "Required Quantity": issue.totalRequired,
          "Available Stock": issue.availableStock,
          Shortage: issue.insufficientQty,
          Status: !issue.stockCheckSuccess
            ? "Product Not Found"
            : "Insufficient Stock",
          "Issue Type":
            issue.message ||
            "Error checking stock: Request failed with status code 404",
          "Required By Invoices": issue.requiredByInvoices?.length || 0,
          "Affected Invoices":
            issue.requiredByInvoices
              ?.map((inv) => `${inv.invoiceNumber} (Qty: ${inv.requiredQty})`)
              .join(", ") || "N/A",
        }));

        // Add summary
        excelData.push({});
        excelData.push({
          "Product Name": "SUMMARY",
          "Required Quantity": summary.totalRequired || 0,
          "Available Stock": summary.totalAvailable || 0,
          Shortage: stockIssues.reduce(
            (sum, issue) => sum + issue.insufficientQty,
            0,
          ),
          Status: "Total",
          "Issue Type": `${stockIssues.length} products with issues`,
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        const range = XLSX.utils.decode_range(ws["!ref"]);
        const summaryRow = range.e.r;

        // Style summary row
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: summaryRow, c: C });
          if (ws[cellAddress]) {
            if (!ws[cellAddress].s) ws[cellAddress].s = {};
            ws[cellAddress].s.font = { bold: true };
            if (C === 0) {
              ws[cellAddress].s.fill = { fgColor: { rgb: "FFCCCC" } };
            }
          }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Stock Issues");
        const fileName = `stock_issues_${new Date().toISOString().slice(0, 10)}_${Date.now()}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showToast("success", "Stock issues report downloaded successfully");
      } catch (error) {
        showToast("error", "Failed to download stock issues report");
      }
    };

    // Download CSV
    const downloadStockIssuesCSV = () => {
      try {
        const headers = [
          "Product Name",
          "Required Quantity",
          "Available Stock",
          "Shortage",
          "Status",
          "Issue Type",
          "Required By Invoices",
          "Affected Invoices",
        ];

        const csvRows = stockIssues.map((issue) => [
          `"${issue.productName}"`,
          issue.totalRequired,
          issue.availableStock,
          issue.insufficientQty,
          `"${!issue.stockCheckSuccess ? "Product Not Found" : "Insufficient Stock"}"`,
          `"${issue.message || "Error checking stock: Request failed with status code 404"}"`,
          issue.requiredByInvoices?.length || 0,
          `"${issue.requiredByInvoices?.map((inv) => `${inv.invoiceNumber}`).join(", ") || "N/A"}"`,
        ]);

        // Add summary
        csvRows.push([]);
        csvRows.push([
          '"SUMMARY"',
          summary.totalRequired || 0,
          summary.totalAvailable || 0,
          stockIssues.reduce((sum, issue) => sum + issue.insufficientQty, 0),
          '"Total"',
          `"${stockIssues.length} products with issues"`,
          "",
          "",
        ]);

        const csvContent = [
          headers.join(","),
          ...csvRows.map((row) => row.join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `stock_issues_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast("success", "Stock issues CSV downloaded successfully");
      } catch (error) {
        showToast("error", "Failed to download stock issues CSV");
      }
    };

    // Fixed: Handle proceed with import in StockValidationModal
    const handleProceedWithImport = async () => {
      const confirmProceed = await confirmDialog({
        title: "Proceed with Import",
        text: `${stockValidationResult.stockIssues.length} products have stock issues. Do you want to proceed?`,
        icon: "info",
        confirmButtonText: "Yes, Proceed",
        cancelButtonText: "Cancel",
      });

      if (confirmProceed.isConfirmed) {
        // Close the modal
        setShowStockValidation(false);

        // Start the import
        setIsImporting(true);
        setImportStep("Starting import with stock issues...");

        // Call the import function
        await handleProductImport(parsedData, true);

        // Reset modal state
        setStockValidationResult(null);
      }
    };

    // Fixed: Handle cancel stock validation
    const handleCancelStockValidation = () => {
      const confirmCancel = window.confirm(
        "Are you sure you want to cancel the import?",
      );

      if (confirmCancel) {
        setShowStockValidation(false);
        setStockValidationResult(null);
        setIsValidatingStock(false);
        setImportStep("");
        showToast("info", "Import cancelled");
      }
    };

    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[110]">
        <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-red-800 flex items-center gap-2">
                <AlertCircle size={24} />
                Stock Validation Issues Found
              </h2>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                  {stockIssues.length} Stock Issues
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={downloadStockIssuesCSV}
                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 cursor-pointer flex items-center gap-1"
                    title="Download as CSV"
                  >
                    <Download size={14} /> CSV
                  </button>
                  <button
                    onClick={downloadStockIssuesExcel}
                    className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 cursor-pointer flex items-center gap-1"
                    title="Download as Excel"
                  >
                    <Download size={14} /> Excel
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-white rounded-lg shadow border">
                <div className="text-sm text-gray-600">Total Required</div>
                <div className="text-2xl font-bold text-red-800">
                  {summary.totalRequired || 0}
                </div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg shadow border">
                <div className="text-sm text-gray-600">Total Available</div>
                <div className="text-2xl font-bold text-green-800">
                  {summary.totalAvailable || 0}
                </div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg shadow border">
                <div className="text-sm text-gray-600">Total Shortage</div>
                <div className="text-2xl font-bold text-red-800">
                  {stockIssues.reduce(
                    (sum, issue) => sum + issue.insufficientQty,
                    0,
                  )}
                </div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg shadow border">
                <div className="text-sm text-gray-600">
                  Products with Issues
                </div>
                <div className="text-2xl font-bold text-orange-800">
                  {stockIssues.length}
                </div>
              </div>
            </div>

            <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ <strong>Stock shortages detected.</strong>{" "}
                {stockIssues.length} products have insufficient stock or are not
                found in inventory.
                <br />
                <br />
                <strong>You can:</strong>
                <br />
                1. Download the stock issues report (Excel/CSV) to see details
                <br />
                2. Update your inventory in the system
                <br />
                3. Submit to proceed (backend will create adjustments)
              </p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-gray-700">
                Stock Issues Details ({stockIssues.length} products)
              </h3>
              <div className="text-sm text-gray-500">
                Click download buttons above to get full report
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-3 text-left">Product Name</th>
                    <th className="p-3 text-left">Required Quantity</th>
                    <th className="p-3 text-left">Available Stock</th>
                    <th className="p-3 text-left">Shortage</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Issue Type</th>
                  </tr>
                </thead>
                <tbody>
                  {stockIssues.map((issue, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-red-50 border-b ${
                        !issue.stockCheckSuccess ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="p-3 font-medium">
                        <div className="text-gray-700">{issue.productName}</div>
                        <div className="text-xs text-gray-500">
                          Required by {issue.requiredByInvoices?.length || 0}{" "}
                          invoices
                        </div>
                      </td>
                      <td className="p-3 font-bold text-red-700">
                        {issue.totalRequired}
                      </td>
                      <td className="p-3 font-medium text-green-700">
                        {issue.availableStock}
                      </td>
                      <td className="p-3 font-bold text-red-800">
                        {issue.insufficientQty}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            !issue.stockCheckSuccess
                              ? "bg-red-100 text-red-800"
                              : issue.insufficient
                                ? "bg-orange-100 text-orange-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {!issue.stockCheckSuccess
                            ? "Product Not Found"
                            : issue.insufficient
                              ? "Insufficient Stock"
                              : "Warning"}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {issue.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Section */}
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="font-medium text-gray-700 mb-2">Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-sm text-gray-600">Total Products</div>
                  <div className="text-lg font-bold text-gray-800">
                    {stockIssues.length}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Total Required</div>
                  <div className="text-lg font-bold text-red-700">
                    {summary.totalRequired || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Total Available</div>
                  <div className="text-lg font-bold text-green-700">
                    {summary.totalAvailable || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Total Shortage</div>
                  <div className="text-lg font-bold text-red-800">
                    {stockIssues.reduce(
                      (sum, issue) => sum + issue.insufficientQty,
                      0,
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-300">
            <div className="text-sm text-gray-600">
              {summary.totalInvoices || 0} invoices affected by stock issues
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCancelStockValidation}
                className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium cursor-pointer"
              >
                Cancel Import
              </button>
              <button
                onClick={handleCancelStockValidation}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={handleProceedWithImport}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle size={16} />
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  // Parse Excel quantity function - IMPROVED
  const parseExcelQuantity = (value) => {
    if (value === null || value === undefined || value === "") return 0;

    try {
      if (typeof value === "number") {
        return Math.max(0, value);
      }

      const str = String(value).trim();
      // Remove non-numeric characters except decimal point and minus sign
      const cleaned = str.replace(/,/g, "").replace(/[^\d.-]/g, "");
      const num = parseFloat(cleaned);

      if (isNaN(num) || !isFinite(num)) return 0;

      return Math.max(0, num);
    } catch (error) {
      return 0;
    }
  };

  // Optimized product stock check
  const findProductStockInHandOptimized = async (productName, requiredQty) => {
    try {
      console.log("🔍 Checking stock for:", productName);

      const response = await axios.post(
        `${backendUrl}/api/sales/check-stock`,
        {
          productName,
          requiredQty,
        },
        { timeout: 5000 },
      );

      if (response.data?.success !== false) {
        const stockData = response.data;
        const availableStock =
          stockData.availableStock ||
          stockData.totalStockCalculated ||
          stockData.totalStockField ||
          0;

        return {
          success: true,
          productName,
          actualProductName: stockData.productName || productName,
          availableStock,
          requiredQty,
          insufficient: availableStock < requiredQty,
          insufficientQty: Math.max(0, requiredQty - availableStock),
          calculationMethod: "backend_api",
          message:
            availableStock < requiredQty
              ? `Insufficient stock: Available ${availableStock}, Required ${requiredQty}`
              : `Stock available: ${availableStock}`,
          rawResponse: stockData,
        };
      }

      return {
        success: false,
        productName,
        actualProductName: productName,
        availableStock: 0,
        requiredQty,
        insufficient: true,
        insufficientQty: requiredQty,
        calculationMethod: "product_not_found",
        message: "Product not found in inventory",
      };
    } catch (error) {
      console.error("Stock check error:", error);
      return {
        success: false,
        productName,
        actualProductName: productName,
        availableStock: 0,
        requiredQty,
        insufficient: true,
        insufficientQty: requiredQty,
        calculationMethod: "error_fallback",
        message: `Error checking stock: ${error.message || "Unknown error"}`,
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

    resetModal(false);
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
      const workbook = XLSX.read(new Uint8Array(data), {
        type: "array",
        cellDates: true,
        cellNF: false,
        cellText: false,
      });

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      setImportMessage("Parsing rows...");

      // Find header row
      let headerIdx = -1;
      const headerKeywords = [
        "invoice",
        "customer",
        "mr",
        "product",
        "sales",
        "qty",
        "quantity",
        "amount",
        "price",
        "date",
        "status",
      ];

      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        let headerMatchCount = 0;

        for (let j = 0; j < row.length; j++) {
          const cellValue = String(row[j] || "")
            .toLowerCase()
            .trim();

          if (headerKeywords.some((keyword) => cellValue.includes(keyword))) {
            headerMatchCount++;
          }
        }

        if (headerMatchCount >= 3) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        throw new Error(
          "Could not find header row. Please make sure your Excel file has proper column headers.",
        );
      }

      const headers = rows[headerIdx].map((h) => String(h || "").trim());

      // Map column indices
      const getColIndex = (possibleNames) => {
        for (const name of possibleNames) {
          const lowerName = name.toLowerCase();
          for (let i = 0; i < headers.length; i++) {
            if (headers[i].toLowerCase().includes(lowerName)) {
              return i;
            }
          }
        }
        return -1;
      };

      const columnIndices = {
        invoiceNumber: getColIndex([
          "Invoice #",
          "Invoice",
          "InvoiceNumber",
          "Invoice No",
          "INVOICE",
        ]),
        invoiceDate: getColIndex([
          "Invoice Date",
          "Date",
          "INVOICE DATE",
          "Inv Date",
        ]),
        recordingDate: getColIndex([
          "Recording Date",
          "Record Date",
          "Entry Date",
        ]),
        mrName: getColIndex([
          "MR Name",
          "MR",
          "SalesPerson",
          "Sales Person",
          "SALESMAN",
        ]),
        customerCode: getColIndex([
          "Customer Code",
          "Code",
          "CUST CODE",
          "CustomerCode",
        ]),
        customerName: getColIndex([
          "Customer Name",
          "Customer",
          "CUSTOMER NAME",
          "Party Name",
        ]),
        productName: getColIndex([
          "Product Name",
          "Product",
          "PRODUCT NAME",
          "Item",
        ]),
        salesQty: getColIndex([
          "Sales Qty",
          "Quantity",
          "SalesQuantity",
          "Qty",
          "QTY",
        ]),
        bonusQty: getColIndex([
          "Bonus Qty",
          "Bonus",
          "BonusQuantity",
          "Bonus Qty.",
        ]),
        sellingPrice: getColIndex([
          "Selling Price",
          "Price",
          "Unit Price",
          "Rate",
          "PRICE",
        ]),
        amount: getColIndex(["Amount", "AMOUNT", "Total Amount"]),
        discount: getColIndex(["Discount", "Disc", "DISCOUNT"]),
        netAmount: getColIndex(["Net Amount", "Net", "NET AMOUNT"]),
        dueDate: getColIndex(["Due Date", "DueDate", "DUE DATE"]),
        deliveryDate: getColIndex([
          "Delivery Date",
          "DeliveryDate",
          "DELIVERY DATE",
        ]),
        creditDays: getColIndex(["Credit Days", "Credit", "CREDIT DAYS"]),
        paidAmount: getColIndex(["Paid Amount", "Paid", "PAID AMOUNT"]),
        paymentStatus: getColIndex([
          "Payment Status",
          "Status",
          "Payment",
          "PAYMENT STATUS",
        ]),
        remark: getColIndex(["Remarks", "Remark", "Note", "REMARKS"]),
      };

      // Validate required columns
      const requiredColumns = [
        { name: "Invoice Number", index: columnIndices.invoiceNumber },
        { name: "Customer Name", index: columnIndices.customerName },
        { name: "Product Name", index: columnIndices.productName },
        { name: "Sales Quantity", index: columnIndices.salesQty },
      ];

      const missingColumns = requiredColumns.filter((col) => col.index === -1);
      if (missingColumns.length > 0) {
        throw new Error(
          `Missing required columns: ${missingColumns.map((col) => col.name).join(", ")}`,
        );
      }

      const dataRows = rows.slice(headerIdx + 1);
      const groupedInvoices = {};
      const validationErrors = [];
      let rowCount = headerIdx;

      for (const row of dataRows) {
        rowCount++;

        // Skip empty rows
        if (!row || row.every((cell) => !cell || String(cell).trim() === "")) {
          continue;
        }

        // Extract values
        const getValue = (index) => {
          if (index === -1 || index >= row.length) return "";
          const value = row[index];
          return value !== undefined && value !== null
            ? String(value).trim()
            : "";
        };

        const invoiceNumber = getValue(columnIndices.invoiceNumber);
        const invoiceDate = parseExcelDate(getValue(columnIndices.invoiceDate));
        const recordingDate =
          columnIndices.recordingDate !== -1
            ? parseExcelDate(getValue(columnIndices.recordingDate))
            : invoiceDate;
        const mrName = getValue(columnIndices.mrName) || "Unknown";
        const customerCode = getValue(columnIndices.customerCode);
        const customerName = getValue(columnIndices.customerName);
        const productName = getValue(columnIndices.productName);
        const salesQty = parseExcelQuantity(getValue(columnIndices.salesQty));
        const bonusQty =
          columnIndices.bonusQty !== -1
            ? parseExcelQuantity(getValue(columnIndices.bonusQty))
            : 0;
        const sellingPrice =
          columnIndices.sellingPrice !== -1
            ? parseFloat(getValue(columnIndices.sellingPrice)) || 0
            : 0;
        const discount =
          columnIndices.discount !== -1
            ? parseFloat(getValue(columnIndices.discount)) || 0
            : 0;
        const amount =
          columnIndices.amount !== -1
            ? parseFloat(getValue(columnIndices.amount)) || 0
            : sellingPrice * salesQty;
        const netAmount =
          columnIndices.netAmount !== -1
            ? parseFloat(getValue(columnIndices.netAmount)) || 0
            : Math.max(0, amount - discount);
        const dueDate =
          columnIndices.dueDate !== -1
            ? parseExcelDate(getValue(columnIndices.dueDate))
            : invoiceDate;
        const deliveryDate =
          columnIndices.deliveryDate !== -1
            ? parseExcelDate(getValue(columnIndices.deliveryDate))
            : invoiceDate;
        const creditDays =
          columnIndices.creditDays !== -1
            ? parseInt(getValue(columnIndices.creditDays)) || 0
            : 0;
        const paidAmount =
          columnIndices.paidAmount !== -1
            ? parseFloat(getValue(columnIndices.paidAmount)) || 0
            : 0;
        const paymentStatus =
          columnIndices.paymentStatus !== -1
            ? getValue(columnIndices.paymentStatus)
            : "Credit";
        const remark = getValue(columnIndices.remark);

        // Validate row
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
            mrName: mrName || "Unknown",
            productName: productName || "N/A",
            error: rowErrors.join("; "),
            type: "validation",
          });
          continue;
        }

        // Group by invoice number
        const invoiceKey = invoiceNumber;
        if (!groupedInvoices[invoiceKey]) {
          groupedInvoices[invoiceKey] = {
            recordingDate,
            invoiceNumber,
            invoiceDate,
            mrName,
            customerName,
            customerCode,
            customerId: "",
            creditDays,
            paidAmount,
            paymentStatus,
            remark,
            products: [],
            totalAmount: 0,
            dueAmount: 0,
            dueDate,
            deliveryDate,
          };
        }

        // Add product to invoice
        groupedInvoices[invoiceKey].products.push({
          productName,
          salesQty,
          bonusQty,
          totalQty: salesQty + bonusQty,
          sellingPrice,
          amount,
          discount,
          netSellingAmount: netAmount,
          averageUnitPrice:
            salesQty + bonusQty > 0 ? netAmount / (salesQty + bonusQty) : 0,
          lc: 0,
          profitLoss: 0,
          isProductAccept: true,
          remark: "",
        });

        // Update invoice totals
        groupedInvoices[invoiceKey].totalAmount += netAmount;
      }

      // Calculate due amounts
      Object.values(groupedInvoices).forEach((inv) => {
        inv.dueAmount = Math.max(0, inv.totalAmount - inv.paidAmount);
      });

      // Filter valid invoices
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
      showToast("error", `Failed to process file: ${error.message}`);
      resetModal(false);
    } finally {
      setIsUploading(false);
      setIsProcessingFile(false);
    }
  };

  // Track failed invoices
  const trackFailedInvoices = (errors, invoices) => {
    const failedMap = new Map();

    errors.forEach((error) => {
      const invoiceNumber = error.invoiceNumber || "Unknown";

      if (!failedMap.has(invoiceNumber)) {
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
          products:
            originalInvoice?.products?.map((p) => ({
              name: p.productName,
              salesQty: p.salesQty,
              bonusQty: p.bonusQty,
              totalQty: p.totalQty,
            })) || [],
        });
      }
    });

    return Array.from(failedMap.values());
  };

  // Updated validateStockBeforeImport to always return result
  const validateStockBeforeImport = async (invoices) => {
    try {
      setIsValidatingStock(true);
      setImportMessage(`Checking stock for ${invoices.length} invoices...`);

      const stockIssues = [];
      const productStockMap = new Map();

      // Collect all products
      for (const invoice of invoices) {
        for (const product of invoice.products) {
          const requiredQty = product.salesQty + product.bonusQty;
          if (requiredQty > 0) {
            const productName = product.productName;
            if (!productStockMap.has(productName)) {
              productStockMap.set(productName, {
                productName,
                totalRequired: 0,
                requiredByInvoices: [],
                checked: false,
              });
            }
            const productData = productStockMap.get(productName);
            productData.totalRequired += requiredQty;
            productData.requiredByInvoices.push({
              invoiceNumber: invoice.invoiceNumber,
              requiredQty,
            });
          }
        }
      }

      // Check each product
      for (const [productName, productData] of productStockMap.entries()) {
        if (!productData.checked) {
          try {
            // Check if product exists
            const existsResponse = await axios.get(
              `${backendUrl}/api/sales/products/check/${encodeURIComponent(productName)}`,
              { timeout: 3000 },
            );

            if (existsResponse.data.exists) {
              // Check stock
              const stockCheck = await findProductStockInHandOptimized(
                productName,
                productData.totalRequired,
              );

              productData.availableStock = stockCheck.availableStock;
              productData.insufficient = stockCheck.insufficient;
              productData.insufficientQty = stockCheck.insufficientQty;
              productData.stockCheckSuccess = stockCheck.success;

              if (stockCheck.insufficient || !stockCheck.success) {
                stockIssues.push({
                  productName,
                  totalRequired: productData.totalRequired,
                  availableStock: stockCheck.availableStock,
                  insufficientQty: stockCheck.insufficientQty,
                  requiredByInvoices: productData.requiredByInvoices,
                  message: stockCheck.message,
                  isCritical: !stockCheck.success,
                  productExists: true,
                });
              }
            } else {
              // Product doesn't exist - consider as stock issue
              stockIssues.push({
                productName,
                totalRequired: productData.totalRequired,
                availableStock: 0,
                insufficientQty: productData.totalRequired,
                requiredByInvoices: productData.requiredByInvoices,
                message: "Product not found - will create stock adjustments",
                isCritical: false,
                productExists: false,
              });
            }

            productData.checked = true;
          } catch (error) {
            stockIssues.push({
              productName,
              totalRequired: productData.totalRequired,
              availableStock: 0,
              insufficientQty: productData.totalRequired,
              requiredByInvoices: productData.requiredByInvoices,
              message: "Could not verify product existence",
              isCritical: false,
              productExists: false,
            });
          }
        }
      }

      const stockValidationResult = {
        stockIssues,
        totalInvoices: invoices.length,
        summary: {
          totalProducts: productStockMap.size,
          totalRequired: Array.from(productStockMap.values()).reduce(
            (sum, p) => sum + p.totalRequired,
            0,
          ),
          totalAvailable: Array.from(productStockMap.values()).reduce(
            (sum, p) => sum + (p.availableStock || 0),
            0,
          ),
          totalInsufficient: stockIssues.length,
          missingProducts: stockIssues.filter((issue) => !issue.productExists)
            .length,
          lowStockProducts: stockIssues.filter(
            (issue) => issue.productExists && issue.insufficient,
          ).length,
          hasCriticalIssues: stockIssues.some((issue) => issue.isCritical),
        },
      };

      // Always return the result
      return stockValidationResult;
    } catch (error) {
      // Return empty result on error
      return {
        stockIssues: [],
        totalInvoices: invoices.length,
        summary: {
          totalProducts: 0,
          totalRequired: 0,
          totalAvailable: 0,
          totalInsufficient: 0,
          missingProducts: 0,
          lowStockProducts: 0,
          hasCriticalIssues: false,
        },
      };
    } finally {
      setIsValidatingStock(false);
    }
  };

  // Main import function
  const handleProductImport = async (dataToImport, bypassStockCheck = true) => {
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
        products: inv.products.map((product) => ({
          ...product,
          salesQty: Number(product.salesQty) || 0,
          bonusQty: Number(product.bonusQty) || 0,
          totalQty:
            (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0),
        })),
      }));

      setImportStep("Sending to server...");

      const endpoint = `${backendUrl}/api/sales/import-with-stock-deduction`;

      const res = await axios.post(
        endpoint,
        {
          invoices: transformedInvoices,
          updateInventory: true,
          importTimestamp: new Date().toISOString(),
          bypassStockCheck: true,
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

        // Start polling
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
        const message =
          err.response?.data?.message || err.message || "Import failed";
        setImportStep("Import failed");
        showToast("error", message);

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

  // Updated handleImportData function
  const handleImportData = async () => {
    if (parsedData.length === 0) {
      showToast("error", "No data to import");
      return;
    }

    // Always check stock first
    const stockValidationResult = await validateStockBeforeImport(parsedData);

    // Check if we have stock issues
    const hasStockIssues = stockValidationResult?.stockIssues?.length > 0;

    if (hasStockIssues) {
      // Show modal for user decision
      setStockValidationResult(stockValidationResult);
      setShowStockValidation(true);
      // IMPORTANT: Don't proceed here - wait for user decision in the modal
    } else {
      // No stock issues, proceed directly with import
      console.log("No stock issues, proceeding with import...");
      await handleProductImport(parsedData, false);
    }
  };
  // Handle proceed despite stock issues
  // const handleProceedAnyway = async () => {
  //   if (!stockValidationResult) {
  //     showToast("error", "Stock validation data not available");
  //     return;
  //   }

  //   setShowStockValidation(false);
  //   setShouldProceedDespiteStockIssues(true);

  //   const confirmProceed = await confirmDialog({
  //     title: "Proceed with Import",
  //     text: `${stockValidationResult.stockIssues.length} products have stock issues. The backend will create stock adjustments automatically. Do you want to proceed?`,
  //     icon: "info",
  //     confirmButtonText: "Yes, Proceed",
  //     cancelButtonText: "Cancel",
  //   });

  //   if (confirmProceed.isConfirmed) {
  //     await handleProductImport(parsedData, true);
  //   } else {
  //     setShouldProceedDespiteStockIssues(false);
  //   }
  // };

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

  // Updated FailedInvoicesModal component with proper column mapping
  const FailedInvoicesModal = ({
    isOpen,
    onClose,
    failedInvoices,
    sessionId,
  }) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [expandedRow, setExpandedRow] = useState(null);

    const toggleRowExpand = (invoiceNumber) => {
      setExpandedRow(expandedRow === invoiceNumber ? null : invoiceNumber);
    };

    const downloadFailedReport = async () => {
      try {
        setIsDownloading(true);

        if (sessionId) {
          try {
            const response = await axios.get(
              `${backendUrl}/api/sales/import/failed/${sessionId}`,
            );
            if (response.data.success && response.data.data.failedInvoices) {
              failedInvoices = response.data.data.failedInvoices;
            }
          } catch (fetchError) {}
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
            "Products Details",
          ],
          ...failedInvoices.map((inv, index) => [
            inv.row || index + 1,
            inv.invoiceNumber || "N/A",

            // CORRECTED: Get customer name from the right place
            inv.customerName ||
              inv.originalData?.customerName ||
              inv.data?.customerName ||
              "N/A",

            // CORRECTED: Get MR name from the right place
            inv.mrName || inv.originalData?.mrName || inv.data?.mrName || "N/A",

            // CORRECTED: Get product name from the right place
            inv.productName || inv.data?.productName || "N/A",

            inv.type || "processing_error",
            inv.error || inv.message || "Unknown error",
            inv.timestamp || new Date().toISOString(),
            inv.products
              ? JSON.stringify(inv.products)
              : inv.data?.products
                ? JSON.stringify(inv.data.products)
                : "N/A",
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
                    <th className="p-3 text-left border-b">Product</th>{" "}
                    {/* Added Product column */}
                    <th className="p-3 text-left border-b">Error Type</th>
                    <th className="p-3 text-left border-b">Error Message</th>
                    <th className="p-3 text-left border-b">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {failedInvoices.slice(0, 50).map((inv, idx) => (
                    <React.Fragment key={idx}>
                      <tr className="hover:bg-red-50 border-b">
                        <td className="p-3 font-mono">{inv.row || idx + 1}</td>
                        <td className="p-3 font-medium">{inv.invoiceNumber}</td>
                        <td className="p-3">
                          {/* CORRECTED: Handle both CSV format and JS object format */}
                          {inv["Customer Name"] || inv.customerName || "N/A"}
                        </td>
                        <td className="p-3">
                          {/* CORRECTED: Handle both CSV format and JS object format */}
                          {inv["MR Name"] || inv.mrName || "N/A"}
                        </td>
                        <td className="p-3">
                          {/* CORRECTED: Handle both CSV format and JS object format */}
                          {inv.Product || inv.productName || "N/A"}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              inv["Error Type"] === "validation" ||
                              inv.type === "validation"
                                ? "bg-yellow-100 text-yellow-800"
                                : inv["Error Type"] === "import_error" ||
                                    inv.type === "import_error"
                                  ? "bg-red-100 text-red-800"
                                  : inv["Error Type"] === "duplicate_error" ||
                                      inv.type === "duplicate_error"
                                    ? "bg-orange-100 text-orange-800"
                                    : inv["Error Type"] ===
                                          "processing_error" ||
                                        inv.type === "processing_error"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {/* CORRECTED: Handle both CSV format and JS object format */}
                            {inv["Error Type"] || inv.type || "error"}
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
                        <td className="p-3">
                          <button
                            onClick={() => toggleRowExpand(inv.invoiceNumber)}
                            className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          >
                            {expandedRow === inv.invoiceNumber
                              ? "Hide"
                              : "Show"}{" "}
                            Details
                          </button>
                        </td>
                      </tr>
                      {expandedRow === inv.invoiceNumber && (
                        <tr className="bg-gray-50">
                          <td colSpan="8" className="p-4">
                            {" "}
                            {/* Changed colSpan from 7 to 8 */}
                            <div className="mb-2">
                              <strong>Additional Details:</strong>
                            </div>
                            <div className="text-sm">
                              <p>
                                <strong>Timestamp:</strong>{" "}
                                {inv.timestamp || "N/A"}
                              </p>
                              <p>
                                <strong>Products Details:</strong>{" "}
                                {inv["Products Details"] || "N/A"}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        // Download sample template
                        const ws = XLSX.utils.aoa_to_sheet([
                          [
                            "Invoice #",
                            "Invoice Date",
                            "Customer Name",
                            "MR Name",
                            "Product Name",
                            "Sales Qty",
                            "Bonus Qty",
                            "Selling Price",
                            "Amount",
                            "Discount",
                            "Net Amount",
                            "Payment Status",
                            "Remark",
                          ],
                          [
                            "INV-001",
                            "2024-01-15",
                            "Customer A",
                            "John Doe",
                            "Product A",
                            10,
                            2,
                            100,
                            1000,
                            100,
                            900,
                            "Credit",
                            "Sample remark",
                          ],
                          [
                            "INV-001",
                            "2024-01-15",
                            "Customer A",
                            "John Doe",
                            "Product B",
                            5,
                            1,
                            50,
                            250,
                            25,
                            225,
                            "Credit",
                            "",
                          ],
                          [
                            "INV-002",
                            "2024-01-16",
                            "Customer B",
                            "Jane Smith",
                            "Product C",
                            20,
                            5,
                            75,
                            1500,
                            150,
                            1350,
                            "Paid",
                            "Urgent delivery",
                          ],
                        ]);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Sales Template");
                        XLSX.writeFile(wb, "sales_import_template.xlsx");
                        showToast(
                          "success",
                          "Template downloaded successfully",
                        );
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer"
                    >
                      Download sample template
                    </button>
                  </div>
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
              {isProcessingFile && (
                <div className="mt-4">
                  <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              )}
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
                <div className="flex gap-2">
                  <button
                    onClick={resetParsedData}
                    className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 border border-gray-300 rounded-lg cursor-pointer"
                  >
                    Clear
                  </button>
                  {importErrorDetails.length > 0 && (
                    <button
                      onClick={() =>
                        setShowValidationErrors(!showValidationErrors)
                      }
                      className="text-sm text-yellow-600 hover:text-yellow-800 px-3 py-1 border border-yellow-300 rounded-lg cursor-pointer"
                    >
                      {showValidationErrors ? "Hide" : "Show"} Errors
                    </button>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Invoices</div>
                  <div className="font-bold text-lg">{parsedData.length}</div>
                </div>
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Products</div>
                  <div className="font-bold text-lg">
                    {parsedData.reduce(
                      (sum, inv) => sum + (inv.products?.length || 0),
                      0,
                    )}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Amount</div>
                  <div className="font-bold text-lg">
                    $
                    {parsedData
                      .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
                      .toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Validation errors */}
          {importErrorDetails.length > 0 &&
            showParsedSection &&
            !isImporting &&
            showValidationErrors && (
              <div className="mb-6 border border-yellow-200 rounded-lg overflow-hidden">
                <div className="bg-yellow-50 p-3 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="text-yellow-600" size={18} />
                    <h3 className="font-medium text-yellow-800">
                      Validation Errors ({importErrorDetails.length})
                    </h3>
                  </div>
                  <button
                    onClick={downloadErrorReport}
                    className="text-sm text-yellow-600 hover:text-yellow-800 border border-yellow-300 px-3 py-1 rounded cursor-pointer flex items-center gap-1"
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left border-b">Row</th>
                        <th className="p-2 text-left border-b">Invoice #</th>
                        <th className="p-2 text-left border-b">Customer</th>
                        <th className="p-2 text-left border-b">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importErrorDetails.slice(0, 20).map((err, i) => (
                        <tr key={i} className="hover:bg-yellow-50 border-b">
                          <td className="p-2 font-mono">{err.row}</td>
                          <td className="p-2">{err.invoiceNumber}</td>
                          <td className="p-2">{err.customerName}</td>
                          <td className="p-2 text-yellow-600 text-xs">
                            {err.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importErrorDetails.length > 20 && (
                    <div className="p-2 text-center text-gray-500 text-sm">
                      Showing 20 of {importErrorDetails.length} errors
                    </div>
                  )}
                </div>
              </div>
            )}

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
                  <div className="mt-2 w-full bg-yellow-100 rounded-full h-2">
                    <div
                      className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.random() * 50 + 30}%` }}
                    ></div>
                  </div>
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
                <div className="flex gap-3">
                  <button
                    onClick={handleImportData}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white py-4 rounded-xl font-bold text-xl shadow-lg transition transform hover:scale-105 cursor-pointer"
                  >
                    Start Import ({parsedData.length} invoices)
                  </button>
                  <button
                    onClick={() => {
                      // Preview data
                      showToast("info", "Check console for data preview");
                    }}
                    className="px-4 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold shadow-lg transition cursor-pointer"
                    title="Preview Data"
                  >
                    <Eye size={20} />
                  </button>
                </div>
                <p className="text-center text-gray-500 text-sm mt-2">
                  Click to import {parsedData.length} invoices with{" "}
                  {parsedData.reduce(
                    (sum, inv) => sum + (inv.products?.length || 0),
                    0,
                  )}{" "}
                  products
                </p>
              </div>
            )}

          {/* Footer */}
          <div className="flex justify-between pt-4 border-t border-gray-200">
            <div>
              {showParsedSection && parsedData.length > 0 && (
                <button
                  onClick={resetParsedData}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
                >
                  Upload Different File
                </button>
              )}
            </div>
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
              {isImporting || isUploading ? "Cancel" : "Close"}
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

// ===================== PRODUCT DETAILS MODAL =====================
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

// ===================== MAIN SALES COMPONENT =====================
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
  const [selectedSale, setSelectedSale] = useState(null);
  const [mrList, setMrList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [hasPurchaseInventories, setHasPurchaseInventories] = useState(false);
  const [checkingPurchaseInventories, setCheckingPurchaseInventories] =
    useState(true);
  const [shouldCheckPurchase, setShouldCheckPurchase] = useState(true);
  const [productsList, setProductsList] = useState([]);
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
      const response = await axios.get(`${backendUrl}/api/products`, {
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
    } catch (error) {}
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
    fetchProductsList();
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
      fetchSaleSummaries();
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
              if (typeof mr === "string") {
                return mr.trim();
              }

              if (mr && typeof mr === "object") {
                if (mr.medicalRepName) {
                  return mr.medicalRepName.trim();
                }
                if (mr.name) {
                  return mr.name.trim();
                }
                if (mr.fullName) {
                  return mr.fullName.trim();
                }
                return null;
              }

              return null;
            })
            .filter(Boolean);

          setMrList(mrNames);
        } else {
          setMrList([]);
        }

        // Handle customer list
        if (customers && customers.success && Array.isArray(customers.data)) {
          setCustomerList(customers.data);
        } else {
          setCustomerList([]);
        }
      } catch (error) {
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

      if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
        return false;
      }

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
    setSelectedSale(sale);
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
        setSelectedSale(null);
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
        productsList={productsList}
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
                      <div className="py-8">
                        <Package
                          className="mx-auto text-gray-400 mb-3"
                          size={48}
                        />
                        <p>No sales data found</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Try adding a new sale or importing from Excel
                        </p>
                      </div>
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
                              <span className="font-medium">
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
                                title="View"
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
                          ) : item.id === "paymentStatus" ? (
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                sale.paymentStatus === "Paid"
                                  ? "bg-green-100 text-green-800"
                                  : sale.paymentStatus === "Credit"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : sale.paymentStatus === "Partial"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {getFieldValue(sale, item.dbName)}
                            </span>
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

              <div className="text-sm text-gray-600">
                Showing {(currentPage - 1) * SALES_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * SALES_PER_PAGE, filteredSales.length)}{" "}
                of {filteredSales.length} sales
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sales;
