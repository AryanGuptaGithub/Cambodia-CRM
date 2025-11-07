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
  Settings,
  Eye,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  productId: "",
  productName: "",
  supplierId: "",
  supplierName: "",
  purchaseQty: 0,
  returnQuantity: 0,
  usedQty: 0,
  fob: 0,
  cif: 0,
  lcNumber: "",
  amount: 0,
  returnAmount: 0,
  remarks: "",
  returnReason: "",
  expiredDate: "",
};

// Define numeric fields for proper handling
const NUMERIC_FIELDS = [
  "purchaseQty",
  "returnQuantity",
  "usedQty",
  "fob",
  "cif",
  "amount",
  "returnAmount",
];

// Custom hook for suggestions
const useSuggestions = (items = [], inputValue = "") => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  const filteredItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    return items
      .filter((item) => {
        if (!item) return false;
        return item.toLowerCase().includes(inputValue.toLowerCase());
      })
      .sort((a, b) => a.localeCompare(b));
  }, [items, inputValue]);

  const calculatePosition = useCallback(() => {
    if (isOpen && inputRef.current) {
      const height = inputRef.current.offsetHeight;
      setDropdownTop(2 * height - 8);
    }
  }, [isOpen]);

  useEffect(() => {
    calculatePosition();
  }, [calculatePosition]);

  const handleKeyDown = useCallback(
    (e, onSelect) => {
      if (!isOpen || filteredItems.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0) {
            const selected = filteredItems[highlightedIndex];
            onSelect(selected);
            setIsOpen(false);
            setHighlightedIndex(-1);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        default:
          break;
      }
    },
    [isOpen, filteredItems, highlightedIndex]
  );

  const selectSuggestion = useCallback((value, onSelect) => {
    onSelect(value);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, []);

  return {
    isOpen,
    setIsOpen,
    highlightedIndex,
    setHighlightedIndex,
    inputRef,
    dropdownTop,
    filteredItems,
    handleKeyDown,
    selectSuggestion,
  };
};

const PurchaseReturn = () => {
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // NEW: States for dropdown data
  const [productOptions, setProductOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Column configuration state
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("add");
  const [selectedItems, setSelectedItems] = useState([]);
  const [allSelected, setAllSelected] = useState(false);

  const returnsPerPage = 10;

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
        id: "deliveryNumber",
        name: "Delivery Number",
        dbName: "deliveryNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "receivedDate",
        name: "Received Date",
        dbName: "receivedDate",
      },
      {
        id: "productName",
        name: "Product Name",
        dbName: "productName",
      },
      {
        id: "purchaseQty",
        name: "Purchase Quantity",
        dbName: "purchaseQty",
      },
      {
        id: "returnQuantity",
        name: "Return Quantity",
        dbName: "returnQuantity",
      },
      {
        id: "usedQty",
        name: "Used Quantity",
        dbName: "usedQty",
      },
      {
        id: "fob",
        name: "FOB",
        dbName: "fob",
      },
      {
        id: "cif",
        name: "CIF",
        dbName: "cif",
      },
      {
        id: "lcNumber",
        name: "LC Number",
        dbName: "lcNumber",
      },
      {
        id: "amount",
        name: "Amount ($)",
        dbName: "amount",
      },
      {
        id: "returnAmount",
        name: "Return Amount ($)",
        dbName: "returnAmount",
      },
    
      {
        id: "remarks",
        name: "Remarks",
        dbName: "remarks",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Sample data for suggestions
  const returnReasonStrings = useMemo(
    () => [
      "Damaged Goods",
      "Wrong Product",
      "Expired Product",
      "Quality Issues",
      "Overstock",
      "Customer Return",
    ],
    []
  );

  // Use the custom hook for suggestions
  const returnReasonSuggestions = useSuggestions(
    returnReasonStrings,
    form.returnReason
  );

  const requiredColumns = [
    "invoiceNumber",
    "deliveryNumber",
    "productName",
    "actions",
  ];

  // Default table columns
  const [tableColumns, setTableColumns] = useState([
    "invoiceNumber",
    "deliveryNumber",
    "productName",
    "purchaseQty",
    "returnQuantity",
    "fob",
    "amount",
    "returnAmount",
    "returnReason",
    "actions",
  ]);

  // Get available columns for Add tab (columns not currently in table)
  const availableColumns = useMemo(() => {
    return allFields.filter((item) => !tableColumns.includes(item.id));
  }, [allFields, tableColumns]);

  const removableColumns = useMemo(() => {
    return allFields.filter(
      (item) =>
        tableColumns.includes(item.id) && !requiredColumns.includes(item.id)
    );
  }, [allFields, tableColumns]);

  const chunkedItems = useMemo(() => {
    const items = activeTab === "add" ? availableColumns : removableColumns;
    const chunks = [];
    for (let i = 0; i < items.length; i += 2) {
      chunks.push(items.slice(i, i + 2));
    }
    return chunks;
  }, [activeTab, availableColumns, removableColumns]);

  // NEW: Fetch products and suppliers for dropdowns
  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await axios.get(`${backendUrl}/api/products`);
      const transformedProducts = response.data.map((product) => ({
        value: product._id,
        label: product.productName,
      }));
      setProductOptions(transformedProducts);
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
      setProductOptions([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const response = await axios.get(`${backendUrl}/api/suppliers`);
      const transformedSuppliers = response.data.map((supplier) => ({
        value: supplier._id,
        label: supplier.supplierName || supplier.name,
      }));
      setSupplierOptions(transformedSuppliers);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      showToast("error", "Failed to fetch suppliers");
      setSupplierOptions([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // NEW: Load dropdown data when edit modal opens
  useEffect(() => {
    if (isEditModalOpen) {
      fetchProducts();
      fetchSuppliers();
    }
  }, [isEditModalOpen]);

  // Toggle item selection
  const toggleItem = (id) => {
    if (id === "all") {
      if (allSelected) {
        setSelectedItems([]);
        setAllSelected(false);
      } else {
        const allIds = chunkedItems.flat().map((item) => item.id);
        setSelectedItems(allIds);
        setAllSelected(true);
      }
    } else {
      let updatedItems;
      if (selectedItems.includes(id)) {
        updatedItems = selectedItems.filter((itemId) => itemId !== id);
      } else {
        updatedItems = [...selectedItems, id];
      }

      setSelectedItems(updatedItems);
      setAllSelected(updatedItems.length === chunkedItems.flat().length);
    }
  };

  // Handle save for column configuration
  const handleSaveFields = () => {
    if (activeTab === "add") {
      // Add selected columns to table
      const newColumns = [...tableColumns, ...selectedItems];
      setTableColumns(newColumns);
    } else {
      const newColumns = tableColumns.filter(
        (id) => !selectedItems.includes(id) || requiredColumns.includes(id)
      );
      setTableColumns(newColumns);
    }
    setSelectedItems([]);
    setAllSelected(false);
    setIsColumnModalOpen(false);
  };

  const handleResetFields = () => {
    setSelectedItems([]);
    setAllSelected(false);
    // Reset to default columns
    setTableColumns([
      "invoiceNumber",
      "deliveryNumber",
      "productName",
      "purchaseQty",
      "returnQuantity",
      "fob",
      "amount",
      "returnAmount",
      "returnReason",
      "actions",
    ]);
  };

  const handleCancelEvent = () => {
    setSelectedItems([]);
    setAllSelected(false);
    setIsColumnModalOpen(false);
  };

  // CORRECTED: Handle product selection from dropdown
  const handleProductChange = useCallback((productId) => {
    const selectedProduct = productOptions.find(
      (product) => product.value === productId
    );
    if (selectedProduct) {
      setForm((prev) => ({
        ...prev,
        productId: selectedProduct.value,
        productName: selectedProduct.label,
      }));
    }
  }, [productOptions]);

  // CORRECTED: Handle supplier selection from dropdown
  const handleSupplierChange = useCallback((supplierId) => {
    const selectedSupplier = supplierOptions.find(
      (supplier) => supplier.value === supplierId
    );
    if (selectedSupplier) {
      setForm((prev) => ({
        ...prev,
        supplierId: selectedSupplier.value,
        supplierName: selectedSupplier.label,
      }));
    }
  }, [supplierOptions]);

  // Select return reason from suggestions
  const selectReturnReason = (reason) => {
    setForm((prev) => ({
      ...prev,
      returnReason: reason,
    }));
    returnReasonSuggestions.setIsOpen(false);
  };

  // Fetch purchase returns
  const fetchPurchaseReturn = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/purchase-return`);
      if (!res.ok) throw new Error("Failed to fetch purchase returns");
      const data = await res.json();
      setPurchaseReturns(data.data || []);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching purchase returns");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchPurchaseReturn();
  }, []);

  // Enhanced handle change for form fields
  const enhancedHandleChange = (e) => {
    const { name, value } = e.target;

    setForm((prevForm) => {
      const updatedForm = {
        ...prevForm,
        [name]: value,
      };

      // Extract relevant numeric values
      const purchaseQty =
        parseFloat(name === "purchaseQty" ? value : prevForm.purchaseQty) || 0;
      const returnQuantity =
        parseFloat(
          name === "returnQuantity" ? value : prevForm.returnQuantity
        ) || 0;
      const fob = parseFloat(name === "fob" ? value : prevForm.fob) || 0;
      const amount =
        parseFloat(name === "amount" ? value : prevForm.amount) || 0;

      // Calculated fields
      const usedQty = Math.max(0, purchaseQty - returnQuantity);
      const returnAmount = (returnQuantity * fob).toFixed(2);

      return {
        ...updatedForm,
        usedQty: usedQty.toFixed(2),
        returnAmount: returnAmount,
      };
    });

    // Autocomplete trigger
    if (name === "returnReason") {
      returnReasonSuggestions.setIsOpen(true);
      returnReasonSuggestions.setHighlightedIndex(-1);
    }
  };

  const handleDateChange = (date, fieldName) => {
    setForm((prevForm) => ({
      ...prevForm,
      [fieldName]: date ? date.toISOString() : "",
    }));
  };

  const handleUpdatePurchaseReturn = async (e, formData) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `${backendUrl}/api/purchase-return/${formData._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) throw new Error("Failed to update purchase return");

      const result = await response.json();
      showToast("success", "Purchase return updated successfully");
      setIsEditModalOpen(false);
      setForm(INITIAL_FORM_STATE);
      fetchPurchaseReturn(); // Refresh the data
    } catch (error) {
      console.error("Update error:", error);
      showToast("error", error.message || "Error updating purchase return");
    }
  };

  // Filtering logic
  const filteredReturns = purchaseReturns.filter((r) => {
    if (searchTerm.trim() === "") return true;
    const lower = searchTerm.toLowerCase();
    return (
      r.invoiceNumber?.toLowerCase().includes(lower) ||
      r.deliveryNumber?.toLowerCase().includes(lower) ||
      r.productName?.toLowerCase().includes(lower) ||
      r.returnReason?.toLowerCase().includes(lower)
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
      text: `Are you sure you want to delete <b>${selected.length}</b> purchase returns?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/purchase-return`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast(
            "success",
            "Selected purchase returns deleted successfully"
          );
          fetchPurchaseReturn();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected purchase returns.");
      }
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSingle = async (id, invoiceNumber) => {
    const confirm = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete purchase return <b>${invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/purchase-return/${id}`
        );
        if (res.status === 200) {
          showToast(
            "success",
            `Purchase return <b>${invoiceNumber}</b> deleted successfully`
          );
          fetchPurchaseReturn();
        }
      } catch (error) {
        showToast("error", "Failed to delete purchase return.");
      }
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  const editPurchaseReturn = (purchaseReturn) => {
    setForm(purchaseReturn);
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const viewPurchaseReturn = (purchaseReturn) => {
    setForm(purchaseReturn);
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  // Get field value from purchase return object
  const getFieldValue = (purchaseReturn, dbName) => {
    if (["recordingDate", "invoiceDate", "receivedDate"].includes(dbName)) {
      return formatDateToReadable(purchaseReturn[dbName]) || "--";
    }

    if (dbName === "amount") {
      return purchaseReturn.amount
        ? parseFloat(purchaseReturn.amount).toFixed(2)
        : "0.00";
    }

    if (dbName === "returnAmount") {
      return purchaseReturn.returnAmount
        ? parseFloat(purchaseReturn.returnAmount).toFixed(2)
        : "0.00";
    }

    if (
      ["purchaseQty", "returnQuantity", "usedQty", "fob", "cif"].includes(
        dbName
      )
    ) {
      return purchaseReturn[dbName]
        ? parseFloat(purchaseReturn[dbName]).toFixed(2)
        : "0.00";
    }

    return purchaseReturn[dbName] ?? "--";
  };

  // Helper function to handle numeric input
  const handleNumericInputChange = (e, onChangeHandler) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      onChangeHandler(e);
    }
  };

  if (loadingData) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-lg">Loading purchase returns...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/purchaselayout/purchasereturn/new")}
            >
              <UserPlus size={18} /> Add New Purchase Return
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}

            {/* Column Configuration Button */}
            <button
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => setIsColumnModalOpen(true)}
            >
              <Settings size={18} /> Add /Remove Column
            </button>
          </div>

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
                placeholder="Search invoice, delivery, product..."
                value={searchTerm}
                onChange={handleSearchChange}
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
                      key={item.id}
                      className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium"
                    >
                      {item.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {currentReturns.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all return purchases"
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
                    No purchase returns found.
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
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button
                                className="text-blue-600 hover:text-blue-800 cursor-pointer"
                                onClick={() => viewPurchaseReturn(ret)}
                                title="View"
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                onClick={() => editPurchaseReturn(ret)}
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
                )
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

        {/* Column Configuration Modal */}
        {isColumnModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsColumnModalOpen(false)}
              />
              <div
                className="relative bg-white p-6 rounded shadow-lg max-w-4xl w-full z-10 max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold mb-4">
                  {activeTab === "add" ? "Add Columns" : "Remove Columns"}
                </h2>

                <div className="flex w-full gap-2 mb-4">
                  <div className="w-1/2">
                    <button
                      onClick={() => {
                        setActiveTab("add");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg cursor-pointer ${
                        activeTab === "add"
                          ? "bg-green-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Add Columns ({availableColumns.length})
                    </button>
                  </div>
                  <div className="w-1/2">
                    <button
                      onClick={() => {
                        setActiveTab("remove");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg cursor-pointer ${
                        activeTab === "remove"
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Remove Columns ({removableColumns.length})
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {chunkedItems.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {/* Select All option */}
                      {chunkedItems.flat().length > 0 && (
                        <div className="flex gap-4 border-b pb-2 mb-2 sticky top-0 bg-white">
                          <label className="flex items-center gap-2 flex-1 cursor-pointer select-none font-semibold">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleItem("all")}
                            />
                            Select All
                          </label>
                          <div className="flex-1"></div>
                        </div>
                      )}

                      {chunkedItems.map((pair, index) => (
                        <div key={index} className="flex gap-4">
                          {pair.map(({ id, name }) => (
                            <label
                              key={id}
                              className="flex items-center gap-1 flex-1 cursor-pointer select-none hover:bg-gray-50 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={selectedItems.includes(id)}
                                onChange={() => toggleItem(id)}
                              />
                              <span className="flex-1">{name}</span>
                            </label>
                          ))}
                          {pair.length === 1 && <div className="flex-1"></div>}
                        </div>
                      ))}

                      {/* REQUIRED COLUMNS shown on Remove tab */}
                      {activeTab === "remove" && (
                        <div className="mt-6 pt-4">
                          <h3 className="text-sm font-semibold text-gray-600 mb-2">
                            Compulsory Fields
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-gray-400 text-sm">
                            {allFields
                              .filter((field) =>
                                requiredColumns.includes(field.id)
                              )
                              .map((field) => (
                                <div
                                  key={field.id}
                                  className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 cursor-not-allowed"
                                >
                                  <input type="checkbox" checked disabled />
                                  <div className="flex flex-col">
                                    <span>{field.name}</span>
                                    <span className="text-xs text-red-500">
                                      This field is compulsory
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {activeTab === "add"
                        ? "All available columns are already in the table."
                        : "No columns available to remove."}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 flex justify-between items-center">
                  <button
                    onClick={handleResetFields}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 cursor-pointer"
                  >
                    Reset to Default
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelEvent}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveFields}
                      disabled={selectedItems.length === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* View Modal */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  View Purchase Return Record - {form.invoiceNumber || "N/A"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                  {[
                    ["Recording Date", "recordingDate"],
                    ["Invoice Date", "invoiceDate"],
                    ["Received Date", "receivedDate"],
                    ["Invoice Number", "invoiceNumber"],
                    ["Delivery Number", "deliveryNumber"],
                    ["Product Name", "productName"],
                    ["Purchase Quantity", "purchaseQty"],
                    ["Return Quantity", "returnQuantity"],
                    ["Used Quantity", "usedQty"],
                    ["FOB", "fob"],
                    ["CIF", "cif"],
                    ["LC Number", "lcNumber"],
                    ["Amount", "amount"],
                    ["Return Amount", "returnAmount"],
                    
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
                              "receivedDate",
                            ].includes(key)
                            ? new Date(form[key]).toLocaleDateString()
                            : key === "amount" ||
                              key === "returnAmount" ||
                              [
                                "purchaseQty",
                                "returnQuantity",
                                "usedQty",
                                "fob",
                                "cif",
                              ].includes(key)
                            ? parseFloat(form[key]).toFixed(2)
                            : form[key]
                          : "-"}
                      </p>
                    </div>
                  ))}

                  {/* Remarks - Full Width */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-600">
                      Remarks
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.remarks || "-"}
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
            document.body
          )}

        {/* Edit Modal - CORRECTED with dropdowns */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setForm(INITIAL_FORM_STATE);
                    returnReasonSuggestions.setIsOpen(false);
                  }}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-6">
                  Edit Purchase Return Record - {form.invoiceNumber || "N/A"}
                </h2>

                <form
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto"
                  onSubmit={(e) => handleUpdatePurchaseReturn(e, form)}
                >
                  {/* Date Fields */}
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
                    <label className="block text-sm font-medium">
                      Received Date
                    </label>
                    <DatePicker
                      selected={
                        form.receivedDate ? new Date(form.receivedDate) : null
                      }
                      onChange={(date) =>
                        handleDateChange(date, "receivedDate")
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Basic Information */}
                  <div>
                    <label className="block text-sm font-medium">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      name="invoiceNumber"
                      value={form.invoiceNumber || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg capitalize border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Delivery Number
                    </label>
                    <input
                      type="text"
                      name="deliveryNumber"
                      value={form.deliveryNumber || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg capitalize border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* CORRECTED: Product Dropdown */}
                  <div>
                    <label className="block text-sm font-medium">
                      Product Name
                    </label>
                    <SearchableDropdown
                      value={form.productId}
                      onChange={handleProductChange}
                      options={[{ value: "", label: "Select Product" }, ...productOptions]}
                      placeholder="Select Product"
                      required={true}
                      loading={loadingProducts}
                    />
                  </div>

                  {/* CORRECTED: Supplier Dropdown */}
                  <div>
                    <label className="block text-sm font-medium">
                      Supplier Name
                    </label>
                    <SearchableDropdown
                      value={form.supplierId}
                      onChange={handleSupplierChange}
                      options={[{ value: "", label: "Select Supplier" }, ...supplierOptions]}
                      placeholder="Select Supplier"
                      required={true}
                      loading={loadingSuppliers}
                    />
                  </div>

                  {/* Quantity Fields */}
                  <div>
                    <label className="block text-sm font-medium">
                      Purchase Quantity
                    </label>
                    <input
                      type="text"
                      name="purchaseQty"
                      value={form.purchaseQty || ""}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Return Quantity
                    </label>
                    <input
                      type="text"
                      name="returnQuantity"
                      value={form.returnQuantity || ""}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Used Quantity
                    </label>
                    <input
                      type="text"
                      name="usedQty"
                      value={form.usedQty || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                      autoComplete="off"
                      disabled
                    />
                  </div>

                  {/* Financial Fields */}
                  <div>
                    <label className="block text-sm font-medium">FOB</label>
                    <input
                      type="text"
                      name="fob"
                      value={form.fob || ""}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">CIF</label>
                    <input
                      type="text"
                      name="cif"
                      value={form.cif || ""}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      LC
                    </label>
                    <input
                      type="text"
                      name="lcNumber"
                      value={form.lcNumber || ""}
                      onChange={enhancedHandleChange}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Amount Fields */}
                  <div>
                    <label className="block text-sm font-medium">Amount ($)</label>
                    <input
                      type="text"
                      name="amount"
                      value={form.amount || ""}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Return Amount ($)
                    </label>
                    <input
                      type="text"
                      value={form.returnAmount || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border border-gray-300"
                      disabled
                    />
                  </div>

                
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Remarks</label>
                    <textarea
                      name="remarks"
                      value={form.remarks || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg capitalize resize-vertical min-h-[80px]"
                      autoComplete="off"
                    />
                  </div>

                  {/* Footer buttons - full width */}
                  <div className="md:col-span-3 mt-6 flex justify-end gap-3 pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        setForm(INITIAL_FORM_STATE);
                        returnReasonSuggestions.setIsOpen(false);
                      }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Update Purchase Return
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default PurchaseReturn;