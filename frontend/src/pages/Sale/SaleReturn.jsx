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
  X,
  Eye,
  Search,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { useInitialSaleData } from "./IntialLoading.jsx";
import {
  fetchMRList,
  fetchCustomerList,
  fetchProducts,
} from "../../pages/ProductManager/common/fetchDropdown.jsx";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";
import SaleExcelDownload from "../../excels/download/ExcelDownload";

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  mrName: "",
  customerName: "",
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
};

const SaleReturn = () => {
  const [saleReturns, setSaleReturns] = useState([]);
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedSaleProducts, setSelectedSaleProducts] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [isOpen, setIsOpen] = useState(false);
  const { statuses, productNames, loading } = useInitialSaleData();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [mrList, setMrList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);
  const [invoiceNumbers, setInvoiceNumbers] = useState([]);

  const returnsPerPage = 10;
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Define all available table columns
  const allFields = useMemo(
    () => [
      {
        id: "recordingDate",
        name: "Recording Date",
        dbName: "recordingDate",
      },
      {
        id: "invoiceNumber",
        name: "Invoice Number",
        dbName: "invoiceNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "mrName",
        name: "MR Name",
        dbName: "mrName",
      },
      {
        id: "customerName",
        name: "Customer Name",
        dbName: "customerName",
      },
      {
        id: "products",
        name: "Products",
        dbName: "products",
      },
      {
        id: "totalAmount",
        name: "Total Amount",
        dbName: "totalAmount",
      },
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
        id: "remark",
        name: "Remark",
        dbName: "remark",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    [],
  );

  // Fixed table columns like Sales layout
  const tableColumns = useMemo(
    () => [
      "invoiceNumber",
      "invoiceDate",
      "products",
      "mrName",
      "customerName",
      "totalAmount",
      "paymentStatus",
      "actions",
    ],
    [],
  );

  // Fetch MR, Customer, and Products lists
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
          setCustomerList(customers.data);
        } else {
          console.warn(
            "Customer list data is not in expected format:",
            customers,
          );
          setCustomerList([]);
        }

        if (products?.success && Array.isArray(products.data)) {
          setProductsList(products.data);
        } else {
          console.warn(
            "Products list data is not in expected format:",
            products,
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

  // Fetch sale returns
  const fetchSaleReturn = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales-return`);
      if (!res.ok) throw new Error("Failed to fetch sale returns");
      const data = await res.json();
      setSaleReturns(data.data || []);

      // Extract unique invoice numbers for dropdown
      const uniqueInvoiceNumbers = [
        ...new Set(data.data.map((item) => item.invoiceNumber)),
      ].filter(Boolean);
      setInvoiceNumbers(
        uniqueInvoiceNumbers.map((invoice) => ({
          value: invoice,
          label: invoice,
        })),
      );
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale returns");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSaleReturn();
  }, []);

  // Form change handlers
  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const enhancedHandleChange = (e) => {
    const { name, value } = e.target;

    setForm((prevForm) => {
      const updatedForm = {
        ...prevForm,
        [name]: value,
      };

      // Calculate due amount when paid amount changes
      if (name === "paidAmount") {
        const paidAmount = parseFloat(value) || 0;
        const totalAmount = parseFloat(prevForm.totalAmount) || 0;
        const dueAmount = Math.max(0, totalAmount - paidAmount);
        updatedForm.dueAmount = dueAmount.toFixed(2);
      }

      // Calculate due date when credit days changes
      if (name === "creditDays" && prevForm.invoiceDate) {
        const creditDays = parseInt(value) || 0;
        const invoiceDate = new Date(prevForm.invoiceDate);
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(invoiceDate.getDate() + creditDays);
        updatedForm.dueDate = dueDate.toISOString().split("T")[0];
      }

      return updatedForm;
    });
  };

  const handleDateChange = (date, fieldName) => {
    setForm((prevForm) => {
      const updatedForm = {
        ...prevForm,
        [fieldName]: date ? date.toISOString().split("T")[0] : "",
      };

      // Set delivery date when invoice date changes
      if (fieldName === "invoiceDate" && date) {
        updatedForm.deliveryDate = date.toISOString().split("T")[0];
      }

      // Calculate due date when invoice date changes and credit days exist
      if (fieldName === "invoiceDate" && date && prevForm.creditDays) {
        const dueDate = new Date(date);
        dueDate.setDate(dueDate.getDate() + parseInt(prevForm.creditDays));
        updatedForm.dueDate = dueDate.toISOString().split("T")[0];
      }

      return updatedForm;
    });
  };

  const handleUpdateSales = async (e) => {
    e.preventDefault();

    try {
      // ✅ Get token
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${backendUrl}/api/sales-return/${form._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`, // ✅ Added here
          },
          body: JSON.stringify(form),
        },
      );

      // if (!response.ok) throw new Error("Failed to update sale return");

      const result = await response.json();

      showToast("success", "Sale return updated successfully");
      setIsEditModalOpen(false);
      setForm(INITIAL_FORM_STATE);
      fetchSaleReturn();
    } catch (error) {
      console.error("Update error:", error);
      showToast(
        "error",
        error?.response?.data?.message || "Failed to updating sale return.",
      );
    }
  };

  // Filtering logic
  const filteredReturns = saleReturns.filter((r) => {
    if (searchTerm.trim() === "") return true;
    const lower = searchTerm.toLowerCase();
    return (
      r.invoiceNumber?.toLowerCase().includes(lower) ||
      r.customerName?.toLowerCase().includes(lower) ||
      r.mrName?.toLowerCase().includes(lower)
    );
  });

  // Pagination
  const indexOfLast = currentPage * returnsPerPage;
  const indexOfFirst = indexOfLast - returnsPerPage;
  const currentReturns = filteredReturns.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredReturns.length / returnsPerPage);

  const toggleSelect = (ret) => {
    setSelected((prev) => {
      return prev.some((s) => s === ret._id)
        ? prev.filter((s) => s !== ret._id)
        : [...prev, ret._id];
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentReturns.map((r) => r._id));
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> sale returns?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        // ✅ Get token
        const token = localStorage.getItem("token");

        const res = await axios.delete(`${backendUrl}/api/sales-return`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected sale returns deleted successfully");
          fetchSaleReturn();
          setSelected([]);
        }
      } catch (error) {
        showToast(
          "error",
          error?.response?.data?.message || "Failed to delete sale return.",
        );
      }
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSingle = async (id, invoiceNumber) => {
    const confirm = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete sale return <b>${invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        // ✅ Get token
        const token = localStorage.getItem("token");

        const res = await axios.delete(`${backendUrl}/api/sales-return/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 200) {
          showToast(
            "success",
            `Sale return <b>${invoiceNumber}</b> deleted successfully`,
          );
          fetchSaleReturn();
        }
      } catch (error) {
        showToast(
          "error",
          error?.response?.data?.message || "Failed to delete sale return.",
        );
      }
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  const editReturnSale = (returnSale) => {
    setForm(returnSale);
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const viewReturnSale = (returnSale) => {
    setForm(returnSale);
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  // Function to open product details modal for viewing
  const handleProductCountClick = (saleReturn) => {
    setSelectedSaleProducts(saleReturn.products || []);
    setIsProductModalOpen(true);
  };

  // Get field value from sale return object
  const getFieldValue = (saleReturn, dbName) => {
    if (
      ["recordingDate", "invoiceDate", "dueDate", "deliveryDate"].includes(
        dbName,
      )
    ) {
      return formatDateToReadable(saleReturn[dbName]) || "--";
    }

    if (dbName === "products") {
      const productCount = saleReturn.products?.length || 0;
      return productCount;
    }

    if (dbName === "totalAmount") {
      return `${Math.ceil(saleReturn.totalAmount || 0).toLocaleString()}`;
    }

    if (["paidAmount", "dueAmount"].includes(dbName)) {
      return Math.ceil(saleReturn[dbName] || 0);
    }

    return saleReturn[dbName] ?? "--";
  };

  // Helper function to handle numeric input
  const handleNumericInputChange = (e, onChangeHandler) => {
    const { name, value } = e.target;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      onChangeHandler(e);
    }
  };

  // Calculate product totals
  const calculateProductTotals = (products) => {
    if (!products || !Array.isArray(products))
      return {
        totalAmount: 0,
        totalReturnQuantity: 0,
        totalUsedQty: 0,
      };

    const totals = products.reduce(
      (acc, product) => {
        acc.totalAmount += parseFloat(product.netSellingAmount || 0);
        acc.totalReturnQuantity += parseFloat(product.returnQuantity || 0);
        acc.totalUsedQty += parseFloat(product.usedQty || 0);
        return acc;
      },
      { totalAmount: 0, totalReturnQuantity: 0, totalUsedQty: 0 },
    );

    return totals;
  };

  // Function to open product edit modal from edit form
  const openProductEditModal = (product, index) => {
    setCurrentProduct({ ...product });
    setCurrentProductIndex(index);
    setIsProductEditModalOpen(true);
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
        dueAmount: (
          totals.totalAmount - parseFloat(prev.paidAmount || 0)
        ).toFixed(2),
      };
    });
    setIsProductEditModalOpen(false);
    setCurrentProduct(null);
    setCurrentProductIndex(null);
  };

  const toggleProductView = (index) => {
    setExpandedProductIndex(expandedProductIndex === index ? -1 : index);
  };

  if (loadingData || loading) {
    return <LoadingOverlay text="Loading sale returns..." />;
  }

  const productTotals = calculateProductTotals(form.products);

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/salelayout/salereturn/new")}
            >
              <UserPlus size={18} /> Add New Sales Return
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
            {saleReturns.length > 0 && (
              <SaleExcelDownload
                type="salesreturn"
                modalTitle="Download Sales Return Report"
                buttonText="Download Sales Return Excel"
                successMessage="Sales Return Excel downloaded successfully!"
                filePrefix="sales_return_summary"
              />
            )}
          </div>
          {saleReturns.length > 0 && (
            <div className="flex items-center gap-8">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredReturns.length}
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
                  placeholder="Search invoice, customer, product..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item) => (
                    <th
                      key={item.id}
                      className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium"
                    >
                      {item.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {currentReturns.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all return sales"
                              checked={
                                selected.length === currentReturns.length &&
                                currentReturns.length > 0
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
              {currentReturns.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    No sale returns found.
                  </td>
                </tr>
              ) : (
                currentReturns.map((ret, index) => (
                  <tr
                    key={ret._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % returnsPerPage === 0 ||
                      index + 1 === currentReturns.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    {allFields
                      .filter((item) => tableColumns.includes(item.id))
                      .map((item) => (
                        <td
                          key={item.id}
                          className="p-3 whitespace-nowrap min-w-[120px]"
                        >
                          {item.id === "invoiceNumber" ? (
                            <div className="flex items-center gap-4">
                              <input
                                type="checkbox"
                                checked={selected.includes(ret._id)}
                                onChange={() => toggleSelect(ret)}
                              />
                              <span className="capitalize">
                                {ret.invoiceNumber}
                              </span>
                            </div>
                          ) : item.id === "products" ? (
                            <button
                              onClick={() => handleProductCountClick(ret)}
                              className="flex items-center justify-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 transition-colors cursor-pointer mx-auto"
                              title="View Products"
                            >
                              <Package size={14} />
                              <span className="font-medium">
                                {getFieldValue(ret, item.dbName)}
                              </span>
                            </button>
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button
                                className="text-blue-600 hover:text-blue-800 cursor-pointer"
                                onClick={() => viewReturnSale(ret)}
                                title="View"
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                onClick={() => editReturnSale(ret)}
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                                onClick={() =>
                                  handleDeleteSingle(ret._id, ret.invoiceNumber)
                                }
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ) : (
                            getFieldValue(ret, item.dbName)
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {currentReturns.length > 0 && (
            <div className="mt-4 p-5 flex justify-start gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded cursor-pointer ${
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
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Product Details Modal */}
        {isProductModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
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
                  Product Return Details
                </h2>

                {selectedSaleProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No products found for this return.
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
                            Return Qty
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Used Qty
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
                            Used Price ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Used Amount ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSaleProducts.length === 0 ? (
                          <tr>
                            <td
                              colSpan={12}
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
                                {Math.ceil(product.returnQuantity || 0)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {Math.ceil(product.usedQty || 0)}
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
                                {(product.usedPrice || 0).toFixed(2)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {(product.usedAmount || 0).toFixed(2)}
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
            document.body,
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
                  View Sales Return Record - {form.invoiceNumber || "N/A"}
                </h2>

                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Record Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      ["Recording Date", "recordingDate"],
                      ["Invoice Date", "invoiceDate"],
                      ["Invoice Number", "invoiceNumber"],
                      ["MR Name", "mrName"],
                      ["Customer Name", "customerName"],
                      ["Credit Days", "creditDays"],
                      ["Due Date", "dueDate"],
                      ["Delivery Date", "deliveryDate"],
                      ["Paid Amount", "paidAmount"],
                      ["Due Amount", "dueAmount"],
                      ["Total Amount", "totalAmount"],
                      ["Payment Status", "paymentStatus"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-600">
                          {label}
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                          {form[key]
                            ? [
                                "recordingDate",
                                "invoiceDate",
                                "dueDate",
                                "deliveryDate",
                              ].includes(key)
                              ? formatDateToReadable(form[key])
                              : key === "totalAmount"
                                ? `${Math.ceil(form[key] || 0).toLocaleString()}`
                                : form[key]
                            : "-"}
                        </p>
                      </div>
                    ))}
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
                                ["Return Quantity", "returnQuantity"],
                                ["Used Quantity", "usedQty"],
                                ["Selling Price", "sellingPrice"],
                                ["Amount", "amount"],
                                ["Discount", "discount"],
                                ["Net Selling Amount", "netSellingAmount"],
                                ["Used Price", "usedPrice"],
                                ["Used Amount", "usedAmount"],
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

                {/* Products Summary */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Products Summary
                  </label>
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          Total Products
                        </label>
                        <p className="text-lg font-semibold">
                          {form.products?.length || 0}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          Total Return Quantity
                        </label>
                        <p className="text-lg font-semibold">
                          {productTotals.totalReturnQuantity}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          Total Used Quantity
                        </label>
                        <p className="text-lg font-semibold">
                          {productTotals.totalUsedQty}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Remark Section */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-600">
                    Remark
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remark || "-"}
                  </p>
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

        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsEditModalOpen(false)}
              />

              <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setForm(INITIAL_FORM_STATE);
                  }}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Sales Return Record - {form.invoiceNumber || "N/A"}
                </h2>

                <form
                  onSubmit={handleUpdateSales}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto"
                >
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

                  {/* Invoice Number - Changed to SearchableDropdown */}
                  <div>
                    <label className="block text-sm font-medium">
                      Invoice Number <span className="text-red-500">*</span>
                    </label>
                    <SearchableDropdown
                      options={invoiceNumbers}
                      value={form.invoiceNumber}
                      onChange={(value) =>
                        updateFormField("invoiceNumber", value)
                      }
                      placeholder="Select Invoice Number"
                      className="w-full"
                      required
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
                      required
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

                  {/* Customer Name - Using SearchableDropdown */}
                  <div>
                    <label className="block text-sm font-medium">
                      Customer Name
                    </label>
                    <SearchableDropdown
                      options={customerList.map((customer) => ({
                        value: customer.name,
                        label: customer.name,
                      }))}
                      value={form.customerName}
                      onChange={(value) =>
                        updateFormField("customerName", value)
                      }
                      placeholder="Select Customer"
                      className="w-full"
                    />
                  </div>

                  {/* Credit Days - ✅ FIXED: type="text" with numeric input only */}
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
                      inputMode="numeric"
                      pattern="\d*"
                    />
                  </div>

                  {/* Due Date */}
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

                  {/* Paid Amount - DISABLED */}
                  <div>
                    <label className="block text-sm font-medium">
                      Paid Amount
                    </label>
                    <InputField
                      type="number"
                      name="paidAmount"
                      value={form.paidAmount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Due Amount */}
                  <div>
                    <label className="block text-sm font-medium">
                      Due Amount
                    </label>
                    <InputField
                      type="number"
                      value={form.dueAmount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Total Amount */}
                  <div>
                    <label className="block text-sm font-medium">
                      Total Amount
                    </label>
                    <InputField
                      type="number"
                      value={form.totalAmount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
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
                                Sales: {product.salesQty || 0} | Return:{" "}
                                {product.returnQuantity || 0} | Used:{" "}
                                {product.usedQty || 0} | Net Amount: $
                                {(product.netSellingAmount || 0).toFixed(2)}
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
                          No products in this return
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Products Summary */}
                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-300">
                    <div>
                      <label className="block text-sm font-medium">
                        Total Products
                      </label>
                      <InputField
                        type="text"
                        value={form.products?.length || 0}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Total Return Quantity
                      </label>
                      <InputField
                        type="text"
                        value={productTotals.totalReturnQuantity}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium">
                        Total Used Quantity
                      </label>
                      <InputField
                        type="text"
                        value={productTotals.totalUsedQty}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Remark</label>
                    <textarea
                      name="remark"
                      value={form.remark}
                      onChange={enhancedHandleChange}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg capitalize resize-vertical min-h-[80px]"
                      autoComplete="off"
                    />
                  </div>

                  {/* Footer buttons - full width */}
                  <div className="md:col-span-3 mt-6 flex justify-end gap-3 border-t pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        setForm(INITIAL_FORM_STATE);
                      }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Update Sale Return
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
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
                  {/* Product Name */}
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

                  {/* Sales Quantity - DISABLED */}
                  <div>
                    <label className="block text-sm font-medium">
                      Sales Quantity
                    </label>
                    <InputField
                      type="text"
                      name="salesQty"
                      value={currentProduct?.salesQty || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Bonus Quantity - DISABLED */}
                  <div>
                    <label className="block text-sm font-medium">
                      Bonus Quantity
                    </label>
                    <InputField
                      type="text"
                      name="bonusQty"
                      value={currentProduct?.bonusQty || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
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

                  {/* Return Quantity */}
                  <div>
                    <label className="block text-sm font-medium">
                      Return Quantity
                    </label>
                    <InputField
                      type="text"
                      name="returnQuantity"
                      value={currentProduct?.returnQuantity || ""}
                      onChange={(e) => {
                        const { name, value } = e.target;
                        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                          setCurrentProduct((prev) => ({
                            ...prev,
                            [name]: value,
                          }));
                        }
                      }}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Used Quantity - DISABLED */}
                  <div>
                    <label className="block text-sm font-medium">
                      Used Quantity
                    </label>
                    <InputField
                      type="text"
                      name="usedQty"
                      value={currentProduct?.usedQty || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Selling Price - DISABLED */}
                  <div>
                    <label className="block text-sm font-medium">
                      Selling Price
                    </label>
                    <InputField
                      type="text"
                      name="sellingPrice"
                      value={currentProduct?.sellingPrice || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
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

                  {/* Discount - DISABLED */}
                  <div>
                    <label className="block text-sm font-medium">
                      Discount
                    </label>
                    <InputField
                      type="text"
                      name="discount"
                      value={currentProduct?.discount || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
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

                  {/* Used Price - DISABLED */}
                  <div>
                    <label className="block text-sm font-medium">
                      Used Price
                    </label>
                    <InputField
                      type="text"
                      name="usedPrice"
                      value={currentProduct?.usedPrice || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Used Amount */}
                  <div>
                    <label className="block text-sm font-medium">
                      Used Amount
                    </label>
                    <InputField
                      type="text"
                      value={currentProduct?.usedAmount || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
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
            document.body,
          )}
      </div>
    </div>
  );
};

export default SaleReturn;
