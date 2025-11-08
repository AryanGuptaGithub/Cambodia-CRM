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
import SaleExcelDownload from "../../excels/download/SaleExcelDownload";
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
  const [isOpen, setIsOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedSaleProducts, setSelectedSaleProducts] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [productsList, setProductsList] = useState([]); // NEW: State for products
  const inputRef = useRef(null);
  const { statuses, productNames, loading } = useInitialSaleData();
  const [errors, setErrors] = useState({});

  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);

  const toggleProductView = (index) => {
    setExpandedProductIndex(expandedProductIndex === index ? -1 : index);
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
  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (string) => {
    if (!string) return "--";
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  // Get field value from sale object
  const getFieldValue = (sale, dbName) => {
    if (dbName === "customerInfo.name") {
      return sale.customerInfo?.name || "--";
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

    // Handle object values by converting to string
    const value = sale[dbName];
    if (value && typeof value === "object") {
      return value.name || value.displayName || JSON.stringify(value);
    }

    return value ?? "--";
  };

  // Function to open product details modal for viewing
  const handleProductCountClick = (sale) => {
    setSelectedSaleProducts(sale.products || []);
    setIsProductModalOpen(true);
  };

  // Function to open product edit modal from edit form
  const openProductEditModal = (product, index) => {
    setCurrentProduct({ ...product });
    setCurrentProductIndex(index);
    setIsProductEditModalOpen(true);
  };

  // Function to handle product changes in the product edit modal
  const handleProductChange = (e) => {
    const { name, value } = e.target;
    setCurrentProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Function to update product in the main form
  const updateProductInForm = () => {
    setForm((prev) => {
      const updatedProducts = [...prev.products];
      updatedProducts[currentProductIndex] = currentProduct;

      // Recalculate totals after product update
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

  // Function to handle numeric input for product modal
  const handleProductNumericChange = (e) => {
    const { name, value } = e.target;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      setCurrentProduct((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

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
        dbName: "customerInfo.name",
      },
      {
        id: "totalAmount",
        name: "Total Amount ($)",
        dbName: "totalAmount",
      },
      {
        id: "salesQty",
        name: "Sales Qty",
        dbName: "salesQty",
      },
      {
        id: "totalQty",
        name: "Total Qty",
        dbName: "totalQty",
      },
      {
        id: "bonusQty",
        name: "Bonus Qty",
        dbName: "bonusQty",
      },
      {
        id: "sellingPrice",
        name: "Selling Price (USD)",
        dbName: "sellingPrice",
      },
      {
        id: "averageUnitPrice",
        name: "Average Unit Price (USD)",
        dbName: "averageUnitPrice",
      },
      {
        id: "discount",
        name: "Discount (USD)",
        dbName: "discount",
      },
      {
        id: "netSellingAmount",
        name: "Net Selling Amount (USD)",
        dbName: "netSellingAmount",
      },
      {
        id: "amount",
        name: "Product Amount ($)",
        dbName: "amount",
      },
      {
        id: "profitLoss",
        name: "Prof/Loss",
        dbName: "profitLoss",
      },
      { id: "lc", name: "LC", dbName: "lc" },
      {
        id: "paidAmount",
        name: "Paid Amount",
        dbName: "paidAmount",
      },
      {
        id: "dueAmount",
        name: "Due Amount",
        dbName: "dueAmount",
      },
      {
        id: "paymentStatus",
        name: "Payment Status",
        dbName: "paymentStatus",
      },
      {
        id: "creditDays",
        name: "Credit (Days)",
        dbName: "creditDays",
      },
      {
        id: "recordingDate",
        name: "Recording Date",
        dbName: "recordingDate",
      },
      { id: "dueDate", name: "Due Date", dbName: "dueDate" },
      {
        id: "deliveryDate",
        name: "Delivery Date",
        dbName: "deliveryDate",
      },
      { id: "remark", name: "Remark", dbName: "remark" },
      {
        id: "customerCode",
        name: "Customer Code",
        dbName: "customerCode",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

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

  // Constants for pagination
  const SALES_PER_PAGE = 9;

  // Fetch MR, Customer, and Products lists
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [mrs, customers, products] = await Promise.all([
          fetchMRList(),
          fetchCustomerList(),
          fetchProducts(), // NEW: Fetch products
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
          setCustomerList(customers.data);
        } else {
          console.warn(
            "Customer list data is not in expected format:",
            customers
          );
          setCustomerList([]);
        }

        // NEW: Handle products data
        if (products?.success && Array.isArray(products.data)) {
          setProductsList(products.data);
        } else {
          console.warn(
            "Products list data is not in expected format:",
            products
          );
          setProductsList([]);
        }
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

  // Fetch sales data
  const fetchSaleSummaries = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sale summaries");

      const data = await res.json();
      const salesData = data.summaries || data;

      const uniqueTypes = Array.from(
        new Set(salesData.map((item) => item.paymentStatus?.toLowerCase()))
      );

      setTypes(["All", ...uniqueTypes]);
      setSales(salesData);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    } finally {
      setLoadingData(false);
    }
  };

  // Fetch data on mount
  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  // Memoized filtered sales
  const filteredSales = useMemo(() => {
    if (!Array.isArray(sales)) {
      console.warn("Sales is not an array:", sales);
      return [];
    }

    const lowerSearch = searchTerm.trim().toLowerCase();
    const selectedTabLower = selectedTab.toLowerCase();

    return sales.filter((sale) => {
      const paymentStatus = (sale.paymentStatus || "pending").toLowerCase();

      // Tab filter
      if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
        return false;
      }

      if (!lowerSearch) {
        return true;
      }

      // Prepare searchable values
      const fields = [
        sale.invoiceNumber,
        sale.customerInfo?.name,
        sale.productName,
      ];

      return fields.some((f) =>
        (f ?? "").toString().toLowerCase().includes(lowerSearch)
      );
    });
  }, [sales, searchTerm, selectedTab]);

  // Current page sales
  const currentSales = useMemo(() => {
    const start = (currentPage - 1) * SALES_PER_PAGE;
    return filteredSales.slice(start, start + SALES_PER_PAGE);
  }, [filteredSales, currentPage]);

  // Total pages calculation
  const totalPages = useMemo(() => {
    return Math.ceil(filteredSales.length / SALES_PER_PAGE);
  }, [filteredSales.length]);

  // Visible pages for pagination
  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

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

  const handleView = (sale) => {
    setForm({ ...sale });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const editSale = (sale) => {
    setForm({ ...sale });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const handleUpdateSales = async (e, sale) => {
    e.preventDefault();
    try {
      const res = await axios.put(`${backendUrl}/api/sales/${sale._id}`, sale);
      if (res.status === 200) {
        showToast("success", "Sales record updated successfully");
        setIsEditModalOpen(false);
        fetchSaleSummaries();
      }
    } catch (err) {
      showToast("error", "Failed to update sales record.");
    }
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
            `Customer <b>${sale.invoiceNumber}</b> deleted successfully`
          );
          fetchSaleSummaries();
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> sales`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected Sales deleted successfully");
          fetchSaleSummaries();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    } else {
      setSelected([]);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const expectedHeaders = [
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

        let headerIdx = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map((c) => c?.toString().trim());
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
          showToast("error", "Header row not found");
          return;
        }

        const headers = rows[headerIdx].map((h) => h?.toString().trim());
        const dataRows = rows.slice(headerIdx + 1);

        const missingHeaders = expectedHeaders.filter(
          (h) => !headers.includes(h)
        );
        if (missingHeaders.length > 0) {
          showToast(
            "error",
            `Missing headers in file: ${missingHeaders.join(", ")}`
          );
          return;
        }

        // 🔄 Convert to JSON
        const json = dataRows.map((row) => {
          const obj = {};
          headers.forEach((h, i) => (obj[h] = row[i] ?? ""));
          return obj;
        });

        // 🧾 Group by Invoice #
        const groupedInvoices = {};

        json.forEach((row) => {
          const invoiceNumber = row["Invoice #"] || "UNKNOWN";

          if (!groupedInvoices[invoiceNumber]) {
            groupedInvoices[invoiceNumber] = {
              recordingDate: row["Recording Date"] || "",
              invoiceNumber,
              invoiceDate: row["Invoice Date"] || "",
              mrName: row["MR Name"] || "",
              customerName: row["Customer Name"] || "",
              creditDays: Number(row["Credit Days"]) || 0,
              paidAmount: Number(row["Paid Amount"]) || 0,
              paymentStatus: row["Payment Status"] || "",
              remarks: row["Remarks"] || "",
              products: [],
              totalAmount: 0,
              dueAmount: 0,
            };
          }

          const salesQty = Number(row["Sales Qty"]) || 0;
          const sellingPrice = Number(row["Selling Price (USD)"]) || 0;
          const discount = Number(row["Discount (USD)"]) || 0;
          const productTotal = sellingPrice * salesQty - discount;

          groupedInvoices[invoiceNumber].products.push({
            productName: row["Product Name"] || "",
            salesQty,
            bonusQty: Number(row["Bonus Qty"]) || 0,
            sellingPrice,
            discount,
            productTotal,
          });

          groupedInvoices[invoiceNumber].totalAmount += productTotal;
        });

        // 💰 Calculate due amount
        Object.values(groupedInvoices).forEach((invoice) => {
          invoice.dueAmount = invoice.totalAmount - invoice.paidAmount;
        });

        const invoicesArray = Object.values(groupedInvoices);

        setParsedData(invoicesArray);
      } catch (error) {
        console.error("❌ Error reading file:", error);
        showToast("error", "Failed to process Excel file");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleProductImport = async () => {
    if (!parsedData || parsedData.length === 0) {
      showToast("warning", "Please upload and validate a file first.");
      return;
    }

    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/sale/import`,
        parsedData,
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (res?.status === 200 && res?.data) {
        if (res.data.success) {
          showToast(
            "success",
            res.data.message || "Sale summary imported successfully!"
          );
        } else {
          // ✅ show detailed errors returned from backend
          const errorMessage =
            res.data.message?.length > 300
              ? res.data.message.slice(0, 300) + "..."
              : res.data.message;

          showToast("error", errorMessage || "Some records failed to import.");
        }

        setShowImportModal(false);
        await new Promise((resolve) => setTimeout(resolve, 500));
        fetchSaleSummaries();
      } else {
        showToast(
          "error",
          res?.data?.message || "Unexpected response from the server."
        );
      }
    } catch (err) {
      console.error("❌ Import failed:", err);
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  const handleNumericInputChange = (e, updateFunc) => {
    const value = e.target.value;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      updateFunc(e);
    }
  };

  // Form change handlers
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

    // Total Qty = Sales + Bonus
    if (["salesQty", "bonusQty"].includes(name)) {
      updatedForm.totalQty = getInt("salesQty") + getInt("bonusQty");
    }

    // Delivery Date = Invoice Date
    if (name === "invoiceDate") {
      updatedForm.deliveryDate = value;
    }

    // Due Date = Credit Days
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

    // Amount = sellingPrice * salesQty
    if (["sellingPrice", "salesQty"].includes(name)) {
      updatedForm.amount = (
        getNum("sellingPrice") * getInt("salesQty")
      ).toFixed(2);
    }

    // Net Selling Amount = amount - discount
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

    // Due Amount = netSellingAmount - paidAmount (FIXED CALCULATION)
    if (["netSellingAmount", "paidAmount"].includes(name)) {
      const netAmount = getNum("netSellingAmount");
      const paidAmount = getNum("paidAmount");
      updatedForm.dueAmount = (netAmount - paidAmount).toFixed(2);
    }

    // Average Unit Price = netSellingAmount / totalQty
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

  // Get customer name from customer code
  const getCustomerName = (customerCode) => {
    const customer = customerList.find((c) => c.code === customerCode);
    return customer ? customer.name : customerCode;
  };

  // Calculate product totals
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

  // Calculate due amount when form changes
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

  // Render loading
  if (loadingData) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="text-xl font-medium text-gray-600 flex gap-1">
          Loading
          <span className="animate-bounce [animation-delay:0s]">.</span>
          <span className="animate-bounce [animation-delay:0.2s]">.</span>
          <span className="animate-bounce [animation-delay:0.4s]">.</span>
        </div>
      </div>
    );
  }

  const productTotals = calculateProductTotals(form.products);

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/salelayout/sale/new")}
            >
              <UserPlus size={18} /> Add New Sales
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Product
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
          <SaleExcelDownload />
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

          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {filteredSales.length}{" "}
              </span>
              {filteredSales.length > SALES_PER_PAGE && (
                <span className="ml-2 text-sm text-gray-600">
                  (Showing {Math.min(SALES_PER_PAGE, currentSales.length)} of{" "}
                  {filteredSales.length} on page {currentPage})
                </span>
              )}
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
                placeholder="Search invoice,product name, customer name..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>
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
                      ""
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
                              <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                                <Eye
                                  onClick={() => handleView(sale)}
                                  size={18}
                                />
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

          {/* Enhanced Pagination Controls */}
          {filteredSales.length > SALES_PER_PAGE && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div className="text-sm text-gray-600">
                Showing {(currentPage - 1) * SALES_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * SALES_PER_PAGE, filteredSales.length)}{" "}
                of {filteredSales.length} entries
              </div>

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

        {isProductModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
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

        {/* Import Modal */}
        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowImportModal(false)}
              />
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">Import Products</h2>
                {isSampleFile && <SampleExcelDownloadSale />}
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowImportModal(false)}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProductImport}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-blue-400 text-white cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isUploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
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

                <form className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh]">
                  {/* Recording Date */}
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

                  {/* Invoice Number */}
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

                  {/* Invoice Date */}
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

                  {/* MR Name - Using SearchableDropdown */}
                  <div>
                    <label className="block text-sm font-medium">MR Name</label>
                    <SearchableDropdown
                      options={mrList.map((mr) => ({ value: mr, label: mr }))}
                      value={form.mrName}
                      onChange={(value) => updateFormField("mrName", value)}
                      placeholder="Select MR"
                      className="w-full"
                    />
                  </div>

                  {/* Customer - Using SearchableDropdown */}
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
                      placeholder="Select Customer"
                      className="w-full"
                    />
                  </div>

                  {/* Products List */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium mb-2">
                      Products ({form.products?.length || 0})
                    </label>
                    <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                      {form.products && form.products.length > 0 ? (
                        form.products.map((product, index) => (
                          <div
                            key={`edit-product-${index}`}
                            className="flex items-center justify-between p-3 bg-white rounded border border-gray-300"
                          >
                            <div className="flex-1">
                              <span className="font-medium text-gray-700">
                                {product.productName || `Product ${index + 1}`}
                              </span>
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
                        ))
                      ) : (
                        <div className="text-center text-gray-500 py-4">
                          No products added
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Summary */}
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

                  {/* Payment Information */}
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

                  {/* Payment Status */}
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

                  {/* Delivery Date */}
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

                  {/* Remark - Changed to textarea with border */}
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

                  {/* Footer buttons */}
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
                      onClick={(e) => handleUpdateSales(e, form)}
                    >
                      Update
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

        {/* Product Edit Modal (from Edit Form) */}
        {isProductEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
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
                  {/* Product Name - UPDATED: Using fetchProducts instead of productNames */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium">
                      Product Name
                    </label>
                    <SearchableDropdown
                      options={productsList.map((product) => ({
                        value: product.name || product.productName,
                        label: product.name || product.productName,
                      }))}
                      value={currentProduct?.productName || ""}
                      onChange={(value) =>
                        setCurrentProduct((prev) => ({
                          ...prev,
                          productName: value,
                        }))
                      }
                      placeholder="Select Product"
                      className="w-full"
                    />
                  </div>

                  {/* Sales Quantity */}
                  <div>
                    <label className="block text-sm font-medium">
                      Sales Quantity
                    </label>
                    <InputField
                      type="text"
                      name="salesQty"
                      value={currentProduct?.salesQty || ""}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Bonus Quantity */}
                  <div>
                    <label className="block text-sm font-medium">
                      Bonus Quantity
                    </label>
                    <InputField
                      type="text"
                      name="bonusQty"
                      value={currentProduct?.bonusQty || ""}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Total Quantity */}
                  <div>
                    <label className="block text-sm font-medium">
                      Total Quantity
                    </label>
                    <InputField
                      type="text"
                      value={currentProduct?.totalQty || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Selling Price */}
                  <div>
                    <label className="block text-sm font-medium">
                      Selling Price
                    </label>
                    <InputField
                      type="text"
                      name="sellingPrice"
                      value={currentProduct?.sellingPrice || ""}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium">Amount</label>
                    <InputField
                      type="text"
                      value={currentProduct?.amount || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Discount */}
                  <div>
                    <label className="block text-sm font-medium">
                      Discount
                    </label>
                    <InputField
                      type="text"
                      name="discount"
                      value={currentProduct?.discount || ""}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Net Selling Amount */}
                  <div>
                    <label className="block text-sm font-medium">
                      Net Selling Amount
                    </label>
                    <InputField
                      type="text"
                      value={currentProduct?.netSellingAmount || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Average Unit Price */}
                  <div>
                    <label className="block text-sm font-medium">
                      Average Unit Price
                    </label>
                    <InputField
                      type="text"
                      value={currentProduct?.averageUnitPrice || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Profit / Loss */}
                  <div>
                    <label className="block text-sm font-medium">
                      Profit / Loss
                    </label>
                    <InputField
                      type="text"
                      value={currentProduct?.profitLoss ?? ""}
                      className={`w-full border px-3 py-2 rounded-lg bg-gray-200 border-gray-300 ${
                        currentProduct?.profitLoss > 0
                          ? "text-green-600"
                          : currentProduct?.profitLoss < 0
                          ? "text-red-600"
                          : "text-gray-700"
                      }`}
                      disabled
                    />
                  </div>
                </div>

                {/* Footer buttons */}
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

        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
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

                {/* Common Fields Section */}
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
                        {form.customerInfo?.name || "-"}
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

                {/* Product List Section */}
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
                          {/* Product Header with Name and View Button */}
                          <div className="flex justify-between items-center mb-2">
                            {/* Product Name on Left */}
                            <div className="flex-1">
                              <h4 className="text-lg font-semibold text-gray-800 capitalize">
                                {product.productName || `Product ${index + 1}`}
                              </h4>
                            </div>

                            {/* View/Hide Button on Right */}
                            <button
                              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer text-sm"
                              onClick={() => toggleProductView(index)}
                            >
                              {expandedProductIndex === index
                                ? "Hide Details"
                                : "View Details"}
                            </button>
                          </div>

                          {/* Product Details - Conditionally Rendered */}
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

                {/* Payment & Delivery Section */}
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

                {/* Remark Section */}
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
