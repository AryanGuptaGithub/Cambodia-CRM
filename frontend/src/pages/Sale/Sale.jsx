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
  PackageCheck,
  ChevronDown,
  ChevronRight,
  User,
  AlertTriangle,
  Menu,
} from "lucide-react";
import ReactDOM from "react-dom";
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
import SearchableDropdown from "../../components/common/SearchableDropdown";
import * as XLSX from "xlsx";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale.jsx";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const isSampleDownloadFile =
  import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";

const DEFAULT_CREDIT_DAYS = 30;

// ── Role helper ──────────────────────────────────────────────────────────────
const getCurrentUserRole = () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.role || null;
  } catch {
    return null;
  }
};

const isSuperAdmin = () => getCurrentUserRole() === "super admin";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
};

const isMRSaleDoc = (sale) => {
  if (sale.saleType === "MR Sale") return true;
  if (sale.saleType === "Normal Sale") return false;
  if (sale.isMRSale === true) return true;
  if (sale.isMrSaleImport === true) return true;
  if (
    typeof sale.saleType === "string" &&
    sale.saleType.toLowerCase().includes("mr")
  )
    return true;
  return false;
};

const computePaymentStatus = (paid, net) => {
  if (paid <= 0) return "Credit";
  if (paid >= net - 0.001) return "Cash";
  return "Partial Paid";
};

const filterNumericInput = (value, allowDecimal = true) => {
  let filtered = value.replace(/[^\d.]/g, "");
  const parts = filtered.split(".");
  if (parts.length > 2) {
    filtered = parts[0] + "." + parts.slice(1).join("");
  }
  if (!allowDecimal) {
    filtered = filtered.replace(".", "");
  }
  return filtered;
};
// ==========================================
// EditProductModal - For editing product quantities with text inputs that only accept numbers
// ==========================================
const EditProductModal = ({
  isOpen,
  onClose,
  products,
  onUpdateProducts,
  title = "Edit Products",
}) => {
  const [editableProducts, setEditableProducts] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (products) {
      setEditableProducts(products.map(p => ({ ...p, _tempId: Math.random().toString() })));
      setHasChanges(false);
    }
  }, [products]);

  // Helper function to filter numeric input
  const filterNumericValue = (value, allowDecimal = true) => {
    if (value === '' || value === undefined) return '';
    let filtered = value.replace(/[^\d.]/g, '');
    const parts = filtered.split('.');
    if (parts.length > 2) {
      filtered = parts[0] + '.' + parts.slice(1).join('');
    }
    if (!allowDecimal) {
      filtered = filtered.replace('.', '');
    }
    // Remove leading zeros
    if (filtered.startsWith('0') && filtered.length > 1 && !filtered.startsWith('0.')) {
      filtered = filtered.replace(/^0+/, '');
      if (filtered === '') filtered = '0';
    }
    return filtered;
  };

  const updateProductField = (index, field, value) => {
    const updated = [...editableProducts];
    
    // Filter the input value to only allow numbers
    let filteredValue = value;
    if (field === 'salesQty' || field === 'bonusQty') {
      filteredValue = filterNumericValue(value, false);
    } else if (field === 'sellingPrice' || field === 'discount') {
      filteredValue = filterNumericValue(value, true);
    }
    
    const numValue = parseFloat(filteredValue) || 0;
    
    if (field === 'salesQty' || field === 'bonusQty') {
      updated[index][field] = numValue;
      updated[index].totalQty = (updated[index].salesQty || 0) + (updated[index].bonusQty || 0);
      
      const sellingPrice = updated[index].sellingPrice || 0;
      const discount = updated[index].discount || 0;
      updated[index].netSellingAmount = (sellingPrice * (updated[index].salesQty || 0)) - discount;
      updated[index].amount = (sellingPrice * (updated[index].salesQty || 0)) - discount;
      
      updated[index].averageUnitPrice = updated[index].totalQty > 0 
        ? updated[index].netSellingAmount / updated[index].totalQty 
        : 0;
    }
    
    if (field === 'sellingPrice') {
      updated[index][field] = numValue;
      updated[index].netSellingAmount = (numValue * (updated[index].salesQty || 0)) - (updated[index].discount || 0);
      updated[index].amount = (numValue * (updated[index].salesQty || 0)) - (updated[index].discount || 0);
      updated[index].averageUnitPrice = updated[index].totalQty > 0 
        ? updated[index].netSellingAmount / updated[index].totalQty 
        : 0;
    }
    
    if (field === 'discount') {
      updated[index][field] = numValue;
      updated[index].netSellingAmount = ((updated[index].sellingPrice || 0) * (updated[index].salesQty || 0)) - numValue;
      updated[index].amount = ((updated[index].sellingPrice || 0) * (updated[index].salesQty || 0)) - numValue;
      updated[index].averageUnitPrice = updated[index].totalQty > 0 
        ? updated[index].netSellingAmount / updated[index].totalQty 
        : 0;
    }
    
    setEditableProducts(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    const cleanedProducts = editableProducts.map(({ _tempId, ...product }) => product);
    onUpdateProducts(cleanedProducts);
    onClose();
  };

  const canSave = hasChanges && editableProducts.length > 0;

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[60]">
      <div className="bg-white w-full max-w-5xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Edit size={20} /> {title}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Edit product quantities, prices, or discounts. Changes will recalculate totals automatically.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Product Name</th>
                <th className="px-3 py-2 text-left">Sales Qty</th>
                <th className="px-3 py-2 text-left">Bonus Qty</th>
                <th className="px-3 py-2 text-left">Total Qty</th>
                <th className="px-3 py-2 text-left">Selling Price ($)</th>
                <th className="px-3 py-2 text-left">Discount ($)</th>
                <th className="px-3 py-2 text-left">Net Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              {editableProducts.map((product, idx) => (
                <tr key={product._tempId} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    {product.productName || product.name}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={product.salesQty || 0}
                      onChange={(e) => updateProductField(idx, 'salesQty', e.target.value)}
                      onKeyDown={(e) => {
                        // Prevent 'e', 'E', '-', '+' characters
                        if (e.key === 'e' || e.key === 'E' || e.key === '-' || e.key === '+') {
                          e.preventDefault();
                        }
                      }}
                      className="w-24 border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-200"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={product.bonusQty || 0}
                      onChange={(e) => updateProductField(idx, 'bonusQty', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'e' || e.key === 'E' || e.key === '-' || e.key === '+') {
                          e.preventDefault();
                        }
                      }}
                      className="w-24 border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-200"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {(product.salesQty || 0) + (product.bonusQty || 0)}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={product.sellingPrice || 0}
                      onChange={(e) => updateProductField(idx, 'sellingPrice', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'e' || e.key === 'E') {
                          e.preventDefault();
                        }
                      }}
                      className="w-28 border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-200"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={product.discount || 0}
                      onChange={(e) => updateProductField(idx, 'discount', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'e' || e.key === 'E') {
                          e.preventDefault();
                        }
                      }}
                      className="w-28 border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-200"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-indigo-600">
                    ${(product.netSellingAmount || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2">
                  {editableProducts.reduce((sum, p) => sum + (p.salesQty || 0), 0)}
                </td>
                <td className="px-3 py-2">
                  {editableProducts.reduce((sum, p) => sum + (p.bonusQty || 0), 0)}
                </td>
                <td className="px-3 py-2">
                  {editableProducts.reduce((sum, p) => sum + (p.salesQty || 0) + (p.bonusQty || 0), 0)}
                </td>
                <td className="px-3 py-2">-</td>
                <td className="px-3 py-2 text-red-600">
                  ${editableProducts.reduce((sum, p) => sum + (p.discount || 0), 0).toFixed(2)}
                </td>
                <td className="px-3 py-2 text-green-600">
                  ${editableProducts.reduce((sum, p) => sum + (p.netSellingAmount || 0), 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer ${canSave ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ==========================================
// DuplicateInvoicesModal
// ==========================================
const DuplicateInvoicesModal = ({
  isOpen,
  onClose,
  duplicates,
  onSkip,
  onCancel,
}) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold text-yellow-600 mb-4 flex items-center gap-2">
          <AlertTriangle size={20} />
          Duplicate Invoice Numbers Found
        </h2>
        <p className="mb-3 text-gray-700">
          The following invoice numbers already exist in the system:
        </p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-h-60 overflow-y-auto mb-4">
          <ul className="list-disc list-inside text-yellow-800">
            {duplicates.map((inv, idx) => (
              <li key={idx}>{inv}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          You can skip these duplicates (they will be removed from the import
          list) or cancel the import.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
          >
            Cancel Import
          </button>
          <button
            onClick={onSkip}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg"
          >
            Skip Duplicates
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ==========================================
// StockValidationModal
// ==========================================
const StockValidationModal = ({
  isOpen,
  onClose,
  stockValidationResult,
  onProceed,
  onCancel,
  title = "Stock Issues",
}) => {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen || !stockValidationResult) return null;

  const {
    stockIssues = [],
    summary = {},
    importBlocked = false,
  } = stockValidationResult;

  const isBlocked =
    importBlocked ||
    (summary.hasInsufficientStock && summary.totalInsufficient > 0);

  const downloadStockIssuesExcel = useCallback(() => {
    try {
      const excelData = stockIssues.map((issue, index) => ({
        "S.No": index + 1,
        "MR Name": issue.mrName || "",
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
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          {isBlocked ? (
            <>❌ Insufficient {title} - Import Blocked</>
          ) : (
            <>⚠️ Missing Products - Review Required</>
          )}
        </h2>

        <div className="flex gap-3 mb-4">
          <button
            onClick={downloadStockIssuesExcel}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm"
          >
            <Download size={14} />
            {stockIssues.length} Stock Issues Excel
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            ["Total Required", summary.totalRequired || 0],
            ["Total Available", summary.totalAvailable || 0],
            ["Insufficient Stock", summary.totalInsufficient || 0],
            ["Missing Products", summary.missingProducts || 0],
          ].map(([label, val]) => (
            <div key={label} className="bg-gray-50 p-3 rounded-lg text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-xl font-bold text-gray-800">{val}</div>
            </div>
          ))}
        </div>

        <div
          className={`p-4 rounded-lg mb-4 ${
            isBlocked
              ? "bg-red-50 border border-red-200"
              : "bg-yellow-50 border border-yellow-200"
          }`}
        >
          {isBlocked ? (
            <>
              <p className="font-semibold text-red-800">
                ⛔ IMPORT BLOCKED: {summary.totalInsufficient || 0} products
                have insufficient stock.
              </p>
              <ol className="mt-2 text-sm text-red-700 list-decimal list-inside space-y-1">
                <li>Update inventory to have sufficient stock</li>
                <li>Or reduce quantities in your import file</li>
                <li>Then try the import again</li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-semibold text-yellow-800">
                ⚠️ Missing Products Found: {summary.missingProducts || 0}{" "}
                products are not in inventory.
              </p>
              <ol className="mt-2 text-sm text-yellow-700 list-decimal list-inside space-y-1">
                <li>Be created automatically during import</li>
                <li>Have zero initial stock</li>
                <li>Appear in your product catalog</li>
              </ol>
            </>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="bg-gray-50 px-4 py-2 font-medium text-sm">
            Stock Issues Details ({stockIssues.length} products)
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {[
                    "Product Name",
                    "Required Quantity",
                    "Available Stock",
                    "Shortage",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockIssues.map((issue, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{issue.productName}</td>
                    <td className="px-3 py-2">{issue.totalRequired}</td>
                    <td className="px-3 py-2">{issue.availableStock}</td>
                    <td className="px-3 py-2">{issue.insufficientQty || 0}</td>
                    <td className="px-3 py-2">
                      {!issue.productExists
                        ? "⚠️ Missing"
                        : issue.insufficient
                          ? "❌ Insufficient"
                          : "✅ Available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          {isBlocked ? (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
            >
              Cancel Import
            </button>
          ) : (
            <>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={onProceed}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg"
              >
                Proceed with Missing Products
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ==========================================
// MRValidationModal
// ==========================================
const MRValidationModal = ({
  isOpen,
  onClose,
  mrValidationResult,
  onProceed,
}) => {
  if (!isOpen || !mrValidationResult) return null;
  const { mrIssues = [] } = mrValidationResult;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          ⚠️ Invalid MRs Detected
        </h2>
        <div className="inline-block bg-yellow-100 text-yellow-800 text-sm px-3 py-1 rounded-full mb-4">
          {mrIssues.length} Invalid MRs
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 text-sm text-yellow-800">
          <p className="font-semibold mb-1">
            ⚠️ Warning: These MRs are not registered in the Staff system.
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>MR names will be saved as provided</li>
            <li>You can add these MRs to Staff module later</li>
            <li>Reports may show "Unknown" for unregistered MRs</li>
          </ol>
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="bg-gray-50 px-4 py-2 font-medium text-sm">
            Invalid MRs List ({mrIssues.length} MRs)
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {["MR Name", "Error", "Affected Invoices"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mrIssues.map((issue, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{issue.mrName}</td>
                    <td className="px-3 py-2 text-red-600">{issue.message}</td>
                    <td className="px-3 py-2">
                      {issue.affectedCount} invoices
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg"
          >
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ==========================================
// FailedInvoicesModal
// ==========================================
const FailedInvoicesModal = ({ isOpen, onClose, failedInvoices }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);
  const [filterType, setFilterType] = useState("all");

  if (!isOpen) return null;
  const list = failedInvoices || [];

  const classify = (inv) => {
    const msg = (inv.message || inv.error || "").toLowerCase();
    const type = (inv.type || "").toLowerCase();
    if (
      type === "duplicate_skipped" ||
      msg.includes("duplicate") ||
      msg.includes("already exists")
    )
      return {
        label: "Duplicate",
        color: "bg-yellow-100 text-yellow-700 border-yellow-300",
      };
    if (
      type === "mr_validation_error" ||
      (msg.includes("mr") && msg.includes("not found"))
    )
      return {
        label: "MR Not Found",
        color: "bg-purple-100 text-purple-700 border-purple-300",
      };
    if (msg.includes("insufficient") && msg.includes("stock"))
      return {
        label: "Insufficient Stock",
        color: "bg-orange-100 text-orange-700 border-orange-300",
      };
    if (msg.includes("product") && msg.includes("not found"))
      return {
        label: "Product Missing",
        color: "bg-blue-100 text-blue-700 border-blue-300",
      };
    if (msg.includes("customer"))
      return {
        label: "Customer Issue",
        color: "bg-pink-100 text-pink-700 border-pink-300",
      };
    if (
      type === "validation_error" ||
      msg.includes("required") ||
      msg.includes("invalid")
    )
      return {
        label: "Validation Error",
        color: "bg-gray-100 text-gray-700 border-gray-300",
      };
    return {
      label: "Import Error",
      color: "bg-red-100 text-red-700 border-red-300",
    };
  };

  const summary = list.reduce((acc, inv) => {
    const { label } = classify(inv);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const filtered = list.filter((inv) => {
    const matchesType =
      filterType === "all" || classify(inv).label === filterType;
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      String(inv.invoiceNumber || "")
        .toLowerCase()
        .includes(q) ||
      String(inv.mrName || "")
        .toLowerCase()
        .includes(q) ||
      String(inv.customerName || "")
        .toLowerCase()
        .includes(q) ||
      String(inv.message || inv.error || "")
        .toLowerCase()
        .includes(q);
    return matchesType && matchesSearch;
  });

  const fixTips = {
    Duplicate:
      "These invoices already exist. Remove them from your Excel file and re-import.",
    "MR Not Found":
      "The MR name doesn't match any Staff record. Add the MR in Staff module first or correct the spelling.",
    "Insufficient Stock":
      "Not enough stock in warehouse / MR hand. Top up stock first or reduce quantities in your file.",
    "Product Missing":
      "Product doesn't exist in inventory. Add it in the Product module first.",
    "Customer Issue":
      "Customer code not found. Verify it exists in the Customer module.",
    "Validation Error":
      "Required fields are missing or have invalid values (e.g. Invoice Number or Qty).",
    "Import Error":
      "Unexpected error. Read the full reason below and fix the data in your file.",
  };

  const downloadReport = () => {
    try {
      const rows = list.map((inv, idx) => ({
        "S.No": idx + 1,
        "Row (Excel)": inv.row || "",
        "Invoice Number": inv.invoiceNumber || "Unknown",
        "MR Name": inv.mrName || "",
        "Customer Name": inv.customerName || "",
        "Error Category": classify(inv).label,
        "Reason / Message": inv.message || inv.error || "Unknown error",
        "Error Type Code": inv.type || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Failed Invoices");
      XLSX.writeFile(
        wb,
        `failed_invoices_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      showToast("success", "Failed invoices report downloaded");
    } catch (err) {
      showToast("error", "Failed to download report");
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl relative max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
              <AlertCircle size={22} />
              {list.length} Invoice{list.length !== 1 ? "s" : ""} Failed to
              Import
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Review the reasons below, fix the issues in your Excel file, then
              re-import.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 cursor-pointer flex-shrink-0 ml-4 mt-1"
          >
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
              Filter by:
            </span>
            {Object.entries(summary).map(([label, count]) => {
              const { color } = classify({
                message: label.toLowerCase(),
                type: "",
              });
              const active = filterType === label;
              return (
                <button
                  key={label}
                  onClick={() => setFilterType(active ? "all" : label)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer select-none transition-all ${color} ${active ? "ring-2 ring-offset-1 ring-current shadow-sm scale-105" : "opacity-75 hover:opacity-100"}`}
                >
                  {label}: {count}
                </button>
              );
            })}
            {filterType !== "all" && (
              <button
                onClick={() => setFilterType("all")}
                className="text-xs text-gray-400 hover:text-gray-600 underline px-2"
              >
                Show all
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={14}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search invoice #, MR name, error message…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-200 outline-none"
              />
            </div>
            <button
              onClick={downloadReport}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              <Download size={15} /> Download Report (.xlsx)
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No results match your search / filter.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50 text-red-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold w-16">
                      Row
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[130px]">
                      Invoice No
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[120px]">
                      MR Name
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[130px]">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[140px]">
                      Error Type
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Reason
                    </th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv, idx) => {
                    const { label, color } = classify(inv);
                    const reason = inv.message || inv.error || "Unknown error";
                    const isLong = reason.length > 90;
                    const isExpanded = expandedRow === idx;
                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className={`border-t transition-colors ${isExpanded ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                        >
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                            {inv.row ? `#${inv.row}` : "—"}
                           </td>
                          <td className="px-4 py-3 font-semibold text-gray-800">
                            {inv.invoiceNumber || "Unknown"}
                           </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {inv.mrName || "—"}
                           </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {inv.customerName || "—"}
                           </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold px-2 py-1 rounded-full border ${color}`}
                            >
                              {label}
                            </span>
                           </td>
                          <td className="px-4 py-3 text-red-700 text-xs max-w-xs leading-relaxed">
                            {isLong && !isExpanded
                              ? `${reason.slice(0, 90)}…`
                              : reason}
                           </td>
                          <td className="px-3 py-3 text-center">
                            {isLong && (
                              <button
                                onClick={() =>
                                  setExpandedRow(isExpanded ? null : idx)
                                }
                                className="text-gray-400 hover:text-gray-700 cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronDown size={15} />
                                ) : (
                                  <ChevronRight size={15} />
                                )}
                              </button>
                            )}
                           </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-red-100 bg-red-50">
                            <td colSpan={7} className="px-6 py-3 space-y-2">
                              <div className="bg-white border border-red-200 rounded-lg p-3 text-xs text-red-800 font-mono break-all whitespace-pre-wrap leading-relaxed">
                                {reason}
                              </div>
                              {fixTips[label] && (
                                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                  <AlertTriangle
                                    size={13}
                                    className="flex-shrink-0 mt-0.5"
                                  />
                                  <span>
                                    <strong>How to fix:</strong>{" "}
                                    {fixTips[label]}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <p className="text-xs text-gray-500">
            {list.length} invoice{list.length !== 1 ? "s" : ""} failed · Fix the
            issues · Re-import your corrected file
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ==========================================
// MrStockValidationModal
// ==========================================
const MrStockValidationModal = ({ isOpen, onClose, stockIssues, onCancel }) => {
  const [expandedMRs, setExpandedMRs] = useState(new Set());
  const [viewMode, setViewMode] = useState("mr");

  if (!isOpen || !stockIssues || stockIssues.length === 0) return null;

  const groupedByMR = useMemo(() => {
    const map = new Map();
    stockIssues.forEach((issue) => {
      const mrName = issue.mrName || "Unknown MR";
      const normMr = mrName.toLowerCase().trim();
      const normProd = issue.productName.toLowerCase().trim();
      if (!map.has(normMr))
        map.set(normMr, { originalMrName: mrName, products: new Map() });
      const mrGroup = map.get(normMr);
      if (!mrGroup.products.has(normProd)) {
        mrGroup.products.set(normProd, {
          originalProductName: issue.productName,
          totalRequired: 0,
          availableStock: 0,
          insufficientQty: 0,
          productExists: issue.productExists,
        });
      }
      const productData = mrGroup.products.get(normProd);
      productData.totalRequired += issue.totalRequired;
      productData.availableStock = issue.availableStock;
      productData.insufficientQty += issue.insufficientQty;
    });
    return map;
  }, [stockIssues]);

  const allProductsList = useMemo(() => {
    const map = new Map();
    stockIssues.forEach((issue) => {
      const normProd = issue.productName.toLowerCase().trim();
      if (!map.has(normProd)) {
        map.set(normProd, {
          originalProductName: issue.productName,
          totalRequired: 0,
          totalAvailable: 0,
          totalInsufficient: 0,
          productExists: issue.productExists,
        });
      }
      const d = map.get(normProd);
      d.totalRequired += issue.totalRequired;
      d.totalAvailable += issue.availableStock;
      d.totalInsufficient += issue.insufficientQty;
    });
    return Array.from(map.values());
  }, [stockIssues]);

  const toggleMR = (normMr) => {
    setExpandedMRs((prev) => {
      const next = new Set(prev);
      if (next.has(normMr)) next.delete(normMr);
      else next.add(normMr);
      return next;
    });
  };

  const isExpanded = (normMr) =>
    expandedMRs.has(normMr) || expandedMRs.size === 0;

  const downloadGroupedReport = () => {
    try {
      const rows = [];
      if (viewMode === "mr") {
        groupedByMR.forEach((mrGroup) => {
          mrGroup.products.forEach((productData) => {
            rows.push({
              "MR Name": mrGroup.originalMrName,
              "Product Name": productData.originalProductName,
              "Required Quantity": productData.totalRequired,
              "Available Stock": productData.availableStock,
              Shortage: productData.insufficientQty,
              Status: productData.productExists
                ? "Insufficient"
                : "Product Not Found",
            });
          });
        });
      } else {
        allProductsList.forEach((p) => {
          rows.push({
            "Product Name": p.originalProductName,
            "Required Quantity": p.totalRequired,
            "Available Stock": p.totalAvailable,
            Shortage: p.totalInsufficient,
            Status: p.productExists ? "Insufficient" : "Product Not Found",
          });
        });
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "MR Stock Issues");
      XLSX.writeFile(
        wb,
        `mr_stock_issues_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      showToast("success", "Report downloaded");
    } catch (err) {
      showToast("error", "Failed to download report");
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-red-600 mb-4 flex items-center gap-2">
          <AlertTriangle size={20} />
          Insufficient MR Hand Stock
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {stockIssues.length} product issue(s) have insufficient stock in the
          respective MR's hand.
        </p>
        <div className="flex gap-2 mb-4">
          {["mr", "all"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === mode ? "bg-red-600 text-white" : "bg-gray-200 text-gray-700"}`}
            >
              {mode === "mr" ? "Group by MR" : "All Products (Flat)"}
            </button>
          ))}
        </div>
        <div className="flex justify-end mb-4">
          <button
            onClick={downloadGroupedReport}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm"
          >
            <Download size={14} /> Download Report
          </button>
        </div>
        {viewMode === "mr" ? (
          <div className="space-y-3">
            {Array.from(groupedByMR.entries()).map(([normMr, mrGroup]) => {
              const productsArray = Array.from(mrGroup.products.values());
              const expanded = isExpanded(normMr);
              return (
                <div
                  key={normMr}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleMR(normMr)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-red-500" />
                      <span className="font-semibold text-red-800">
                        {mrGroup.originalMrName}
                      </span>
                      <span className="bg-red-200 text-red-800 text-xs px-2 py-0.5 rounded-full">
                        {productsArray.length} product
                        {productsArray.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {expanded ? (
                      <ChevronDown size={16} className="text-red-400" />
                    ) : (
                      <ChevronRight size={16} className="text-red-400" />
                    )}
                  </button>
                  {expanded && (
                    <div className="p-4 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            {[
                              "Product Name",
                              "Required",
                              "Available",
                              "Shortage",
                            ].map((h) => (
                              <th
                                key={h}
                                className="px-4 py-2 text-left font-medium text-gray-600"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {productsArray.map((product) => (
                            <tr
                              key={product.originalProductName}
                              className="border-t"
                            >
                              <td className="px-4 py-2">
                                {product.originalProductName}
                              </td>
                              <td className="px-4 py-2">
                                {product.totalRequired}
                              </td>
                              <td className="px-4 py-2 text-orange-600">
                                {product.availableStock}
                              </td>
                              <td className="px-4 py-2 text-red-600 font-semibold">
                                {product.insufficientQty}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {[
                    "Sr.",
                    "Product Name",
                    "Required",
                    "Available",
                    "Shortage",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left font-medium text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allProductsList.map((product, index) => (
                  <tr key={product.originalProductName} className="border-t">
                    <td className="px-4 py-2">{index + 1}</td>
                    <td className="px-4 py-2">{product.originalProductName}</td>
                    <td className="px-4 py-2">{product.totalRequired}</td>
                    <td className="px-4 py-2">{product.totalAvailable}</td>
                    <td className="px-4 py-2 text-red-600 font-semibold">
                      {product.totalInsufficient}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
          >
            Cancel Import
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ==========================================
// ImportSalesModal (unchanged logic, kept intact)
// ==========================================
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
  const [duplicateInvoices, setDuplicateInvoices] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [mrStockValidationResult, setMrStockValidationResult] = useState(null);
  const [showMrStockValidation, setShowMrStockValidation] = useState(false);
  const [showMrStockGroupedModal, setShowMrStockGroupedModal] = useState(false);
  const [mrStockIssuesGrouped, setMrStockIssuesGrouped] = useState([]);
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
        setDuplicateInvoices([]);
        setMrStockValidationResult(null);
        setMrStockIssuesGrouped([]);
      }
      setShowParsedSection(false);
      setShowFailedInvoices(false);
      setShowStockValidation(false);
      setShowMRValidation(false);
      setShowDuplicateModal(false);
      setShowMrStockValidation(false);
      setShowMrStockGroupedModal(false);
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

  const parseExcelDate = useCallback((value) => {
    if (value === null || value === undefined || value === "")
      return new Date().toISOString().split("T")[0];
    try {
      if (value instanceof Date && !isNaN(value))
        return value.toISOString().split("T")[0];
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

  const parseExcelQuantity = useCallback((value) => {
    if (value === null || value === undefined || value === "") return 0;
    try {
      if (typeof value === "number") return Math.max(0, value);
      const cleaned = String(value)
        .trim()
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) || !isFinite(num) ? 0 : Math.max(0, num);
    } catch {
      return 0;
    }
  }, []);

  const parseExcelAmount = useCallback((value) => {
    if (value === null || value === undefined || value === "") return 0;
    try {
      if (typeof value === "number") return Math.max(0, value);
      const cleaned = String(value)
        .trim()
        .replace(/[$,\s]/g, "")
        .replace(/[^\d.-]/g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) || !isFinite(num) ? 0 : Math.max(0, num);
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
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              defval: "",
              raw: true,
            });

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
              reject(new Error("Could not find header row."));
              return;
            }

            const headerRow = rows[headerIndex];
            const dataRows = rows
              .slice(headerIndex + 1)
              .filter(
                (row) =>
                  Array.isArray(row) &&
                  row.some(
                    (cell) =>
                      cell !== null &&
                      cell !== undefined &&
                      String(cell).trim() !== "",
                  ),
              );
            if (dataRows.length === 0) {
              reject(new Error("No data rows found after the header row."));
              return;
            }

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

            for (let ri = 0; ri < dataRows.length; ri++) {
              const row = dataRows[ri];
              const excelRow = headerIndex + 2 + ri;
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
              const rawCreditDays = parseExcelAmount(
                getVal(row, col.creditDays),
              );
              const creditDays =
                rawCreditDays > 0 ? rawCreditDays : DEFAULT_CREDIT_DAYS;
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
                  creditDays,
                  paidAmount: paidAmount || 0,
                  products: [],
                  totalAmount: 0,
                  dueAmount: 0,
                  paymentStatus: paymentStatus || "Credit",
                  remark: remarks || "",
                  isMrSaleImport: importSaleType === "mr",
                  saleType: importSaleType === "mr" ? "MR Sale" : "Normal Sale",
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

            const validInvoices = Object.values(groupedInvoices).filter(
              (inv) => inv.products && inv.products.length > 0,
            );
            validInvoices.forEach((inv) => {
              inv.dueAmount = Math.max(
                0,
                inv.totalAmount - (inv.paidAmount || 0),
              );
            });

            if (validInvoices.length === 0) {
              let errorMsg = "No valid invoices found. ";
              if (validationErrors.length > 0)
                errorMsg += `${validationErrors.length} row(s) had validation errors.`;
              else errorMsg += "No data rows found after the header row.";
              reject(new Error(errorMsg));
              return;
            }

            resolve({ validInvoices, validationErrors });
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(file);
      });
    },
    [parseExcelDate, parseExcelQuantity, parseExcelAmount, importSaleType],
  );

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
        if (validInvoices.length === 0)
          throw new Error("No valid invoices found in the file");
        if (importSaleType === "mr") {
          validInvoices.forEach((inv) => {
            inv.isMrSaleImport = true;
            inv.saleType = "MR Sale";
          });
        } else {
          validInvoices.forEach((inv) => {
            inv.saleType = "Normal Sale";
          });
        }
        setParsedData(validInvoices);
        setImportErrorDetails(validationErrors);
        if (validationErrors.length > 0)
          showToast(
            "warning",
            `Found ${validInvoices.length} valid invoices with ${validationErrors.length} validation errors`,
          );
        setShowParsedSection(true);
      } catch (error) {
        showToast("error", `Failed to process file: ${error.message}`);
        resetModal(false);
      } finally {
        setIsUploading(false);
        setIsProcessingFile(false);
      }
    },
    [importSaleType, resetModal, parseExcelFile],
  );

  const checkDuplicateInvoices = useCallback(async (invoices) => {
    try {
      const invoiceNumbers = invoices
        .map((inv) => inv.invoiceNumber)
        .filter(Boolean);
      if (invoiceNumbers.length === 0) return [];
      const response = await axios.post(
        `${backendUrl}/api/sales/check-duplicates`,
        { invoiceNumbers },
        getAuthHeaders(),
      );
      if (response.data.success) return response.data.existingInvoices;
      return [];
    } catch (error) {
      showToast("error", "Failed to check for duplicate invoices");
      return [];
    }
  }, []);

  const validateMRStockBeforeImport = useCallback(async (invoices) => {
    try {
      setIsValidatingStock(true);
      setImportMessage(
        `Checking MR hand stock for ${invoices.length} invoices...`,
      );
      const response = await axios.post(
        `${backendUrl}/api/sales/validate-import-mr-stock`,
        { invoices },
        getAuthHeaders(),
      );
      setIsValidatingStock(false);
      return response.data.validationResult;
    } catch (error) {
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
          hasCriticalIssues: true,
          hasInsufficientStock: false,
          importBlocked: true,
        },
        importBlocked: true,
        blockReason: "VALIDATION_ERROR",
        message: `MR stock validation failed: ${error.message}`,
      };
    }
  }, []);

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
      if (response.data.success)
        return {
          mrIssues: [],
          totalInvoices: invoices.length,
          summary: {
            totalMRs: mrNames.size,
            validMRs: mrNames.size,
            invalidMRs: 0,
          },
        };
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
        if (response.data.success) return response.data.validationResult;
        else
          throw new Error(response.data.message || "Stock validation failed");
      } catch (error) {
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

  const handleProceedWithMrStockIssues = useCallback(async () => {
    if (!mrStockValidationResult) return;
    if (mrStockValidationResult.summary?.hasInsufficientStock) {
      showToast("error", "Cannot proceed – insufficient MR hand stock");
      return;
    }
    setShowMrStockValidation(false);
    await handleProductImport(parsedData);
  }, [mrStockValidationResult, parsedData]);

  const handleCancelMrStockValidation = useCallback(() => {
    setShowMrStockValidation(false);
    setMrStockValidationResult(null);
    setIsValidatingStock(false);
    setImportStep("");
    showToast("info", "Import cancelled");
  }, []);
  const handleMrStockGroupedCancel = useCallback(() => {
    setShowMrStockGroupedModal(false);
    setMrStockIssuesGrouped([]);
    setIsValidatingStock(false);
    setImportStep("");
    showToast("info", "Import cancelled");
  }, []);

  const handleSkipDuplicates = useCallback(() => {
    const duplicateSet = new Set(duplicateInvoices);
    const filteredData = parsedData.filter(
      (inv) => !duplicateSet.has(inv.invoiceNumber),
    );
    setParsedData(filteredData);
    setShowDuplicateModal(false);
    setDuplicateInvoices([]);
    showToast(
      "info",
      `Skipped ${duplicateInvoices.length} duplicate invoice(s). Remaining: ${filteredData.length}`,
    );
    handleImportData();
  }, [duplicateInvoices, parsedData]);

  const handleImportData = useCallback(async () => {
    if (parsedData.length === 0) {
      showToast("error", "No data to import");
      return;
    }
    const duplicates = await checkDuplicateInvoices(parsedData);
    if (duplicates.length > 0) {
      setDuplicateInvoices(duplicates);
      setShowDuplicateModal(true);
      return;
    }
    if (importSaleType === "mr") {
      const mrValResult = await validateMRsBeforeImport(parsedData);
      if (mrValResult.mrIssues && mrValResult.mrIssues.length > 0) {
        setMrValidationResult(mrValResult);
        setShowMRValidation(true);
        return;
      }
    }
    let svResult;
    if (importSaleType === "mr")
      svResult = await validateMRStockBeforeImport(parsedData);
    else svResult = await validateStockBeforeImport(parsedData);
    if (svResult.stockIssues?.length > 0) {
      const insufficientStockIssues = svResult.stockIssues.filter(
        (i) => i.productExists && i.insufficient,
      );
      const missingProductIssues = svResult.stockIssues.filter(
        (i) => !i.productExists,
      );
      if (insufficientStockIssues.length > 0) {
        if (importSaleType === "mr") {
          setMrStockIssuesGrouped(insufficientStockIssues);
          setShowMrStockGroupedModal(true);
        } else {
          setMrStockValidationResult({
            ...svResult,
            stockIssues: insufficientStockIssues,
            summary: {
              ...svResult.summary,
              totalInsufficient: insufficientStockIssues.length,
              hasInsufficientStock: true,
            },
            importBlocked: true,
            message: `${insufficientStockIssues.length} products have insufficient MR hand stock.`,
          });
          setShowMrStockValidation(true);
        }
        return;
      }
      if (
        missingProductIssues.length > 0 &&
        insufficientStockIssues.length === 0
      ) {
        if (importSaleType === "mr") {
          setMrStockIssuesGrouped(missingProductIssues);
          setShowMrStockGroupedModal(true);
        } else {
          setMrStockValidationResult({
            ...svResult,
            stockIssues: missingProductIssues,
            summary: {
              ...svResult.summary,
              totalInsufficient: missingProductIssues.length,
              hasInsufficientStock: false,
            },
            importBlocked: false,
            message: `${missingProductIssues.length} products not found in MR hand stock.`,
          });
          setShowMrStockValidation(true);
        }
        return;
      }
    }
    await handleProductImport(parsedData);
  }, [
    parsedData,
    importSaleType,
    checkDuplicateInvoices,
    validateMRsBeforeImport,
    validateMRStockBeforeImport,
    validateStockBeforeImport,
  ]);

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
          isMRSale: isMrSale,
          saleType: isMrSale ? "MR Sale" : "Normal Sale",
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
            skipDuplicates: true,
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
        } else throw new Error(response.data.message || "Import failed");
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
    setDuplicateInvoices([]);
    setShowDuplicateModal(false);
    setMrStockValidationResult(null);
    setShowMrStockValidation(false);
    setMrStockIssuesGrouped([]);
    setShowMrStockGroupedModal(false);
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
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-40">
        <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Upload size={20} /> Import Sales Data
          </h2>
          {!isImporting && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-4">
              <button
                onClick={() => {
                  setImportSaleType("normal");
                  resetParsedData();
                }}
                disabled={isImporting || isValidatingStock || isValidatingMR}
                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${importSaleType === "normal" ? "bg-indigo-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
              >
                <Package size={16} /> Normal Sale{" "}
                <span className="text-xs opacity-75">Warehouse Stock</span>
              </button>
              <button
                onClick={() => {
                  setImportSaleType("mr");
                  resetParsedData();
                }}
                disabled={isImporting || isValidatingStock || isValidatingMR}
                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${importSaleType === "mr" ? "bg-green-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
              >
                <UserPlus size={16} /> MR Sale{" "}
                <span className="text-xs opacity-75">MR Hand Stock</span>
              </button>
            </div>
          )}
          {!isImporting && (
            <div
              className={`p-3 rounded-lg mb-4 text-sm ${importSaleType === "normal" ? "bg-indigo-50 text-indigo-800" : "bg-green-50 text-green-800"}`}
            >
              {importSaleType === "normal" ? (
                <p>
                  📦 <strong>Normal Sale:</strong> Stock will be deducted from
                  the main warehouse inventory.
                </p>
              ) : (
                <p>
                  👤 <strong>MR Sale:</strong> Stock will be deducted from each
                  MR's hand stock.
                </p>
              )}
            </div>
          )}
          {!showParsedSection &&
            !isUploading &&
            !isProcessingFile &&
            !isImporting && (
              <div
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border mb-4 ${importSaleType === "normal" ? "bg-indigo-50 border-indigo-200" : "bg-green-50 border-green-200"}`}
              >
                <div className="flex items-center gap-2">
                  <Download
                    size={16}
                    className={
                      importSaleType === "normal"
                        ? "text-indigo-500 flex-shrink-0"
                        : "text-green-500 flex-shrink-0"
                    }
                  />
                  <p
                    className={`text-sm ${importSaleType === "normal" ? "text-indigo-700" : "text-green-700"}`}
                  >
                    First time importing? Download the sample template to get
                    the correct format.
                  </p>
                </div>
                <SampleExcelDownloadSale saleType={importSaleType} />
              </div>
            )}
          {!showParsedSection &&
            !isUploading &&
            !isProcessingFile &&
            !isImporting && (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors mb-4">
                <Upload size={40} className="text-gray-400 mb-3" />
                <p className="font-medium text-gray-700">
                  Upload Excel/CSV File
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Drag & drop your file here or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Supported formats: Excel (.xlsx, .xls), CSV (.csv) | Max size:
                  20MB
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          {(isUploading || isProcessingFile) && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
              <p className="font-medium text-gray-700">
                {isUploading ? "Uploading..." : "Processing file..."}
              </p>
              <p className="text-sm text-gray-500 mt-1">{importMessage}</p>
            </div>
          )}
          {isValidatingMR && (
            <div className="text-center py-6 bg-yellow-50 rounded-lg mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600 mx-auto mb-2" />
              <p className="font-medium text-yellow-800">Validating MRs...</p>
              <p className="text-sm text-yellow-600">
                Checking MR names for {parsedData.length} invoices...
              </p>
            </div>
          )}
          {isValidatingStock && (
            <div className="text-center py-6 bg-blue-50 rounded-lg mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
              <p className="font-medium text-blue-800">
                Checking Stock Availability
              </p>
              <p className="text-sm text-blue-600">
                Validating stock for {parsedData.length} invoices...
              </p>
            </div>
          )}
          {showParsedSection && parsedData.length > 0 && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600" />
                  <span className="font-medium text-green-800">
                    File Successfully Parsed
                  </span>
                </div>
                <button
                  onClick={resetParsedData}
                  className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                >
                  <X size={14} /> Clear
                </button>
              </div>
              <p className="text-sm text-green-700 mb-3">
                Found {parsedData.length} valid invoices ready for import
              </p>
              {importErrorDetails.length > 0 && (
                <div className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1 rounded-full inline-block mb-3">
                  ⚠️ {importErrorDetails.length} rows skipped due to errors
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  ["Total Invoices", parsedData.length],
                  [
                    "Total Products",
                    parsedData.reduce(
                      (s, i) => s + (i.products?.length || 0),
                      0,
                    ),
                  ],
                  [
                    "Total Amount",
                    `$${parsedData.reduce((s, i) => s + (i.totalAmount || 0), 0).toFixed(2)}`,
                  ],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    className="bg-white rounded-lg p-3 text-center"
                  >
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="font-bold text-gray-800">{val}</div>
                  </div>
                ))}
              </div>
              {importSaleType === "mr" && (
                <p className="text-sm text-green-700 mb-3">
                  MRs detected in file:{" "}
                  {[
                    ...new Set(parsedData.map((i) => i.mrName).filter(Boolean)),
                  ].join(", ") || "None"}
                </p>
              )}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sample Data (First 3 invoices):
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        {[
                          "Invoice",
                          "MR",
                          "Products",
                          "Amount",
                          "Sale Type",
                        ].map((h) => (
                          <th key={h} className="px-2 py-1 text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 3).map((inv, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-2 py-1">{inv.invoiceNumber}</td>
                          <td className="px-2 py-1">{inv.mrName}</td>
                          <td className="px-2 py-1">
                            {inv.products?.length || 0}
                          </td>
                          <td className="px-2 py-1">
                            ${inv.totalAmount?.toFixed(2)}
                          </td>
                          <td className="px-2 py-1">{inv.saleType}</td>
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
              <div className="border border-red-200 rounded-lg mb-4 overflow-hidden">
                <div className="bg-red-50 px-4 py-2 font-medium text-sm text-red-800">
                  Validation Errors ({importErrorDetails.length})
                </div>
                <div className="overflow-x-auto max-h-40">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Row", "Invoice #", "Product", "Error"].map((h) => (
                          <th
                            key={h}
                            className="px-2 py-1 text-left font-medium text-gray-600"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importErrorDetails.slice(0, 10).map((err, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{err.row}</td>
                          <td className="px-2 py-1">{err.invoiceNumber}</td>
                          <td className="px-2 py-1">{err.productName}</td>
                          <td className="px-2 py-1 text-red-600">
                            {err.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          {isImporting && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-blue-800">
                  Importing{" "}
                  {importSaleType === "mr" ? "MR Sale" : "Normal Sale"} Data...
                </p>
                <span className="font-bold text-blue-800">
                  {serverProgress}%
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-3 mb-2">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${serverProgress}%` }}
                />
              </div>
              <p className="text-sm text-blue-700">
                {serverProcessed} / {serverTotal}
              </p>
              <p className="text-sm text-blue-600 mt-1">{importStep}</p>
              <button
                onClick={handleCancelImport}
                className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm"
              >
                Cancel Import
              </button>
            </div>
          )}
          {!isImporting &&
            showParsedSection &&
            parsedData.length > 0 &&
            !isValidatingStock &&
            !isValidatingMR && (
              <button
                onClick={handleImportData}
                className={`w-full py-3 rounded-lg font-semibold text-white mb-3 ${importSaleType === "mr" ? "bg-green-600 hover:bg-green-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
              >
                Start {importSaleType === "mr" ? "MR Sale" : "Normal Sale"}{" "}
                Import ({parsedData.length} invoices)
              </button>
            )}
          <div className="flex justify-between">
            {showParsedSection && parsedData.length > 0 && (
              <label className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer text-sm">
                Upload Different File
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg ml-auto"
            >
              {isImporting || isUploading ? "Cancel" : "Close"}
            </button>
          </div>
        </div>
      </div>

      {showDuplicateModal && (
        <DuplicateInvoicesModal
          isOpen={showDuplicateModal}
          onClose={() => setShowDuplicateModal(false)}
          duplicates={duplicateInvoices}
          onSkip={handleSkipDuplicates}
          onCancel={() => {
            setShowDuplicateModal(false);
            resetModal();
          }}
        />
      )}
      {showMrStockGroupedModal && mrStockIssuesGrouped.length > 0 && (
        <MrStockValidationModal
          isOpen={showMrStockGroupedModal}
          onClose={() => setShowMrStockGroupedModal(false)}
          stockIssues={mrStockIssuesGrouped}
          onCancel={handleMrStockGroupedCancel}
        />
      )}
      {showMrStockValidation && mrStockValidationResult && (
        <StockValidationModal
          isOpen={showMrStockValidation}
          onClose={() => setShowMrStockValidation(false)}
          onProceed={handleProceedWithMrStockIssues}
          onCancel={handleCancelMrStockValidation}
          stockValidationResult={mrStockValidationResult}
          title="MR Hand Stock Issues"
        />
      )}
      {showStockValidation && stockValidationResult && (
        <StockValidationModal
          isOpen={showStockValidation}
          onClose={() => setShowStockValidation(false)}
          onProceed={() => {}}
          onCancel={() => {}}
          stockValidationResult={stockValidationResult}
        />
      )}
      {showMRValidation && mrValidationResult && (
        <MRValidationModal
          isOpen={showMRValidation}
          onClose={() => setShowMRValidation(false)}
          onProceed={() => {
            setShowMRValidation(false);
            handleImportData();
          }}
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

// ==========================================
// ProductDetailsModal — role-aware LC & P/L
// ==========================================
const ProductDetailsModal = ({
  isOpen,
  onClose,
  products,
  title = "Product Details",
}) => {
  const showSensitiveColumns = isSuperAdmin();

  if (!isOpen) return null;

  const totals = useMemo(() => {
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

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          {title} ({products?.length || 0} items)
        </h2>
        {!products || products.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No products found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead className="bg-gray-100">
                <tr>
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
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap border-b"
                    >
                      {h}
                    </th>
                  ))}
                  {showSensitiveColumns && (
                    <>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap border-b">
                        LC ($)
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap border-b">
                        Profit / Loss ($)
                      </th>
                    </>
                  )}
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
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">
                        {product.productName || product.name || "N/A"}
                      </td>
                      <td className="px-3 py-2">{salesQty}</td>
                      <td className="px-3 py-2">{bonusQty}</td>
                      <td className="px-3 py-2">{totalQty}</td>
                      <td className="px-3 py-2">
                        ${Number(product.sellingPrice || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        ${Number(product.amount || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        ${Number(product.discount || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">${netAmount.toFixed(2)}</td>
                      <td className="px-3 py-2">${avgUnitPrice.toFixed(2)}</td>
                      {showSensitiveColumns && (
                        <>
                          <td className="px-3 py-2">${lc.toFixed(3)}</td>
                          <td
                            className={`px-3 py-2 font-medium ${profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            ${profitLoss.toFixed(3)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                <tr className="bg-gray-100 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2">{totals.totalSalesQty}</td>
                  <td className="px-3 py-2">{totals.totalBonusQty}</td>
                  <td className="px-3 py-2">
                    {totals.totalSalesQty + totals.totalBonusQty}
                  </td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2">
                    ${totals.totalAmount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    ${totals.totalDiscount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    ${totals.totalNetAmount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">-</td>
                  {showSensitiveColumns && (
                    <>
                      <td className="px-3 py-2">-</td>
                      <td
                        className={`px-3 py-2 ${totals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        ${totals.totalProfitLoss.toFixed(2)}
                      </td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ================== MAIN SALES COMPONENT ==================
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
  const [mrFullList, setMrFullList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [customerListLoading, setCustomerListLoading] = useState(false);
  const [hasPurchaseInventories, setHasPurchaseInventories] = useState(false);
  const [checkingPurchaseInventories, setCheckingPurchaseInventories] =
    useState(true);
  const [shouldCheckPurchase, setShouldCheckPurchase] = useState(true);
  const [productsList, setProductsList] = useState([]);
  const inputRef = useRef(null);
  const { statuses, loading } = useInitialSaleData();
  const [saleTypeTab, setSaleTypeTab] = useState("all");

  // State for product editing
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [pendingProductUpdates, setPendingProductUpdates] = useState(null);

  const canSeeSensitiveData = useMemo(() => isSuperAdmin(), []);

  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [provincesList, setProvincesList] = useState([]);
  const [zonesList, setZonesList] = useState([]);
  const [provincesLoading, setProvincesLoading] = useState(false);
  const [zonesLoading, setZonesLoading] = useState(false);
  const lastFetchedProvinceRef = useRef("");

  const [form, setForm] = useState({
    _id: null,
    recordingDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    mrName: "",
    mrId: "",
    customerName: "",
    customerCode: "",
    customerId: "",
    products: [],
    creditDays: DEFAULT_CREDIT_DAYS,
    dueDate: "",
    deliveryDate: "",
    paidAmount: 0,
    dueAmount: 0,
    totalAmount: 0,
    paymentStatus: "",
    remark: "",
    customerPhone: "",
    customerZone: "",
    customerProvince: "",
  });

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleMRChange = (selectedMr) => {
    setForm((prev) => ({
      ...prev,
      mrId: selectedMr._id ? String(selectedMr._id) : "",
      mrName: selectedMr.mrName,
    }));
  };

  const SALES_PER_PAGE = 9;

  const fetchProductsList = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/products`, {
        timeout: 5000,
      });
      if (response.data && Array.isArray(response.data))
        setProductsList(response.data);
      else if (response.data.products && Array.isArray(response.data.products))
        setProductsList(response.data.products);
      else if (response.data.data && Array.isArray(response.data.data))
        setProductsList(response.data.data);
    } catch (error) {
      console.error("Error fetching products list:", error);
    }
  }, []);

  const processSalesData = useCallback((data) => {
    const salesData = Array.isArray(data)
      ? data
      : data?.summaries || data?.data || [];
    if (!Array.isArray(salesData)) {
      setSales([]);
      return;
    }
    const sortedData = [...salesData].sort(
      (a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate),
    );
    setSales(sortedData);
  }, []);

  const fetchSaleSummaries = useCallback(async () => {
    try {
      setLoadingData(true);
      const response = await axios.get(`${backendUrl}/api/sales/all`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (
        response.data &&
        response.data.summaries &&
        Array.isArray(response.data.summaries)
      ) {
        processSalesData(response.data.summaries);
      } else {
        throw new Error("Invalid response format: missing summaries array");
      }
    } catch (error) {
      console.error("Fetch sale summaries error:", error);
      let errorMessage = "Failed to load sales";
      if (error.code === "ECONNABORTED") {
        errorMessage = "Request timed out. Please check your network.";
      } else if (error.response) {
        errorMessage = `Server error: ${error.response.status} ${error.response.statusText}`;
      } else if (error.request) {
        errorMessage =
          "Cannot reach server. Make sure backend is running on port 3001.";
      }
      showToast("error", errorMessage);
      setSales([]);
    } finally {
      setLoadingData(false);
    }
  }, [processSalesData]);

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

  const fetchProvinces = useCallback(async () => {
    setProvincesLoading(true);
    try {
      const response = await axios.get(`${backendUrl}/api/customers/provinces`);
      if (response.data.success) setProvincesList(response.data.data || []);
      else
        setProvincesList([
          { name: "Province A" },
          { name: "Province B" },
          { name: "Province C" },
        ]);
    } catch (error) {
      setProvincesList([
        { name: "Province A" },
        { name: "Province B" },
        { name: "Province C" },
      ]);
    } finally {
      setProvincesLoading(false);
    }
  }, []);

  const fetchZonesByProvince = useCallback(async (provinceName) => {
    if (!provinceName) {
      setZonesList([]);
      return;
    }
    setZonesLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/zones?province=${encodeURIComponent(provinceName)}`,
      );
      if (response.data.success) setZonesList(response.data.data || []);
      else setZonesList([{ name: provinceName }]);
    } catch (error) {
      setZonesList([{ name: provinceName }]);
    } finally {
      setZonesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSaleSummaries();
  }, [fetchSaleSummaries]);
  useEffect(() => {
    checkPurchaseInventories();
    fetchProductsList();
    fetchProvinces();
  }, [checkPurchaseInventories, fetchProductsList, fetchProvinces]);
  useEffect(() => {
    if (shouldCheckPurchase) {
      checkPurchaseInventories();
      setShouldCheckPurchase(false);
    }
  }, [shouldCheckPurchase, checkPurchaseInventories]);

  useEffect(() => {
    if (
      form.customerProvince &&
      form.customerProvince !== lastFetchedProvinceRef.current
    ) {
      lastFetchedProvinceRef.current = form.customerProvince;
      fetchZonesByProvince(form.customerProvince);
    } else if (!form.customerProvince) {
      setZonesList([]);
      lastFetchedProvinceRef.current = "";
    }
  }, [form.customerProvince, fetchZonesByProvince]);

  useEffect(() => {
    const handleInventoryUpdated = () => {
      fetchSaleSummaries();
      fetchProductsList();
    };
    window.addEventListener("inventory-updated", handleInventoryUpdated);
    return () =>
      window.removeEventListener("inventory-updated", handleInventoryUpdated);
  }, [fetchSaleSummaries, fetchProductsList]);

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
    const fetchDropdownData = async () => {
      setCustomerListLoading(true);
      try {
        const [mrs, customers] = await Promise.all([
          fetchMRList(),
          fetchCustomerList(),
        ]);
        if (mrs && mrs.success && Array.isArray(mrs.data)) {
          const names = [];
          const full = [];
          mrs.data.forEach((mr) => {
            if (typeof mr === "string") {
              const trimmed = mr.trim();
              names.push(trimmed);
              full.push({ _id: null, mrName: trimmed });
            } else if (mr && typeof mr === "object") {
              const name = mr.medicalRepName || mr.name || mr.fullName;
              const id = mr._id ? String(mr._id) : null;
              if (name) {
                const trimmedName = name.trim();
                names.push(trimmedName);
                full.push({ _id: id, mrName: trimmedName });
              }
            }
          });
          setMrList(names);
          setMrFullList(full);
        } else {
          setMrList([]);
          setMrFullList([]);
        }
        if (customers && customers.success && Array.isArray(customers.data)) {
          setCustomerList(
            customers.data.map((c) => ({ ...c, _id: String(c._id) })),
          );
        } else {
          setCustomerList([]);
        }
      } catch (error) {
        setMrList([]);
        setMrFullList([]);
        setCustomerList([]);
      } finally {
        setCustomerListLoading(false);
      }
    };
    fetchDropdownData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab, saleTypeTab]);

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
        showToast(
          "error",
          error.response?.data?.error ||
            error.response?.data?.message ||
            "Failed to delete selected sales",
        );
      }
    }
  }, [selected, fetchSaleSummaries]);

  const tableColumns = useMemo(() => {
    const base = [
      "invoiceNumber",
      "invoiceDate",
      "productCount",
      "mrName",
      "customerName",
      "totalAmount",
      "paymentStatus",
      "actions",
    ];
    return base;
  }, []);

  const allFields = useMemo(() => {
    const base = [
      { id: "invoiceNumber", name: "Invoice No", dbName: "invoiceNumber" },
      { id: "invoiceDate", name: "Invoice Date", dbName: "invoiceDate" },
      { id: "productCount", name: "Products", dbName: "products" },
      { id: "mrName", name: "MR Name", dbName: "mrName" },
      { id: "customerName", name: "Customer Name", dbName: "customerName" },
      { id: "totalAmount", name: "Total Amount ($)", dbName: "totalAmount" },
      { id: "paymentStatus", name: "Payment Status", dbName: "paymentStatus" },
      { id: "actions", name: "Actions", dbName: "actions" },
    ];
    return base;
  }, []);

  const mobileColumns = [
    "invoiceNumber",
    "customerName",
    "totalAmount",
    "actions",
  ];

  const paymentStatusTabs = useMemo(() => {
    if (!Array.isArray(sales) || sales.length === 0)
      return ["All", "Cash", "Credit"];
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
    uniqueStatuses.forEach((status) => {
      if (
        !baseTabs.includes(status) &&
        status !== "Cash" &&
        status !== "Credit"
      )
        baseTabs.push(status);
    });
    return baseTabs;
  }, [sales]);

  const saleTypeTabs = useMemo(
    () => [
      { id: "all", label: "All" },
      { id: "normal", label: "Normal Sale" },
      { id: "mr", label: "MR Sale" },
    ],
    [],
  );

  const filteredSales = useMemo(() => {
    if (!Array.isArray(sales)) return [];
    const lowerSearch = searchTerm.trim().toLowerCase();
    const tabStatus = selectedTab.toLowerCase();
    const tabSaleType = saleTypeTab;
    return sales.filter((sale) => {
      if (tabStatus !== "all") {
        const ps = (sale.paymentStatus || "").toLowerCase();
        if (ps !== tabStatus) return false;
      }
      if (tabSaleType === "mr") {
        if (!isMRSaleDoc(sale)) return false;
      } else if (tabSaleType === "normal") {
        if (isMRSaleDoc(sale)) return false;
      }
      if (!lowerSearch) return true;
      return [sale.invoiceNumber, sale.customerName, sale.mrName].some((f) =>
        (f ?? "").toString().toLowerCase().includes(lowerSearch),
      );
    });
  }, [sales, searchTerm, selectedTab, saleTypeTab]);

  const downloadData = useMemo(() => {
    if (isSampleDownloadFile) {
      if (saleTypeTab === "all") return sales;
      if (saleTypeTab === "normal") return sales.filter((s) => !isMRSaleDoc(s));
      if (saleTypeTab === "mr") return sales.filter((s) => isMRSaleDoc(s));
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
    setForm({ ...sale, products: sale.products || [] });
    setIsViewModalOpen(true);
  }, []);

  // Enhanced editSale function with product processing
  const editSale = useCallback(
    (sale) => {
      setSelectedSale(sale);
      const matchedMr = mrFullList.find(
        (mr) =>
          mr.mrName?.toLowerCase().trim() ===
          (sale.mrName || "").toLowerCase().trim(),
      );
      
      const processedProducts = (sale.products || []).map(p => ({
        ...p,
        salesQty: p.salesQty || 0,
        bonusQty: p.bonusQty || 0,
        totalQty: (p.salesQty || 0) + (p.bonusQty || 0),
        sellingPrice: p.sellingPrice || 0,
        discount: p.discount || 0,
        netSellingAmount: p.netSellingAmount || ((p.sellingPrice || 0) * (p.salesQty || 0)) - (p.discount || 0),
      }));
      
      setForm({
        ...sale,
        products: processedProducts,
        mrId: matchedMr
          ? String(matchedMr._id)
          : sale.mrId
            ? String(sale.mrId)
            : "",
        mrName: matchedMr ? matchedMr.mrName : sale.mrName || "",
        customerZone: sale.customerZone || "",
        customerProvince: sale.customerProvince || "",
        creditDays:
          sale.creditDays && sale.creditDays > 0
            ? sale.creditDays
            : DEFAULT_CREDIT_DAYS,
      });
      setIsEditModalOpen(true);
    },
    [mrFullList],
  );

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
          showToast(
            "error",
            error.response?.data?.error ||
              error.response?.data?.message ||
              "Failed to delete sale",
          );
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

  const formTotals = useMemo(
    () => calculateProductTotals(form.products),
    [form.products, calculateProductTotals],
  );

  const handlePaidChange = (e) => {
    const rawValue = e.target.value;
    const filtered = filterNumericInput(rawValue, true);
    e.target.value = filtered;
    const numericValue = parseFloat(filtered) || 0;
    setForm((prev) => {
      const net = formTotals.netAmount;
      const clampedPaid = Math.min(Math.max(numericValue, 0), net);
      const newDue = net - clampedPaid;
      const isFullyPaid = Math.abs(clampedPaid - net) < 0.001;
      return {
        ...prev,
        paidAmount: clampedPaid,
        dueAmount: newDue,
        creditDays: isFullyPaid ? "" : prev.creditDays,
        dueDate: isFullyPaid ? "" : prev.dueDate,
        paymentStatus: computePaymentStatus(clampedPaid, net),
      };
    });
  };

  const handleDueChange = (e) => {
    const rawValue = e.target.value;
    const filtered = filterNumericInput(rawValue, true);
    e.target.value = filtered;
    const numericValue = parseFloat(filtered) || 0;
    setForm((prev) => {
      const net = formTotals.netAmount;
      const clampedDue = Math.min(Math.max(numericValue, 0), net);
      const newPaid = net - clampedDue;
      const isFullyPaid = Math.abs(newPaid - net) < 0.001;
      return {
        ...prev,
        dueAmount: clampedDue,
        paidAmount: newPaid,
        creditDays: isFullyPaid ? "" : prev.creditDays,
        dueDate: isFullyPaid ? "" : prev.dueDate,
        paymentStatus: computePaymentStatus(newPaid, net),
      };
    });
  };

  const handleCreditDaysChange = (e) => {
    const rawValue = e.target.value;
    const filtered = filterNumericInput(rawValue, false);
    e.target.value = filtered;
    const days = filtered ? parseInt(filtered, 10) : DEFAULT_CREDIT_DAYS;
    let newDueDate = "";
    if (days > 0) {
      const today = new Date();
      today.setDate(today.getDate() + days);
      newDueDate = today.toISOString().split("T")[0];
    }
    setForm((prev) => ({ ...prev, creditDays: days, dueDate: newDueDate }));
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomerChange = useCallback(
    (customerId) => {
      if (!customerId) {
        setForm((prev) => ({
          ...prev,
          customerId: "",
          customerCode: "",
          customerName: "",
          customerPhone: "",
          customerZone: "",
          customerProvince: "",
        }));
        return;
      }
      const selectedCustomer = customerList.find((c) => c._id === customerId);
      if (selectedCustomer) {
        setForm((prev) => ({
          ...prev,
          customerId,
          customerCode: selectedCustomer.customerCode,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone || "",
          customerZone: selectedCustomer.zone || "",
          customerProvince: selectedCustomer.province || "",
        }));
      }
    },
    [customerList],
  );

  // Handle product update from EditProductModal
  const handleProductUpdate = useCallback((updatedProducts) => {
    setPendingProductUpdates(updatedProducts);
    const confirmChanges = async () => {
      const result = await confirmDialog({
        title: "Update Products",
        text: "Updating product quantities will affect the total amount. Are you sure?",
        icon: "warning",
        confirmButtonText: "Yes, update",
        cancelButtonText: "Cancel",
      });
      if (result.isConfirmed) {
        setForm(prev => ({
          ...prev,
          products: updatedProducts
        }));
        showToast("success", "Products updated. Please save the sale to apply changes.");
      }
      setPendingProductUpdates(null);
    };
    confirmChanges();
  }, []);

  const customerOptions = useMemo(() => {
    if (customerList.length === 0 && !customerListLoading)
      return [{ value: "", label: "No Customers Available", disabled: true }];
    return [
      { value: "", label: "Select Customer" },
      ...customerList.map((customer) => ({
        value: customer._id,
        label: `${customer.customerCode} - ${customer.name}`,
      })),
    ];
  }, [customerList, customerListLoading]);

  const mrOptions = useMemo(() => {
    const options = [{ value: "", label: "Select MR" }];
    mrFullList.forEach((mr) => {
      options.push({ value: String(mr._id), label: mr.mrName });
    });
    if (form.mrId && form.mrName) {
      const exists = options.some((opt) => opt.value === String(form.mrId));
      if (!exists)
        options.push({ value: String(form.mrId), label: form.mrName });
    }
    return options;
  }, [mrFullList, form.mrId, form.mrName]);

  const provinceOptions = useMemo(() => {
    if (provincesLoading)
      return [{ value: "", label: "Loading provinces...", disabled: true }];
    const options = [
      { value: "", label: "Select Province" },
      ...provincesList.map((prov) => {
        const provName =
          prov.name ||
          prov.provinceName ||
          prov.value ||
          prov.label ||
          prov.province ||
          "";
        return { value: provName.trim(), label: provName.trim() };
      }),
    ];
    if (
      form.customerProvince &&
      !options.some((opt) => opt.value === form.customerProvince.trim())
    )
      options.push({
        value: form.customerProvince.trim(),
        label: form.customerProvince.trim(),
      });
    return options;
  }, [provincesList, provincesLoading, form.customerProvince]);

  const zoneOptions = useMemo(() => {
    if (zonesLoading)
      return [{ value: "", label: "Loading zones...", disabled: true }];
    if (!zonesList || zonesList.length === 0) {
      if (form.customerZone)
        return [
          { value: "", label: "Select a province first", disabled: true },
          { value: form.customerZone.trim(), label: form.customerZone.trim() },
        ];
      return form.customerProvince
        ? [{ value: "", label: "No zones for this province", disabled: true }]
        : [{ value: "", label: "Select a province first", disabled: true }];
    }
    const options = [
      { value: "", label: "Select Zone" },
      ...zonesList.map((zone) => {
        const zoneName =
          zone.name ||
          zone.zoneName ||
          zone.value ||
          zone.label ||
          zone.zone ||
          "";
        return { value: zoneName.trim(), label: zoneName.trim() };
      }),
    ];
    if (
      form.customerZone &&
      !options.some((opt) => opt.value === form.customerZone.trim())
    )
      options.push({
        value: form.customerZone.trim(),
        label: form.customerZone.trim(),
      });
    return options;
  }, [zonesList, zonesLoading, form.customerProvince, form.customerZone]);

  const handleProvinceChange = (value) => {
    setForm((prev) => ({
      ...prev,
      customerProvince: value.trim(),
      customerZone: "",
    }));
  };
  const handleZoneChange = (value) => {
    setForm((prev) => ({ ...prev, customerZone: value.trim() }));
  };

  // Enhanced handleUpdateSale with product recalculation
  const handleUpdateSale = useCallback(
    async (e) => {
      e.preventDefault();
      try {
        const totals = calculateProductTotals(form.products);
        
        const updatedProducts = form.products.map(p => ({
          ...p,
          salesQty: p.salesQty || 0,
          bonusQty: p.bonusQty || 0,
          totalQty: (p.salesQty || 0) + (p.bonusQty || 0),
          netSellingAmount: p.netSellingAmount || ((p.sellingPrice || 0) * (p.salesQty || 0)) - (p.discount || 0),
          amount: p.amount || ((p.sellingPrice || 0) * (p.salesQty || 0)) - (p.discount || 0),
        }));
        
        const updatedForm = {
          ...form,
          products: updatedProducts,
          totalAmount: totals.totalAmount,
          dueAmount: totals.netAmount - parseFloat(form.paidAmount || 0),
          paymentStatus: computePaymentStatus(
            form.paidAmount,
            totals.netAmount,
          ),
          creditDays:
            form.creditDays && Number(form.creditDays) > 0
              ? Number(form.creditDays)
              : DEFAULT_CREDIT_DAYS,
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
          window.dispatchEvent(new CustomEvent("inventory-updated"));
        }
      } catch (err) {
        showToast(
          "error",
          err.response?.data?.error ||
            err.response?.data?.message ||
            "Failed to update sale",
        );
      }
    },
    [form, calculateProductTotals, fetchSaleSummaries],
  );

  const handleImportSuccess = useCallback(() => {
    setTimeout(() => {
      fetchSaleSummaries();
      window.dispatchEvent(new CustomEvent("inventory-updated"));
    }, 1000);
  }, [fetchSaleSummaries]);

  const showMRCustomerWarning = useMemo(
    () => !mrList?.length && !customerList?.length,
    [mrList, customerList],
  );
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

  const downloadExcel = useCallback(
    (data, baseFileName) => {
      if (!data || data.length === 0) {
        showToast("error", "No data to download");
        return;
      }
      const excelRows = [];
      data.forEach((sale) => {
        const products =
          sale.products && sale.products.length
            ? sale.products
            : [
                {
                  productName: "—",
                  salesQty: 0,
                  bonusQty: 0,
                  totalQty: 0,
                  sellingPrice: 0,
                  discount: 0,
                  netSellingAmount: 0,
                  lc: 0,
                  profitLoss: 0,
                },
              ];
        products.forEach((product) => {
          const row = {
            "Invoice Number": sale.invoiceNumber,
            "Invoice Date": sale.invoiceDate
              ? new Date(sale.invoiceDate).toLocaleDateString()
              : "",
            "MR Name": sale.mrName || "",
            "Customer Name": sale.customerName || "",
            "Customer Code": sale.customerCode || "",
            "Payment Status": sale.paymentStatus || "",
            "Product Name": product.productName || "",
            "Sales Qty": product.salesQty || 0,
            "Bonus Qty": product.bonusQty || 0,
            "Total Qty": product.totalQty || 0,
            "Selling Price": product.sellingPrice || 0,
            Discount: product.discount || 0,
            "Net Amount": product.netSellingAmount || 0,
            "Total Amount": sale.totalAmount || 0,
            "Paid Amount": sale.paidAmount || 0,
            "Due Amount": sale.dueAmount || 0,
            "Sale Type": isMRSaleDoc(sale) ? "MR Sale" : "Normal Sale",
          };
          if (canSeeSensitiveData) {
            row["LC"] = product.lc || 0;
            row["Profit/Loss"] = product.profitLoss || 0;
            row["Cost Amount"] = sale.costAmount || 0;
          }
          excelRows.push(row);
        });
      });
      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");
      XLSX.writeFile(
        workbook,
        `${baseFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    },
    [canSeeSensitiveData],
  );

  const handleSampleDownload = useCallback(() => {
    const normalSales = sales.filter((s) => !isMRSaleDoc(s));
    const mrSales = sales.filter((s) => isMRSaleDoc(s));
    if (normalSales.length === 0 && mrSales.length === 0) {
      showToast("error", "No sales data available");
      return;
    }
    if (normalSales.length > 0) downloadExcel(normalSales, "Normal_Sales");
    else showToast("info", "No normal sales to download");
    setTimeout(() => {
      if (mrSales.length > 0) downloadExcel(mrSales, "MR_Sales");
      else showToast("info", "No MR sales to download");
    }, 500);
  }, [sales, downloadExcel]);

  const visibleFields = allFields.filter((item) =>
    isMobileView
      ? mobileColumns.includes(item.id)
      : tableColumns.includes(item.id),
  );

  if (loading) return <LoadingOverlay />;

  return (
    <div className="p-4 md:p-6 relative">
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

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

      <EditProductModal
        isOpen={isEditProductModalOpen}
        onClose={() => setIsEditProductModalOpen(false)}
        products={pendingProductUpdates}
        onUpdateProducts={handleProductUpdate}
        title="Edit Sale Products"
      />

      {/* ── EDIT MODAL ── */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Edit size={20} /> Edit Sales Record
              </h2>
              <form onSubmit={handleUpdateSale} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <input
                      name="invoiceNumber"
                      value={form.invoiceNumber || ""}
                      onChange={handleFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                      MR Name
                    </label>
                    <select
                      value={form.mrId ? String(form.mrId) : ""}
                      onChange={(e) => {
                        const selectedVal = e.target.value;
                        const selectedOption = mrOptions.find(
                          (opt) => opt.value === selectedVal,
                        );
                        if (selectedOption)
                          handleMRChange({
                            _id: selectedVal,
                            mrName: selectedOption.label,
                          });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      {mrOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <SearchableDropdown
                      value={form.customerId}
                      onChange={handleCustomerChange}
                      options={customerOptions}
                      placeholder="Select Customer"
                      required={true}
                      loading={customerListLoading}
                      error={null}
                      label="Customer"
                      disabled={false}
                    />
                  </div>
                  {form.customerId && (
                    <div className="col-span-1 md:col-span-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone
                          </label>
                          <input
                            type="text"
                            name="customerPhone"
                            value={form.customerPhone}
                            onChange={handleFormChange}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          />
                        </div>
                        <div>
                          <SearchableDropdown
                            value={form.customerProvince}
                            onChange={handleProvinceChange}
                            options={provinceOptions}
                            placeholder="Select Province"
                            loading={provincesLoading}
                            label="Province"
                          />
                        </div>
                        <div>
                          <SearchableDropdown
                            value={form.customerZone}
                            onChange={handleZoneChange}
                            options={zoneOptions}
                            placeholder={
                              form.customerProvince
                                ? "Select Zone"
                                : "Select a province first"
                            }
                            loading={zonesLoading && !!form.customerProvince}
                            label="Zone"
                            disabled={!form.customerProvince}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Enhanced Products Section with Edit Products Button */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium text-gray-700">
                      Products ({form.products?.length || 0})
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSaleProducts(form.products || []);
                          setIsProductModalOpen(true);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm"
                      >
                        <Eye size={16} className="inline mr-1" /> View Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingProductUpdates(form.products || []);
                          setIsEditProductModalOpen(true);
                        }}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 cursor-pointer text-sm"
                      >
                        <Edit size={16} className="inline mr-1" /> Edit Products
                      </button>
                    </div>
                  </div>
                  
                  {form.products && form.products.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {form.products.map((product, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-3">
                          <h4 className="font-medium text-gray-800">
                            {product.productName || `Product ${index + 1}`}
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mt-1">
                            <div>Sales Qty: <span className="font-semibold">{product.salesQty || 0}</span></div>
                            <div>Bonus Qty: <span className="font-semibold">{product.bonusQty || 0}</span></div>
                            <div>Price: <span className="font-semibold">${(product.sellingPrice || 0).toFixed(2)}</span></div>
                            <div>Net: <span className="font-semibold text-indigo-600">${(product.netSellingAmount || 0).toFixed(2)}</span></div>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    ["Total Amount", `$${formTotals.totalAmount.toFixed(2)}`],
                    [
                      "Total Discount",
                      `$${formTotals.totalDiscount.toFixed(2)}`,
                    ],
                    ["Net Amount", `$${formTotals.netAmount.toFixed(2)}`],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">{label}</div>
                      <div className="font-semibold text-gray-800">{val}</div>
                    </div>
                  ))}
                  {canSeeSensitiveData && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-500">Profit/Loss</div>
                      <div
                        className={`font-semibold ${formTotals.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        ${formTotals.totalProfitLoss.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paid Amount ($)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.paidAmount || ""}
                      onChange={handlePaidChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Due Amount ($)
                    </label>
                    <input
                      type="text"
                      value={form.dueAmount?.toFixed(2) || "0.00"}
                      disabled
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                  {form.paymentStatus !== "Cash" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Credit Days{" "}
                        <span className="ml-1 text-xs text-gray-400">
                          (default: {DEFAULT_CREDIT_DAYS})
                        </span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        name="creditDays"
                        value={form.creditDays || ""}
                        onChange={handleCreditDaysChange}
                        placeholder={String(DEFAULT_CREDIT_DAYS)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  )}
                  {form.paymentStatus !== "Cash" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Due Date
                      </label>
                      <DatePicker
                        selected={form.dueDate ? new Date(form.dueDate) : null}
                        onChange={(date) =>
                          setForm((prev) => ({
                            ...prev,
                            dueDate: date
                              ? date.toISOString().split("T")[0]
                              : "",
                          }))
                        }
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select date"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        readOnly
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Status
                    </label>
                    <select
                      name="paymentStatus"
                      value={form.paymentStatus || ""}
                      disabled
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
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
                    Remarks
                  </label>
                  <textarea
                    name="remark"
                    value={form.remark || ""}
                    onChange={handleFormChange}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
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

      {/* ── View Modal ── (keeping as is) */}
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[
                  ["Customer Phone", form.customerPhone || "-"],
                  ["Customer Zone", form.customerZone || "-"],
                  ["Customer Province", form.customerProvince || "-"],
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 p-3 rounded-lg">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {label}
                    </label>
                    <div className="text-sm font-medium text-gray-800">
                      {val}
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
                {canSeeSensitiveData && (
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
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[
                  [
                    "Credit Days",
                    `${form.creditDays && form.creditDays > 0 ? form.creditDays : DEFAULT_CREDIT_DAYS} days`,
                  ],
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
                    className={`text-sm font-medium ${form.paymentStatus === "Cash" ? "text-green-600" : form.paymentStatus === "Credit" ? "text-yellow-600" : form.paymentStatus === "Partial Paid" ? "text-blue-600" : "text-gray-600"}`}
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

      {/* ── Main Content ── */}
      <div className="container">
        {isMobileView && (
          <div className="flex justify-between items-center mb-1 bg-gray-200 border-gray-200 p-2 rounded-2xl">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} />
            </button>
            {sales.length > 0 && (
              <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
                Total Records: {filteredSales.length}
              </div>
            )}
          </div>
        )}

        {!isMobileView && (
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
            {isSampleDownloadFile ? (
              <button
                onClick={handleSampleDownload}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
                disabled={sales.length === 0}
              >
                <Download size={18} /> Download Sample (Normal + MR)
              </button>
            ) : (
              <SaleExcelDownload
                data={downloadData}
                fileName={`sale_summary_${saleTypeTab}_${selectedTab}`}
                buttonText="Download Sales Excel"
              />
            )}
          </div>
        )}

        {isMobileView && sales.length > 0 && (
          <div className="flex flex-col gap-3 mb-3">
            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer w-full"
              >
                <Trash2 size={18} /> Delete ({selected.length})
              </button>
            )}
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search invoice, MR, customer..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm text-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        )}

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
                  importing sales.{" "}
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
          <div
            className={`flex ${!isMobileView ? "flex-row items-center justify-between" : ""} mb-4`}
          >
            <div className="flex flex-wrap gap-2 items-center">
              <div
                className={`flex items-center gap-1 bg-gray-100 border border-gray-300 rounded-xl ${isMobileView ? "px-1 py-0.5" : "px-2 py-1"} flex-wrap`}
              >
                <span
                  className={`${isMobileView ? "text-[8px] font-bold" : "text-xs"} text-gray-500 font-semibold uppercase tracking-wide ${isMobileView ? "pr-0.5" : "pr-1"}`}
                >
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
                    className={`${isMobileView ? "py-0.5 text-[8px] font-bold" : "px-3 py-1 text-xs"} rounded-lg cursor-pointer transition-colors font-medium ${selectedTab === tab ? "bg-indigo-600 text-white shadow" : "text-gray-600 hover:bg-gray-200"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div
                className={`flex items-center gap-1 bg-gray-100 border border-gray-300 rounded-xl ${isMobileView ? "px-1 py-0.5" : "px-2 py-1"} flex-wrap`}
              >
                <span
                  className={`${isMobileView ? "text-[8px] font-bold" : "text-xs"} text-gray-500 font-semibold uppercase tracking-wide ${isMobileView ? "pr-0.5" : "pr-1"}`}
                >
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
                    className={`flex items-center gap-1 ${isMobileView ? "py-0.5 text-[8px] font-bold" : "px-3 py-1 text-xs"} rounded-lg cursor-pointer transition-colors font-medium ${saleTypeTab === tab.id ? (tab.id === "normal" ? "bg-indigo-600 text-white shadow" : tab.id === "mr" ? "bg-green-600 text-white shadow" : "bg-gray-600 text-white shadow") : "text-gray-600 hover:bg-gray-200"}`}
                  >
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {!isMobileView && (
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
                {!isMobileView && (
                  <th className="p-3 whitespace-nowrap min-w-[40px] text-sm font-medium">
                    {currentSales.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select all sales"
                        checked={
                          selected.length === currentSales.length &&
                          currentSales.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="cursor-pointer"
                      />
                    )}
                  </th>
                )}
                {visibleFields.map((item) => (
                  <th
                    key={`header-${item.id}`}
                    className={`p-3 whitespace-nowrap min-w-[80px] font-medium ${isMobileView ? "text-[10px]" : "text-sm"}`}
                  >
                    {item.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleFields.length + (isMobileView ? 0 : 1)}
                    className="p-4 text-center text-gray-500"
                  >
                    {loadingData ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
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
                currentSales.map((sale, index) => {
                  const isMRSale = isMRSaleDoc(sale);
                  return (
                    <tr
                      key={`sale-${sale._id || index}`}
                      className={`hover:bg-gray-50 transition-colors ${index < currentSales.length - 1 ? "border-b" : ""}`}
                    >
                      {!isMobileView && (
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selected.some((s) => s.id === sale._id)}
                            onChange={() => toggleSelect(sale)}
                            className="cursor-pointer"
                          />
                        </td>
                      )}
                      {visibleFields.map((item) => (
                        <td
                          key={`cell-${sale._id}-${item.id}`}
                          className={`p-3 whitespace-nowrap min-w-[80px] ${isMobileView ? "text-[9px]" : "text-sm"}`}
                        >
                          {item.id === "invoiceNumber" ? (
                            <span className="font-medium">
                              {sale.invoiceNumber}
                              {isMRSale && (
                                <span
                                  className={`ml-1 bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full ${isMobileView ? "text-[8px]" : "text-xs"}`}
                                >
                                  MR
                                </span>
                              )}
                            </span>
                          ) : item.id === "productCount" ? (
                            <button
                              onClick={() => handleProductCountClick(sale)}
                              className="flex items-center justify-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-200 transition-colors cursor-pointer mx-auto"
                              title="View Products"
                            >
                              <Package size={isMobileView ? 10 : 14} />
                              <span className="font-medium">
                                {getFieldValue(sale, item.dbName)}
                              </span>
                            </button>
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-2 min-w-[60px]">
                              <button
                                className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors p-1"
                                onClick={() => handleView(sale)}
                                title="View"
                              >
                                <Eye size={isMobileView ? 14 : 18} />
                              </button>
                              {!isMobileView && (
                                <>
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
                                </>
                              )}
                            </div>
                          ) : item.id === "paymentStatus" ? (
                            <span
                              className={`px-2 py-0.5 rounded-full font-medium ${isMobileView ? "text-[8px]" : "text-xs"} ${sale.paymentStatus === "Cash" ? "bg-green-100 text-green-800" : sale.paymentStatus === "Credit" ? "bg-yellow-100 text-yellow-800" : sale.paymentStatus === "Partial Paid" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}
                            >
                              {getFieldValue(sale, item.dbName)}
                            </span>
                          ) : (
                            getFieldValue(sale, item.dbName)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
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
                {!isMobileView ? (
                  visiblePages.map((page, idx) =>
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
                        className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${currentPage === page ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
                      >
                        {page}
                      </button>
                    ),
                  )
                ) : (
                  <span className="px-3 py-1 text-sm text-gray-700 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
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
              {!isMobileView && (
                <div className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * SALES_PER_PAGE + 1} to{" "}
                  {Math.min(currentPage * SALES_PER_PAGE, filteredSales.length)}{" "}
                  of {filteredSales.length} sales
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sales;