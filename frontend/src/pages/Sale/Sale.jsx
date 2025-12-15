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

// Progress modal component
const ImportProgressModal = ({ progress, message, onCancel }) => {
  if (!progress) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-[100]">
      <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Importing Sales Data
          </h3>
          <p className="text-sm text-gray-600 mb-4">{message}</p>

          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{Math.round(progress)}% Complete</span>
            <span>Processing...</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors cursor-pointer"
            disabled={progress >= 100}
          >
            Cancel Import
          </button>
        </div>
      </div>
    </div>,
    document.body
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
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [types, setTypes] = useState([]);
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
  const [importProgress, setImportProgress] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [abortController, setAbortController] = useState(null);

  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);

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

  const SALES_PER_PAGE = 9; // Keep this for frontend pagination

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
    const missingFields = [];

    if (!productsList.length) {
      missingFields.push("product names");
    }

    if (!mrList.length) {
      missingFields.push("medical representatives");
    }

    if (!customerList.length) {
      missingFields.push("customers");
    }

    if (missingFields.length > 0) {
      showToast(
        "error",
        `Please upload ${missingFields.join(
          ", "
        )} first before importing sales data.`
      );
      return;
    }

    setShowImportModal(true);
  };

  // Fetch sale summaries - UPDATED TO GET ALL DATA
  const fetchSaleSummaries = async () => {
    try {
      setLoadingData(true);
      // Fetch without pagination to get all data
      const res = await fetch(`${backendUrl}/api/sales/all`);
      if (!res.ok) {
        // Fallback to paginated endpoint if all endpoint doesn't exist
        const fallbackRes = await fetch(
          `${backendUrl}/api/sales?page=1&limit=1000`
        );
        if (!fallbackRes.ok) throw new Error("Failed to fetch sale summaries");

        const data = await fallbackRes.json();
        const salesData = data.summaries || data.data || data;

        const uniqueTypes = Array.from(
          new Set(salesData.map((item) => item.paymentStatus?.toLowerCase()))
        ).filter(Boolean);

        setTypes(["All", ...uniqueTypes]);
        setSales(salesData);
      } else {
        const data = await res.json();
        const salesData = data.summaries || data.data || data;

        const uniqueTypes = Array.from(
          new Set(salesData.map((item) => item.paymentStatus?.toLowerCase()))
        ).filter(Boolean);

        setTypes(["All", ...uniqueTypes]);
        setSales(salesData);
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

  // Fetch dropdown data
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

  // 🔥 OPTIMIZED FILE UPLOAD FOR LARGE DATASETS
  // 🔥 OPTIMIZED FILE UPLOAD FOR LARGE DATASETS
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      showToast("error", "File size too large. Maximum size is 20MB.");
      return;
    }

    setImportMessage("Reading file...");
    setImportProgress(10);
    setIsUploading(true);

    try {
      // Read file as array buffer
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      setImportProgress(30);
      setImportMessage("Processing Excel data...");

      // Parse Excel file
      const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      setImportProgress(50);
      setImportMessage("Parsing data...");

      // Find header row
      const expectedHeaders = [
        "Recording Date",
        "Invoice #",
        "Invoice Date",
        "MR Name",
        "Customer Name",
        "Customer Code",
        "Customer ID",
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

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i].map((c) => String(c || "").trim());
        const normalized = row.map((c) => c.toLowerCase());
        const matchCount = expectedHeaders.filter((h) =>
          normalized.includes(h.toLowerCase())
        ).length;
        if (matchCount >= 5) {
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

      // 🔥 FIXED DATE PARSING FUNCTION
      const parseExcelDate = (dateValue) => {
        if (!dateValue) return new Date();

        // If it's already a Date object
        if (dateValue instanceof Date) {
          return dateValue;
        }

        // If it's an Excel serial number
        if (typeof dateValue === "number") {
          const excelEpoch = new Date(1899, 11, 30); // Excel epoch is Dec 30, 1899
          const date = new Date(excelEpoch.getTime() + dateValue * 86400000);
          return date;
        }

        // If it's a string, try to parse it
        if (typeof dateValue === "string") {
          // Remove any whitespace
          const dateStr = dateValue.trim();

          // Try different date formats
          const dateFormats = [
            // Try DD-MMM-YY (like 8-Jun-21)
            /^(\d{1,2})-([a-zA-Z]{3})-(\d{2})$/i,
            // Try DD/MM/YYYY or DD-MM-YYYY
            /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
            // Try DD/MM/YY or DD-MM-YY
            /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/,
            // Try YYYY-MM-DD
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
          ];

          for (const format of dateFormats) {
            const match = dateStr.match(format);
            if (match) {
              if (format.toString().includes("[a-zA-Z]{3}")) {
                // Handle DD-MMM-YY format (like 8-Jun-21)
                const day = parseInt(match[1], 10);
                const monthStr = match[2].toLowerCase();
                const year = parseInt(match[3], 10);

                const monthMap = {
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

                const month = monthMap[monthStr];
                if (month !== undefined) {
                  const fullYear = year < 100 ? 2000 + year : year;
                  return new Date(fullYear, month, day);
                }
              } else {
                const parts = dateStr.split(/[\/-]/);
                let day, month, year;

                if (format.toString().includes("YYYY-MM-DD")) {
                  // YYYY-MM-DD format
                  year = parseInt(parts[0], 10);
                  month = parseInt(parts[1], 10) - 1;
                  day = parseInt(parts[2], 10);
                } else {
                  // DD/MM/YYYY or similar
                  day = parseInt(parts[0], 10);
                  month = parseInt(parts[1], 10) - 1;
                  year = parseInt(parts[2], 10);

                  // Handle 2-digit years
                  if (year < 100) {
                    year = 2000 + year;
                  }
                }

                return new Date(year, month, day);
              }
            }
          }

          // Last resort: try JavaScript Date parsing
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            return parsed;
          }
        }

        // Default to today's date
        return new Date();
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
          row[headers.indexOf("Invoice #")] || ""
        ).trim();
        const customerName = String(
          row[headers.indexOf("Customer Name")] || ""
        ).trim();
        const customerCode = String(
          row[headers.indexOf("Customer Code")] || ""
        ).trim();
        const productName = String(
          row[headers.indexOf("Product Name")] || ""
        ).trim();
        const salesQty = Number(row[headers.indexOf("Sales Qty")]) || 0;
        const sellingPrice =
          Number(row[headers.indexOf("Selling Price (USD)")]) || 0;

        // Basic validation
        if (!invoiceNumber) {
          validationErrors.push(
            `Row ${rowCount + headerIdx + 1}: Invoice number is required`
          );
          continue;
        }

        if (!customerName) {
          validationErrors.push(
            `Row ${rowCount + headerIdx + 1}: Customer name is required`
          );
          continue;
        }

        if (!productName) {
          validationErrors.push(
            `Row ${rowCount + headerIdx + 1}: Product name is required`
          );
          continue;
        }

        if (salesQty <= 0) {
          validationErrors.push(
            `Row ${
              rowCount + headerIdx + 1
            }: Sales quantity must be greater than 0`
          );
          continue;
        }

        if (sellingPrice <= 0) {
          validationErrors.push(
            `Row ${
              rowCount + headerIdx + 1
            }: Selling price must be greater than 0`
          );
          continue;
        }

        // Find customer
        let customer = null;
        if (customerCode) {
          customer = customerList.find((c) => c.code === customerCode);
        } else if (customerName) {
          customer = customerList.find(
            (c) => c.name.toLowerCase() === customerName.toLowerCase()
          );
        }

        if (!groupedInvoices[invoiceNumber]) {
          const creditDays = Number(row[headers.indexOf("Credit Days")]) || 0;
          const currentDate = new Date();
          const dueDate = new Date(currentDate);
          dueDate.setDate(currentDate.getDate() + creditDays);

          // 🔥 FIXED: Use the new parseExcelDate function for dates
          let recordingDateStr = row[headers.indexOf("Recording Date")] || "";
          let recordingDate = recordingDateStr
            ? parseExcelDate(recordingDateStr)
            : new Date();

          let invoiceDateStr =
            row[headers.indexOf("Invoice Date")] || recordingDateStr;
          let invoiceDate = invoiceDateStr
            ? parseExcelDate(invoiceDateStr)
            : new Date();

          // Validate dates
          if (isNaN(recordingDate.getTime())) {
            recordingDate = new Date();
          }
          if (isNaN(invoiceDate.getTime())) {
            invoiceDate = new Date();
          }

          groupedInvoices[invoiceNumber] = {
            recordingDate: recordingDate.toISOString().split("T")[0],
            invoiceNumber,
            invoiceDate: invoiceDate.toISOString().split("T")[0],
            mrName: String(row[headers.indexOf("MR Name")] || "").trim(),
            customerName: customerName,
            customerCode: customer?.code || customerCode || "",
            customerId: customer?.id || "",
            creditDays: creditDays,
            paidAmount: Number(row[headers.indexOf("Paid Amount")]) || 0,
            paymentStatus: String(
              row[headers.indexOf("Payment Status")] || "Credit"
            ).trim(),
            remark: String(row[headers.indexOf("Remarks")] || "").trim(),
            products: [],
            totalAmount: 0,
            dueAmount: 0,
            dueDate: dueDate.toISOString().split("T")[0],
            deliveryDate: invoiceDate.toISOString().split("T")[0],
          };
        }

        const bonusQty = Number(row[headers.indexOf("Bonus Qty")]) || 0;
        const discount = Number(row[headers.indexOf("Discount (USD)")]) || 0;
        const totalQty = salesQty + bonusQty;
        const amount = sellingPrice * salesQty;
        const netSellingAmount = amount - discount;
        const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;

        groupedInvoices[invoiceNumber].products.push({
          productName: productName,
          salesQty: salesQty,
          bonusQty: bonusQty,
          totalQty: totalQty,
          sellingPrice: sellingPrice,
          amount: amount,
          discount: discount,
          netSellingAmount: netSellingAmount,
          averageUnitPrice: averageUnitPrice,
          lc: 0, // Will be populated from stock during import
          profitLoss: 0, // Will be calculated during import
          isProductAccept: true,
        });

        groupedInvoices[invoiceNumber].totalAmount += netSellingAmount;
      }

      // Calculate due amounts
      Object.values(groupedInvoices).forEach((invoice) => {
        invoice.dueAmount = invoice.totalAmount - invoice.paidAmount;

        // Default values
        if (!invoice.mrName && mrList.length > 0) {
          invoice.mrName = mrList[0];
        }

        if (!invoice.paymentStatus) {
          invoice.paymentStatus = "Credit";
        }
      });

      const invoicesArray = Object.values(groupedInvoices);

      setImportProgress(100);

      if (validationErrors.length > 0) {
        showToast(
          "warning",
          `Found ${invoicesArray.length} invoices with ${rowCount} products, but ${validationErrors.length} rows had errors`
        );

        // Show first 3 errors
        const errorMessage = validationErrors.slice(0, 3).join("\n");
        if (validationErrors.length > 3) {
          showToast(
            "warning",
            `${errorMessage}\n...and ${validationErrors.length - 3} more errors`
          );
        }
      } else {
        showToast(
          "success",
          `Found ${invoicesArray.length} invoices with ${rowCount} products`
        );
      }

      setParsedData(invoicesArray);

      if (invoicesArray.length > 0) {
      }
    } catch (error) {
      console.error("❌ Error processing file:", error);
      showToast("error", "Failed to process Excel file: " + error.message);
    } finally {
      setImportProgress(null);
      setIsUploading(false);
    }
  };

  // 🔥 OPTIMIZED IMPORT FUNCTION
  const handleProductImport = async () => {
    if (!parsedData || parsedData.length === 0) {
      showToast("warning", "Please upload and validate a file first.");
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsUploading(true);
    setImportProgress(0);
    setImportMessage("Preparing import...");

    try {
      // Upload data
      const res = await axios.post(
        `${backendUrl}/api/sales/import`,
        parsedData,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 300000, // 5 minutes timeout
          signal: controller.signal,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentComplete = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              setImportProgress(Math.min(percentComplete, 90));
              setImportMessage("Uploading data to server...");
            }
          },
        }
      );

      setImportProgress(95);
      setImportMessage("Processing import...");

      // Check response
      if (res.data) {
        const result = res.data;

        if (result.success) {
          const summary = result.summary;

          showToast(
            "success",
            `Import completed!\n` +
              `✓ ${summary.successfullyImported} invoices imported successfully\n` +
              `✗ ${summary.failed} invoices failed\n` +
              `Time: ${summary.processingTimeSeconds}s`
          );

          setTimeout(() => {
            setShowImportModal(false);
            setParsedData([]);
            setImportProgress(null);
            fetchSaleSummaries();
            fetchStockData();
          }, 1000);
        } else {
          showToast("error", result.message || "Import failed");
          setImportProgress(null);
        }
      }
    } catch (err) {
      console.error("❌ Import failed:", err);

      let errorMessage = "Failed to import data";

      if (err.code === "ECONNABORTED") {
        errorMessage =
          "Import timeout. Please try with a smaller file or split into multiple imports.";
      } else if (err.response) {
        errorMessage =
          err.response.data?.message || `Server error: ${err.response.status}`;
      } else if (err.request) {
        errorMessage = "No response from server. Please check your connection.";
      } else {
        errorMessage = err.message;
      }

      showToast("error", errorMessage);
      setImportProgress(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Cancel import
  const cancelImport = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setImportProgress(null);
    setIsUploading(false);
    showToast("info", "Import cancelled");
  };

  // Handle batch delete
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
        setImportProgress(0);
        setImportMessage("Deleting selected sales...");

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
      } finally {
        setImportProgress(null);
      }
    }
  };

  const validateParsedDataStock = () => {
    const validationErrors = [];

    parsedData.forEach((invoice, invoiceIndex) => {
      invoice.products.forEach((product, productIndex) => {
        const totalQty =
          (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0);
        const stockCheck = checkProductStock(product.productName, totalQty);

        if (!stockCheck.hasSufficientStock) {
          validationErrors.push({
            invoiceNumber: invoice.invoiceNumber,
            productName: product.productName,
            required: totalQty,
            available: stockCheck.availableStock,
            message: `Insufficient stock for "${product.productName}". Required: ${totalQty}, Available: ${stockCheck.availableStock}`,
          });
        }
      });
    });

    return validationErrors;
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
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Filtered sales - Now showing all data with frontend pagination
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

  // Current sales for pagination
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

  // Helper functions
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

  const toggleProductView = (index) => {
    setExpandedProductIndex(expandedProductIndex === index ? -1 : index);
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

  const handleUpdateSales = async (e, sale) => {
    e.preventDefault();
    try {
      const stockErrors = [];
      sale.products.forEach((product, index) => {
        const totalQty =
          (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0);
        const stockCheck = checkProductStock(product.productName, totalQty);
        if (!stockCheck.hasSufficientStock) {
          stockErrors.push({
            product: product.productName,
            required: totalQty,
            available: stockCheck.availableStock,
          });
        }
      });

      if (stockErrors.length > 0) {
        const errorMessages = stockErrors
          .map(
            (err) =>
              `"${err.product}": Required ${err.required}, Available ${err.available}`
          )
          .join("\n");
        showToast("error", `Insufficient stock:\n${errorMessages}`);
        return;
      }

      const res = await axios.put(`${backendUrl}/api/sales/${sale._id}`, sale);
      if (res.status === 200) {
        showToast("success", "Sales record updated successfully");
        setIsEditModalOpen(false);
        fetchSaleSummaries();
        await fetchStockData();
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        showToast("error", err.response.data.error);
      } else {
        showToast("error", "Failed to update sales record.");
      }
    }
  };

  // Product edit modal functions
  const openProductEditModal = (product, index) => {
    setCurrentProduct({ ...product });
    setCurrentProductIndex(index);
    setIsProductEditModalOpen(true);
  };

  const handleProductChange = (e) => {
    const { name, value } = e.target;
    setCurrentProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProductNumericChange = (e) => {
    const { name, value } = e.target;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      setCurrentProduct((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const updateProductInForm = () => {
    setForm((prev) => {
      const updatedProducts = [...prev.products];
      updatedProducts[currentProductIndex] = currentProduct;

      const totals = calculateProductTotals(updatedProducts);

      return {
        ...prev,
        products: updatedProducts,
        totalAmount: totals.totalAmount,
        netSellingAmount: totals.netAmount,
        dueAmount: (
          totals.netAmount - parseFloat(prev.paidAmount || 0)
        ).toFixed(2),
      };
    });
    setIsProductEditModalOpen(false);
    setCurrentProduct(null);
    setCurrentProductIndex(null);
  };

  // Form handlers
  const handleNumericInputChange = (e, updateFunc) => {
    const value = e.target.value;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      updateFunc(e);
    }
  };

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleChangeEvent = (name, value, prevForm) => {
    const updatedForm = { ...prevForm, [name]: value };

    const getNum = (field) => {
      const num = parseFloat(updatedForm[field]);
      return isNaN(num) ? 0 : num;
    };

    const getInt = (field) => {
      const num = parseInt(updatedForm[field], 10);
      return isNaN(num) ? 0 : num;
    };

    if (["salesQty", "bonusQty"].includes(name)) {
      updatedForm.totalQty = getInt("salesQty") + getInt("bonusQty");
    }

    if (name === "invoiceDate") {
      updatedForm.deliveryDate = value;
    }

    if (name === "creditDays") {
      const creditDays = parseInt(value, 10);
      if (!isNaN(creditDays)) {
        const due = new Date();
        due.setDate(due.getDate() + creditDays);
        updatedForm.dueDate = due.toISOString().split("T")[0];
      } else {
        updatedForm.dueDate = "";
      }
    }

    if (["sellingPrice", "salesQty"].includes(name)) {
      updatedForm.amount = (
        getNum("sellingPrice") * getInt("salesQty")
      ).toFixed(2);
    }

    if (["amount", "discount", "sellingPrice", "salesQty"].includes(name)) {
      updatedForm.netSellingAmount = (
        getNum("amount") - getNum("discount")
      ).toFixed(2);
    }

    if (
      ["amount", "discount", "lc", "totalQty", "salesQty", "bonusQty"].includes(
        name
      )
    ) {
      updatedForm.profitLoss = (
        getNum("amount") -
        getNum("discount") -
        getNum("lc") * getInt("totalQty")
      ).toFixed(2);
    }

    if (["netSellingAmount", "paidAmount"].includes(name)) {
      const netAmount = getNum("netSellingAmount");
      const paidAmount = getNum("paidAmount");
      updatedForm.dueAmount = (netAmount - paidAmount).toFixed(2);
    }

    if (
      [
        "netSellingAmount",
        "salesQty",
        "bonusQty",
        "discount",
        "sellingPrice",
      ].includes(name)
    ) {
      const totalQty = getInt("totalQty");
      updatedForm.averageUnitPrice =
        totalQty > 0 ? (getNum("netSellingAmount") / totalQty).toFixed(2) : "";
    }

    return updatedForm;
  };

  const enhancedHandleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => handleChangeEvent(name, value, prev));
  }, []);

  const handleDateChange = (date, fieldName) => {
    setForm((prev) => {
      const updatedForm = {
        ...prev,
        [fieldName]: date ? date.toISOString().split("T")[0] : "",
      };
      if (fieldName === "invoiceDate" && date) {
        updatedForm.deliveryDate = date.toISOString().split("T")[0];
      }

      return updatedForm;
    });
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

  useEffect(() => {
    if (form.netSellingAmount !== undefined && form.paidAmount !== undefined) {
      const netAmount = parseFloat(form.netSellingAmount) || 0;
      const paidAmount = parseFloat(form.paidAmount) || 0;
      const dueAmount = (netAmount - paidAmount).toFixed(2);

      if (parseFloat(form.dueAmount || 0) !== parseFloat(dueAmount)) {
        setForm((prev) => ({
          ...prev,
          dueAmount: dueAmount,
        }));
      }
    }
  }, [form.netSellingAmount, form.paidAmount]);

  const showMRCustomerWarning = useMemo(() => {
    return mrList.length === 0 || customerList.length === 0;
  }, [mrList, customerList]);

  if (loading) return <LoadingOverlay text="Please wait..." />;

  const productTotals = calculateProductTotals(form.products);

  return (
    <div className="p-6">
      {/* Import Progress Modal */}
      <ImportProgressModal
        progress={importProgress}
        message={importMessage}
        onCancel={cancelImport}
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
              disabled={showMRCustomerWarning || isUploading}
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
                disabled={isUploading}
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
              <div className="flex gap-4">
                {types.map((tab) => (
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
            <div className="flex items-center gap-8">
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
              <div className="flex items-center gap-2">
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

        {/* Import Modal */}
        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
                <button
                  onClick={() => {
                    if (!isUploading) {
                      setShowImportModal(false);
                      setParsedData([]);
                    }
                  }}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Import Sales Data
                </h2>

                <div className="mb-6">
                  {isSampleFile && <SampleExcelDownloadSale />}

                  <input
                    type="file"
                    accept=".csv, .xlsx"
                    onChange={handleFileUpload}
                    className="block w-full border rounded-lg px-3 py-2 mb-6"
                    disabled={isUploading}
                  />
                </div>

                {parsedData.length > 0 && (
                  <div className="mb-6">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-medium text-green-800">
                            File Ready for Import
                          </h3>
                          <p className="text-sm text-green-700">
                            {parsedData.length} invoices with{" "}
                            {parsedData.reduce(
                              (total, inv) =>
                                total + (inv.products?.length || 0),
                              0
                            )}{" "}
                            products
                          </p>
                        </div>
                        <div className="text-right">
                          <button
                            onClick={handleProductImport}
                            disabled={isUploading}
                            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:opacity-50"
                          >
                            {isUploading ? "Importing..." : "Start Import"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      if (!isUploading) {
                        setShowImportModal(false);
                        setParsedData([]);
                      }
                    }}
                    disabled={isUploading}
                    className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {isUploading ? "Cancel" : "Close"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Product Details Modal */}
        {isProductModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
              <div
                className="absolute inset-0"
                onClick={() => setIsProductModalOpen(false)}
              />
              <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Product Details
                </h2>

                {selectedSaleProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No products found for this sale.
                  </p>
                ) : (
                  <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
                    <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                      <thead className="bg-gray-100 text-gray-700 border-b">
                        <tr>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Product Name
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Sales Qty
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Bonus Qty
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Total Qty
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Selling Price ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Amount ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Discount ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Net Amount ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Avg Unit Price ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Profit/Loss ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            LC ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSaleProducts.length === 0 ? (
                          <tr>
                            <td
                              colSpan={11}
                              className="p-4 text-center text-gray-500"
                            >
                              No products found.
                            </td>
                          </tr>
                        ) : (
                          selectedSaleProducts.map((product, index) => (
                            <tr
                              key={`product-${product._id || index}`}
                              className={`hover:bg-gray-50 ${
                                index < selectedSaleProducts.length - 1
                                  ? "border-b"
                                  : ""
                              }`}
                            >
                              <td className="p-3 whitespace-nowrap min-w-[120px] capitalize">
                                {product.productName || "--"}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {Math.ceil(product.salesQty || 0)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {Math.ceil(product.bonusQty || 0)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {Math.ceil(product.totalQty || 0)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {(product.sellingPrice || 0).toFixed(2)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {(product.amount || 0).toFixed(2)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {(product.discount || 0).toFixed(2)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {(product.netSellingAmount || 0).toFixed(2)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {(product.averageUnitPrice || 0).toFixed(2)}
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] font-semibold ${
                                  (product.profitLoss || 0) > 0
                                    ? "text-green-600"
                                    : (product.profitLoss || 0) < 0
                                    ? "text-red-600"
                                    : "text-gray-600"
                                }`}
                              >
                                {(product.profitLoss || 0).toFixed(2)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {(product.lc || 0).toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsProductModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Edit Sales Modal */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
              <div
                className="absolute inset-0"
                onClick={() => setIsEditModalOpen(false)}
              />
              <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Sales Record
                </h2>

                <form
                  onSubmit={(e) => handleUpdateSales(e, form)}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh]"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Recording Date
                    </label>
                    <DatePicker
                      selected={
                        form.recordingDate ? new Date(form.recordingDate) : null
                      }
                      onChange={(date) =>
                        handleDateChange(date, "recordingDate")
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Invoice Number
                    </label>
                    <InputField
                      type="text"
                      name="invoiceNumber"
                      value={form.invoiceNumber}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg capitalize border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Invoice Date
                    </label>
                    <DatePicker
                      selected={
                        form.invoiceDate ? new Date(form.invoiceDate) : null
                      }
                      onChange={(date) => handleDateChange(date, "invoiceDate")}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">MR Name</label>
                    <SearchableDropdown
                      options={mrList.map((mr) => ({ value: mr, label: mr }))}
                      value={form.mrName}
                      onChange={(value) => updateFormField("mrName", value)}
                      placeholder={
                        mrList.length === 0
                          ? "No MR available. Please add MR first."
                          : "Select MR"
                      }
                      className="w-full"
                      disabled={mrList.length === 0}
                    />
                    {mrList.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        No Medical Representatives available. Please add MR data
                        first.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Customer
                    </label>
                    <SearchableDropdown
                      options={customerList.map((customer) => ({
                        value: customer.code,
                        label: customer.name,
                      }))}
                      value={form.customerCode}
                      onChange={(value) =>
                        updateFormField("customerCode", value)
                      }
                      placeholder={
                        customerList.length === 0
                          ? "No customers available. Please add customers first."
                          : "Select Customer"
                      }
                      className="w-full"
                      disabled={customerList.length === 0}
                    />
                    {customerList.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        No Customers available. Please add Customer data first.
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium mb-2">
                      Products ({form.products?.length || 0})
                    </label>
                    <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                      {form.products && form.products.length > 0 ? (
                        form.products.map((product, index) => {
                          const totalQty =
                            (product.salesQty || 0) + (product.bonusQty || 0);
                          const stockCheck = checkProductStock(
                            product.productName,
                            totalQty
                          );

                          return (
                            <div
                              key={`edit-product-${index}`}
                              className="p-3 bg-white rounded border border-gray-300"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-700">
                                      {product.productName ||
                                        `Product ${index + 1}`}
                                    </span>
                                    {!stockCheck.hasSufficientStock && (
                                      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                                        Insufficient Stock (Available:{" "}
                                        {stockCheck.availableStock})
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-500 mt-1">
                                    Qty: {product.salesQty || 0} | Bonus:{" "}
                                    {product.bonusQty || 0} | Price: $
                                    {(product.sellingPrice || 0).toFixed(2)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openProductEditModal(product, index)
                                  }
                                  className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm cursor-pointer"
                                >
                                  Edit Details
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center text-gray-500 py-4">
                          No products added
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-300">
                    <div>
                      <label className="block text-sm font-medium">
                        Total Amount
                      </label>
                      <InputField
                        type="text"
                        value={productTotals.totalAmount.toFixed(2)}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Total Discount
                      </label>
                      <InputField
                        type="text"
                        value={productTotals.totalDiscount.toFixed(2)}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Net Amount
                      </label>
                      <InputField
                        type="text"
                        value={productTotals.netAmount.toFixed(2)}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Profit / Loss
                      </label>
                      <InputField
                        type="text"
                        value={productTotals.totalProfitLoss.toFixed(2)}
                        disabled
                        className={`w-full border px-3 py-2 rounded-lg bg-gray-200 border-gray-300 ${
                          productTotals?.totalProfitLoss > 0
                            ? "text-green-600"
                            : productTotals?.totalProfitLoss < 0
                            ? "text-red-600"
                            : "text-gray-700"
                        }`}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium">
                        Credit Days
                      </label>
                      <InputField
                        type="text"
                        name="creditDays"
                        value={form.creditDays}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border px-3 py-2 rounded-lg border-gray-300"
                        autoComplete="off"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Due Date
                      </label>
                      <DatePicker
                        selected={form.dueDate ? new Date(form.dueDate) : null}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select a date"
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Paid Amount
                      </label>
                      <InputField
                        type="text"
                        name="paidAmount"
                        value={form.paidAmount}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border px-3 py-2 rounded-lg border-gray-300"
                        autoComplete="off"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Due Amount
                      </label>
                      <InputField
                        type="text"
                        value={form.dueAmount}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Payment Status
                    </label>
                    <SearchableDropdown
                      options={statuses.map((status) => ({
                        value: status.type,
                        label: status.type,
                      }))}
                      value={form.paymentStatus}
                      onChange={(value) =>
                        updateFormField("paymentStatus", value)
                      }
                      placeholder="Select Status"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Delivery Date
                    </label>
                    <DatePicker
                      selected={
                        form.deliveryDate ? new Date(form.deliveryDate) : null
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Remark</label>
                    <textarea
                      name="remark"
                      value={form.remark}
                      onChange={enhancedHandleChange}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg capitalize"
                      rows={3}
                      placeholder="Enter remarks..."
                    />
                  </div>

                  <div className="md:col-span-3 mt-4 flex justify-end gap-3 border-t border-gray-300 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Update
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

        {/* Product Edit Modal */}
        {isProductEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
              <div
                className="absolute inset-0"
                onClick={() => setIsProductEditModalOpen(false)}
              />
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setIsProductEditModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Product - {currentProduct?.productName || "Product"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Product Name
                    </label>
                    <InputField
                      type="text"
                      name="productName"
                      value={currentProduct?.productName || ""}
                      onChange={handleProductChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Sales Quantity
                    </label>
                    <InputField
                      type="number"
                      name="salesQty"
                      value={currentProduct?.salesQty || 0}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Bonus Quantity
                    </label>
                    <InputField
                      type="number"
                      name="bonusQty"
                      value={currentProduct?.bonusQty || 0}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Selling Price
                    </label>
                    <InputField
                      type="number"
                      name="sellingPrice"
                      value={currentProduct?.sellingPrice || 0}
                      onChange={handleProductNumericChange}
                      step="0.01"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Discount
                    </label>
                    <InputField
                      type="number"
                      name="discount"
                      value={currentProduct?.discount || 0}
                      onChange={handleProductNumericChange}
                      step="0.01"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      LC Value
                    </label>
                    <InputField
                      type="number"
                      name="lc"
                      value={currentProduct?.lc || 0}
                      onChange={handleProductNumericChange}
                      step="0.01"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-gray-300 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsProductEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    onClick={updateProductInForm}
                  >
                    Update Product
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* View Modal */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
              <div
                className="absolute inset-0"
                onClick={() => setIsViewModalOpen(false)}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  View Sales Record
                </h2>

                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Record Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Recording Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.recordingDate
                          ? formatDateToReadable(form.recordingDate)
                          : "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Invoice Number
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.invoiceNumber || "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Invoice Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.invoiceDate
                          ? formatDateToReadable(form.invoiceDate)
                          : "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        MR Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form.mrName || "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Customer Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form?.customerName || "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Payment Status
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form.paymentStatus || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Product Information
                  </h3>

                  {form.products && form.products.length > 0 ? (
                    <div className="space-y-4">
                      {form.products.map((product, index) => (
                        <div
                          key={index}
                          className="border rounded-lg p-4 bg-gray-50"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex-1">
                              <h4 className="text-lg font-semibold text-gray-800 capitalize">
                                {product.productName || `Product ${index + 1}`}
                              </h4>
                            </div>

                            <button
                              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer text-sm"
                              onClick={() => toggleProductView(index)}
                            >
                              {expandedProductIndex === index
                                ? "Hide Details"
                                : "View Details"}
                            </button>
                          </div>

                          {expandedProductIndex === index && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                              {[
                                ["Sales Quantity", "salesQty"],
                                ["Bonus Quantity", "bonusQty"],
                                ["Total Quantity", "totalQty"],
                                ["Selling Price", "sellingPrice"],
                                ["Amount", "amount"],
                                ["Discount", "discount"],
                                ["Net Selling Amount", "netSellingAmount"],
                                ["Average Unit Price", "averageUnitPrice"],
                                ["Profit / Loss", "profitLoss"],
                              ].map(([label, key]) => (
                                <div key={key}>
                                  <label className="block text-sm font-medium text-gray-600">
                                    {label}
                                  </label>
                                  <p className="border px-3 py-2 rounded-lg bg-white">
                                    {product[key] ?? 0}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border rounded-lg p-4 bg-gray-50 text-center text-gray-500">
                      No products found
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Payment & Delivery
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Credit Days
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.creditDays ?? 0}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Paid Amount
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.paidAmount ?? 0}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Due Amount
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.dueAmount ?? 0}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Due Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.dueDate
                          ? formatDateToReadable(form.dueDate)
                          : "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Delivery Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.deliveryDate
                          ? formatDateToReadable(form.deliveryDate)
                          : "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Total Amount
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.totalAmount ?? 0}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Remark
                  </label>
                  <textarea
                    value={form.remark || "-"}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100 capitalize"
                    rows={3}
                    disabled
                  />
                </div>

                <div className="mt-6 flex justify-end border-t border-gray-300 pt-4">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default Sales;
