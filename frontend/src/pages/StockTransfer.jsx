import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import {
  Plus,
  Trash2,
  Search,
  Eye,
  Edit,
  X,
  Package,
  Users,
  Truck,
  Pencil,
  DollarSign,
  Box,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { getVisiblePages } from "../utils/useVisiblePages.jsx";
import { formatDateToReadable } from "../utils/dateUtil.js";
import CustomDropdown from "./Utility/customDropdown.jsx";
import axios from "axios";
import { showToast } from "../utils/toast.jsx";
import { confirmDialog } from "../utils/confirmationDialog.js";
import SearchableDropdown from "../components/common/SearchableDropdown";

const ITEMS_PER_PAGE = 9,
  backendUrl = import.meta.env.VITE_BACKEND_URL;

const StockTransfer = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(() => {
    if (location.state && location.state.activeTab) {
      return location.state.activeTab;
    }
    const savedTab = localStorage.getItem("stockTransferActiveTab");
    return savedTab || "general";
  });

  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [generalTransfers, setGeneralTransfers] = useState([]);
  const [mrTransfers, setMrTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const inputRef = useRef(null);

  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    productId: "",
    productName: "",
    boxQuantity: "",
    lc: "",
    productCost: 0,
  });

  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);

  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);

  const [form, setForm] = useState({
    invoiceNo: "",
    date: "",
    items: [],
    remarks: "",
    notes: "",
    status: "",
    transferType: "send",
    shipping: 0,
    totalExpenses: 0,
    grandTotal: 0,
    source: "",
    destination: "",
    mrName: "",
    mrId: "",
    stockTransferToMr: "",
    stockTransferFromMrToMain: "",
  });

  const getProductLc = useCallback((product) => {
    if (!product) return 0;
    if (
      product.batches &&
      Array.isArray(product.batches) &&
      product.batches.length > 0
    ) {
      const batchWithLc = product.batches.find(
        (batch) => batch.lc && batch.lc > 0,
      );
      if (batchWithLc) return batchWithLc.lc;
      if (product.batches[0].lc !== undefined) {
        return product.batches[0].lc || 0;
      }
    }
    return product.lc || 0;
  }, []);

  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(`${backendUrl}/api/staff`);
      const data = response.data || [];
      if (data && data.length > 0) {
        setMrList(data);
        setIsMrListEmpty(false);
      } else {
        setMrList([]);
        setIsMrListEmpty(true);
      }
    } catch (err) {
      console.error("Error fetching MR list:", err);
      setMrList([]);
      setIsMrListEmpty(true);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const mrOptions = useMemo(() => {
    if (isMrListEmpty) return [];
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
      mrData: mr,
    }));
  }, [mrList, isMrListEmpty]);

  useEffect(() => {
    localStorage.setItem("stockTransferActiveTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (location.state?.activeTab) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    fetchMRList();
  }, [fetchMRList]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === "") return "0.00";
    const num = parseFloat(value);
    if (isNaN(num)) return "0.00";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const calculateTotalTransferCost = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    const total = items.reduce((sum, item) => {
      let itemCost = 0;
      if (item.productCost !== undefined && item.productCost !== null) {
        itemCost = parseFloat(item.productCost);
      } else if (item.lc && item.boxQuantity) {
        itemCost = parseFloat(item.lc) * parseInt(item.boxQuantity);
      }
      return sum + (isNaN(itemCost) ? 0 : itemCost);
    }, 0);
    return parseFloat(total.toFixed(2));
  };

  const calculateGrandTotal = (items, shipping = 0, expenses = 0) => {
    const productTotal = calculateTotalTransferCost(items);
    const shippingNum = parseFloat(shipping) || 0;
    const expensesNum = parseFloat(expenses) || 0;
    return parseFloat((productTotal + shippingNum + expensesNum).toFixed(2));
  };

  const extractNumberFromInvoice = (invoiceNo) => {
    if (!invoiceNo || typeof invoiceNo !== "string") return 0;
    const match = invoiceNo.match(/ST-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const getNextStockTransferNumber = useCallback(async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/stock-transfer/next-number`,
      );
      if (response.data.success) {
        return response.data.nextNumber;
      }
      throw new Error(response.data.message || "Failed to get next number");
    } catch (error) {
      console.error("Error fetching next stock transfer number:", error);
      const allTransfers = [...generalTransfers, ...mrTransfers];
      if (allTransfers.length === 0) return "ST-0001";
      const stNumbers = allTransfers
        .map((t) => t.invoiceNo)
        .filter((invoiceNo) => invoiceNo && typeof invoiceNo === "string")
        .map(extractNumberFromInvoice)
        .filter((num) => !isNaN(num) && num > 0);
      if (stNumbers.length === 0) return "ST-0001";
      const maxNum = Math.max(...stNumbers);
      const nextNum = maxNum + 1;
      return `ST-${nextNum.toString().padStart(4, "0")}`;
    }
  }, [generalTransfers, mrTransfers]);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/products/dropdown`);
      const productsData = response.data?.data || [];

      if (!Array.isArray(productsData)) {
        showToast("error", "Invalid products data format");
        return;
      }

      const uniqueProductsMap = new Map();
      productsData.forEach((product) => {
        if (product && product._id && product.productName) {
          const name = product.productName.trim().toLowerCase();
          if (!uniqueProductsMap.has(name)) {
            uniqueProductsMap.set(name, product);
          }
        }
      });

      const uniqueProducts = Array.from(uniqueProductsMap.values());

      const formattedProducts = uniqueProducts.map((product) => ({
        id: product._id,
        _id: product._id,
        label: product.productName || `Product ${product._id}`,
        type: product.type,
        productName: product.productName,
        supplierName: product.supplierName,
        batches: product.batches || [],
        totalBoxes: product.totalBoxes || 0,
        totalAmount: product.totalAmount || 0,
        status: product.status || "Out of Stock",
        minStockLevel: product.minStockLevel || 0,
        lc: getProductLc(product),
        fob: product.fob || 0,
        cif: product.cif || 0,
        sellingPrice: product.sellingPrice,
        stockLastUpdated: product.stockLastUpdated || null,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      }));

      setProducts(formattedProducts);
    } catch (err) {
      console.error("Error fetching products with LC:", err);
      showToast("error", "Failed to fetch products");
    }
  }, [getProductLc]);

  const productOptions = useMemo(() => {
    const availableProducts = products.filter(
      (product) => product.totalBoxes > 0,
    );
    return [
      { value: "", label: "Select Product" },
      ...availableProducts.map((product) => ({
        value: product._id,
        label: `${product.productName} (Stock: ${
          product.totalBoxes || product.availableStock || 0
        } boxes, LC: $${formatCurrency(product.lc)})`,
        qtyPerCarton: product.qtyPerCarton || 0,
        lc: product.lc || product.landedCost || 0,
        availableStock: product.totalBoxes || product.availableStock || 0,
        productName: product.productName,
      })),
    ];
  }, [products]);

  const productOptionsForEdit = useMemo(() => {
    return [
      { value: "", label: "Select Product" },
      ...products.map((product) => ({
        value: product._id,
        label: `${product.productName} (Stock: ${
          product.totalBoxes || product.availableStock || 0
        } boxes, LC: $${formatCurrency(product.lc)})`,
        qtyPerCarton: product.qtyPerCarton || 0,
        lc: product.lc || product.landedCost || 0,
        availableStock: product.totalBoxes || product.availableStock || 0,
        productName: product.productName,
      })),
    ];
  }, [products]);

  const fetchGeneralTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${backendUrl}/api/stock-transfer`);
      setGeneralTransfers(response.data.data || response.data || []);
    } catch (err) {
      setError(err.message || "Error fetching general transfers");
      showToast("error", err.message || "Failed to fetch general transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMRTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr`,
      );
      const data = response.data || [];
      const updatedData = data.map((transfer) => {
        if (!transfer.totalTransferCost || transfer.totalTransferCost === 0) {
          return {
            ...transfer,
            totalTransferCost: calculateTotalTransferCost(transfer.items),
          };
        }
        return transfer;
      });
      setMrTransfers(updatedData || []);
    } catch (err) {
      setError(err.message || "Error fetching MR transfers");
      showToast("error", err.message || "Failed to fetch MR transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "general") {
      fetchGeneralTransfers();
    } else if (activeTab === "mr") {
      fetchMRTransfers();
    }
  }, [activeTab, fetchGeneralTransfers, fetchMRTransfers]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleNumericInputChange = (e, onChangeFunc) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      let numericValue = value === "" ? 0 : parseFloat(value);
      if (isNaN(numericValue)) numericValue = 0;
      const formattedValue = parseFloat(numericValue.toFixed(2));
      const syntheticEvent = {
        target: {
          name,
          value: formattedValue,
        },
      };
      onChangeFunc(syntheticEvent);
    }
  };

  const handleDeleteItem = (index) => {
    if (window.confirm("Are you sure you want to remove this item?")) {
      setForm((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "invoiceNo") return;

    let newValue = value;

    if (
      name === "shipping" ||
      name === "totalExpenses" ||
      name === "grandTotal"
    ) {
      const num = parseFloat(value);
      newValue = isNaN(num) ? 0 : parseFloat(num.toFixed(2));
    }

    setForm((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  const handleViewProducts = (transfer) => {
    if (!transfer || !Array.isArray(transfer.items)) {
      setSelectedProducts([]);
      setIsProductModalOpen(true);
      return;
    }

    const productsWithCost = transfer.items.map((item) => {
      const boxQuantity = parseFloat(item.boxQuantity) || 0;
      const lc = parseFloat(item.lc) || 0;
      const productCost = parseFloat(item.productCost) || lc * boxQuantity;

      return {
        ...item,
        boxQuantity,
        lc,
        productCost,
      };
    });

    setSelectedProducts(productsWithCost);
    setIsProductModalOpen(true);
  };

  const handleAddNewItem = () => {
    setNewProductForm({
      productId: "",
      productName: "",
      boxQuantity: "",
      lc: "",
      productCost: 0,
    });
    setIsAddProductModalOpen(true);
  };

  const handleNewProductSelect = (selectedValue) => {
    const selectedProduct = productOptions.find(
      (opt) => opt.value === selectedValue,
    );

    if (selectedProduct && selectedProduct.value) {
      setNewProductForm((prev) => ({
        ...prev,
        productId: selectedValue,
        productName: selectedProduct.productName,
        lc: selectedProduct.lc || 0,
        boxQuantity: "",
        productCost: 0,
      }));
    }
  };

  const handleNewProductBoxQuantityChange = (e) => {
    const value = e.target.value;
    if (value === "" || /^\d+$/.test(value)) {
      const boxQty = value === "" ? "" : parseInt(value);
      setNewProductForm((prev) => {
        const updated = {
          ...prev,
          boxQuantity: boxQty,
        };
        if (boxQty !== "" && prev.lc) {
          updated.productCost = parseFloat((prev.lc * boxQty).toFixed(2));
        } else {
          updated.productCost = 0;
        }
        return updated;
      });
    }
  };

  const handleAddProductToForm = () => {
    if (
      !newProductForm.productId ||
      !newProductForm.boxQuantity ||
      newProductForm.boxQuantity <= 0
    ) {
      showToast(
        "error",
        "Please select a product and enter a valid box quantity",
      );
      return;
    }

    const selectedProduct = productOptions.find(
      (opt) => opt.value === newProductForm.productId,
    );

    const existingIndex = form.items.findIndex(
      (item) => item.productId === newProductForm.productId,
    );

    if (existingIndex >= 0) {
      setForm((prev) => {
        const updatedItems = [...prev.items];
        const existingItem = updatedItems[existingIndex];
        const newBoxQuantity = parseInt(newProductForm.boxQuantity) || 0;
        const totalBoxQuantity =
          (parseInt(existingItem.boxQuantity) || 0) + newBoxQuantity;

        updatedItems[existingIndex] = {
          ...existingItem,
          boxQuantity: totalBoxQuantity,
          lc: newProductForm.lc || existingItem.lc || 0,
          productCost: parseFloat(
            (
              (newProductForm.lc || existingItem.lc || 0) * totalBoxQuantity
            ).toFixed(2),
          ),
        };

        return {
          ...prev,
          items: updatedItems,
        };
      });

      showToast("success", "Product quantity updated successfully");
    } else {
      const newItem = {
        productId: newProductForm.productId,
        productName: newProductForm.productName,
        boxQuantity: parseInt(newProductForm.boxQuantity) || 0,
        lc: newProductForm.lc,
        productCost: newProductForm.productCost,
        _id: `new-${Date.now()}`,
        product: {
          value: newProductForm.productId,
          label: newProductForm.productName,
          qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
        },
        openPieces: 0,
        qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
        totalPieces:
          (parseInt(newProductForm.boxQuantity) || 0) *
          (selectedProduct?.qtyPerCarton || 0),
        expenses: 0,
      };

      setForm((prev) => ({
        ...prev,
        items: [...prev.items, newItem],
      }));

      showToast("success", "Product added successfully");
    }

    setIsAddProductModalOpen(false);
    setNewProductForm({
      productId: "",
      productName: "",
      boxQuantity: "",
      lc: "",
      productCost: 0,
    });
  };

  // FIXED: handleUpdateTransfer - removed Authorization header
  const handleUpdateTransfer = async (e, formData) => {
    e.preventDefault();

    // Get token from localStorage
    const token = localStorage.getItem("token");

    try {
      let url;
      let requestData = { ...formData };

      if (activeTab === "general") {
        url = `${backendUrl}/api/stock-transfer/${formData._id}`;
        delete requestData.stockTransferToMr;
        delete requestData.stockTransferFromMrToMain;
        delete requestData.mrName;
        delete requestData.mrId;
      } else {
        url = `${backendUrl}/api/stock-transfer-to-mr/${formData._id}`;
        delete requestData.transferType;
        delete requestData.source;
        delete requestData.destination;
        if (requestData.stockTransferToMr) {
          requestData.mrName = requestData.stockTransferToMr;
        }
        if (requestData.mrId) {
          requestData.mrId = requestData.mrId;
        }
      }

      requestData.items = formData.items.map((item) => {
        const itemData = {
          productId: item.productId || item.product?.value,
          productName: item.productName || item.product?.label,
          boxQuantity: parseInt(item.boxQuantity) || 0,
          expenses: parseFloat(item.expenses) || 0,
        };

        if (item.lc) {
          itemData.lc = parseFloat(parseFloat(item.lc).toFixed(2));
          itemData.productCost = parseFloat(
            (itemData.lc * (itemData.boxQuantity || 0)).toFixed(2),
          );
        } else if (item.productCost) {
          itemData.productCost = parseFloat(
            parseFloat(item.productCost).toFixed(2),
          );
        }

        return itemData;
      });

      requestData.totalTransferCost = calculateTotalTransferCost(
        requestData.items,
      );
      requestData.grandTotal = calculateGrandTotal(
        requestData.items,
        requestData.shipping,
        requestData.totalExpenses,
      );

      // Add Authorization header here
      const response = await axios.put(url, requestData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200) {
        if (activeTab === "general") {
          await fetchGeneralTransfers();
        } else {
          await fetchMRTransfers();
        }
        setIsEditModalOpen(false);
        showToast("success", "Transfer updated successfully");
      }
    } catch (err) {
      console.error("Error updating transfer:", err);
      const errorMessage =
        err.response?.data?.err ||
        err.response?.data?.message ||
        "Failed to update transfer";
      showToast("error", errorMessage);
    }
  };

  const getCurrentData = () => {
    return activeTab === "general" ? generalTransfers : mrTransfers;
  };

  const filteredTransfers = useMemo(() => {
    const data = getCurrentData();
    const lowerSearch = searchTerm.trim().toLowerCase();

    if (!lowerSearch) return data;

    return data.filter((transfer) => {
      const matchesInvoice = (transfer.invoiceNo || "")
        .toLowerCase()
        .includes(lowerSearch);
      const matchesRemarks = (transfer.remarks || "")
        .toLowerCase()
        .includes(lowerSearch);

      if (activeTab === "general") {
        const matchesSourceDest =
          (transfer.transferType === "send"
            ? (transfer.destination || "").toLowerCase().includes(lowerSearch)
            : (transfer.source || "").toLowerCase().includes(lowerSearch)) ??
          false;

        return matchesInvoice || matchesRemarks || matchesSourceDest;
      } else {
        const matchesMRName = (
          transfer.stockTransferToMr ||
          transfer.mrName ||
          ""
        )
          .toLowerCase()
          .includes(lowerSearch);
        return matchesInvoice || matchesRemarks || matchesMRName;
      }
    });
  }, [activeTab, getCurrentData, searchTerm]);

  const currentTransfers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransfers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransfers, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE);
  }, [filteredTransfers]);

  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  const handleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleItemProductChange = (index, productValue) => {
    setForm((prev) => {
      const updatedItems = [...prev.items];
      const selectedProduct = productOptionsForEdit.find(
        (opt) => opt.value === productValue,
      );

      updatedItems[index] = {
        ...updatedItems[index],
        product: {
          value: productValue,
          label: selectedProduct?.label || productValue,
          qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
        },
        productName: selectedProduct?.label || productValue,
        qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
        lc: selectedProduct?.lc || 0,
      };

      const boxQuantity = updatedItems[index].boxQuantity || 0;
      const openPieces = updatedItems[index].openPieces || 0;
      const qtyPerCarton = selectedProduct?.qtyPerCarton || 0;

      updatedItems[index].totalPieces =
        parseInt(boxQuantity) * parseInt(qtyPerCarton) + parseInt(openPieces);

      const lc = selectedProduct?.lc || 0;
      updatedItems[index].productCost = parseFloat(
        (lc * (boxQuantity || 0)).toFixed(2),
      );

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };

  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const updatedItems = [...prev.items];
      let newValue = value;

      if (field === "lc" || field === "expenses") {
        const num = parseFloat(value);
        newValue = isNaN(num) ? 0 : parseFloat(num.toFixed(2));
      } else if (
        field === "boxQuantity" ||
        field === "openPieces" ||
        field === "qtyPerCarton"
      ) {
        const num = parseInt(value);
        newValue = isNaN(num) ? 0 : num;
      }

      updatedItems[index] = {
        ...updatedItems[index],
        [field]: newValue,
      };

      if (
        field === "boxQuantity" ||
        field === "openPieces" ||
        field === "qtyPerCarton"
      ) {
        const boxQuantity = updatedItems[index].boxQuantity || 0;
        const openPieces = updatedItems[index].openPieces || 0;
        const qtyPerCarton = updatedItems[index].qtyPerCarton || 0;
        updatedItems[index].totalPieces =
          boxQuantity * qtyPerCarton + openPieces;
      }

      if (field === "boxQuantity" || field === "lc") {
        const lc = parseFloat(updatedItems[index].lc) || 0;
        const boxQty = parseInt(updatedItems[index].boxQuantity) || 0;
        const productCost = parseFloat((lc * boxQty).toFixed(2));
        updatedItems[index].productCost = productCost;
      }

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(currentTransfers.map((row) => row._id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleDelete = async () => {
    if (selectedRows.length === 0) return;

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selectedRows.length}</b> ${
        activeTab === "general" ? "General Transfers" : "MR Transfers"
      }?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      const token = localStorage.getItem("token");
      try {
        await Promise.all(
          selectedRows.map((id) => {
            const url =
              activeTab === "general"
                ? `${backendUrl}/api/stock-transfer/${id}`
                : `${backendUrl}/api/stock-transfer-to-mr/${id}`;

            // Add Authorization header here
            return axios.delete(url, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
          }),
        );

        if (activeTab === "general") {
          await fetchGeneralTransfers();
        } else {
          await fetchMRTransfers();
        }

        setSelectedRows([]);
        showToast("success", "Selected items deleted");
      } catch (err) {
        console.error("Error deleting selected items:", err);
        const errorMessage =
          err.response?.data?.err ||
          err.response?.data?.message ||
          err.message ||
          "Error deleting items";
        showToast("error", errorMessage);
      }
    }
  };

  const handleDeleteSingle = async (transferData) => {
    if (!transferData._id) return;

    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete ${
        activeTab === "general" ? "stock transfer" : "MR transfer"
      } <b>${transferData.invoiceNo}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      const token = localStorage.getItem("token");
      try {
        const url =
          activeTab === "general"
            ? `${backendUrl}/api/stock-transfer/${transferData._id}`
            : `${backendUrl}/api/stock-transfer-to-mr/${transferData._id}`;

        // Add Authorization header here
        const response = await axios.delete(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 200) {
          showToast(
            "success",
            `${activeTab === "general" ? "Stock Transfer" : "MR Transfer"} <b>${
              transferData.invoiceNo
            }</b> deleted successfully`,
          );

          if (activeTab === "general") {
            await fetchGeneralTransfers();
          } else {
            await fetchMRTransfers();
          }
        }
      } catch (err) {
        console.error("Error deleting transfer:", err);
        const errorMessage =
          err.response?.data?.err ||
          err.response?.data?.message ||
          `Failed to delete ${activeTab === "general" ? "stock transfer" : "MR transfer"}.`;
        showToast("error", errorMessage);
      }
    }
  };

  const handleView = (transfer) => {
    setForm({
      ...transfer,
      mrName: transfer.stockTransferToMr || transfer.mrName || "",
      stockTransferToMr: transfer.stockTransferToMr || transfer.mrName || "",
      shipping: parseFloat(transfer.shipping || 0).toFixed(2),
      totalExpenses: parseFloat(transfer.totalExpenses || 0).toFixed(2),
      grandTotal: parseFloat(transfer.grandTotal || 0).toFixed(2),
      mrId: transfer.mrId || "",
    });
    setIsViewModalOpen(true);
  };

  const handleEdit = (transfer) => {
    setForm({
      ...transfer,
      mrName: transfer.stockTransferToMr || transfer.mrName || "",
      stockTransferToMr: transfer.stockTransferToMr || transfer.mrName || "",
      shipping: parseFloat(transfer.shipping || 0).toFixed(2),
      totalExpenses: parseFloat(transfer.totalExpenses || 0).toFixed(2),
      grandTotal: parseFloat(transfer.grandTotal || 0).toFixed(2),
      mrId: transfer.mrId || "",
    });
    setIsEditModalOpen(true);
  };

  const openProductEditModal = (product, index) => {
    setCurrentProduct({
      ...product,
      productId: product.productId || product._id || product.product?.value,
      _id: product.productId || product._id,
      productName: product.productName || product.product?.label,
      boxQuantity: product.boxQuantity || 0,
      lc: product.lc || 0,
      productCost: product.productCost || 0,
    });
    setCurrentProductIndex(index);
    setIsProductEditModalOpen(true);
  };

  const handleProductEditChange = (e) => {
    const { name, value } = e.target;
    setCurrentProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProductNumericChange = (e, isInteger = false) => {
    const { name, value } = e.target;

    if (isInteger) {
      if (value === "" || /^\d*$/.test(value)) {
        const processedValue = value === "" ? "" : parseInt(value) || 0;
        setCurrentProduct((prev) => {
          const updatedProduct = {
            ...prev,
            [name]: processedValue,
          };
          if (name === "boxQuantity") {
            const lcValue = parseFloat(updatedProduct.lc) || 0;
            const boxQty = parseInt(processedValue) || 0;
            updatedProduct.productCost = parseFloat(
              (lcValue * boxQty).toFixed(2),
            );
          }
          return updatedProduct;
        });
      }
    } else {
      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
        const processedValue = value === "" ? "" : parseFloat(value) || 0;
        setCurrentProduct((prev) => {
          const updatedProduct = {
            ...prev,
            [name]: processedValue,
          };
          if (name === "lc") {
            const lcValue = parseFloat(processedValue) || 0;
            const boxQty = parseInt(updatedProduct.boxQuantity) || 0;
            updatedProduct.productCost = parseFloat(
              (lcValue * boxQty).toFixed(2),
            );
          }
          return updatedProduct;
        });
      }
    }
  };

  const handleProductSelectChange = (selectedValue) => {
    const selectedProduct = productOptionsForEdit.find(
      (opt) => opt.value === selectedValue,
    );

    if (selectedProduct) {
      setCurrentProduct((prev) => {
        const updatedProduct = {
          ...prev,
          productId: selectedValue,
          _id: selectedValue,
          productName: selectedProduct.label,
          product: {
            value: selectedValue,
            label: selectedProduct.label,
            qtyPerCarton: selectedProduct.qtyPerCarton,
          },
          qtyPerCarton: selectedProduct.qtyPerCarton || 0,
          lc: selectedProduct.lc || 0,
        };
        updatedProduct.boxQuantity = prev.boxQuantity || 0;
        updatedProduct.productCost = parseFloat(
          ((selectedProduct.lc || 0) * (prev.boxQuantity || 0)).toFixed(2),
        );
        return updatedProduct;
      });
    }
  };

  const updateProductInForm = () => {
    if (!currentProduct?.productName) {
      showToast("error", "Please select a product name");
      return;
    }

    setForm((prev) => {
      const updatedItems = [...prev.items];

      const updatedProduct = {
        ...currentProduct,
        productId: currentProduct.productId,
        _id: currentProduct._id,
        productName: currentProduct.productName,
        product: currentProduct.product || {
          value: currentProduct.productId,
          label: currentProduct.productName,
          qtyPerCarton: currentProduct.qtyPerCarton,
        },
        boxQuantity: parseInt(currentProduct.boxQuantity) || 0,
        openPieces: parseInt(currentProduct.openPieces) || 0,
        qtyPerCarton: parseInt(currentProduct.qtyPerCarton) || 0,
        totalPieces:
          (parseInt(currentProduct.boxQuantity) || 0) *
            (parseInt(currentProduct.qtyPerCarton) || 0) +
          (parseInt(currentProduct.openPieces) || 0),
        lc: parseFloat(currentProduct.lc) || 0,
        productCost: parseFloat(currentProduct.productCost) || 0,
      };

      updatedItems[currentProductIndex] = updatedProduct;

      return {
        ...prev,
        items: updatedItems,
      };
    });

    showToast("success", "Product updated successfully");
    setIsProductEditModalOpen(false);
    setCurrentProduct(null);
    setCurrentProductIndex(null);
  };

  const handleMRNameChange = (selectedValue) => {
    const selectedMR = mrOptions.find((mr) => mr.value === selectedValue);
    setForm((prev) => ({
      ...prev,
      mrId: selectedValue,
      stockTransferToMr: selectedMR?.label || "",
      mrName: selectedMR?.label || "",
    }));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem("stockTransferActiveTab", tab);
    setSelectedRows([]);
    setCurrentPage(1);
    setSearchTerm("");
  };

  const handleNavigateToForm = async () => {
    try {
      const formTab = activeTab === "mr" ? "toMR" : "general";
      const nextNumber = await getNextStockTransferNumber();
      navigate("/createstocktransfer", {
        state: {
          nextStockTransferNo: nextNumber,
          activeTab: formTab,
        },
      });
    } catch (error) {
      console.error("Error getting next stock transfer number:", error);
      showToast("error", "Failed to generate next stock transfer number");
      const formTab = activeTab === "mr" ? "toMR" : "general";
      navigate("/createstocktransfer", {
        state: {
          activeTab: formTab,
        },
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Stock Transfer
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={handleNavigateToForm}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Plus size={18} /> Add New Stock Transfer
          </button>
          {selectedRows.length > 0 && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Trash2 size={18} /> Delete Selected ({selectedRows.length})
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={() => handleTabChange("general")}
            className={`px-5 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "general"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <Truck size={18} /> General Transfer
          </button>
          <button
            onClick={() => handleTabChange("mr")}
            className={`px-5 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "mr"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <Users size={18} /> Stock Transfer To MR
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
          <div className="flex items-center">
            <p className="text-base font-semibold text-gray-700 whitespace-nowrap">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                {filteredTransfers.length}
              </span>
            </p>
          </div>

          <div className="relative w-full lg:w-60">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder={
                activeTab === "general"
                  ? "Search by Stock Transfer No, Remarks, Source/Destination"
                  : "Search by Stock Transfer No, Remarks, MR Name"
              }
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 min-w-[150px] text-sm font-medium">
                <div className="flex items-center gap-4">
                  {currentTransfers.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        selectedRows.length === currentTransfers.length &&
                        currentTransfers.length > 0
                      }
                      onChange={handleSelectAll}
                    />
                  )}
                  <span>Stock Transfer No</span>
                </div>
              </th>
              <th className="p-3 min-w-[150px] text-sm font-medium">
                {activeTab === "general" ? "Source/Destination" : "MR Name"}
              </th>
              <th className="p-3 min-w-[100px] text-sm font-medium">Type</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Date</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                Total LC Cost ($)
              </th>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                # Products
              </th>
              <th className="p-3 min-w-[150px] text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentTransfers.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  {searchTerm
                    ? "No matching records found"
                    : "No data available"}
                </td>
              </tr>
            ) : (
              currentTransfers.map((item, index) => {
                const productCount = Array.isArray(item.items)
                  ? item.items.length
                  : 0;

                const calculatedTotal = calculateTotalTransferCost(item.items);
                const displayTotal = item.totalTransferCost || calculatedTotal;

                return (
                  <tr
                    key={item._id}
                    className={`hover:bg-gray-50 ${
                      index + 1 === currentTransfers.length ? "" : "border-b"
                    }`}
                  >
                    <td className="p-3 min-w-[150px]">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(item._id)}
                          onChange={() => handleSelectRow(item._id)}
                        />
                        <span className="font-medium text-indigo-600">
                          {item.invoiceNo || "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 min-w-[150px]">
                      {activeTab === "general"
                        ? item.transferType === "send"
                          ? item.destination || "Main Warehouse"
                          : item.source || "Main Warehouse"
                        : item.stockTransferToMr || item.mrName || "-"}
                    </td>
                    <td className="p-3 min-w-[100px]">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.transferType === "send"
                            ? "bg-green-100 text-green-800"
                            : item.transferType === "receive"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {item.transferType === "send"
                          ? "Send"
                          : item.transferType === "receive"
                            ? "Receive"
                            : activeTab === "mr"
                              ? "MR Transfer"
                              : "General"}
                      </span>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      {formatDateToReadable(item.date)}
                    </td>
                    <td className="p-3 min-w-[120px] font-medium">
                      <div className="flex items-center justify-center gap-1">
                        <DollarSign size={14} className="text-green-600" />
                        <span className="text-green-700">
                          {formatCurrency(displayTotal)}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <div className="flex items-center justify-center gap-3">
                        <span className="font-medium">{productCount}</span>
                        <button
                          className="text-purple-600 hover:text-purple-800 cursor-pointer"
                          onClick={() => handleViewProducts(item)}
                          title="View Products"
                        >
                          <Package size={18} />
                        </button>
                      </div>
                    </td>
                    <td className="p-3 min-w-[150px]">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          onClick={() => handleView(item)}
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="text-green-600 hover:text-green-800 cursor-pointer"
                          onClick={() => handleEdit(item)}
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          onClick={() => handleDeleteSingle(item)}
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {currentTransfers.length > 0 && (
          <div className="mt-4 p-5 flex flex-wrap justify-start gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Prev
            </button>
            <div className="flex gap-1">
              {visiblePages.map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`px-3 py-2 rounded-lg min-w-[40px] cursor-pointer ${
                    currentPage === pg
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {pg}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* View Modal */}
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
                View{" "}
                {activeTab === "general" ? "Stock Transfer" : "MR Transfer"}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Stock Transfer No
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 font-medium text-indigo-600">
                    {form.invoiceNo || "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.date ? formatDateToReadable(form.date) : "-"}
                  </p>
                </div>

                {activeTab === "general" ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Transfer Type
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form.transferType || "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        {form.transferType === "send"
                          ? "Destination"
                          : "Source"}
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form.transferType === "send"
                          ? form.destination || "-"
                          : form.source || "-"}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        MR Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form.stockTransferToMr || form.mrName || "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        MR ID
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 font-mono text-gray-600">
                        {form.mrId || "-"}
                      </p>
                    </div>
                  </>
                )}

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Remarks
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remarks || "-"}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">
                    Products ({form.items?.length || 0})
                  </h3>
                  <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                    {form.items && form.items.length > 0 ? (
                      form.items.map((item, index) => {
                        const productCost =
                          item.itemCost ||
                          (item.lc || 0) * (item.boxQuantity || 0);
                        return (
                          <div
                            key={item._id || index}
                            className="border-b pb-4 last:border-b-0 bg-gray-50 p-3 rounded-lg"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-600">
                                  Product Name
                                </label>
                                <p className="px-3 py-2 rounded bg-white">
                                  {item.productName || "-"}
                                </p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-600">
                                  Box Quantity
                                </label>
                                <p className="px-3 py-2 rounded bg-white flex items-center gap-1">
                                  <Box size={14} className="text-gray-500" />
                                  {item.boxQuantity || 0}
                                </p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-600">
                                  LC ($)
                                </label>
                                <p className="px-3 py-2 rounded bg-white flex items-center gap-1">
                                  <DollarSign
                                    size={14}
                                    className="text-green-600"
                                  />
                                  {formatCurrency(item.lc)}
                                </p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-600">
                                  LC Per Box ($)
                                </label>
                                <p className="px-3 py-2 rounded bg-white font-medium">
                                  ${formatCurrency(item.lc || 0)}
                                </p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-600">
                                  Total Cost ($)
                                </label>
                                <p className="px-3 py-2 rounded bg-white font-medium text-green-700">
                                  ${formatCurrency(productCost)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-gray-500 text-center">No items</p>
                    )}

                    {form.items && form.items.length > 0 && (
                      <div className="border-t pt-4 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                          <div className="md:col-span-3">
                            <p className="text-right font-semibold text-gray-700">
                              Total:
                            </p>
                          </div>
                          <div>
                            <p className="px-3 py-2 rounded bg-blue-50 font-semibold text-blue-800">
                              {formatCurrency(
                                form.items.reduce(
                                  (sum, item) =>
                                    sum + (parseFloat(item.lc) || 0),
                                  0,
                                ) / form.items.length,
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="px-3 py-2 rounded bg-green-50 font-semibold text-green-800">
                              $
                              {formatCurrency(
                                calculateTotalTransferCost(form.items),
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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

      {/* Edit Modal */}
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
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit{" "}
                {activeTab === "general" ? "Stock Transfer" : "MR Transfer"}
              </h2>

              <form className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Stock Transfer No
                      </label>
                      <input
                        type="text"
                        name="invoiceNo"
                        value={form.invoiceNo || ""}
                        readOnly
                        className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Date
                      </label>
                      <input
                        type="date"
                        name="date"
                        value={form.date ? form.date.split("T")[0] : ""}
                        onChange={handleChange}
                        className="w-full border px-3 py-2 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-1">
                  <div className="grid grid-cols-1 gap-4">
                    {activeTab === "general" ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Transfer Type
                        </label>
                        <select
                          name="transferType"
                          value={form.transferType || "send"}
                          onChange={handleChange}
                          className="w-full border px-3 py-2 rounded-lg"
                        >
                          <option value="send">Send</option>
                          <option value="receive">Receive</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          MR Name
                        </label>
                        <SearchableDropdown
                          value={form.mrId || ""}
                          onChange={(value) => handleMRNameChange(value)}
                          options={mrOptions}
                          placeholder={
                            isMrListEmpty ? "No MRs Available" : "Select MR"
                          }
                          required={true}
                          loading={mrListLoading}
                          disabled={isMrListEmpty}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {activeTab === "general" ? (
                  <div className="md:col-span-3">
                    {form.transferType === "send" ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Destination
                        </label>
                        <input
                          type="text"
                          name="destination"
                          value={form.destination || ""}
                          onChange={handleChange}
                          className="w-full border px-3 py-2 rounded-lg capitalize"
                          autoComplete="off"
                          placeholder="Enter destination"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Source
                        </label>
                        <input
                          type="text"
                          name="source"
                          value={form.source || ""}
                          onChange={handleChange}
                          className="w-full border px-3 py-2 rounded-lg capitalize"
                          autoComplete="off"
                          placeholder="Enter source"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="md:col-span-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        MR ID (Reference)
                      </label>
                      <input
                        type="text"
                        name="mrId"
                        value={form.mrId || ""}
                        readOnly
                        className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-mono text-gray-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This ID is automatically linked to the selected MR
                      </p>
                    </div>
                  </div>
                )}

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Total LC Cost ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="grandTotal"
                    value={calculateTotalTransferCost(form.items)}
                    readOnly
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-green-700"
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated automatically from items (LC × Box Quantity)
                  </p>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Remarks
                  </label>
                  <input
                    type="text"
                    name="remarks"
                    value={form.remarks || ""}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                    autoComplete="off"
                    placeholder="Enter remarks"
                  />
                </div>

                <div className="md:col-span-3">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">
                    Products ({form.items?.length || 0})
                  </h3>
                  <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                    {form.items && form.items.length > 0 ? (
                      form.items.map((item, index) => {
                        const productCost =
                          item.productCost ||
                          (item.lc || 0) * (item.boxQuantity || 0);
                        return (
                          <div
                            key={item._id || index}
                            className="border-b pb-4 last:border-b-0 bg-white p-4 rounded-lg shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-gray-800 capitalize">
                                  {item.productName || "Product"}
                                </h4>
                                <p className="text-sm text-gray-600">
                                  Boxes: {item.boxQuantity || 0} | LC:{" "}
                                  <span className="text-green-600 font-medium">
                                    ${formatCurrency(item.lc)}
                                  </span>{" "}
                                  | Total:{" "}
                                  <span className="text-green-700 font-medium">
                                    ${formatCurrency(productCost)}
                                  </span>
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openProductEditModal(item, index)
                                  }
                                  className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 cursor-pointer"
                                >
                                  <Pencil size={16} />
                                  Edit Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(index)}
                                  className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 size={16} />
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-gray-500 text-center">No items</p>
                    )}
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleAddNewItem}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                    >
                      <Plus size={16} />
                      Add New Product
                    </button>
                  </div>
                </div>

                <div className="md:col-span-3 mt-4 flex justify-end gap-3">
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
                    onClick={(e) => handleUpdateTransfer(e, form)}
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* Add Product Modal */}
      {isAddProductModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAddProductModalOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setIsAddProductModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Add New Product
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <SearchableDropdown
                    value={newProductForm.productId}
                    onChange={(value) => handleNewProductSelect(value)}
                    placeholder="Select Product"
                    options={productOptions}
                    required
                    disabled={productOptions.length === 0}
                  />
                  {newProductForm.productId && (
                    <p className="text-xs text-gray-500 mt-1">
                      Available:{" "}
                      {productOptions.find(
                        (p) => p.value === newProductForm.productId,
                      )?.availableStock || 0}{" "}
                      boxes | LC: $
                      {formatCurrency(
                        productOptions.find(
                          (p) => p.value === newProductForm.productId,
                        )?.lc || 0,
                      )}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Box Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={
                      productOptions.find(
                        (p) => p.value === newProductForm.productId,
                      )?.availableStock || 1000
                    }
                    value={newProductForm.boxQuantity}
                    onChange={handleNewProductBoxQuantityChange}
                    className="w-full border px-3 py-2 rounded-lg border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter box quantity"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    LC ($) Per Box
                  </label>
                  <input
                    type="text"
                    value={
                      newProductForm.lc
                        ? `$${formatCurrency(newProductForm.lc)}`
                        : "$0.00"
                    }
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-green-700"
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Auto-filled from product batches data
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total LC Cost ($)
                  </label>
                  <input
                    type="text"
                    value={`$${formatCurrency(newProductForm.productCost)}`}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-green-700"
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated: LC × Box Quantity
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-300 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:bg-blue-400 disabled:cursor-not-allowed"
                  onClick={handleAddProductToForm}
                  disabled={
                    !newProductForm.productId ||
                    !newProductForm.boxQuantity ||
                    newProductForm.boxQuantity <= 0
                  }
                >
                  Add Product
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Product Edit Modal */}
      {isProductEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsProductEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setIsProductEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Product
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <SearchableDropdown
                    value={currentProduct?.productId || ""}
                    onChange={(value) => handleProductSelectChange(value)}
                    options={productOptionsForEdit}
                    placeholder="Select Product"
                    required
                    disabled={productOptionsForEdit.length === 0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Box Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="boxQuantity"
                    value={currentProduct?.boxQuantity || ""}
                    onChange={(e) => handleProductNumericChange(e, true)}
                    className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    autoComplete="off"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    LC ($) Per Box <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="lc"
                    value={currentProduct?.lc || ""}
                    onChange={(e) => handleProductNumericChange(e, false)}
                    className="w-full border px-3 py-2 rounded-lg border-gray-300 text-green-700"
                    autoComplete="off"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Landed Cost per box from product batches
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Total LC Cost ($)
                  </label>
                  <input
                    type="text"
                    value={`$${formatCurrency(
                      currentProduct?.productCost || 0,
                    )}`}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-green-700"
                    readOnly
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated: LC × Box Quantity
                  </p>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:bg-blue-400 disabled:cursor-not-allowed"
                  onClick={updateProductInForm}
                  disabled={
                    !currentProduct?.productName ||
                    !currentProduct?.boxQuantity ||
                    currentProduct?.boxQuantity <= 0
                  }
                >
                  Update Product
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Product Modal */}
      {isProductModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsProductModalOpen(false)}
            />
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-lg relative flex flex-col border border-gray-200">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-800">
                  Product Details with LC (Landed Cost)
                </h2>
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
                  <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                    <thead className="bg-gray-100 text-gray-700 border-b">
                      <tr>
                        <th className="p-3 min-w-[200px] text-sm font-medium">
                          Product Name
                        </th>
                        <th className="p-3 min-w-[120px] text-sm font-medium">
                          Box Quantity
                        </th>
                        <th className="p-3 min-w-[120px] text-sm font-medium">
                          LC ($) Per Box
                        </th>
                        <th className="p-3 min-w-[120px] text-sm font-medium">
                          Total LC Cost ($)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProducts.length > 0 ? (
                        selectedProducts.map((product, index) => {
                          const productCost =
                            product.itemCost ||
                            (product.lc || 0) * (product.boxQuantity || 0);

                          return (
                            <tr
                              key={product._id || index}
                              className={`hover:bg-gray-50 ${
                                index + 1 === selectedProducts.length
                                  ? ""
                                  : "border-b"
                              }`}
                            >
                              <td className="p-3 min-w-[200px] capitalize">
                                {product.productName || "-"}
                              </td>
                              <td className="p-3 min-w-[120px]">
                                <div className="flex items-center justify-center gap-1">
                                  <Box size={14} className="text-gray-500" />
                                  {product.boxQuantity || 0}
                                </div>
                              </td>
                              <td className="p-3 min-w-[120px]">
                                <div className="flex items-center justify-center gap-1">
                                  <DollarSign
                                    size={14}
                                    className="text-green-600"
                                  />
                                  {formatCurrency(product.lc)}
                                </div>
                              </td>
                              <td className="p-3 min-w-[120px] font-medium">
                                <div className="flex items-center justify-center gap-1">
                                  <DollarSign
                                    size={14}
                                    className="text-green-700"
                                  />
                                  {formatCurrency(product.productCost)}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-gray-500"
                          >
                            No products found
                          </td>
                        </tr>
                      )}
                      {selectedProducts.length > 0 && (
                        <tr className="bg-gray-50 font-semibold">
                          <td
                            className="p-3 min-w-[200px] text-right"
                            colSpan={3}
                          >
                            Total:
                          </td>
                          <td className="p-3 min-w-[120px]">
                            <div className="flex items-center justify-center gap-1">
                              <DollarSign
                                size={14}
                                className="text-green-800"
                              />
                              {formatCurrency(
                                selectedProducts.reduce((sum, product) => {
                                  const cost =
                                    product.itemCost ||
                                    (product.lc || 0) *
                                      (product.boxQuantity || 0);
                                  return sum + cost;
                                }, 0),
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end p-6 border-t">
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default StockTransfer;
