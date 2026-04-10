import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Search,
  UserPlus,
  Upload,
  X,
  Eye,
  Edit,
  Trash2,
  Package,
  PlusSquare,
} from "lucide-react";
import SampleExcelDownloadDailySample from "../../excels/SampleExcelDownloadDailySample";
import ReactDOM from "react-dom";
import { getVisiblePages } from "../../utils/useVisiblePages";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import {
  formatDateToReadable,
  formatDateToYYYYMMDD,
} from "../../utils/dateUtil";
import { useNavigate, Outlet } from "react-router-dom";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import { fetchCustomerList } from "../ProductManager/common/fetchDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const dailySamplePerPage = 10;

// Helper: format date to YYYY-MM-DD
const toYYYYMMDD = (date) => {
  if (!date) return "";
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

// ==========================================
// ProductDetailsModal – shows products for a daily sample
// ==========================================
const ProductDetailsModal = ({ isOpen, onClose, products, title }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
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
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Product Name
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Quantity
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{product.productName}</td>
                    <td className="px-4 py-2">{product.totalQty}</td>
                  </tr>
                ))}
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

// Custom hook for product suggestions (for edit modal)
const useProductSuggestions = (
  productsList,
  currentProducts,
  setCurrentProducts,
  setErrors,
) => {
  const [suggestionsList, setSuggestionsList] = useState([]);
  const inputRefs = useRef([]);

  useEffect(() => {
    setSuggestionsList(
      currentProducts.map(() => ({
        isOpen: false,
        highlightedIndex: -1,
        dropdownTop: 0,
      })),
    );
    inputRefs.current = currentProducts.map(
      (_, i) => inputRefs.current[i] || React.createRef(),
    );
  }, [currentProducts.length]);

  const getFilteredProducts = useCallback(
    (index) => {
      const currentName = currentProducts[index]?.productName || "";
      const selectedNames = currentProducts
        .filter((_, i) => i !== index)
        .map((p) => p.productName)
        .filter(Boolean);
      return (productsList || [])
        .filter((p) => !selectedNames.includes(p.productName))
        .filter((p) =>
          p.productName.toLowerCase().includes(currentName.toLowerCase()),
        )
        .sort((a, b) => a.productName.localeCompare(b.productName));
    },
    [productsList, currentProducts],
  );

  const setIsOpen = (index, isOpen) => {
    setSuggestionsList((prev) =>
      prev.map((s, i) => (i === index ? { ...s, isOpen } : s)),
    );
  };

  const setHighlightedIndex = (index, highlightedIndex) => {
    setSuggestionsList((prev) =>
      prev.map((s, i) => (i === index ? { ...s, highlightedIndex } : s)),
    );
  };

  const setDropdownTop = (index) => {
    const ref = inputRefs.current[index];
    if (ref?.current) {
      const height = ref.current.offsetHeight;
      setSuggestionsList((prev) =>
        prev.map((s, i) =>
          i === index ? { ...s, dropdownTop: 2 * height - 8 } : s,
        ),
      );
    }
  };

  const handleKeyDown = (index, e, onSelect) => {
    const suggestion = suggestionsList[index];
    const filtered = getFilteredProducts(index);
    if (!suggestion?.isOpen || filtered.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(
          index,
          suggestion.highlightedIndex < filtered.length - 1
            ? suggestion.highlightedIndex + 1
            : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(
          index,
          suggestion.highlightedIndex > 0
            ? suggestion.highlightedIndex - 1
            : filtered.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (suggestion.highlightedIndex >= 0) {
          const selected = filtered[suggestion.highlightedIndex];
          onSelect(selected.productName);
          setIsOpen(index, false);
          setHighlightedIndex(index, -1);
        }
        break;
      case "Escape":
        setIsOpen(index, false);
        setHighlightedIndex(index, -1);
        break;
      default:
        break;
    }
  };

  const selectSuggestion = (index, value, onSelect) => {
    onSelect(value);
    setIsOpen(index, false);
    setHighlightedIndex(index, -1);
  };

  const getInputRef = (index) => inputRefs.current[index];

  return {
    suggestionsList,
    getFilteredProducts,
    setIsOpen,
    setHighlightedIndex,
    setDropdownTop,
    handleKeyDown,
    selectSuggestion,
    getInputRef,
  };
};

const DailySample = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dailySampleData, setDailySampleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parsedData, setParsedData] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const inputRef = useRef(null);

  // For edit modal
  const [customerList, setCustomerList] = useState([]);
  const [customerListLoading, setCustomerListLoading] = useState(false);
  const [productsList, setProductsList] = useState([]);
  const [productsListLoading, setProductsListLoading] = useState(false);

  const [form, setForm] = useState({
    _id: "",
    requestNumber: "",
    date: "",
    mrName: "",
    customerId: "",
    customerName: "",
    customerCode: "",
    products: [],
    remark: "",
  });

  const capitalizeFirstLetter = (str) => {
    if (!str) return "";
    str = str.toString();
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // Fetch customers and products for edit modal
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setCustomerListLoading(true);
        const result = await fetchCustomerList();
        if (result.success) setCustomerList(result.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setCustomerListLoading(false);
      }
    };
    loadCustomers();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setProductsListLoading(true);
        const res = await fetch(`${backendUrl}/api/products`);
        const data = await res.json();
        setProductsList(Array.isArray(data) ? data : data.products || []);
      } catch (err) {
        console.error(err);
      } finally {
        setProductsListLoading(false);
      }
    };
    fetchProducts();
  }, []);

  // Filter data
  const filteredDailySamples = (dailySampleData || []).filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const productsArray = Array.isArray(item.products) ? item.products : [];
    const productMatch = productsArray.some((p) =>
      p.productName?.toLowerCase().includes(searchLower),
    );
    return (
      productMatch ||
      item?.customerName?.toLowerCase().includes(searchLower) ||
      item?.customerCode?.toLowerCase().includes(searchLower) ||
      item?.remark?.toLowerCase().includes(searchLower) ||
      item?.requestNumber?.toString().includes(searchLower) ||
      item?.mrName?.toLowerCase().includes(searchLower)
    );
  });

  const totalPages =
    Math.ceil(filteredDailySamples.length / dailySamplePerPage) || 1;
  const visiblePages = Array.isArray(getVisiblePages(currentPage, totalPages))
    ? getVisiblePages(currentPage, totalPages)
    : [];
  const currentDailySamples = filteredDailySamples.slice(
    (currentPage - 1) * dailySamplePerPage,
    currentPage * dailySamplePerPage,
  );

  const fetchDailySampleReports = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${backendUrl}/api/reports/daily-sample`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDailySampleData(data.reports || []);
    } catch (error) {
      console.error(error);
      showToast(
        "error",
        error.message || "Error fetching daily sample reports",
      );
      setDailySampleData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailySampleReports();
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });
      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }
      const requiredHeaders = [
        "request #",
        "date",
        "mr name",
        "remark",
        "product name",
        "total quantity",
      ];
      let headerRowIndex = -1;
      let matchedHeaders = [];
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          cell?.toString().trim().toLowerCase(),
        );
        const matched = requiredHeaders.filter((h) => row.includes(h));
        if (matched.length >= 4) {
          headerRowIndex = i;
          matchedHeaders = matched;
          break;
        }
      }
      if (
        headerRowIndex === -1 ||
        matchedHeaders.length < requiredHeaders.length
      ) {
        const missing = requiredHeaders.filter(
          (h) => !matchedHeaders.includes(h),
        );
        showToast("error", `Missing headers: ${missing.join(", ")}`);
        return;
      }
      const rawHeaders = rows[headerRowIndex];
      const headersMap = {};
      rawHeaders.forEach((header, index) => {
        if (!header) return;
        headersMap[index] = header.toString().trim().toLowerCase();
      });
      const dataRows = rows.slice(headerRowIndex + 1);
      if (dataRows.length === 0) {
        showToast("warning", "No data rows found.");
        return;
      }
      const mappedData = dataRows
        .map((row) => {
          const item = {};
          Object.entries(headersMap).forEach(([index, key]) => {
            item[key] = row[index] || "";
          });
          return {
            requestNumber: item["request #"],
            date: parseExcelDate(item["date"]),
            mrName: item["mr name"],
            remark: item["remark"],
            productName: item["product name"],
            totalQty: item["total quantity"] || 0,
            customerName: item["customer name"] || "",
            customerCode: item["customer code"] || "",
          };
        })
        .filter((entry) => !!entry.requestNumber);
      setParsedData(mappedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const parseExcelDate = (value) => {
    if (!value) return null;
    if (typeof value === "number") {
      const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return jsDate.toISOString();
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/api/reports/daily-sample/import`,
        parsedData,
      );
      if (res.status === 200) {
        showToast("success", res.data.message || "Imported successfully!");
        setShowImportModal(false);
        fetchDailySampleReports();
        setParsedData([]);
      }
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message || "Failed to import";
      showToast("error", message);
    } finally {
      setIsUploading(false);
    }
  };

  const editDailySample = (dailySampleData) => {
    setForm({
      ...dailySampleData,
      products: dailySampleData.products || [],
      date: toYYYYMMDD(dailySampleData.date), // Ensure YYYY-MM-DD for date input
    });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const handleView = (DailySample) => {
    setForm({ ...DailySample, products: DailySample.products || [] });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const onUpdate = async (formData) => {
    try {
      const res = await axios.put(
        `${backendUrl}/api/reports/daily-sample/${formData._id}`,
        formData,
      );
      if (res.status === 200) {
        showToast("success", "Updated successfully");
        setIsEditModalOpen(false);
        fetchDailySampleReports();
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to update");
    }
  };

  const deleteDailySample = async (dailySampleData) => {
    if (!dailySampleData._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete this report?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirmDelete.isConfirmed) {
      try {
        await axios.delete(
          `${backendUrl}/api/reports/daily-sample/${dailySampleData._id}`,
        );
        showToast("success", "Deleted successfully");
        fetchDailySampleReports();
      } catch (error) {
        showToast("error", "Failed to delete");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> daily sample reports?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        await axios.delete(`${backendUrl}/api/reports/daily-sample`, {
          data: { ids: selected },
        });
        showToast("success", `Deleted ${selected.length} reports`);
        fetchDailySampleReports();
        setSelected([]);
      } catch (error) {
        showToast("error", "Failed to delete selected reports");
      }
    } else {
      setSelected([]);
    }
  };

  const toggleSelect = (sale) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c === sale._id);
      if (exists) return prev.filter((c) => c !== sale._id);
      else return [...prev, sale._id];
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentDailySamples.map((s) => s._id);
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => inputRef.current.classList.remove("highlight"), 1000);
    }
  };

  const handleProductCountClick = (item) => {
    setSelectedProducts(item.products || []);
    setIsProductModalOpen(true);
  };

  // Edit modal product handlers
  const [editProducts, setEditProducts] = useState([]);
  const [editErrors, setEditErrors] = useState({});

  useEffect(() => {
    if (isEditModalOpen) {
      setEditProducts(
        form.products.map((p) => ({ ...p, _tempId: Math.random() })),
      );
      setEditErrors({});
    }
  }, [isEditModalOpen, form.products]);

  const addEditProduct = () => {
    setEditProducts((prev) => [
      ...prev,
      { productName: "", totalQty: "", _tempId: Math.random() },
    ]);
  };

  const removeEditProduct = (idx) => {
    if (editProducts.length === 1) {
      showToast("warning", "At least one product is required");
      return;
    }
    setEditProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEditProduct = (idx, field, value) => {
    const newProducts = [...editProducts];
    newProducts[idx][field] = value;
    setEditProducts(newProducts);
    // Clear error for this field
    setEditErrors((prev) => ({ ...prev, [`${field}_${idx}`]: "" }));
  };

  const validateEditProducts = () => {
    const newErrors = {};
    let hasValid = false;
    editProducts.forEach((prod, idx) => {
      if (!prod.productName)
        newErrors[`productName_${idx}`] = "Product name required";
      if (!prod.totalQty || Number(prod.totalQty) <= 0)
        newErrors[`totalQty_${idx}`] = "Quantity must be > 0";
      else hasValid = true;
    });
    if (!hasValid)
      newErrors.products =
        "At least one product with valid quantity is required";
    setEditErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!validateEditProducts()) return;
    const updatedForm = {
      ...form,
      products: editProducts.map(({ productName, totalQty }) => ({
        productName,
        totalQty: Number(totalQty),
      })),
    };
    onUpdate(updatedForm);
  };

  // Customer dropdown options
  const customerOptions = useMemo(() => {
    if (customerList.length === 0 && !customerListLoading)
      return [{ value: "", label: "No Customers Available", disabled: true }];
    return [
      { value: "", label: "Select Customer" },
      ...customerList.map((c) => ({
        value: c._id,
        label: `${c.customerCode} - ${c.name}`,
      })),
    ];
  }, [customerList, customerListLoading]);

  const handleCustomerChange = (customerId) => {
    const selected = customerList.find((c) => c._id === customerId);
    if (selected) {
      setForm((prev) => ({
        ...prev,
        customerId: selected._id,
        customerName: selected.name,
        customerCode: selected.customerCode,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        customerId: "",
        customerName: "",
        customerCode: "",
      }));
    }
  };

  // Product suggestions for edit modal
  const productSuggestionHook = useProductSuggestions(
    productsList,
    editProducts,
    setEditProducts,
    setEditErrors,
  );

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ProductDetailsModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        products={selectedProducts}
        title="Products in this Sample"
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 md:gap-6">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/reportlayout/dailysample/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Daily Sample
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import CSV
          </button>
          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete ({selected.length})
            </button>
          )}
        </div>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 w-full md:w-auto justify-end">
          <p className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold shadow-sm">
              {filteredDailySamples.length}
            </span>
          </p>
          <div className="relative w-full md:w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={handleIconClick}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by Product, MR, Customer, Remark or Request #"
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

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 text-sm border-b">
            <tr>
              <th className="p-3 w-10">
                {currentDailySamples.length > 0 && (
                  <input
                    type="checkbox"
                    checked={
                      selected.length === currentDailySamples.length &&
                      currentDailySamples.length > 0
                    }
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                )}
              </th>
              <th className="p-3">MR Name</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Remark</th>
              <th className="p-3">Products</th>
              <th className="p-3">Total Qty</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentDailySamples.length > 0 ? (
              currentDailySamples.map((item, index) => {
                const productsArray = Array.isArray(item.products)
                  ? item.products
                  : [];
                const totalQty = productsArray.reduce(
                  (sum, p) => sum + (p?.totalQty || 0),
                  0,
                );
                return (
                  <tr
                    key={item._id}
                    className={`hover:bg-gray-50 ${(index + 1) % dailySamplePerPage === 0 || index + 1 === currentDailySamples.length ? "" : "border-b"}`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(item._id)}
                        onChange={() => toggleSelect(item)}
                      />
                    </td>
                    <td className="p-3">
                      {capitalizeFirstLetter(item.mrName)}
                    </td>
                    <td className="p-3">
                      {item.customerName
                        ? capitalizeFirstLetter(item.customerName)
                        : item.customerCode || "—"}
                    </td>
                    <td className="p-3">
                      {capitalizeFirstLetter(item.remark)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleProductCountClick(item)}
                        className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 transition-colors cursor-pointer mx-auto"
                        title="View Products"
                      >
                        <Package size={16} />
                        <span className="font-medium">
                          {productsArray.length}
                        </span>
                      </button>
                    </td>
                    <td className="p-3">{totalQty}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                        <Eye onClick={() => handleView(item)} size={18} />
                      </button>
                      <button className="text-green-600 hover:text-green-800 cursor-pointer">
                        <Edit onClick={() => editDailySample(item)} size={18} />
                      </button>
                      <button
                        onClick={() => deleteDailySample(item)}
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" className="text-center py-4 text-gray-500">
                  No products match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredDailySamples.length > 0 && visiblePages.length > 0 && (
        <div className="mt-4 p-5 flex justify-start gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
          >
            Prev
          </button>
          {visiblePages.map((page, idx) =>
            page === "..." ? (
              <span key={`ellipsis-${idx}`} className="px-3 py-1 text-gray-500">
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${currentPage === page ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
              >
                {page}
              </button>
            ),
          )}
          <button
            onClick={() => {
              setCurrentPage((prev) => Math.min(prev + 1, totalPages));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (!isUploading) setShowImportModal(false);
              }}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => {
                  if (!isUploading) setShowImportModal(false);
                }}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Daily Sample
              </h2>
              {isSampleFile && <SampleExcelDownloadDailySample />}
              <div className="mb-6">
                <label className="block text-gray-700 mb-2">File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                  disabled={isUploading}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowImportModal(false)}
                  disabled={isUploading}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${isUploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-300 hover:bg-gray-400 text-gray-700"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={isUploading}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${isUploading ? "bg-blue-400 text-white cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                >
                  {isUploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Edit Modal – with editable products and customer dropdown */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                ✕
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Daily Sample Report
              </h2>
              <form
                onSubmit={handleEditSubmit}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date || ""}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    MR Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.mrName}
                    onChange={(e) =>
                      setForm({ ...form, mrName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <SearchableDropdown
                    value={form.customerId || ""}
                    onChange={handleCustomerChange}
                    options={customerOptions}
                    placeholder="Select Customer"
                    required={false}
                    loading={customerListLoading}
                    error={null}
                    label="Customer"
                  />
                </div>

                {/* Editable Products Section */}
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">
                      Products <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={addEditProduct}
                      className="text-green-600 hover:text-green-800 flex items-center gap-1 text-sm"
                    >
                      <PlusSquare size={16} /> Add Product
                    </button>
                  </div>
                  {editProducts.map((prod, idx) => {
                    const filteredProducts =
                      productSuggestionHook.getFilteredProducts(idx);
                    return (
                      <div
                        key={prod._tempId}
                        className="border p-4 rounded mb-3 relative"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="relative flex flex-col">
                            <label className="text-sm font-medium">
                              Product Name{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              ref={productSuggestionHook.getInputRef(idx)}
                              type="text"
                              value={prod.productName}
                              onChange={(e) =>
                                updateEditProduct(
                                  idx,
                                  "productName",
                                  e.target.value,
                                )
                              }
                              onKeyDown={(e) =>
                                productSuggestionHook.handleKeyDown(
                                  idx,
                                  e,
                                  (value) =>
                                    updateEditProduct(
                                      idx,
                                      "productName",
                                      value,
                                    ),
                                )
                              }
                              onFocus={() => {
                                productSuggestionHook.setIsOpen(idx, true);
                                productSuggestionHook.setDropdownTop(idx);
                                productSuggestionHook.setHighlightedIndex(
                                  idx,
                                  0,
                                );
                              }}
                              onBlur={() =>
                                setTimeout(
                                  () =>
                                    productSuggestionHook.setIsOpen(idx, false),
                                  150,
                                )
                              }
                              className={`w-full border rounded-md px-3 py-2 ${editErrors[`productName_${idx}`] ? "border-red-500" : "border-gray-300"}`}
                              placeholder="Type to search..."
                              autoComplete="off"
                            />
                            {productSuggestionHook.suggestionsList[idx]
                              ?.isOpen &&
                              filteredProducts.length > 0 && (
                                <ul
                                  className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
                                  style={{
                                    top: productSuggestionHook.suggestionsList[
                                      idx
                                    ].dropdownTop,
                                  }}
                                >
                                  {filteredProducts.map((product, pIdx) => (
                                    <li
                                      key={product._id || pIdx}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() =>
                                        productSuggestionHook.selectSuggestion(
                                          idx,
                                          product.productName,
                                          (value) =>
                                            updateEditProduct(
                                              idx,
                                              "productName",
                                              value,
                                            ),
                                        )
                                      }
                                      onMouseEnter={() =>
                                        productSuggestionHook.setHighlightedIndex(
                                          idx,
                                          pIdx,
                                        )
                                      }
                                      className={`cursor-pointer px-3 py-2 ${productSuggestionHook.suggestionsList[idx].highlightedIndex === pIdx ? "bg-blue-600 text-white" : "bg-white text-gray-900 hover:bg-gray-100"}`}
                                    >
                                      {product.productName}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            {editErrors[`productName_${idx}`] && (
                              <p className="text-red-500 text-xs mt-0.5">
                                {editErrors[`productName_${idx}`]}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="text-sm font-medium">
                              Total Quantity{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={prod.totalQty}
                              onChange={(e) =>
                                updateEditProduct(
                                  idx,
                                  "totalQty",
                                  e.target.value,
                                )
                              }
                              className={`w-full border rounded-md px-3 py-2 ${editErrors[`totalQty_${idx}`] ? "border-red-500" : "border-gray-300"}`}
                            />
                            {editErrors[`totalQty_${idx}`] && (
                              <p className="text-red-500 text-xs">
                                {editErrors[`totalQty_${idx}`]}
                              </p>
                            )}
                          </div>
                        </div>
                        {editProducts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEditProduct(idx)}
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {editErrors.products && (
                    <p className="text-red-500 text-sm mt-1">
                      {editErrors.products}
                    </p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">Remark</label>
                  <input
                    type="text"
                    value={form.remark}
                    onChange={(e) =>
                      setForm({ ...form, remark: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg"
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* View Modal – unchanged */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Daily Sample Report
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.date ? formatDateToReadable(form.date) : "—"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    MR Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.mrName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Customer Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.customerName || "—"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Customer Code
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.customerCode || "—"}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Products
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProducts(form.products || []);
                      setIsProductModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    <Package size={16} /> View Details (
                    {form.products?.length || 0} products)
                  </button>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Remark
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remark?.trim() ? form.remark : "No Remark"}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <Outlet />
    </div>
  );
};

export default DailySample;
