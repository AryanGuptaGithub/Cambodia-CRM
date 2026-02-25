  import React, {
    useState,
    useEffect,
    useMemo,
    useRef,
    useCallback,
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
  import SaleExcelDownload from "../../excels/download/SaleExcelDownload.jsx";
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

  // ✅ Read the sample download flag
  const isSampleDownloadFile = import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";

  //suraj
  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };
  };

  // Stock Validation Modal Component
  const StockValidationModal = ({
    isOpen,
    onClose,
    stockValidationResult,
    onProceed,
    onCancel,
  }) => {
    const [isDownloading, setIsDownloading] = useState(false);

    if (!isOpen || !stockValidationResult) return null;

    const {
      stockIssues = [],
      summary = {},
      importBlocked = false,
      message = "",
    } = stockValidationResult;

    const isBlocked =
      importBlocked ||
      (summary.hasInsufficientStock && summary.totalInsufficient > 0);

    const downloadStockIssuesExcel = useCallback(() => {
      try {
        const excelData = stockIssues.map((issue, index) => ({
          "S.No": index + 1,
          "Product Name": issue.productName,
          "Required Quantity": issue.totalRequired,
          "Available Stock": issue.availableStock,
          Shortage: issue.insufficientQty || 0,
          Status: issue.productExists
            ? issue.insufficient
              ? "Insufficient Stock"
              : "Available"
            : "Product Not Found",
          "Issue Type": issue.message,
          "Affected Invoices": issue.requiredByInvoices?.length || 0,
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Stock Issues");

        const fileName = `stock_issues_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showToast("success", "Stock issues report downloaded");
      } catch (error) {
        console.error("Download error:", error);
        showToast("error", "Failed to download report");
      }
    }, [stockIssues]);

    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[110]">
        <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <div
            className={`mb-6 ${isBlocked ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"} border-2 rounded-xl p-5`}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold flex items-center gap-2">
                {isBlocked ? (
                  <>
                    <AlertCircle size={24} className="text-red-800" />
                    <span className="text-red-800">
                      ❌ Insufficient Stock - Import Blocked
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={24} className="text-yellow-800" />
                    <span className="text-yellow-800">
                      ⚠️ Missing Products - Review Required
                    </span>
                  </>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${isBlocked ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}
                >
                  {stockIssues.length} Stock Issues
                </span>
                <button
                  onClick={downloadStockIssuesExcel}
                  disabled={isDownloading}
                  className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Download as Excel"
                >
                  <Download size={14} /> Excel
                </button>
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
                <div className="text-sm text-gray-600">Insufficient Stock</div>
                <div className="text-2xl font-bold text-red-800">
                  {summary.totalInsufficient || 0}
                </div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg shadow border">
                <div className="text-sm text-gray-600">Missing Products</div>
                <div className="text-2xl font-bold text-orange-800">
                  {summary.missingProducts || 0}
                </div>
              </div>
            </div>

            <div
              className={`p-3 ${isBlocked ? "bg-red-100 border-red-300" : "bg-yellow-100 border-yellow-300"} border rounded-lg`}
            >
              <p
                className={`text-sm font-medium ${isBlocked ? "text-red-900" : "text-yellow-900"}`}
              >
                {isBlocked ? (
                  <>
                    ⛔ <strong>IMPORT BLOCKED:</strong>{" "}
                    {summary.totalInsufficient || 0} products have insufficient
                    stock.
                    <br />
                    <br />
                    <strong>You must:</strong>
                    <br />
                    1. Update your inventory to have sufficient stock
                    <br />
                    2. Or reduce quantities in your import file
                    <br />
                    3. Then try the import again
                  </>
                ) : (
                  <>
                    ⚠️ <strong>Missing Products Found:</strong>{" "}
                    {summary.missingProducts || 0} products are not in inventory.
                    <br />
                    <br />
                    <strong>These products will:</strong>
                    <br />
                    1. Be created automatically during import
                    <br />
                    2. Have zero initial stock (you'll need to add inventory
                    later)
                    <br />
                    3. Appear in your product catalog
                    <br />
                    <br />
                    <strong>
                      You can proceed if you want to create these products.
                    </strong>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-gray-700">
                Stock Issues Details ({stockIssues.length} products)
              </h3>
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
                  </tr>
                </thead>
                <tbody>
                  {stockIssues.map((issue, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-gray-50 border-b ${
                        !issue.productExists
                          ? "bg-yellow-50"
                          : issue.insufficient
                            ? "bg-red-50"
                            : ""
                      }`}
                    >
                      <td className="p-3 font-medium">{issue.productName}</td>
                      <td className="p-3 font-bold text-red-700">
                        {issue.totalRequired}
                      </td>
                      <td className="p-3 font-medium text-green-700">
                        {issue.availableStock}
                      </td>
                      <td className="p-3 font-bold text-red-800">
                        {issue.insufficientQty || 0}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            !issue.productExists
                              ? "bg-yellow-100 text-yellow-800"
                              : issue.insufficient
                                ? "bg-red-100 text-red-800"
                                : "bg-green-100 text-green-800"
                          }`}
                        >
                          {!issue.productExists
                            ? "⚠️ Missing"
                            : issue.insufficient
                              ? "❌ Insufficient"
                              : "✅ Available"}
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
              {summary.totalInvoices || 0} invoices affected
            </div>
            <div className="flex gap-3">
              {isBlocked ? (
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium cursor-pointer"
                >
                  Cancel Import
                </button>
              ) : (
                <>
                  <button
                    onClick={onCancel}
                    className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onProceed}
                    className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle size={16} />
                    Proceed with Missing Products
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  const MRValidationModal = ({
    isOpen,
    onClose,
    mrValidationResult,
    onProceed,
  }) => {
    if (!isOpen || !mrValidationResult) return null;

    const { mrIssues = [], summary = {}, totalInvoices = 0 } = mrValidationResult;

    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[110]">
        <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-yellow-800 flex items-center gap-2">
                <AlertCircle size={24} />
                ⚠️ Invalid MRs Detected
              </h2>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                {mrIssues.length} Invalid MRs
              </span>
            </div>

            <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
              <p className="text-sm text-yellow-900 font-medium">
                ⚠️ <strong>Warning:</strong> The following MRs are not registered
                in the Staff system.
                <br />
                <br />
                <strong>These invoices will still be imported, but:</strong>
                <br />
                1. MR names will be saved as provided
                <br />
                2. You can add these MRs to Staff module later
                <br />
                3. Reports may show "Unknown" for unregistered MRs
                <br />
                <br />
                <strong className="text-yellow-700">
                  You can proceed with import if this is acceptable.
                </strong>
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3 text-lg">
              Invalid MRs List ({mrIssues.length} MRs)
            </h3>

            <div className="overflow-x-auto border-2 border-yellow-200 rounded-lg max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-yellow-100 sticky top-0">
                  <tr>
                    <th className="p-3 text-left font-bold">MR Name</th>
                    <th className="p-3 text-left font-bold">Error</th>
                    <th className="p-3 text-left font-bold">Affected Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {mrIssues.map((issue, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-yellow-50 border-b border-yellow-100"
                    >
                      <td className="p-3 font-bold text-yellow-700">
                        {issue.mrName}
                      </td>
                      <td className="p-3 text-yellow-600 text-xs font-medium">
                        {issue.message}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">
                          {issue.affectedCount} invoices
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t-2 border-gray-300">
            <div className="text-sm text-gray-600">
              <strong className="text-yellow-600">Warning:</strong> MRs not found
              in Staff module
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={onProceed}
                className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium cursor-pointer flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  const FailedInvoicesModal = ({ isOpen, onClose, failedInvoices }) => {
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
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left border-b">Row</th>
                    <th className="p-3 text-left border-b">Invoice #</th>
                    <th className="p-3 text-left border-b">Customer</th>
                    <th className="p-3 text-left border-b">MR Name</th>
                    <th className="p-3 text-left border-b">Error Message</th>
                  </tr>
                </thead>
                <tbody>
                  {failedInvoices.slice(0, 50).map((inv, idx) => (
                    <tr key={idx} className="hover:bg-red-50 border-b">
                      <td className="p-3 font-mono">{inv.row || idx + 1}</td>
                      <td className="p-3 font-medium">{inv.invoiceNumber}</td>
                      <td className="p-3">{inv.customerName || "N/A"}</td>
                      <td className="p-3">{inv.mrName || "N/A"}</td>
                      <td className="p-3 text-red-600 max-w-xs">
                        {inv.error || inv.message || "Unknown error"}
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

          <div className="flex justify-end border-t border-gray-300 pt-4">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  const ImportSalesModal = ({
    isOpen,
    onClose,
    onImportSuccess,
    mrList = [],
  }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [parsedData, setParsedData] = useState([]);
    const [importMessage, setImportMessage] = useState("");
    const [importErrorDetails, setImportErrorDetails] = useState([]);
    const [isImporting, setIsImporting] = useState(false);
    const [showParsedSection, setShowParsedSection] = useState(false);
    const [importStep, setImportStep] = useState("");
    const [isCancelled, setIsCancelled] = useState(false);
    const abortControllerRef = useRef(null);
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [importSaleType, setImportSaleType] = useState("normal");
    const [serverProgress, setServerProgress] = useState(0);
    const [serverProcessed, setServerProcessed] = useState(0);
    const [serverTotal, setServerTotal] = useState(0);
    const [sessionId, setSessionId] = useState(null);
    const [failedInvoices, setFailedInvoices] = useState([]);
    const [showFailedInvoices, setShowFailedInvoices] = useState(false);
    const [showStockValidation, setShowStockValidation] = useState(false);
    const [stockValidationResult, setStockValidationResult] = useState(null);
    const [isValidatingStock, setIsValidatingStock] = useState(false);
    const [mrValidationResult, setMrValidationResult] = useState(null);
    const [showMRValidation, setShowMRValidation] = useState(false);
    const [isValidatingMR, setIsValidatingMR] = useState(false);

    const pollingIntervalRef = useRef(null);

    const clearPolling = useCallback(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }, []);

    const resetModal = useCallback(
      (fullReset = true) => {
        if (fullReset) {
          setParsedData([]);
          setImportErrorDetails([]);
          setFailedInvoices([]);
          setSessionId(null);
          setStockValidationResult(null);
          setMrValidationResult(null);
        }

        setShowParsedSection(false);
        setShowFailedInvoices(false);
        setShowStockValidation(false);
        setShowMRValidation(false);
        setServerProgress(0);
        setServerProcessed(0);
        setServerTotal(0);
        setIsImporting(false);
        setIsValidatingStock(false);
        setIsValidatingMR(false);
        setIsUploading(false);
        setIsProcessingFile(false);
        setImportStep("");
        setIsCancelled(false);
        clearPolling();

        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = "";
      },
      [clearPolling],
    );

    const handleClose = useCallback(() => {
      if (isImporting || isUploading || isProcessingFile) {
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
    }, [isImporting, isUploading, isProcessingFile, resetModal, onClose]);

    const handleCancelImport = useCallback(() => {
      setIsCancelled(true);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      clearPolling();
      setIsImporting(false);
      setImportStep("Import cancelled by user");
      showToast("info", "Import cancelled");
    }, [clearPolling]);

    // ── parseExcelDate ────────────────────────────────────────────────────────
    const parseExcelDate = useCallback((value) => {
      if (value === null || value === undefined || value === "") {
        return new Date().toISOString().split("T")[0];
      }
      try {
        if (value instanceof Date && !isNaN(value)) {
          return value.toISOString().split("T")[0];
        }
        if (typeof value === "number") {
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + (value - 1) * 86400000);
          return date.toISOString().split("T")[0];
        }
        if (typeof value === "string") {
          const str = value.trim();
          const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (ddmmyyyy) {
            const d = new Date(
              parseInt(ddmmyyyy[3]),
              parseInt(ddmmyyyy[2]) - 1,
              parseInt(ddmmyyyy[1]),
            );
            if (!isNaN(d)) return d.toISOString().split("T")[0];
          }
          const yyyymmdd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (yyyymmdd) {
            const d = new Date(
              parseInt(yyyymmdd[1]),
              parseInt(yyyymmdd[2]) - 1,
              parseInt(yyyymmdd[3]),
            );
            if (!isNaN(d)) return d.toISOString().split("T")[0];
          }
          const parsed = new Date(str);
          if (!isNaN(parsed)) return parsed.toISOString().split("T")[0];
        }
        return new Date().toISOString().split("T")[0];
      } catch {
        return new Date().toISOString().split("T")[0];
      }
    }, []);

    // ── parseExcelQuantity ────────────────────────────────────────────────────
    const parseExcelQuantity = useCallback((value) => {
      if (value === null || value === undefined || value === "") return 0;
      try {
        if (typeof value === "number") return Math.max(0, value);
        const cleaned = String(value)
          .trim()
          .replace(/,/g, "")
          .replace(/[^\d.-]/g, "");
        const num = parseFloat(cleaned);
        if (isNaN(num) || !isFinite(num)) return 0;
        return Math.max(0, num);
      } catch {
        return 0;
      }
    }, []);

    // ── parseExcelAmount ──────────────────────────────────────────────────────
    const parseExcelAmount = useCallback((value) => {
      if (value === null || value === undefined || value === "") return 0;
      try {
        if (typeof value === "number") return Math.max(0, value);
        const cleaned = String(value)
          .trim()
          .replace(/[$,\s]/g, "")
          .replace(/[^\d.-]/g, "");
        const num = parseFloat(cleaned);
        if (isNaN(num) || !isFinite(num)) return 0;
        return Math.max(0, num);
      } catch {
        return 0;
      }
    }, []);

    const parseExcelFile = useCallback(
      async (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const data = new Uint8Array(evt.target.result);
              const workbook = XLSX.read(data, {
                type: "array",
                cellDates: true,
                cellNF: false,
                cellText: false,
              });

              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];

              // Convert all rows to an array of arrays
              const rows = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: "",
                raw: true,
              });

              console.log("RAW EXCEL DATA - Total rows in sheet:", rows.length);
              console.log("First 5 rows:", rows.slice(0, 5));

              // ----- Find the header row -----
              const isHeaderRow = (row) => {
                if (!Array.isArray(row) || row.length === 0) return false;
                const rowStr = row
                  .map((c) =>
                    String(c ?? "")
                      .toLowerCase()
                      .trim(),
                  )
                  .join(" ");
                return rowStr.includes("invoice");
              };

              let headerIndex = -1;
              for (let i = 0; i < Math.min(rows.length, 20); i++) {
                if (isHeaderRow(rows[i])) {
                  headerIndex = i;
                  break;
                }
              }

              if (headerIndex === -1) {
                reject(
                  new Error(
                    "Could not find header row. Make sure your file has a row containing 'Invoice #' or 'Invoice'.",
                  ),
                );
                return;
              }

              const headerRow = rows[headerIndex];
              const allDataRows = rows.slice(headerIndex + 1);
              console.log(`All data rows (raw) count: ${allDataRows.length}`);
              console.log("First 5 raw data rows:", allDataRows.slice(0, 5));

              // Filter out completely empty rows (all cells are empty strings, null, or undefined)
              const dataRows = allDataRows.filter((row, idx) => {
                const hasContent =
                  Array.isArray(row) &&
                  row.some(
                    (cell) =>
                      cell !== null &&
                      cell !== undefined &&
                      String(cell).trim() !== "",
                  );
                // Log the first few empty rows to see why they are considered empty
                if (!hasContent && idx < 10) {
                  console.log(`Row ${idx} considered empty:`, row);
                }
                return hasContent;
              });

              console.log(
                `Header found at row ${headerIndex + 1}. ` +
                  `Data rows available: ${dataRows.length} (total rows after header: ${allDataRows.length})`,
              );

              if (dataRows.length === 0) {
                reject(
                  new Error(
                    `No data rows found. Your file has a header at row ${
                      headerIndex + 1
                    } but all rows below it are empty according to our check.\n` +
                      `Here are the first 3 raw data rows for inspection:\n${JSON.stringify(allDataRows.slice(0, 3), null, 2)}`,
                  ),
                );
                return;
              }

              // ----- Flexible column mapping (unchanged) -----
              const headerMap = {};
              headerRow.forEach((cell, idx) => {
                if (cell !== null && cell !== undefined) {
                  const key = String(cell).toLowerCase().trim();
                  if (key) headerMap[key] = idx;
                }
              });

              const findCol = (aliases) => {
                for (const alias of aliases) {
                  if (headerMap[alias] !== undefined) return headerMap[alias];
                }
                for (const alias of aliases) {
                  const found = Object.keys(headerMap).find((k) =>
                    k.includes(alias),
                  );
                  if (found !== undefined) return headerMap[found];
                }
                return -1;
              };

              const col = {
                recordingDate: findCol([
                  "recording date",
                  "recording_date",
                  "rec date",
                ]),
                invoiceNumber: findCol([
                  "invoice #",
                  "invoice#",
                  "invoice no",
                  "invoice number",
                  "invoice_number",
                  "invoice",
                ]),
                invoiceDate: findCol([
                  "invoice date",
                  "invoice_date",
                  "inv date",
                ]),
                mrName: findCol([
                  "mr name",
                  "mr_name",
                  "mr",
                  "medical rep",
                  "medical rep name",
                  "medrep",
                ]),
                customerCode: findCol([
                  "customer code",
                  "customer_code",
                  "cust code",
                  "cust_code",
                  "customer id",
                ]),
                productName: findCol([
                  "product name",
                  "product_name",
                  "item name",
                  "item_name",
                  "product",
                ]),
                salesQty: findCol([
                  "sales qty",
                  "sales_qty",
                  "salesqty",
                  "sale qty",
                  "sale_qty",
                  "qty",
                  "quantity",
                  "sales quantity",
                ]),
                bonusQty: findCol([
                  "bonus qty",
                  "bonus_qty",
                  "bonusqty",
                  "bonus quantity",
                  "bonus",
                ]),
                sellingPrice: findCol([
                  "selling price",
                  "selling_price",
                  "sellingprice",
                  "price",
                  "unit price",
                  "sale price",
                ]),
                discount: findCol([
                  "discount",
                  "disc",
                  "disc amount",
                  "discount amount",
                ]),
                creditDays: findCol(["credit days", "credit_days", "creditdays"]),
                paidAmount: findCol([
                  "paid amount",
                  "paid_amount",
                  "paidamount",
                  "paid",
                ]),
                paymentStatus: findCol([
                  "payment status",
                  "payment_status",
                  "paymentstatus",
                  "status",
                  "pay status",
                ]),
                remarks: findCol([
                  "remarks",
                  "remark",
                  "notes",
                  "note",
                  "comment",
                  "comments",
                ]),
              };

              const getVal = (row, index) => {
                if (index === -1 || index === undefined || index >= row.length)
                  return "";
                const v = row[index];
                if (v === null || v === undefined) return "";
                if (v instanceof Date)
                  return isNaN(v.getTime()) ? "" : v.toISOString().split("T")[0];
                return String(v).trim();
              };

              const groupedInvoices = {};
              const validationErrors = [];
              let validRowCount = 0;

              for (let ri = 0; ri < dataRows.length; ri++) {
                const row = dataRows[ri];
                const excelRow = headerIndex + 2 + ri; // original Excel row number

                const invoiceNumber = getVal(row, col.invoiceNumber);
                const invoiceDate = getVal(row, col.invoiceDate);
                const recordingDate =
                  getVal(row, col.recordingDate) || invoiceDate;
                const mrName = getVal(row, col.mrName);
                const customerCode = getVal(row, col.customerCode);
                const productName = getVal(row, col.productName);
                const paymentStatus = getVal(row, col.paymentStatus);
                const remarks = getVal(row, col.remarks);

                const salesQty = parseExcelQuantity(getVal(row, col.salesQty));
                const bonusQty = parseExcelQuantity(getVal(row, col.bonusQty));
                const sellingPrice = parseExcelAmount(
                  getVal(row, col.sellingPrice),
                );
                const discount = parseExcelAmount(getVal(row, col.discount));
                const creditDays = parseExcelAmount(getVal(row, col.creditDays));
                const paidAmount = parseExcelAmount(getVal(row, col.paidAmount));

                const rowErrors = [];
                if (!invoiceNumber) rowErrors.push("Invoice number is required");
                if (!productName) rowErrors.push("Product name is required");
                if (salesQty < 0 || bonusQty < 0)
                  rowErrors.push("Quantities cannot be negative");
                if (salesQty === 0 && bonusQty === 0)
                  rowErrors.push("Sales Qty or Bonus Qty must be greater than 0");

                if (rowErrors.length > 0) {
                  validationErrors.push({
                    row: excelRow,
                    invoiceNumber: invoiceNumber || "N/A",
                    productName: productName || "N/A",
                    mrName: mrName || "Unknown",
                    error: rowErrors.join("; "),
                    type: "validation",
                  });
                  continue;
                }

                validRowCount++;

                const netSellingAmount = sellingPrice * salesQty - discount;

                if (!groupedInvoices[invoiceNumber]) {
                  groupedInvoices[invoiceNumber] = {
                    recordingDate: parseExcelDate(recordingDate),
                    invoiceNumber,
                    invoiceDate: parseExcelDate(invoiceDate),
                    mrName: mrName || "Unknown",
                    customerName: "Unknown",
                    customerCode: customerCode || "",
                    customerId: "",
                    creditDays: creditDays || 0,
                    paidAmount: paidAmount || 0,
                    products: [],
                    totalAmount: 0,
                    dueAmount: 0,
                    paymentStatus: paymentStatus || "Credit",
                    remark: remarks || "",
                    isMrSaleImport: importSaleType === "mr",
                  };
                }

                groupedInvoices[invoiceNumber].products.push({
                  productName,
                  salesQty,
                  bonusQty,
                  totalQty: salesQty + bonusQty,
                  sellingPrice,
                  amount: netSellingAmount,
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

              console.log(
                `Parsing summary — data rows: ${dataRows.length}, ` +
                  `valid: ${validRowCount}, errors: ${validationErrors.length}`,
              );

              const validInvoices = Object.values(groupedInvoices).filter(
                (inv) => inv.products && inv.products.length > 0,
              );

              validInvoices.forEach((inv) => {
                inv.dueAmount = Math.max(
                  0,
                  inv.totalAmount - (inv.paidAmount || 0),
                );
              });

              console.log(`Final result: ${validInvoices.length} valid invoices`);

              if (validInvoices.length === 0) {
                let errorMsg = "No valid invoices found. ";
                if (dataRows.length === 0) {
                  errorMsg += `Your file has no data rows below the header (row ${
                    headerIndex + 1
                  }). Please add invoice data.`;
                } else if (validationErrors.length > 0) {
                  errorMsg +=
                    `${validationErrors.length} row(s) had validation errors. ` +
                    validationErrors
                      .slice(0, 3)
                      .map((e) => `Row ${e.row}: ${e.error}`)
                      .join(" | ");
                } else {
                  errorMsg += "No data rows found after the header row.";
                }
                reject(new Error(errorMsg));
                return;
              }

              resolve({ validInvoices, validationErrors });
            } catch (error) {
              console.error("Error parsing Excel:", error);
              reject(error);
            }
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsArrayBuffer(file);
        });
      },
      [parseExcelDate, parseExcelQuantity, parseExcelAmount, importSaleType],
    );

    // Handle file upload
    const handleFileUpload = useCallback(
      async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const validExtensions = [".xlsx", ".xls", ".csv"];
        const fileExtension = "." + file.name.split(".").pop().toLowerCase();

        if (!validExtensions.includes(fileExtension)) {
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
          setImportMessage("Processing Excel data...");
          const { validInvoices, validationErrors } = await parseExcelFile(file);
          console.log("values of validInvoices", validInvoices);

          if (validInvoices.length === 0) {
            throw new Error("No valid invoices found in the file");
          }

          if (importSaleType === "mr") {
            validInvoices.forEach((inv) => {
              inv.isMrSaleImport = true;
            });
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
      },
      [importSaleType, resetModal, parseExcelFile],
    );

    const validateMRsBeforeImport = useCallback(async (invoices) => {
      try {
        setIsValidatingMR(true);
        setImportMessage(`🔍 Validating MRs for ${invoices.length} invoices...`);

        const mrNames = new Set();
        const mrToInvoices = new Map();

        for (const invoice of invoices) {
          if (invoice.mrName && invoice.mrName.trim()) {
            const mrName = invoice.mrName.trim();
            mrNames.add(mrName);
            if (!mrToInvoices.has(mrName)) mrToInvoices.set(mrName, []);
            mrToInvoices.get(mrName).push({
              invoiceNumber: invoice.invoiceNumber,
              customerName: invoice.customerName,
            });
          }
        }

        if (mrNames.size === 0) {
          setIsValidatingMR(false);
          return {
            mrIssues: [],
            totalInvoices: invoices.length,
            summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 },
          };
        }

        const response = await axios.post(
          `${backendUrl}/api/sales/validate-mr`,
          { mrNames: Array.from(mrNames) },
          getAuthHeaders(),
        );

        setIsValidatingMR(false);

        if (response.data.success) {
          return {
            mrIssues: [],
            totalInvoices: invoices.length,
            summary: {
              totalMRs: mrNames.size,
              validMRs: mrNames.size,
              invalidMRs: 0,
            },
          };
        }

        const mrIssues = [];
        const invalidMRMap = new Map();

        response.data.invalidMRs.forEach((invalidMR) => {
          const affectedInvoices = mrToInvoices.get(invalidMR.mrName) || [];
          invalidMRMap.set(invalidMR.mrName, {
            mrName: invalidMR.mrName,
            message: invalidMR.message,
            affectedInvoices,
            affectedCount: affectedInvoices.length,
          });
        });

        mrIssues.push(...Array.from(invalidMRMap.values()));

        return {
          mrIssues,
          totalInvoices: invoices.length,
          summary: {
            totalMRs: mrNames.size,
            validMRs: mrNames.size - mrIssues.length,
            invalidMRs: mrIssues.length,
          },
        };
      } catch (error) {
        console.error("MR validation error:", error);
        setIsValidatingMR(false);
        return {
          mrIssues: [],
          totalInvoices: invoices.length,
          summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 },
          error: error.message,
        };
      }
    }, []);

    const validateStockBeforeImport = useCallback(
      async (invoices) => {
        try {
          setIsValidatingStock(true);
          setImportMessage(`Checking stock for ${invoices.length} invoices...`);

          // For MR sales, skip warehouse stock validation
          if (importSaleType === "mr") {
            setIsValidatingStock(false);
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
                hasInsufficientStock: false,
                importBlocked: false,
              },
              insufficientStockIssues: [],
              missingProductIssues: [],
              importBlocked: false,
              blockReason: "NO_ISSUES",
              message:
                "MR sale - stock from MR hands will be validated during import.",
            };
          }

          const response = await axios.post(
            `${backendUrl}/api/sales/validate-import-stock`,
            { invoices, isMrSaleImport: importSaleType === "mr" },
            getAuthHeaders(),
          );

          setIsValidatingStock(false);

          if (response.data.success) {
            return response.data.validationResult;
          } else {
            throw new Error(response.data.message || "Stock validation failed");
          }
        } catch (error) {
          console.error("Stock validation error:", error);
          setIsValidatingStock(false);
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
              hasCriticalIssues: true,
              hasInsufficientStock: false,
              importBlocked: true,
            },
            insufficientStockIssues: [],
            missingProductIssues: [],
            importBlocked: true,
            blockReason: "VALIDATION_ERROR",
            message: `Stock validation failed: ${error.message}`,
          };
        }
      },
      [importSaleType],
    );

    const handleImportData = useCallback(async () => {
      if (parsedData.length === 0) {
        showToast("error", "No data to import");
        return;
      }

      const mrValResult = await validateMRsBeforeImport(parsedData);
      if (mrValResult.mrIssues && mrValResult.mrIssues.length > 0) {
        setMrValidationResult(mrValResult);
        setShowMRValidation(true);
        return;
      }

      const svResult = await validateStockBeforeImport(parsedData);
      if (svResult.stockIssues?.length > 0) {
        const insufficientStockIssues = svResult.stockIssues.filter(
          (i) => i.productExists && i.insufficient,
        );
        const missingProductIssues = svResult.stockIssues.filter(
          (i) => !i.productExists,
        );

        if (insufficientStockIssues.length > 0) {
          setStockValidationResult({
            ...svResult,
            stockIssues: insufficientStockIssues,
            summary: {
              ...svResult.summary,
              totalInsufficient: insufficientStockIssues.length,
              hasInsufficientStock: true,
            },
            importBlocked: true,
            message: `${insufficientStockIssues.length} products have insufficient stock.`,
          });
          setShowStockValidation(true);
          return;
        }

        if (
          missingProductIssues.length > 0 &&
          insufficientStockIssues.length === 0
        ) {
          setStockValidationResult({
            ...svResult,
            stockIssues: missingProductIssues,
            summary: {
              ...svResult.summary,
              totalInsufficient: missingProductIssues.length,
              hasInsufficientStock: false,
            },
            importBlocked: false,
            message: `${missingProductIssues.length} products not found in inventory.`,
          });
          setShowStockValidation(true);
          return;
        }
      }

      await handleProductImport(parsedData);
    }, [parsedData, validateMRsBeforeImport, validateStockBeforeImport]);

    const handleProceedWithMRIssues = useCallback(async () => {
      const confirmProceed = await confirmDialog({
        title: "Proceed with Invalid MRs",
        text: `${mrValidationResult?.summary?.invalidMRs || 0} MRs are not registered. These will be saved as provided. Do you want to proceed?`,
        icon: "warning",
        confirmButtonText: "Yes, Proceed Anyway",
        cancelButtonText: "Cancel",
      });
      if (confirmProceed.isConfirmed) {
        setShowMRValidation(false);
        await handleProductImport(parsedData);
      }
    }, [mrValidationResult, parsedData]);

    const handleProceedWithStockIssues = useCallback(async () => {
      if (!stockValidationResult) {
        showToast("error", "Stock validation data not available");
        return;
      }
      if (stockValidationResult.summary?.hasInsufficientStock) {
        showToast(
          "error",
          "Cannot proceed - there are insufficient stock issues",
        );
        return;
      }

      const confirmProceed = await confirmDialog({
        title: "Proceed with Missing Products",
        text: `${stockValidationResult.summary?.missingProducts || 0} products are not in inventory. These will be created during import. Do you want to proceed?`,
        icon: "warning",
        confirmButtonText: "Yes, Create Products",
        cancelButtonText: "Cancel",
      });
      if (confirmProceed.isConfirmed) {
        setShowStockValidation(false);
        await handleProductImport(parsedData);
      }
    }, [stockValidationResult, parsedData]);

    const handleCancelStockValidation = useCallback(() => {
      setShowStockValidation(false);
      setStockValidationResult(null);
      setIsValidatingStock(false);
      setImportStep("");
      showToast("info", "Import cancelled");
    }, []);

    const handleProductImport = useCallback(
      async (dataToImport) => {
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
          const isMrSale = importSaleType === "mr";

          const transformedInvoices = dataToImport.map((inv) => ({
            ...inv,
            invoiceDate:
              inv.invoiceDate || new Date().toISOString().split("T")[0],
            recordingDate:
              inv.recordingDate || new Date().toISOString().split("T")[0],
            paymentStatus: inv.paymentStatus || "Credit",
            totalAmount: inv.totalAmount || 0,
            dueAmount: inv.dueAmount || 0,
            isMrSaleImport: isMrSale,
            products: inv.products.map((product) => ({
              ...product,
              salesQty: Number(product.salesQty) || 0,
              bonusQty: Number(product.bonusQty) || 0,
              totalQty:
                (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0),
            })),
          }));

          setImportStep("Sending to server...");

          const response = await axios.post(
            `${backendUrl}/api/sales/import-with-stock-deduction`,
            {
              invoices: transformedInvoices,
              updateInventory: true,
              importTimestamp: new Date().toISOString(),
            },
            {
              timeout: 300000,
              signal: abortControllerRef.current.signal,
              ...getAuthHeaders(),
            },
          );

          if (response.data.success) {
            const newSessionId = response.data.sessionId;
            setSessionId(newSessionId);
            setImportStep("Import started – processing invoices...");

            pollingIntervalRef.current = setInterval(async () => {
              try {
                const progressResponse = await axios.get(
                  `${backendUrl}/api/sales/import/progress/${newSessionId}`,
                  { timeout: 5000, ...getAuthHeaders() },
                );

                if (progressResponse.data.success) {
                  const progress = progressResponse.data.progress;
                  setServerProgress(progress.percentage || 0);
                  setServerProcessed(progress.processed || 0);
                  setServerTotal(progress.total || dataToImport.length);

                  if (progress.completed) {
                    clearPolling();
                    setIsImporting(false);

                    if (progress.failed > 0) {
                      try {
                        const failedResponse = await axios.get(
                          `${backendUrl}/api/sales/import/failed/${newSessionId}`,
                          getAuthHeaders(),
                        );
                        if (failedResponse.data.success) {
                          const failedInvoicesData =
                            failedResponse.data.data.failedInvoices || [];
                          if (failedInvoicesData.length > 0) {
                            setFailedInvoices(failedInvoicesData);
                            setShowFailedInvoices(true);
                          }
                        }
                      } catch (fetchError) {
                        console.error(
                          "Error fetching failed invoices:",
                          fetchError,
                        );
                      }
                      showToast(
                        "warning",
                        `Import completed with ${progress.successful} successful and ${progress.failed} failed invoices`,
                      );
                    } else {
                      showToast(
                        "success",
                        `Successfully imported ${progress.successful} invoices`,
                      );
                      if (onImportSuccess) {
                        onImportSuccess();
                        setTimeout(
                          () =>
                            window.dispatchEvent(
                              new CustomEvent("inventory-updated"),
                            ),
                          1000,
                        );
                      }
                    }

                    setImportStep("Import completed");
                  }
                }
              } catch (err) {
                if (err.code === "ERR_CANCELED") return;
                console.error("Progress polling error:", err);
              }
            }, 1000);
          } else {
            throw new Error(response.data.message || "Import failed");
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
            }
          }
        }
      },
      [clearPolling, isCancelled, onImportSuccess, importSaleType],
    );

    const resetParsedData = useCallback(() => {
      setParsedData([]);
      setImportErrorDetails([]);
      setShowParsedSection(false);
      setFailedInvoices([]);
      setShowFailedInvoices(false);
      setShowStockValidation(false);
      setStockValidationResult(null);
      setShowMRValidation(false);
      setMrValidationResult(null);
    }, []);

    useEffect(() => {
      return () => {
        clearPolling();
        if (abortControllerRef.current) abortControllerRef.current.abort();
      };
    }, [clearPolling]);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
      <>
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

            {!isImporting && (
              <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
                <button
                  onClick={() => {
                    setImportSaleType("normal");
                    resetParsedData();
                  }}
                  disabled={isImporting || isValidatingStock || isValidatingMR}
                  className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${importSaleType === "normal" ? "bg-indigo-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                >
                  <Package size={16} />
                  Normal Sale
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${importSaleType === "normal" ? "bg-indigo-500 text-white" : "bg-gray-200 text-gray-600"}`}
                  >
                    Warehouse Stock
                  </span>
                </button>
                <button
                  onClick={() => {
                    setImportSaleType("mr");
                    resetParsedData();
                  }}
                  disabled={isImporting || isValidatingStock || isValidatingMR}
                  className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${importSaleType === "mr" ? "bg-green-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                >
                  <User size={16} />
                  MR Sale
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${importSaleType === "mr" ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600"}`}
                  >
                    MR Hand Stock
                  </span>
                </button>
              </div>
            )}

            {!isImporting && (
              <div
                className={`mb-5 p-3 rounded-lg text-sm ${importSaleType === "normal" ? "bg-indigo-50 text-indigo-800 border border-indigo-200" : "bg-green-50 text-green-800 border border-green-200"}`}
              >
                {importSaleType === "normal" ? (
                  <p>
                    📦 <strong>Normal Sale:</strong> Stock will be deducted from
                    the main warehouse inventory.
                  </p>
                ) : (
                  <p>
                    👤 <strong>MR Sale:</strong> Stock will be deducted from each
                    MR's hand stock. The MR Name column in your Excel file
                    determines which MR's stock is used.
                  </p>
                )}
              </div>
            )}

            {!showParsedSection &&
              !isUploading &&
              !isProcessingFile &&
              !isImporting && (
                <div className="mb-8">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Excel/CSV File
                  </label>
                  <div className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-lg p-8 text-center transition-colors">
                    <Upload className="mx-auto text-gray-400 mb-3" size={48} />
                    <p className="text-gray-600 mb-2">
                      Drag & drop your file here or click to browse
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      disabled={isUploading || isProcessingFile}
                    />
                    <p className="text-xs text-gray-500 mt-3">
                      Supported formats: Excel (.xlsx, .xls), CSV (.csv) | Max
                      size: 20MB
                    </p>
                    <SampleExcelDownloadSale />
                  </div>
                </div>
              )}

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

            {isValidatingMR && (
              <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <div className="flex-1">
                    <h3 className="font-medium text-blue-800">
                      Validating MRs...
                    </h3>
                    <p className="text-sm text-blue-700 mt-1">
                      Checking MR names for {parsedData.length} invoices...
                    </p>
                  </div>
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
                  </div>
                </div>
              </div>
            )}

            {showParsedSection && parsedData.length > 0 && (
              <div
                className={`mb-6 border rounded-lg p-4 ${importSaleType === "mr" ? "bg-green-50 border-green-200" : "bg-indigo-50 border-indigo-200"}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3
                      className={`font-medium ${importSaleType === "mr" ? "text-green-800" : "text-indigo-800"}`}
                    >
                      File Successfully Parsed
                    </h3>
                    <p
                      className={`text-sm ${importSaleType === "mr" ? "text-green-700" : "text-indigo-700"}`}
                    >
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
                    className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 border border-gray-300 rounded-lg cursor-pointer"
                    disabled={isImporting || isValidatingStock || isValidatingMR}
                  >
                    Clear
                  </button>
                </div>

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

                {importSaleType === "mr" && (
                  <div className="mt-3 p-2 bg-green-100 rounded text-xs text-green-800">
                    MRs detected in file:{" "}
                    {[
                      ...new Set(
                        parsedData.map((inv) => inv.mrName).filter(Boolean),
                      ),
                    ].join(", ") || "None"}
                  </div>
                )}

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Sample Data (First 3 invoices):
                  </h4>
                  <div className="bg-white border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">Invoice</th>
                          <th className="p-2 text-left">MR</th>
                          <th className="p-2 text-left">Products</th>
                          <th className="p-2 text-left">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.slice(0, 3).map((inv, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2 font-mono">{inv.invoiceNumber}</td>
                            <td className="p-2">{inv.mrName}</td>
                            <td className="p-2">{inv.products?.length || 0}</td>
                            <td className="p-2">
                              ${inv.totalAmount?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

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
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left border-b">Row</th>
                          <th className="p-2 text-left border-b">Invoice #</th>
                          <th className="p-2 text-left border-b">Product</th>
                          <th className="p-2 text-left border-b">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importErrorDetails.slice(0, 10).map((err, i) => (
                          <tr key={i} className="hover:bg-yellow-50 border-b">
                            <td className="p-2 font-mono">{err.row}</td>
                            <td className="p-2">{err.invoiceNumber}</td>
                            <td className="p-2">{err.productName}</td>
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
                </div>
              )}

            {isImporting && (
              <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-2xl font-bold text-blue-900">
                    Importing{" "}
                    {importSaleType === "mr" ? "MR Sale" : "Normal Sale"} Data...
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

            {!isImporting &&
              showParsedSection &&
              parsedData.length > 0 &&
              !isValidatingStock &&
              !isValidatingMR && (
                <div className="mb-6">
                  <button
                    onClick={handleImportData}
                    className={`w-full py-4 rounded-xl font-bold text-xl shadow-lg transition transform hover:scale-105 cursor-pointer text-white ${importSaleType === "mr" ? "bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800" : "bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800"}`}
                    disabled={isImporting || isValidatingStock || isValidatingMR}
                  >
                    Start {importSaleType === "mr" ? "MR Sale" : "Normal Sale"}{" "}
                    Import ({parsedData.length} invoices)
                  </button>
                </div>
              )}

            <div className="flex justify-between pt-4 border-t border-gray-200">
              <div>
                {showParsedSection && parsedData.length > 0 && (
                  <button
                    onClick={resetParsedData}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
                    disabled={isImporting || isValidatingStock || isValidatingMR}
                  >
                    Upload Different File
                  </button>
                )}
              </div>
              <button
                onClick={handleClose}
                disabled={isUploading || isProcessingFile || isImporting}
                className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isImporting || isUploading ? "Cancel" : "Close"}
              </button>
            </div>
          </div>
        </div>

        {showStockValidation && stockValidationResult && (
          <StockValidationModal
            isOpen={showStockValidation}
            onClose={() => setShowStockValidation(false)}
            onProceed={handleProceedWithStockIssues}
            onCancel={handleCancelStockValidation}
            stockValidationResult={stockValidationResult}
          />
        )}

        {showMRValidation && mrValidationResult && (
          <MRValidationModal
            isOpen={showMRValidation}
            onClose={() => setShowMRValidation(false)}
            onProceed={handleProceedWithMRIssues}
            mrValidationResult={mrValidationResult}
          />
        )}

        {showFailedInvoices && (
          <FailedInvoicesModal
            isOpen={showFailedInvoices}
            onClose={() => setShowFailedInvoices(false)}
            failedInvoices={failedInvoices}
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

    const calculateTotals = useCallback(() => {
      return (products || []).reduce(
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
    }, [products]);

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
                    {[
                      "Product Name",
                      "Sales Qty",
                      "Bonus Qty",
                      "Total Qty",
                      "Selling Price",
                      "Amount ($)",
                      "Discount ($)",
                      "Net Amount ($)",
                      "Avg. Price",
                      "LC ($)",
                      "Profit / Loss ($)",
                    ].map((h) => (
                      <th
                        key={h}
                        className="p-3 text-sm font-medium text-gray-700 border-b text-left"
                      >
                        {h}
                      </th>
                    ))}
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
                            className={`font-medium ${profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
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
                        className={
                          totals.totalProfitLoss >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
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
    const [checkingPurchaseInventories, setCheckingPurchaseInventories] = useState(true);
    const [shouldCheckPurchase, setShouldCheckPurchase] = useState(true);
    const [productsList, setProductsList] = useState([]);
    const inputRef = useRef(null);
    const { statuses, loading } = useInitialSaleData();

    const [saleTypeTab, setSaleTypeTab] = useState("all");

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

    const fetchProductsList = useCallback(async () => {
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
      } catch (error) {
        console.error("Error fetching products list:", error);
      }
    }, []);

    const checkPurchaseInventories = useCallback(async () => {
      try {
        setCheckingPurchaseInventories(true);
        const response = await axios.get(`${backendUrl}/api/purchase/check`);
        setHasPurchaseInventories(
          response.data.exists || response.data.count > 0,
        );
      } catch (error) {
        setHasPurchaseInventories(false);
      } finally {
        setCheckingPurchaseInventories(false);
      }
    }, []);

    const recheckPurchaseInventories = useCallback(() => {
      setShouldCheckPurchase(true);
    }, []);

    useEffect(() => {
      if (shouldCheckPurchase) {
        checkPurchaseInventories();
        setShouldCheckPurchase(false);
      }
    }, [shouldCheckPurchase, checkPurchaseInventories]);

    useEffect(() => {
      checkPurchaseInventories();
      fetchProductsList();
    }, [checkPurchaseInventories, fetchProductsList]);

    useEffect(() => {
      const handlePurchaseInventoryAdded = () => recheckPurchaseInventories();
      window.addEventListener(
        "purchase-inventory-added",
        handlePurchaseInventoryAdded,
      );
      return () =>
        window.removeEventListener(
          "purchase-inventory-added",
          handlePurchaseInventoryAdded,
        );
    }, [recheckPurchaseInventories]);

    useEffect(() => {
      const handleInventoryUpdated = () => {
        fetchSaleSummaries();
        fetchProductsList();
      };
      window.addEventListener("inventory-updated", handleInventoryUpdated);
      return () =>
        window.removeEventListener("inventory-updated", handleInventoryUpdated);
    }, [fetchProductsList]);

    const processSalesData = useCallback((data) => {
      const salesData = data.summaries || data.data || data;
      if (!Array.isArray(salesData)) {
        setSales([]);
        return;
      }
      const sortedData = salesData.sort(
        (a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate),
      );
      setSales(sortedData);
    }, []);

    const fetchSaleSummaries = useCallback(async () => {
      try {
        setLoadingData(true);
        const res = await fetch(`${backendUrl}/api/sales/all`, {
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
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
    }, [processSalesData]);

    useEffect(() => {
      fetchSaleSummaries();
    }, [fetchSaleSummaries]);

    useEffect(() => {
      const fetchDropdownData = async () => {
        try {
          const [mrs, customers] = await Promise.all([
            fetchMRList(),
            fetchCustomerList(),
          ]);
          if (mrs && mrs.success && Array.isArray(mrs.data)) {
            const mrNames = mrs.data
              .map((mr) => {
                if (typeof mr === "string") return mr.trim();
                if (mr && typeof mr === "object") {
                  if (mr.medicalRepName) return mr.medicalRepName.trim();
                  if (mr.name) return mr.name.trim();
                  if (mr.fullName) return mr.fullName.trim();
                }
                return null;
              })
              .filter(Boolean);
            setMrList(mrNames);
          } else {
            setMrList([]);
          }
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

    const handleDeleteSelected = useCallback(async () => {
      if (selected.length === 0) return;
      const confirm = await confirmDialog({
        text: `Are you sure you want to delete ${selected.length} sales?`,
        icon: "warning",
        confirmButtonText: "Yes, delete",
        cancelButtonText: "Cancel",
      });
      if (confirm.isConfirmed) {
        try {
          const token = localStorage.getItem("token");
          const ids = selected
            .map((s) => s.id)
            .filter((id) => id && typeof id === "string");
          if (ids.length === 0) {
            showToast("error", "No valid sale IDs to delete");
            return;
          }
          const res = await axios.post(
            `${backendUrl}/api/sales/batch-delete`,
            { ids },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.status === 200) {
            showToast("success", `${ids.length} sale(s) deleted successfully`);
            fetchSaleSummaries();
            setSelected([]);
          }
        } catch (error) {
          const errorMessage =
            error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to delete selected sales";
          showToast("error", errorMessage);
        }
      }
    }, [selected, fetchSaleSummaries]);

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
        { id: "invoiceNumber", name: "Invoice No", dbName: "invoiceNumber" },
        { id: "invoiceDate", name: "Invoice Date", dbName: "invoiceDate" },
        { id: "productCount", name: "Products", dbName: "products" },
        { id: "mrName", name: "MR Name", dbName: "mrName" },
        { id: "customerName", name: "Customer Name", dbName: "customerName" },
        { id: "totalAmount", name: "Total Amount ($)", dbName: "totalAmount" },
        { id: "paymentStatus", name: "Payment Status", dbName: "paymentStatus" },
        { id: "actions", name: "Actions", dbName: "actions" },
      ],
      [],
    );

    // Payment status tabs (All, Cash, Credit, etc.)
    const paymentStatusTabs = useMemo(() => {
      if (!Array.isArray(sales) || sales.length === 0) return ["All", "Cash", "Credit"];
      
      const uniqueStatuses = [
        ...new Set(
          sales
            .map((sale) => sale.paymentStatus)
            .filter((s) => s && s.trim() !== "")
            .map((s) => s.trim()),
        ),
      ].sort();
      
      const baseTabs = ["All"];
      
      if (uniqueStatuses.includes("Cash")) baseTabs.push("Cash");
      if (uniqueStatuses.includes("Credit")) baseTabs.push("Credit");
      
      uniqueStatuses.forEach(status => {
        if (!baseTabs.includes(status) && status !== "Cash" && status !== "Credit") {
          baseTabs.push(status);
        }
      });
      
      return baseTabs;
    }, [sales]);

    // Sale type tabs (Normal Sale, MR Sale)
    const saleTypeTabs = useMemo(() => {
      return [
        { id: "all", label: "All" },
        { id: "normal", label: "Normal Sale"},
        { id: "mr", label: "MR Sale"},
      ];
    }, []);

    // Filtered sales based on payment status, sale type, and search term
    const filteredSales = useMemo(() => {
      if (!Array.isArray(sales)) return [];
      const lowerSearch = searchTerm.trim().toLowerCase();
      const selectedTabLower = selectedTab.toLowerCase();
      const selectedSaleType = saleTypeTab.toLowerCase();

      return sales.filter((sale) => {
        // Determine if this is an MR sale - check both possible fields
        const isMRSale = sale.isMRSale === true || sale.isMrSaleImport === true;
        
        // Filter by payment status (All, Cash, Credit, etc.)
        const paymentStatus = (sale.paymentStatus || "").toLowerCase();
        if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
          return false;
        }

        // Filter by sale type (All, Normal Sale, MR Sale)
        if (selectedSaleType !== "all") {
          if (selectedSaleType === "mr" && !isMRSale) return false;
          if (selectedSaleType === "normal" && isMRSale) return false;
        }

        // Filter by search term
        if (!lowerSearch) return true;
        return [sale.invoiceNumber, sale.customerName, sale.mrName].some((f) =>
          (f ?? "").toString().toLowerCase().includes(lowerSearch),
        );
      });
    }, [sales, searchTerm, selectedTab, saleTypeTab]);

    // ✅ Memoized download data based on environment variable (used only for normal download)
    const downloadData = useMemo(() => {
      if (isSampleDownloadFile) {
        // When sample download is enabled, ignore search and payment status,
        // only filter by sale type tab (but we will handle download separately)
        if (saleTypeTab === "all") return sales;
        if (saleTypeTab === "normal") {
          return sales.filter(s => !s.isMRSale && !s.isMrSaleImport);
        }
        if (saleTypeTab === "mr") {
          return sales.filter(s => s.isMRSale || s.isMrSaleImport);
        }
        return [];
      }
      return filteredSales;
    }, [isSampleDownloadFile, sales, saleTypeTab, filteredSales]);

    const currentSales = useMemo(() => {
      const start = (currentPage - 1) * SALES_PER_PAGE;
      return filteredSales.slice(start, start + SALES_PER_PAGE);
    }, [filteredSales, currentPage]);

    const totalPages = useMemo(
      () => Math.ceil(filteredSales.length / SALES_PER_PAGE),
      [filteredSales.length],
    );
    const visiblePages = useMemo(
      () => getVisiblePages(currentPage, totalPages),
      [currentPage, totalPages],
    );

    useEffect(() => {
      setCurrentPage(1);
    }, [searchTerm, selectedTab, saleTypeTab]);

    const getFieldValue = useCallback((sale, dbName) => {
      if (dbName === "products") return sale.products?.length || 0;
      if (["invoiceDate", "dueDate", "deliveryDate"].includes(dbName))
        return formatDateToReadable(sale[dbName]) || "--";
      if (dbName === "totalAmount")
        return `$${(sale.totalAmount || 0).toLocaleString()}`;
      return sale[dbName] ?? "--";
    }, []);

    const toggleSelect = useCallback((sale) => {
      setSelected((prev) => {
        const exists = prev.some((c) => c.id === sale._id);
        return exists
          ? prev.filter((c) => c.id !== sale._id)
          : [...prev, { id: sale._id }];
      });
    }, []);

    const toggleSelectAll = useCallback(
      (checked) => {
        setSelected(checked ? currentSales.map((s) => ({ id: s._id })) : []);
      },
      [currentSales],
    );

    const handleProductCountClick = useCallback((sale) => {
      setSelectedSaleProducts(sale.products || []);
      setIsProductModalOpen(true);
    }, []);

    const handleView = useCallback((sale) => {
      setForm({
        ...sale,
        products: sale.products || [],
        customerName: sale.customerName || "--",
        customerCode: sale.customerCode || "",
        customerId: sale.customerId || "",
      });
      setIsViewModalOpen(true);
    }, []);

    const editSale = useCallback((sale) => {
      setSelectedSale(sale);
      setForm({
        ...sale,
        products: sale.products || [],
        customerName: sale.customerName || "--",
        customerCode: sale.customerCode || "",
        customerId: sale.customerId || "",
      });
      setIsEditModalOpen(true);
    }, []);

    const deleteSale = useCallback(
      async (sale) => {
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
            const token = localStorage.getItem("token");
            const res = await axios.delete(
              `${backendUrl}/api/sales/${sale._id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (res.status === 200) {
              showToast(
                "success",
                `Sale ${sale.invoiceNumber} deleted successfully`,
              );
              fetchSaleSummaries();
            }
          } catch (error) {
            const errorMessage =
              error.response?.data?.error ||
              error.response?.data?.message ||
              "Failed to delete sale";
            showToast("error", errorMessage);
          }
        }
      },
      [fetchSaleSummaries],
    );

    const calculateProductTotals = useCallback((products) => {
      if (!products || !Array.isArray(products))
        return {
          totalAmount: 0,
          totalDiscount: 0,
          netAmount: 0,
          totalProfitLoss: 0,
        };
      return products.reduce(
        (acc, product) => {
          acc.totalAmount += parseFloat(product.amount || 0);
          acc.totalDiscount += parseFloat(product.discount || 0);
          acc.netAmount += parseFloat(product.netSellingAmount || 0);
          acc.totalProfitLoss += parseFloat(product.profitLoss || 0);
          return acc;
        },
        { totalAmount: 0, totalDiscount: 0, netAmount: 0, totalProfitLoss: 0 },
      );
    }, []);

    const handleUpdateSale = useCallback(
      async (e) => {
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
          const token = localStorage.getItem("token");
          const res = await axios.put(
            `${backendUrl}/api/sales/${form._id}`,
            updatedForm,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.status === 200) {
            showToast("success", "Sales record updated successfully");
            setIsEditModalOpen(false);
            setSelectedSale(null);
            fetchSaleSummaries();
          }
        } catch (err) {
          const errorMessage =
            err.response?.data?.err ||
            err.response?.data?.message ||
            "Failed to update sale";
          showToast("error", errorMessage);
        }
      },
      [form, calculateProductTotals, fetchSaleSummaries],
    );

    const handleFormChange = useCallback((e) => {
      const { name, value } = e.target;
      setForm((prev) => ({ ...prev, [name]: value }));
    }, []);

    const formTotals = useMemo(
      () => calculateProductTotals(form.products),
      [form.products, calculateProductTotals],
    );

    const handleImportSuccess = useCallback(() => {
      setTimeout(() => {
        fetchSaleSummaries();
        window.dispatchEvent(new CustomEvent("inventory-updated"));
      }, 1000);
    }, [fetchSaleSummaries]);

    const showMRCustomerWarning = useMemo(() => {
      const hasMRs = mrList && mrList.length > 0;
      const hasCustomers = customerList && customerList.length > 0;
      return !hasMRs && !hasCustomers;
    }, [mrList, customerList]);

    const shouldDisableButtons = useMemo(
      () =>
        checkingPurchaseInventories ||
        !hasPurchaseInventories ||
        showMRCustomerWarning,
      [
        checkingPurchaseInventories,
        hasPurchaseInventories,
        showMRCustomerWarning,
      ],
    );

    const getButtonTitle = useCallback(() => {
      if (checkingPurchaseInventories) return "Checking purchase inventories...";
      if (!hasPurchaseInventories)
        return "First purchase the entry enter then sale";
      if (showMRCustomerWarning) return "Please add MR and Customer data first";
      return "Create new sale";
    }, [
      checkingPurchaseInventories,
      hasPurchaseInventories,
      showMRCustomerWarning,
    ]);

    // ===== NEW: Helper function to download Excel from data array =====
    const downloadExcel = useCallback((data, baseFileName) => {
      if (!data || data.length === 0) {
        showToast("error", "No data to download");
        return;
      }

      // Flatten products into rows
      const excelRows = [];
      data.forEach(sale => {
        if (sale.products && sale.products.length) {
          sale.products.forEach(product => {
            excelRows.push({
              'Invoice Number': sale.invoiceNumber,
              'Invoice Date': sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString() : '',
              'MR Name': sale.mrName || '',
              'Customer Name': sale.customerName || '',
              'Customer Code': sale.customerCode || '',
              'Payment Status': sale.paymentStatus || '',
              'Product Name': product.productName || '',
              'Sales Qty': product.salesQty || 0,
              'Bonus Qty': product.bonusQty || 0,
              'Total Qty': product.totalQty || 0,
              'Selling Price': product.sellingPrice || 0,
              'Discount': product.discount || 0,
              'Net Amount': product.netSellingAmount || 0,
              'LC': product.lc || 0,
              'Profit/Loss': product.profitLoss || 0,
              'Total Amount': sale.totalAmount || 0,
              'Paid Amount': sale.paidAmount || 0,
              'Due Amount': sale.dueAmount || 0,
              'Cost Amount': sale.costAmount || 0,
              'Sale Type': sale.saleType || (sale.isMRSale || sale.isMrSaleImport ? 'MR Sale' : 'Normal Sale')
            });
          });
        } else {
          // Fallback for invoices without products
          excelRows.push({
            'Invoice Number': sale.invoiceNumber,
            'Invoice Date': sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString() : '',
            'MR Name': sale.mrName || '',
            'Customer Name': sale.customerName || '',
            'Customer Code': sale.customerCode || '',
            'Payment Status': sale.paymentStatus || '',
            'Product Name': '—',
            'Sales Qty': 0,
            'Bonus Qty': 0,
            'Total Qty': 0,
            'Selling Price': 0,
            'Discount': 0,
            'Net Amount': 0,
            'LC': 0,
            'Profit/Loss': 0,
            'Total Amount': sale.totalAmount || 0,
            'Paid Amount': sale.paidAmount || 0,
            'Due Amount': sale.dueAmount || 0,
            'Cost Amount': sale.costAmount || 0,
            'Sale Type': sale.saleType || (sale.isMRSale || sale.isMrSaleImport ? 'MR Sale' : 'Normal Sale')
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales');
      const fileName = `${baseFileName}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    }, []);

    // ===== NEW: Handler for sample download (two files) =====
    const handleSampleDownload = useCallback(() => {
      const normalSales = sales.filter(s => !s.isMRSale && !s.isMrSaleImport);
      const mrSales = sales.filter(s => s.isMRSale || s.isMrSaleImport);

      if (normalSales.length === 0 && mrSales.length === 0) {
        showToast("error", "No sales data available");
        return;
      }

      // Download normal sales file
      if (normalSales.length > 0) {
        downloadExcel(normalSales, 'Normal_Sales');
      } else {
        showToast("info", "No normal sales to download");
      }

      // Download MR sales file (short delay to avoid browser blocking multiple downloads)
      setTimeout(() => {
        if (mrSales.length > 0) {
          downloadExcel(mrSales, 'MR_Sales');
        } else {
          showToast("info", "No MR sales to download");
        }
      }, 500);
    }, [sales, downloadExcel]);

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
                            <h4 className="font-medium text-gray-800">
                              {product.productName || `Product ${index + 1}`}
                            </h4>
                            <div className="text-sm text-gray-600 mt-1">
                              Qty: {product.salesQty || 0} | Bonus:{" "}
                              {product.bonusQty || 0} | Price: $
                              {(product.sellingPrice || 0).toFixed(2)}
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
                    {[
                      ["Total Amount", `$${formTotals.totalAmount.toFixed(2)}`],
                      [
                        "Total Discount",
                        `$${formTotals.totalDiscount.toFixed(2)}`,
                      ],
                      ["Net Amount", `$${formTotals.netAmount.toFixed(2)}`],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          {label}
                        </label>
                        <div className="text-lg font-semibold text-gray-800">
                          {val}
                        </div>
                      </div>
                    ))}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Profit/Loss
                      </label>
                      <div
                        className={`text-lg font-semibold ${formTotals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
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
                  {[
                    ["Recording Date", formatDateToReadable(form.recordingDate)],
                    ["Invoice Number", form.invoiceNumber],
                    ["Invoice Date", formatDateToReadable(form.invoiceDate)],
                    ["MR Name", form.mrName],
                    ["Customer Name", form.customerName],
                    ["Customer Code", form.customerCode],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-gray-50 p-3 rounded-lg">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {label}
                      </label>
                      <div className="text-sm font-medium text-gray-800">
                        {val || "-"}
                      </div>
                    </div>
                  ))}
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
                          <h4 className="font-medium text-gray-800">
                            {product.productName || `Product ${index + 1}`}
                          </h4>
                          <div className="text-sm text-gray-600 mt-1">
                            Quantity: {product.salesQty || 0} | Bonus:{" "}
                            {product.bonusQty || 0} | Price: $
                            {(product.sellingPrice || 0).toFixed(2)}
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
                  {[
                    ["Total Amount", `$${formTotals.totalAmount.toFixed(2)}`],
                    ["Total Discount", `$${formTotals.totalDiscount.toFixed(2)}`],
                    ["Net Amount", `$${formTotals.netAmount.toFixed(2)}`],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {label}
                      </label>
                      <div className="text-lg font-semibold text-gray-800">
                        {val}
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Profit/Loss
                    </label>
                    <div
                      className={`text-lg font-semibold ${formTotals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      ${formTotals.totalProfitLoss.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {[
                    ["Credit Days", `${form.creditDays || 0} days`],
                    ["Due Date", formatDateToReadable(form.dueDate)],
                    ["Paid Amount", `$${(form.paidAmount || 0).toFixed(2)}`],
                    ["Due Amount", `$${(form.dueAmount || 0).toFixed(2)}`],
                    ["Delivery Date", formatDateToReadable(form.deliveryDate)],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-gray-50 p-3 rounded-lg">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {label}
                      </label>
                      <div className="text-sm font-medium text-gray-800">
                        {val || "-"}
                      </div>
                    </div>
                  ))}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Payment Status
                    </label>
                    <div
                      className={`text-sm font-medium ${form.paymentStatus === "Paid" ? "text-green-600" : form.paymentStatus === "Credit" ? "text-yellow-600" : form.paymentStatus === "Partial" ? "text-blue-600" : "text-gray-600"}`}
                    >
                      {form.paymentStatus || "-"}
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
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={() => navigate("/salelayout/sale/new")}
                disabled={shouldDisableButtons}
                title={getButtonTitle()}
              >
                <UserPlus size={18} /> Add New Sales
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={shouldDisableButtons}
                title={getButtonTitle()}
              >
                <Upload size={18} /> Import Sales
              </button>
              {selected.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
                >
                  <Trash2 size={18} /> Delete Selected
                </button>
              )}
            </div>

            {/* ===== CONDITIONAL DOWNLOAD BUTTON ===== */}
            {isSampleDownloadFile ? (
              <button
                onClick={handleSampleDownload}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
                disabled={sales.length === 0}
              >
                <Download size={18} />
                Download Sample (Normal + MR)
              </button>
            ) : (
              <SaleExcelDownload
                data={downloadData}
                fileName={`sale_summary_${saleTypeTab}_${selectedTab}`}
                buttonText="Download Sales Excel"
              />
            )}
          </div>

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

          {sales.length > 0 && (
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              {/* Left side - Payment Status + Sale Type Tabs */}
              <div className="flex gap-2 flex-wrap items-center">
                {/* Payment Status Group */}
                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-xl px-2 py-1">
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide pr-1">
                    Payment
                  </span>
                  {paymentStatusTabs.map((tab) => (
                    <button
                      key={`payment-tab-${tab}`}
                      onClick={() => {
                        setSelectedTab(tab);
                        setCurrentPage(1);
                        setSelected([]);
                      }}
                      className={`px-4 py-1.5 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
                        selectedTab === tab
                          ? "bg-indigo-600 text-white shadow"
                          : "text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-gray-300 mx-1" />

                {/* Sale Type Group */}
                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-xl px-2 py-1">
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide pr-1">
                    Sale Type
                  </span>
                  {saleTypeTabs.map((tab) => (
                    <button
                      key={`sale-type-tab-${tab.id}`}
                      onClick={() => {
                        setSaleTypeTab(tab.id);
                        setCurrentPage(1);
                        setSelected([]);
                      }}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-full cursor-pointer transition-colors text-sm font-medium ${
                        saleTypeTab === tab.id
                          ? tab.id === "normal"
                            ? "bg-indigo-600 text-white shadow"
                            : tab.id === "mr"
                              ? "bg-green-600 text-white shadow"
                              : "bg-gray-600 text-white shadow"
                          : "text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {/* Icon */}
                      {tab.id === "normal" ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 3H8v4h8V3z"
                          />
                        </svg>
                      ) : tab.id === "mr" ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6h16M4 12h16M4 18h16"
                          />
                        </svg>
                      )}

                      {/* Label */}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right side - Total Count + Search */}
              {sales.length > 0 && (
                <div className="flex items-center justify-end gap-4 flex-wrap">
                  <p className="text-lg font-semibold text-gray-700">
                    Total Count:{" "}
                    <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                      {filteredSales.length}
                    </span>
                  </p>
                  <div className="relative w-full md:w-72">
                    <Search
                      className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 pointer-events-none"
                      size={16}
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
                      className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto shadow-lg rounded-2xl border border-gray-200">
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
                                className="cursor-pointer"
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
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
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
                      className={`hover:bg-gray-50 transition-colors ${index < currentSales.length - 1 ? "border-b" : ""}`}
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
                                  className="cursor-pointer"
                                />
                                <span className="font-medium">
                                  {sale.invoiceNumber}
                                  {(sale.isMRSale || sale.isMrSaleImport) && (
                                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                                      MR
                                    </span>
                                  )}
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
                                  className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors p-1"
                                  onClick={() => handleView(sale)}
                                  title="View"
                                >
                                  <Eye size={18} />
                                </button>
                                <button
                                  className="text-green-600 hover:text-green-800 cursor-pointer transition-colors p-1"
                                  onClick={() => editSale(sale)}
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  className="text-red-600 hover:text-red-800 cursor-pointer transition-colors p-1"
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
                    onClick={() =>
                      setCurrentPage((prev) => {
                        const p = Math.max(prev - 1, 1);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        return p;
                      })
                    }
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    ← Prev
                  </button>
                  {visiblePages.map((page, idx) =>
                    page === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-3 py-1 text-gray-500 select-none"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={`page-${page}`}
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
                    onClick={() =>
                      setCurrentPage((prev) => {
                        const p = Math.min(prev + 1, totalPages);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                        return p;
                      })
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1 transition-colors"
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