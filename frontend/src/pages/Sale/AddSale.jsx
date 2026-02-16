import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useInitialSaleData } from "./IntialLoading.jsx";
import { PlusSquare, MinusSquare } from "lucide-react";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import {
  fetchMRList,
  fetchCustomerList,
  fetchProducts,
} from "../../pages/ProductManager/common/fetchDropdown.jsx";

// ------------------------------------------------
// CONFIG & INITIAL STATES
// ------------------------------------------------
const INITIAL_PRODUCT_STATE = {
  productName: "",
  salesQty: "",
  bonusQty: "",
  totalQty: "",
  sellingPrice: "",
  amount: "",
  discount: "",
  netSellingAmount: "",
  averageUnitPrice: "",
  lc: "",
  fob: "",
  cif: "",
  profitLoss: "",
  selectedMrId: "",        // only used when saleType === 'mr'
  selectedMrName: "",      // only used when saleType === 'mr'
};

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  mrName: "",              // only used for Normal Sale
  mrId: "",                // only used for Normal Sale
  customerCode: "",
  customerId: "",
  customerName: "",
  paymentStatus: "",
  remark: "",
  creditDays: "",
  dueDate: "",
  deliveryDate: "",
  paidAmount: "",
  dueAmount: "",
  totalAmount: "0.00",
  products: [
    {
      ...INITIAL_PRODUCT_STATE,
      totalQty: "0",
      amount: "0.00",
      netSellingAmount: "0.00",
      averageUnitPrice: "0.00",
      profitLoss: "0.00",
    },
  ],
};

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ------------------------------------------------
// STOCK CALCULATION HELPERS (global & MR)
// ------------------------------------------------
const calculateAvailableStock = (productData) => {
  if (!productData) return 0;
  if (
    productData.totalBoxes !== undefined &&
    productData.totalBoxes !== null &&
    productData.totalBoxes > 0
  ) {
    return productData.totalBoxes;
  }
  if (productData.batches && Array.isArray(productData.batches)) {
    return productData.batches.reduce(
      (sum, batch) => sum + (batch.boxes || 0),
      0
    );
  }
  if (productData.inStock?.boxes !== undefined) {
    return productData.inStock.boxes;
  }
  return 0;
};

const getNearestExpiryDate = (productData) => {
  if (!productData?.batches || !Array.isArray(productData.batches)) return null;
  const validBatches = productData.batches.filter(
    (batch) => batch.boxes > 0 && batch.expiryDate
  );
  if (validBatches.length === 0) return null;
  const sortedBatches = [...validBatches].sort(
    (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
  );
  return sortedBatches[0].expiryDate;
};

const hasStock = (productData) => calculateAvailableStock(productData) > 0;

// --- MR‑specific stock helpers ---
const calculateMRStock = (mrStockData) => {
  if (!mrStockData) return 0;
  return mrStockData.totalBoxes || 0;
};

const getMRNearestExpiry = (mrStockData) => {
  if (!mrStockData?.batches) return null;
  const valid = mrStockData.batches.filter(b => b.boxes > 0 && b.expiryDate);
  if (!valid.length) return null;
  const sorted = [...valid].sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  return sorted[0].expiryDate;
};

// ------------------------------------------------
// CUSTOM HOOK – SUGGESTIONS (unchanged)
// ------------------------------------------------
const useSuggestions = (items, filterField = "type", inputValue = "") => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => {
          const fieldValue =
            typeof item === "string" ? item : item[filterField];
          if (inputValue.trim() === "") {
            return true;
          }
          return fieldValue.toLowerCase().includes(inputValue.toLowerCase());
        })
        .sort((a, b) => {
          const aVal = typeof a === "string" ? a : a[filterField];
          const bVal = typeof b === "string" ? b : b[filterField];
          return aVal.localeCompare(bVal);
        }),
    [items, filterField, inputValue]
  );

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
            const value =
              typeof selected === "string" ? selected : selected[filterField];
            onSelect(value);
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
    [isOpen, filteredItems, highlightedIndex, filterField]
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

// ------------------------------------------------
// CUSTOM HOOK – PRODUCT SUGGESTIONS (unchanged)
// ------------------------------------------------
const useProductSuggestions = (products, productNames) => {
  const [suggestionsList, setSuggestionsList] = useState([]);
  const inputRefs = useRef([]);

  useEffect(() => {
    const initialSuggestions = products.map((product) => ({
      isOpen: false,
      highlightedIndex: -1,
      dropdownTop: 0,
    }));
    setSuggestionsList(initialSuggestions);
    inputRefs.current = products.map(
      (_, i) => inputRefs.current[i] || React.createRef()
    );
  }, [products.length]);

  const filteredItems = useMemo(() => {
    return products.map((product, productIndex) => {
      const selectedProductNames = products
        .filter((p, idx) => idx !== productIndex && p.productName.trim() !== "")
        .map((p) => p.productName);
      return productNames
        .filter((item) => {
          const fieldValue = typeof item === "string" ? item : item.name;
          const itemName = typeof item === "string" ? item : item.name;
          if (selectedProductNames.includes(itemName)) {
            return false;
          }
          if (product.productName.trim() === "") {
            return true;
          }
          return fieldValue
            .toLowerCase()
            .includes(product.productName.toLowerCase());
        })
        .sort((a, b) => {
          const aVal = typeof a === "string" ? a : a.name;
          const bVal = typeof b === "string" ? b : b.name;
          return aVal.localeCompare(bVal);
        });
    });
  }, [products, productNames]);

  const setIsOpen = useCallback((index, isOpen) => {
    setSuggestionsList((prev) =>
      prev.map((suggestion, i) =>
        i === index ? { ...suggestion, isOpen } : suggestion
      )
    );
  }, []);

  const setHighlightedIndex = useCallback((index, highlightedIndex) => {
    setSuggestionsList((prev) =>
      prev.map((suggestion, i) =>
        i === index ? { ...suggestion, highlightedIndex } : suggestion
      )
    );
  }, []);

  const setDropdownTop = useCallback((index) => {
    const inputRef = inputRefs.current[index];
    if (inputRef?.current) {
      const height = inputRef.current.offsetHeight;
      setSuggestionsList((prev) =>
        prev.map((suggestion, i) =>
          i === index
            ? { ...suggestion, dropdownTop: 2 * height - 8 }
            : suggestion
        )
      );
    }
  }, []);

  const handleKeyDown = useCallback(
    (index, e, onSelect) => {
      const suggestion = suggestionsList[index];
      if (!suggestion?.isOpen || filteredItems[index].length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex(
            index,
            suggestion.highlightedIndex < filteredItems[index].length - 1
              ? suggestion.highlightedIndex + 1
              : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex(
            index,
            suggestion.highlightedIndex > 0
              ? suggestion.highlightedIndex - 1
              : filteredItems[index].length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (suggestion.highlightedIndex >= 0) {
            const selected = filteredItems[index][suggestion.highlightedIndex];
            const value =
              typeof selected === "string" ? selected : selected.name;
            onSelect(value);
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
    },
    [suggestionsList, filteredItems, setHighlightedIndex, setIsOpen]
  );

  const selectSuggestion = useCallback(
    (index, value, onSelect) => {
      onSelect(value);
      setIsOpen(index, false);
      setHighlightedIndex(index, -1);
    },
    [setIsOpen, setHighlightedIndex]
  );

  const getInputRef = useCallback((index) => {
    return inputRefs.current[index];
  }, []);

  return {
    suggestionsList,
    filteredItems,
    setIsOpen,
    setHighlightedIndex,
    setDropdownTop,
    handleKeyDown,
    selectSuggestion,
    getInputRef,
  };
};

// ------------------------------------------------
// CUSTOM HOOK – SALE FORM (unchanged)
// ------------------------------------------------
const useSaleForm = (initialCustomerCode = "", initialSaleType = "normal") => {
  const [form, setForm] = useState({
    ...INITIAL_FORM_STATE,
    customerCode: initialCustomerCode,
  });
  const [errors, setErrors] = useState({});
  const [expandedProductIndex, setExpandedProductIndex] = useState(0);
  const [mrList, setMrList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [customerListLoading, setCustomerListLoading] = useState(true);
  const [productsListLoading, setProductsListLoading] = useState(true);

  const [mrProductStock, setMrProductStock] = useState([]);
  const [mrAvailableProducts, setMrAvailableProducts] = useState([]);

  const parseNumber = useCallback((val) => {
    if (val === "" || val === null || val === undefined) return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }, []);

  const calculateTotalAmount = useCallback((products) => {
    const total = products.reduce((sum, product) => {
      return sum + parseFloat(product.netSellingAmount || 0);
    }, 0);
    return total.toFixed(2);
  }, []);

  const calculateTotalNetAmount = useCallback((products) => {
    const total = products.reduce((sum, product) => {
      return sum + parseFloat(product.netSellingAmount || 0);
    }, 0);
    return total.toFixed(2);
  }, []);

  const isPaidInFull = useCallback(() => {
    const totalAmount = parseFloat(form.totalAmount) || 0;
    const paidAmount = parseFloat(form.paidAmount) || 0;
    return totalAmount > 0 && totalAmount === paidAmount;
  }, [form.totalAmount, form.paidAmount]);

  const autoSetPaymentStatus = useCallback((currentForm) => {
    const totalAmount = parseFloat(currentForm.totalAmount) || 0;
    const paidAmount = parseFloat(currentForm.paidAmount) || 0;
    const dueAmount = parseFloat(currentForm.dueAmount) || 0;

    let paymentStatus = "Credit";
    if (totalAmount > 0) {
      if (paidAmount === totalAmount) {
        paymentStatus = "Cash";
      } else if (dueAmount === totalAmount || paidAmount === 0) {
        paymentStatus = "Credit";
      } else if (paidAmount > 0 && paidAmount < totalAmount) {
        paymentStatus = "Partial Paid";
      }
    }
    return paymentStatus;
  }, []);

  const calculateDerivedFields = useCallback(
    (name, value, currentForm) => {
      const updatedForm = { ...currentForm, [name]: value };

      if (name === "invoiceDate") {
        updatedForm.deliveryDate = value;
      }

      if (name === "creditDays") {
        const creditDays = parseInt(value, 10);
        if (!isNaN(creditDays) && creditDays > 0) {
          try {
            const currentDate = new Date();
            const due = new Date(currentDate);
            due.setDate(due.getDate() + creditDays);
            if (!isNaN(due.getTime())) {
              updatedForm.dueDate = due.toISOString().split("T")[0];
            } else {
              updatedForm.dueDate = "";
            }
          } catch (error) {
            console.error("Error calculating due date:", error);
            updatedForm.dueDate = "";
          }
        } else {
          updatedForm.dueDate = "";
        }
      }

      if (name === "paidAmount") {
        const totalNetAmount = calculateTotalNetAmount(currentForm.products);
        const paidAmount = parseNumber(value);
        const newDueAmount = (parseFloat(totalNetAmount) - paidAmount).toFixed(2);
        updatedForm.dueAmount = newDueAmount;
        updatedForm.paymentStatus = autoSetPaymentStatus({
          ...updatedForm,
          paidAmount: value,
          dueAmount: newDueAmount,
          totalAmount: totalNetAmount,
        });
        const isFullPayment = parseFloat(totalNetAmount) === parseFloat(value);
        if (isFullPayment) {
          updatedForm.creditDays = "";
          updatedForm.dueDate = "";
        }
      }

      if (name === "totalAmount") {
        const totalAmount = parseFloat(value) || 0;
        const paidAmount = parseFloat(currentForm.paidAmount) || 0;
        const dueAmount = totalAmount - paidAmount;
        updatedForm.dueAmount = dueAmount.toFixed(2);
        updatedForm.paymentStatus = autoSetPaymentStatus({
          ...updatedForm,
          totalAmount: value,
          dueAmount: dueAmount.toFixed(2),
        });
        const isFullPayment = totalAmount === paidAmount;
        if (isFullPayment) {
          updatedForm.creditDays = "";
          updatedForm.dueDate = "";
        }
      }

      return updatedForm;
    },
    [parseNumber, calculateTotalNetAmount, autoSetPaymentStatus]
  );

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setForm((prev) => {
        return calculateDerivedFields(name, value, prev);
      });
    },
    [calculateDerivedFields]
  );

  // ------------------------------------------------
  // DATA FETCHING (unchanged)
  // ------------------------------------------------
  const fetchMRListData = useCallback(async () => {
    try {
      setMrListLoading(true);
      const result = await fetchMRList();
      if (result.success) {
        setMrList(result.data || []);
      } else {
        console.error("Error fetching MR list:", result.error);
        showToast("error", result.error);
      }
    } catch (error) {
      console.error("Error fetching MR list:", error);
      showToast("error", "Failed to load Medical Representatives");
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const fetchCustomerListData = useCallback(async () => {
    try {
      setCustomerListLoading(true);
      const result = await fetchCustomerList();
      if (result.success) {
        setCustomerList(result.data || []);
      } else {
        console.error("Error fetching customer list:", result.error);
        showToast("error", result.error);
      }
    } catch (error) {
      console.error("Error fetching customer list:", error);
      showToast("error", "Failed to load Customers");
    } finally {
      setCustomerListLoading(false);
    }
  }, []);

  const fetchProductsListData = useCallback(async () => {
    try {
      setProductsListLoading(true);
      const result = await fetchProducts();
      if (result.success) {
        setProductsList(result.data || []);
      } else {
        console.error("Error fetching products list:", result.error);
        showToast("error", result.error);
      }
    } catch (error) {
      console.error("Error fetching products list:", error);
      showToast("error", "Failed to load Products");
    } finally {
      setProductsListLoading(false);
    }
  }, []);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // --- NORMAL SALE: header MR handling ---
  const handleMRChange = useCallback(
    (mrId) => {
      const selectedMR = mrList.find((mr) => mr._id === mrId);
      if (selectedMR) {
        setForm((prevForm) => ({
          ...prevForm,
          mrId: mrId,
          mrName: selectedMR.medicalRepName,
        }));
      }
      setErrors((prev) => ({ ...prev, mrName: "" }));
    },
    [mrList]
  );

  const handleCustomerChange = useCallback(
    (customerId) => {
      const selectedCustomer = customerList.find(
        (customer) => customer._id === customerId
      );
      if (selectedCustomer) {
        setForm((prevForm) => ({
          ...prevForm,
          customerId: customerId,
          customerCode: selectedCustomer.customerCode,
          customerName: selectedCustomer.name,
        }));
      }
      setErrors((prev) => ({ ...prev, customerCode: "" }));
    },
    [customerList]
  );

  // ------------------------------------------------
  // PRODUCT ROW MANAGEMENT
  // ------------------------------------------------
  const toggleView = useCallback((index) => {
    setExpandedProductIndex((prevIndex) => (prevIndex === index ? -1 : index));
  }, []);

  const isProductExpanded = useCallback(
    (index) => expandedProductIndex === index,
    [expandedProductIndex]
  );

  const isProductFilled = useCallback((product) => {
    return product.productName.trim() !== "";
  }, []);

  const areCommonFieldsFilled = useCallback((currentForm) => {
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "customerCode",
      "paymentStatus",
    ];
    if (currentForm.saleType !== "mr") {
      requiredFields.push("mrName");
    }
    return requiredFields.every(
      (field) =>
        currentForm[field] && currentForm[field].toString().trim() !== ""
    );
  }, []);

  const hasAtLeastOneProduct = useCallback((products) => {
    return products.some((product) => product.productName.trim() !== "");
  }, []);

  const addProduct = useCallback(() => {
    setForm((prev) => {
      const newProducts = [
        ...prev.products,
        {
          ...INITIAL_PRODUCT_STATE,
          totalQty: "0",
          amount: "0.00",
          netSellingAmount: "0.00",
          averageUnitPrice: "0.00",
          profitLoss: "0.00",
          selectedMrId: "",
          selectedMrName: "",
        },
      ];
      const totalAmount = calculateTotalAmount(newProducts);
      const totalNetAmount = calculateTotalNetAmount(newProducts);
      const dueAmount = (
        parseFloat(totalNetAmount) - parseFloat(prev.paidAmount || 0)
      ).toFixed(2);
      const paymentStatus = autoSetPaymentStatus({
        ...prev,
        totalAmount,
        dueAmount,
        products: newProducts,
      });
      return {
        ...prev,
        products: newProducts,
        totalAmount,
        dueAmount,
        paymentStatus,
      };
    });
    setExpandedProductIndex(form.products.length);
    setMrProductStock(prev => [...prev, null]);
    setMrAvailableProducts(prev => [...prev, []]);
  }, [form.products.length, calculateTotalAmount, calculateTotalNetAmount, autoSetPaymentStatus]);

  const removeProduct = useCallback(
    (index) => {
      if (form.products.length > 1) {
        setForm((prev) => {
          const newProducts = prev.products.filter((_, i) => i !== index);
          const totalAmount = calculateTotalAmount(newProducts);
          const totalNetAmount = calculateTotalNetAmount(newProducts);
          const dueAmount = (
            parseFloat(totalNetAmount) - parseFloat(prev.paidAmount || 0)
          ).toFixed(2);
          const paymentStatus = autoSetPaymentStatus({
            ...prev,
            totalAmount,
            dueAmount,
            products: newProducts,
          });
          return {
            ...prev,
            products: newProducts,
            totalAmount,
            dueAmount,
            paymentStatus,
          };
        });
        setMrProductStock(prev => prev.filter((_, i) => i !== index));
        setMrAvailableProducts(prev => prev.filter((_, i) => i !== index));
        setExpandedProductIndex((prevIndex) => {
          if (prevIndex === index) return 0;
          if (prevIndex > index) return prevIndex - 1;
          return prevIndex;
        });
      }
    },
    [form.products, calculateTotalAmount, calculateTotalNetAmount, autoSetPaymentStatus]
  );

  const calculateProductFields = useCallback((product) => {
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const sellingPrice = parseFloat(product.sellingPrice) || 0;
    const discount = parseFloat(product.discount) || 0;
    const lc = parseFloat(product.lc) || 0;

    const totalQty = salesQty + bonusQty;
    const amount = (sellingPrice * salesQty).toFixed(2);
    const netSellingAmount = (parseFloat(amount) - discount).toFixed(2);
    const averageUnitPrice =
      totalQty > 0
        ? (parseFloat(netSellingAmount) / totalQty).toFixed(2)
        : "0.00";
    const profitLoss = (parseFloat(netSellingAmount) - lc * totalQty).toFixed(2);

    return {
      ...product,
      totalQty: totalQty.toString(),
      amount,
      netSellingAmount,
      averageUnitPrice,
      profitLoss,
    };
  }, []);

  const updateProduct = useCallback(
    (index, field, value) => {
      setForm((prev) => {
        const updatedProducts = [...prev.products];
        updatedProducts[index] = { ...updatedProducts[index], [field]: value };
        const recalculatedProducts = updatedProducts.map((product) =>
          calculateProductFields(product)
        );
        const totalAmount = calculateTotalAmount(recalculatedProducts);
        const totalNetAmount = calculateTotalNetAmount(recalculatedProducts);
        const dueAmount = (
          parseFloat(totalNetAmount) - parseFloat(prev.paidAmount || 0)
        ).toFixed(2);
        const paymentStatus = autoSetPaymentStatus({
          ...prev,
          totalAmount,
          dueAmount,
          products: recalculatedProducts,
        });
        return {
          ...prev,
          products: recalculatedProducts,
          totalAmount,
          dueAmount,
          paymentStatus,
        };
      });
    },
    [calculateTotalAmount, calculateTotalNetAmount, calculateProductFields, autoSetPaymentStatus]
  );

  // --- STOCK VALIDATION (Normal Sale) ---
  const validateTotalQuantity = useCallback((product, index, productsData) => {
    if (!product.productName) return null;
    const productData = productsData.find(
      (p) => p.productName === product.productName
    );
    if (!productData) return null;
    const availableStock = calculateAvailableStock(productData);
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const totalQty = salesQty + bonusQty;
    if (totalQty > availableStock) {
      return `Total quantity (Sales + Bonus = ${totalQty}) cannot exceed available stock (${availableStock} boxes)`;
    }
    return null;
  }, []);

  const hasStockIssue = useCallback((product, productsData) => {
    if (!product.productName) return false;
    const productData = productsData.find(
      (p) => p.productName === product.productName
    );
    if (!productData) return false;
    const availableStock = calculateAvailableStock(productData);
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const totalQty = salesQty + bonusQty;
    return totalQty > availableStock;
  }, []);

  const calculateRemainingStock = useCallback((product, productsData) => {
    if (!product.productName) return null;
    const productData = productsData.find(
      (p) => p.productName === product.productName
    );
    if (!productData) return null;
    const availableStock = calculateAvailableStock(productData);
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const totalQty = salesQty + bonusQty;
    return availableStock - totalQty;
  }, []);

  // --- MR SALE: Stock validation using MR-specific stock ---
  const validateMRTotalQuantity = useCallback((product, index, mrStock) => {
    if (!product.productName || !product.selectedMrId) return null;
    const stockData = mrStock[index];
    if (!stockData) return "Stock information not loaded";
    const availableStock = calculateMRStock(stockData);
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const totalQty = salesQty + bonusQty;
    if (totalQty > availableStock) {
      return `Total quantity (Sales + Bonus = ${totalQty}) exceeds MR's available stock (${availableStock} boxes)`;
    }
    return null;
  }, []);

  const validateProductField = useCallback(
    (index, field, value, productsData, saleType, mrStock) => {
      const product = { ...form.products[index], [field]: value };
      const newErrors = { ...errors };
      delete newErrors[`${field}_${index}`];

      if (field === "productName" && !value.trim()) {
        newErrors[`productName_${index}`] = `Product Name for item ${index + 1} is required`;
      }

      if (field === "salesQty") {
        const salesQtyStr = value?.toString().trim();
        if (!salesQtyStr || salesQtyStr === "") {
          newErrors[`salesQty_${index}`] = `Sales Quantity for item ${index + 1} is required`;
        } else {
          const qty = Number(salesQtyStr);
          if (isNaN(qty) || qty <= 0) {
            newErrors[`salesQty_${index}`] = `Sales Quantity for item ${index + 1} must be greater than 0`;
          } else {
            if (form.products[index].productName) {
              let stockError = null;
              if (saleType === 'mr') {
                stockError = validateMRTotalQuantity(
                  { ...form.products[index], salesQty: value },
                  index,
                  mrStock
                );
              } else {
                stockError = validateTotalQuantity(
                  { ...form.products[index], salesQty: value },
                  index,
                  productsData
                );
              }
              if (stockError) {
                newErrors[`salesQty_${index}`] = stockError;
              }
            }
          }
        }
      }

      if (field === "sellingPrice") {
        const sellingPriceStr = value?.toString().trim();
        if (!sellingPriceStr || sellingPriceStr === "") {
          newErrors[`sellingPrice_${index}`] = `Selling Price for item ${index + 1} is required`;
        } else {
          const price = Number(sellingPriceStr);
          if (isNaN(price) || price <= 0) {
            newErrors[`sellingPrice_${index}`] = `Selling Price for item ${index + 1} must be greater than 0`;
          }
        }
      }

      if (saleType === 'mr' && field === 'selectedMrId' && !value) {
        newErrors[`selectedMrId_${index}`] = `Medical Representative for item ${index + 1} is required`;
      }

      setErrors(newErrors);
    },
    [form.products, errors, validateTotalQuantity, validateMRTotalQuantity]
  );

  const validate = useCallback(
    (productsData = [], saleType, mrStock = []) => {
      const newErrors = {};

      if (!form.recordingDate?.trim()) {
        newErrors.recordingDate = "Recording Date is required";
      }
      if (!form.invoiceNumber?.trim()) {
        newErrors.invoiceNumber = "Invoice Number is required";
      }
      if (!form.invoiceDate?.trim()) {
        newErrors.invoiceDate = "Invoice Date is required";
      }
      if (saleType !== 'mr' && !form.mrName?.trim()) {
        newErrors.mrName = "Medical Representative is required";
      }
      if (!form.customerCode?.trim()) {
        newErrors.customerCode = "Customer is required";
      }
      if (!form.paymentStatus?.trim()) {
        newErrors.paymentStatus = "Payment Status is required";
      }

      form.products.forEach((product, index) => {
        if (product.productName.trim()) {
          if (!product.productName.trim()) {
            newErrors[`productName_${index}`] = `Product Name for item ${index + 1} is required`;
          }
          if (saleType === 'mr' && !product.selectedMrId) {
            newErrors[`selectedMrId_${index}`] = `Medical Representative for item ${index + 1} is required`;
          }

          const salesQtyStr = product.salesQty?.toString().trim();
          if (!salesQtyStr || salesQtyStr === "") {
            newErrors[`salesQty_${index}`] = `Sales Quantity for item ${index + 1} is required`;
          } else {
            const qty = Number(salesQtyStr);
            if (isNaN(qty) || qty <= 0) {
              newErrors[`salesQty_${index}`] = `Sales Quantity for item ${index + 1} must be greater than 0`;
            }
          }

          const sellingPriceStr = product.sellingPrice?.toString().trim();
          if (!sellingPriceStr || sellingPriceStr === "") {
            newErrors[`sellingPrice_${index}`] = `Selling Price for item ${index + 1} is required`;
          } else {
            const price = Number(sellingPriceStr);
            if (isNaN(price) || price <= 0) {
              newErrors[`sellingPrice_${index}`] = `Selling Price for item ${index + 1} must be greater than 0`;
            }
          }

          if (saleType === 'mr') {
            const stockError = validateMRTotalQuantity(product, index, mrStock);
            if (stockError) {
              newErrors[`salesQty_${index}`] = stockError;
            }
          } else {
            const stockError = validateTotalQuantity(product, index, productsData);
            if (stockError) {
              newErrors[`salesQty_${index}`] = stockError;
            }
          }
        }
      });

      const hasProducts = form.products.some(
        (product) => product.productName.trim() !== ""
      );
      if (!hasProducts) {
        newErrors.products = "At least one product is required";
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [form, validateTotalQuantity, validateMRTotalQuantity]
  );

  // --- Process products list for Normal Sale (global stock) ---
  const [products, setProducts] = useState([]);
  const [productNames, setProductNames] = useState([]);

  useEffect(() => {
    if (productsList?.length > 0) {
      try {
        const availableProducts = productsList
          .filter((product) => hasStock(product))
          .sort((a, b) => {
            try {
              const aExpiry = getNearestExpiryDate(a);
              const bExpiry = getNearestExpiryDate(b);
              const aDate = aExpiry ? new Date(aExpiry) : null;
              const bDate = bExpiry ? new Date(bExpiry) : null;
              if (aDate && !isNaN(aDate) && bDate && !isNaN(bDate)) {
                return aDate.getTime() - bDate.getTime();
              }
              if (aDate && !isNaN(aDate) && (!bDate || isNaN(bDate))) return -1;
              if (bDate && !isNaN(bDate) && (!aDate || isNaN(aDate))) return 1;
              return 0;
            } catch (error) {
              return 0;
            }
          });
        setProducts(availableProducts);
        setProductNames(availableProducts.map((product) => product.productName));
      } catch (error) {
        console.error("Error processing products list:", error);
        setProducts([]);
        setProductNames([]);
      }
    } else {
      setProducts([]);
      setProductNames([]);
    }
  }, [productsList]);

  return {
    form,
    errors,
    mrList,
    customerList,
    productsList,
    mrListLoading,
    customerListLoading,
    productsListLoading,
    handleChange,
    validate,
    validateProductField,
    hasStockIssue,
    calculateRemainingStock,
    updateFormField,
    handleMRChange,
    handleCustomerChange,
    fetchMRList: fetchMRListData,
    fetchCustomerList: fetchCustomerListData,
    fetchProductsList: fetchProductsListData,
    addProduct,
    removeProduct,
    updateProduct,
    toggleView,
    isProductExpanded,
    isProductFilled,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    setErrors,
    products,
    productNames,
    isPaidInFull,
    mrProductStock,
    setMrProductStock,
    mrAvailableProducts,
    setMrAvailableProducts,
  };
};

// ------------------------------------------------
// UI COMPONENTS (unchanged)
// ------------------------------------------------
const DatePickerField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    required = false,
    readOnly = false,
    disabled = false,
    placeholder = "Select a date",
    className = "",
    maxDate = null,
    minDate = null,
  }) => {
    const today = useMemo(() => new Date(), []);
    const handleDateChange = useCallback(
      (date) => {
        if (!disabled && date && !isNaN(date.getTime())) {
          const event = {
            target: {
              name: name,
              value: date.toISOString().split("T")[0],
            },
          };
          onChange(event);
        }
      },
      [name, onChange, disabled]
    );
    const selectedDate = useMemo(() => {
      if (!value) return null;
      try {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    }, [value]);
    return (
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <DatePicker
          selected={selectedDate}
          onChange={handleDateChange}
          dateFormat="yyyy-MM-dd"
          placeholderText={placeholder}
          readOnly={readOnly || disabled}
          disabled={disabled}
          maxDate={maxDate !== null ? maxDate : today}
          minDate={minDate}
          className={`w-full border rounded-md px-3 py-2 ${
            error ? "border-red-500" : "border-gray-300"
          } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""} ${
            readOnly ? "bg-gray-200" : ""
          } ${className}`}
          autoComplete="off"
        />
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

const SuggestionInput = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    onFocus,
    onBlur,
    error,
    suggestions,
    isOpen,
    highlightedIndex,
    inputRef,
    dropdownTop,
    onSuggestionSelect,
    getSuggestionValue = (item) => item,
    getSuggestionDisplay = (item) => item,
    setHighlightedIndex,
    handleKeyDown,
    required = false,
    disabled = false,
  }) => {
    const handleMouseEnter = useCallback(
      (index) => {
        if (!disabled) setHighlightedIndex(index);
      },
      [setHighlightedIndex, disabled]
    );
    const handleClick = useCallback(
      (item) => {
        if (!disabled) {
          const value = getSuggestionValue(item);
          onSuggestionSelect && onSuggestionSelect(value);
        }
      },
      [onSuggestionSelect, getSuggestionValue, disabled]
    );
    return (
      <div className="relative flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          ref={inputRef}
          type="text"
          name={name}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={disabled}
          className={`border rounded-md px-3 py-2 ${
            error ? "border-red-500" : "border-gray-300"
          } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
          placeholder="Type to search..."
          autoComplete="off"
        />
        {isOpen && suggestions.length > 0 && !disabled && (
          <ul
            className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
            style={{ top: dropdownTop }}
          >
            {suggestions.map((item, idx) => (
              <li
                key={typeof item === "object" ? item._id ?? idx : idx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleClick(item)}
                onMouseEnter={() => handleMouseEnter(idx)}
                className={`cursor-pointer px-3 py-2 ${
                  highlightedIndex === idx
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-900 hover:bg-gray-100"
                }`}
              >
                {getSuggestionDisplay(item)}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

// ------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------
const AddSale = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerCode } = location.state || {};
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const [saleType, setSaleType] = useState('normal');

  const {
    form,
    errors,
    mrList,
    customerList,
    productsList,
    mrListLoading,
    customerListLoading,
    productsListLoading,
    handleChange,
    validate,
    validateProductField,
    hasStockIssue,
    calculateRemainingStock,
    updateFormField,
    handleMRChange,
    handleCustomerChange,
    fetchMRList,
    fetchCustomerList,
    fetchProductsList,
    addProduct,
    removeProduct,
    updateProduct,
    toggleView,
    isProductExpanded,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    products,
    productNames,
    isPaidInFull,
    mrProductStock,
    setMrProductStock,
    mrAvailableProducts,
    setMrAvailableProducts,
  } = useSaleForm(customerCode, saleType);

  const { statuses, loading: initialLoading } = useInitialSaleData();

  // ----- 🔥 NEW: MR Stock List (MRs with stock) -----
  const [mrStockList, setMrStockList] = useState([]);
  const [mrStockListLoading, setMrStockListLoading] = useState(false);

  useEffect(() => {
    const fetchMRStockList = async () => {
      setMrStockListLoading(true);
      try {
        const response = await axios.get(`${backendUrl}/api/sales/mr-stock/mrs-with-stock`);
        if (response.data.success) {
          setMrStockList(response.data.data || []);
          console.log("✅ Fetched MRs with stock:", response.data.data);
        }
      } catch (error) {
        console.error("❌ Error fetching MR stock list:", error);
        showToast("error", "Could not load MR list for MR Sale");
      } finally {
        setMrStockListLoading(false);
      }
    };
    fetchMRStockList();
  }, [backendUrl]);

  const [showUploadMessage, setShowUploadMessage] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isFormDisabled, setIsFormDisabled] = useState(false);

  useEffect(() => {
    fetchMRList();
    fetchCustomerList();
    fetchProductsList();
  }, [fetchMRList, fetchCustomerList, fetchProductsList]);

  const loading =
    initialLoading ||
    mrListLoading ||
    customerListLoading ||
    productsListLoading ||
    mrStockListLoading;

  // --- Normal Sale: MR options for header (unchanged) ---
  const mrOptions = useMemo(() => {
    if (mrList.length === 0 && !mrListLoading) {
      return [
        {
          value: "",
          label: "No Medical Representatives Available",
          disabled: true,
        },
      ];
    }
    return [
      { value: "", label: "Select Medical Representative" },
      ...mrList.map((mr) => ({
        value: mr._id,
        label: `${mr.medicalRepName}`,
      })),
    ];
  }, [mrList, mrListLoading]);

  // --- Customer dropdown (unchanged) ---
  const customerOptions = useMemo(() => {
    if (customerList.length === 0 && !customerListLoading) {
      return [
        {
          value: "",
          label: "No Customers Available",
          disabled: true,
        },
      ];
    }
    return [
      { value: "", label: "Select Customer" },
      ...customerList.map((customer) => ({
        value: customer._id,
        label: `${customer.customerCode} - ${customer.name}`,
      })),
    ];
  }, [customerList, customerListLoading]);

  // --- Payment status suggestions (unchanged) ---
  const paymentStatusSuggestions = useSuggestions(
    statuses,
    "type",
    form.paymentStatus
  );

  // --- Product suggestions (unchanged) ---
  const productSuggestions = useProductSuggestions(form.products, productNames);

  // --- MR‑specific stock fetch (unchanged) ---
  const fetchMRProductStock = useCallback(async (mrId, productName, index) => {
    if (!mrId || !productName) return null;
    try {
      const response = await axios.get(`${backendUrl}/api/sales/mr-stock/${mrId}/${encodeURIComponent(productName)}`);
      if (response.data.success) {
        const stockData = response.data.stock;
        setMrProductStock(prev => {
          const newStock = [...prev];
          newStock[index] = stockData;
          return newStock;
        });
        return stockData;
      }
    } catch (error) {
      console.error("Failed to fetch MR product stock:", error);
      showToast("error", `Could not load stock for ${productName}`);
    }
    return null;
  }, [backendUrl, setMrProductStock]);

  // --- Fetch list of products that the MR has stock for (unchanged) ---
  const fetchMRAvailableProducts = useCallback(async (mrId, index) => {
    if (!mrId) return;
    try {
      const response = await axios.get(`${backendUrl}/api/sales/mr-stock/products/${mrId}`);
      if (response.data.success) {
        setMrAvailableProducts(prev => {
          const newList = [...prev];
          newList[index] = response.data.products;
          return newList;
        });
      }
    } catch (error) {
      console.error("Failed to fetch MR product list:", error);
      showToast("error", "Could not load product list for this MR");
    }
  }, [backendUrl, setMrAvailableProducts]);

  // --- Normal Sale expiry info (unchanged) ---
  const getProductExpiryInfo = (productName) => {
    const productData = products.find((p) => p.productName === productName);
    if (!productData?.batches) return null;
    const validBatches = productData.batches
      .filter((batch) => batch.boxes > 0 && batch.expiryDate)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    if (validBatches.length === 0) return null;
    const nearestBatch = validBatches[0];
    const today = new Date();
    const expiryDate = new Date(nearestBatch.expiryDate);
    const daysUntilExpiry = Math.ceil(
      (expiryDate - today) / (1000 * 60 * 60 * 24)
    );
    return {
      nearestExpiry: nearestBatch.expiryDate,
      daysUntilExpiry,
      isNearExpiry: daysUntilExpiry <= 30,
      batchCount: validBatches.length,
    };
  };

  // --- MR Sale expiry info (unchanged) ---
  const getMRProductExpiryInfo = (mrStockData) => {
    if (!mrStockData?.batches) return null;
    const valid = mrStockData.batches.filter(b => b.boxes > 0 && b.expiryDate);
    if (!valid.length) return null;
    const sorted = [...valid].sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    const nearest = sorted[0];
    const days = Math.ceil((new Date(nearest.expiryDate) - new Date()) / (1000*60*60*24));
    return {
      nearestExpiry: nearest.expiryDate,
      daysUntilExpiry: days,
      isNearExpiry: days <= 30,
      batchCount: valid.length,
    };
  };

  // --- Check required master data (unchanged) ---
  const checkRequiredData = useCallback(() => {
    const missingFields = [];
    if (productsList.length === 0 && !productsListLoading) {
      missingFields.push("products");
    }
    if (mrList.length === 0 && !mrListLoading) {
      missingFields.push("medical representatives");
    }
    if (customerList.length === 0 && !customerListLoading) {
      missingFields.push("customers");
    }
    if (missingFields.length > 0) {
      setUploadMessage(`Please upload ${missingFields.join(", ")} first`);
      setShowUploadMessage(true);
      setIsFormDisabled(true);
      return false;
    }
    if (saleType !== 'mr' && productNames.length === 0 && productsList.length > 0) {
      setUploadMessage("All products are currently out of stock. Please add stock to products first.");
      setShowUploadMessage(true);
      setIsFormDisabled(true);
      return false;
    }
    setShowUploadMessage(false);
    setIsFormDisabled(false);
    return true;
  }, [productsList.length, productsListLoading, productNames.length, mrList.length, mrListLoading, customerList.length, customerListLoading, saleType]);

  useEffect(() => {
    checkRequiredData();
  }, [checkRequiredData]);

  // --- Get product details (unchanged) ---
  const getProductDetails = (productName) => {
    const product = products.find((p) => p.productName === productName);
    if (!product) {
      return { lc: "", fob: "", cif: "", sellingPrice: "" };
    }
    let lc = product.lc || 0;
    let fob = product.fob || 0;
    let cif = product.cif || 0;
    let sellingPrice = product.sellingPrice || "";
    if (product.batches && product.batches.length > 0) {
      const firstBatch = product.batches[0];
      lc = firstBatch.lc || lc;
      fob = firstBatch.fob || fob;
      cif = firstBatch.cif || cif;
    }
    return {
      lc: lc.toString(),
      fob: fob.toString(),
      cif: cif.toString(),
      sellingPrice: sellingPrice.toString(),
    };
  };

  // --- Enhanced change handler for form fields (unchanged) ---
  const enhancedHandleChange = useCallback(
    (e) => {
      if (isFormDisabled) return;
      const { name, value } = e.target;
      if (name === "paymentStatus") {
        updateFormField("paymentStatus", value);
        paymentStatusSuggestions.setIsOpen(true);
        paymentStatusSuggestions.setHighlightedIndex(0);
      } else {
        handleChange(e);
      }
      if (name === "paidAmount") {
        setTimeout(() => {
          const totalAmount = parseFloat(form.totalAmount) || 0;
          const paidAmount = parseFloat(value) || 0;
          const dueAmount = totalAmount - paidAmount;
          if (totalAmount > 0) {
            let newPaymentStatus = "Credit";
            if (paidAmount === totalAmount) {
              newPaymentStatus = "Cash";
            } else if (dueAmount === totalAmount || paidAmount === 0) {
              newPaymentStatus = "Credit";
            } else if (paidAmount > 0 && paidAmount < totalAmount) {
              newPaymentStatus = "Partial Paid";
            }
            if (newPaymentStatus !== form.paymentStatus) {
              updateFormField("paymentStatus", newPaymentStatus);
            }
          }
        }, 100);
      }
    },
    [handleChange, paymentStatusSuggestions, updateFormField, form.totalAmount, form.paymentStatus, isFormDisabled]
  );

  // --- Filter product names per row (unchanged) ---
  const getProductNamesForRow = useCallback((index) => {
    if (saleType === 'mr') {
      const available = mrAvailableProducts[index];
      if (available && available.length > 0) {
        return available;
      }
      return [];
    }
    return productNames;
  }, [saleType, mrAvailableProducts, productNames]);

  // --- 🔥 ENHANCED: product change handler using mrStockList for MR Sale ---
  const enhancedProductChange = useCallback(
    (index, field, value) => {
      if (isFormDisabled) return;

      updateProduct(index, field, value);

      if (field === "productName") {
        const productDetails = getProductDetails(value);
        updateProduct(index, "lc", productDetails.lc);
        updateProduct(index, "fob", productDetails.fob);
        updateProduct(index, "cif", productDetails.cif);
        if (productDetails.sellingPrice) {
          updateProduct(index, "sellingPrice", productDetails.sellingPrice);
        }
        if (saleType === 'mr') {
          const mrId = form.products[index]?.selectedMrId;
          if (mrId) {
            fetchMRProductStock(mrId, value, index);
          }
        }
        productSuggestions.setIsOpen(index, true);
        productSuggestions.setDropdownTop(index);
        productSuggestions.setHighlightedIndex(index, 0);
      }

      // 🔥 MR Sale: when MR is selected, use mrStockList (not mrList)
      if (saleType === 'mr' && field === 'selectedMrId') {
        const selectedMr = mrStockList.find(mr => mr._id === value);
        if (selectedMr) {
          updateProduct(index, 'selectedMrName', selectedMr.mrName);
        }
        fetchMRAvailableProducts(value, index);
        if (form.products[index].productName) {
          updateProduct(index, 'productName', '');
          setMrProductStock(prev => {
            const newStock = [...prev];
            newStock[index] = null;
            return newStock;
          });
        }
        validateProductField(index, field, value, products, saleType, mrProductStock);
      }

      if (["salesQty", "bonusQty", "sellingPrice", "productName"].includes(field)) {
        setTimeout(() => {
          validateProductField(index, field, value, products, saleType, mrProductStock);
        }, 10);
      }
    },
    [
      updateProduct,
      productSuggestions,
      validateProductField,
      products,
      saleType,
      mrStockList,          // 🔥 NOW uses mrStockList
      fetchMRProductStock,
      fetchMRAvailableProducts,
      mrProductStock,
      isFormDisabled,
      form.products,
      setMrProductStock,
    ]
  );

  // --- Keyboard / focus handlers (unchanged) ---
  const handlePaymentStatusKeyDown = useCallback(
    (e) => {
      if (isFormDisabled) return;
      paymentStatusSuggestions.handleKeyDown(e, (value) => {
        updateFormField("paymentStatus", value);
      });
    },
    [paymentStatusSuggestions, updateFormField, isFormDisabled]
  );

  const handleProductNameKeyDown = useCallback(
    (index, e) => {
      if (isFormDisabled) return;
      productSuggestions.handleKeyDown(index, e, (value) => {
        enhancedProductChange(index, "productName", value);
      });
    },
    [productSuggestions, enhancedProductChange, isFormDisabled]
  );

  const handlePaymentStatusFocus = useCallback(() => {
    if (isFormDisabled) return;
    paymentStatusSuggestions.setIsOpen(true);
    paymentStatusSuggestions.setHighlightedIndex(0);
  }, [paymentStatusSuggestions, isFormDisabled]);

  const handleProductNameFocus = useCallback(
    (index) => {
      if (isFormDisabled) return;
      productSuggestions.setIsOpen(index, true);
      productSuggestions.setDropdownTop(index);
      productSuggestions.setHighlightedIndex(index, 0);
    },
    [productSuggestions, isFormDisabled]
  );

  const handleProductRowHighlight = useCallback(
    (productIndex, suggestionIndex) => {
      if (isFormDisabled) return;
      productSuggestions.setHighlightedIndex(productIndex, suggestionIndex);
    },
    [productSuggestions, isFormDisabled]
  );

  // --- "Add Product" validation (unchanged) ---
  const isCurrentProductValid = useCallback(() => {
    if (isFormDisabled) return false;
    const currentProduct = form.products[form.products.length - 1];
    const salesQty = currentProduct.salesQty?.toString().trim();
    const sellingPrice = currentProduct.sellingPrice?.toString().trim();

    const basicValidation =
      currentProduct.productName.trim() !== "" &&
      salesQty &&
      salesQty !== "" &&
      !isNaN(Number(salesQty)) &&
      Number(salesQty) > 0 &&
      sellingPrice &&
      sellingPrice !== "" &&
      !isNaN(Number(sellingPrice)) &&
      Number(sellingPrice) > 0;

    if (!basicValidation) return false;

    if (saleType === 'mr' && !currentProduct.selectedMrId) {
      return false;
    }

    if (saleType === 'mr') {
      const stockData = mrProductStock[form.products.length - 1];
      if (!stockData) return false;
      const available = calculateMRStock(stockData);
      const total = (parseInt(currentProduct.salesQty)||0) + (parseInt(currentProduct.bonusQty)||0);
      if (total > available) return false;
    } else {
      const hasStockProblem = hasStockIssue(currentProduct, products);
      if (hasStockProblem) return false;
    }

    return true;
  }, [form.products, products, hasStockIssue, isFormDisabled, saleType, mrProductStock]);

  const isAddSaleEnabled = useMemo(() => {
    return (
      areCommonFieldsFilled({ ...form, saleType }) &&
      hasAtLeastOneProduct(form.products) &&
      !isFormDisabled
    );
  }, [form, areCommonFieldsFilled, hasAtLeastOneProduct, isFormDisabled, saleType]);

  const handleNumericInputChange = useCallback(
    (e, updateFunc) => {
      if (isFormDisabled) return;
      const value = e.target.value;
      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
        updateFunc(e);
      }
    },
    [isFormDisabled]
  );

  const handleAlphanumericInputChange = useCallback(
    (e, updateFunc) => {
      if (isFormDisabled) return;
      const value = e.target.value;
      if (value === "" || /^[a-zA-Z0-9\-\/\s]*$/.test(value)) {
        updateFunc(e);
      }
    },
    [isFormDisabled]
  );

  // --- SUBMIT (unchanged) ---
// --- SUBMIT (FIXED) ---
const handleSubmit = async (e) => {
  e.preventDefault();

  if (!checkRequiredData()) return;

  if (!validate(products, saleType, mrProductStock)) {
    showToast("error", "Please fix the validation errors before submitting");
    return;
  }

  try {
    const validProducts = form.products.filter(
      (product) =>
        product.productName &&
        product.productName.trim() !== "" &&
        (Number(product.salesQty) > 0 || Number(product.bonusQty) > 0)
    );

    if (validProducts.length === 0) {
      showToast("error", "Please add at least one product with quantity");
      return;
    }

    const stockErrors = [];
    for (const product of validProducts) {
      if (saleType === 'mr') {
        const index = form.products.findIndex(p => p === product);
        const stockData = mrProductStock[index];
        if (!stockData) {
          stockErrors.push(`"${product.productName}": Stock information not loaded`);
          continue;
        }
        const availableStock = calculateMRStock(stockData);
        const totalQty = Number(product.salesQty) + Number(product.bonusQty || 0);
        if (totalQty > availableStock) {
          stockErrors.push(
            `"${product.productName}" for MR ${product.selectedMrName || 'unknown'}: Required ${totalQty}, Available ${availableStock}`
          );
        }
      } else {
        const productData = products.find(
          (p) => p.productName === product.productName
        );
        if (productData) {
          const availableStock = calculateAvailableStock(productData);
          const totalQty = Number(product.salesQty) + Number(product.bonusQty || 0);
          if (totalQty > availableStock) {
            stockErrors.push(
              `"${product.productName}": Required ${totalQty}, Available ${availableStock}`
            );
          }
        }
      }
    }

    if (stockErrors.length > 0) {
      showToast("error", "Stock insufficient: " + stockErrors.join("; "));
      return;
    }

    const safeFormatDate = (dateString) => {
      if (!dateString) return "";
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
    };

    // ✅ FIX: Create saleData with isMRSale flag
    const saleData = {
      // Add the isMRSale flag - this is the critical fix
      isMRSale: saleType === 'mr',
      
      recordingDate: safeFormatDate(form.recordingDate),
      invoiceNumber: form.invoiceNumber?.trim() || "",
      invoiceDate: safeFormatDate(form.invoiceDate),
      customerCode: form.customerCode || "",
      customerId: form.customerId || null,
      customerName: form.customerName || "",
      products: validProducts.map((product) => ({
        productName: product.productName.trim(),
        salesQty: Number(product.salesQty) || 0,
        bonusQty: Number(product.bonusQty) || 0,
        totalQty: Number(product.totalQty) || 0,
        sellingPrice: Number(product.sellingPrice) || 0,
        amount: Number(product.amount) || 0,
        discount: Number(product.discount) || 0,
        netSellingAmount: Number(product.netSellingAmount) || 0,
        averageUnitPrice: Number(product.averageUnitPrice) || 0,
        lc: Number(product.lc) || 0,
        fob: Number(product.fob) || 0,
        cif: Number(product.cif) || 0,
        profitLoss: Number(product.profitLoss) || 0,
        isProductAccept: true,
        remark: product.remark || "",
        ...(saleType === 'mr' && {
          mrId: product.selectedMrId,
          mrName: product.selectedMrName,
        }),
      })),
      creditDays: form.creditDays ? Number(form.creditDays) : null,
      dueDate: safeFormatDate(form.dueDate),
      deliveryDate: safeFormatDate(form.deliveryDate),
      paidAmount: Number(form.paidAmount) || 0,
      dueAmount: Number(form.dueAmount) || 0,
      totalAmount: Number(form.totalAmount) || 0,
      paymentStatus: form.paymentStatus || "Credit",
      remark: form.remark || "",
    };

    // Add header MR fields for normal sale
    if (saleType !== 'mr') {
      saleData.mrName = form.mrName || "";
      saleData.mrId = form.mrId || null;
    } else {
      // For MR sale, set primary MR from first product (for backward compatibility)
      if (validProducts.length > 0 && validProducts[0].selectedMrName) {
        saleData.mrName = validProducts[0].selectedMrName;
        saleData.mrId = validProducts[0].selectedMrId;
      }
      
      // ✅ FIX: Create MR distribution map for multi-MR invoices
      // This helps track which products belong to which MR
      const mrDistribution = {};
      validProducts.forEach((product) => {
        const mrName = product.selectedMrName || 'Unknown';
        const mrId = product.selectedMrId;
        
        if (!mrDistribution[mrName]) {
          mrDistribution[mrName] = {
            mrName,
            mrId,
            products: []
          };
        }
        
        mrDistribution[mrName].products.push({
          productName: product.productName,
          salesQty: Number(product.salesQty),
          bonusQty: Number(product.bonusQty),
          sellingPrice: Number(product.sellingPrice),
          discount: Number(product.discount),
        });
      });
      
      // Add the distribution to saleData
      saleData._mrDistribution = mrDistribution;
    }

    console.log("📤 Sending sale data:", {
      ...saleData,
      isMRSale: saleData.isMRSale, // This should now be true for MR sales
      products: saleData.products.map(p => ({
        productName: p.productName,
        mrId: p.mrId,
        mrName: p.mrName
      }))
    });

    const response = await fetch(`${backendUrl}/api/sales/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saleData),
    });

    const contentType = response.headers.get("content-type");
    if (!response.ok) {
      let errorMessage;
      if (contentType && contentType.includes("application/json")) {
        const respData = await response.json();
        errorMessage = respData.error || respData.message || `HTTP error! status: ${response.status}`;
      } else {
        const text = await response.text();
        errorMessage = `Server returned ${response.status}: ${text.substring(0, 100)}...`;
      }
      throw new Error(errorMessage);
    }

    const respData = await response.json();
    showToast("success", respData.message || "Sale created successfully!");
    navigate("/salelayout/sale");
  } catch (err) {
    console.error("❌ Error submitting sale:", err);
    showToast("error", err.message || "Failed to submit sale");
  }
};

  const paidInFull = isPaidInFull();

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
        <div className="flex justify-center items-center h-32">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // --- RENDER ---
  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      {/* TABS */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          type="button"
          onClick={() => setSaleType('normal')}
          className={`py-2 px-4 font-medium text-sm focus:outline-none ${
            saleType === 'normal'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Normal Sale
        </button>
        <button
          type="button"
          onClick={() => setSaleType('mr')}
          className={`py-2 px-4 font-medium text-sm focus:outline-none ${
            saleType === 'mr'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          MR Sale
        </button>
      </div>

      {/* UPLOAD WARNING (unchanged) */}
      {showUploadMessage && (
        <div className={`mb-6 p-4 rounded-lg ${
          uploadMessage.includes("out of stock") 
            ? "bg-yellow-50 border border-yellow-200" 
            : "bg-red-50 border border-red-200"
        }`}>
          {/* ... (unchanged) ... */}
        </div>
      )}

      {/* HEADER: Add Product button */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          {saleType === 'normal' ? 'Add New Sale (Normal)' : 'Add New Sale (MR)'}
        </h2>
        <button
          type="button"
          disabled={!isCurrentProductValid() || isFormDisabled}
          onClick={addProduct}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            isCurrentProductValid() && !isFormDisabled
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
          }`}
        >
          <PlusSquare className="w-5 h-5" />
          Add Product
        </button>
      </div>

      {/* PRODUCT ROWS */}
      <div className="mb-6">
        {form.products.map((product, index) => {
          let availableStock = 0;
          let remainingStock = null;
          let hasStockProblem = false;
          let expiryInfo = null;

          if (saleType === 'mr') {
            const stockData = mrProductStock[index];
            if (stockData) {
              availableStock = calculateMRStock(stockData);
              const totalQty = (parseInt(product.salesQty)||0) + (parseInt(product.bonusQty)||0);
              remainingStock = availableStock - totalQty;
              hasStockProblem = totalQty > availableStock;
              expiryInfo = getMRProductExpiryInfo(stockData);
            }
          } else {
            const productData = products.find(p => p.productName === product.productName);
            if (productData) {
              availableStock = calculateAvailableStock(productData);
              const totalQty = (parseInt(product.salesQty)||0) + (parseInt(product.bonusQty)||0);
              remainingStock = availableStock - totalQty;
              hasStockProblem = totalQty > availableStock;
              expiryInfo = getProductExpiryInfo(product.productName);
            }
          }

          return (
            <div key={index} className="border p-4 mb-4 rounded shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <h3 className="text-lg font-semibold">
                    {product.productName || `Product ${index + 1}`}
                  </h3>
                  {product.productName && (
                    <>
                      {availableStock > 0 && (
                        <>
                          <span
                            className={`text-sm px-3 py-2 rounded ${
                              remainingStock < 0
                                ? "bg-red-100 text-red-800 border border-red-300"
                                : remainingStock <= 10
                                ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                                : "bg-green-100 text-green-800 border border-green-300"
                            }`}
                          >
                            Remaining: {remainingStock ?? 'N/A'} boxes
                          </span>
                          <span className="text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded border border-blue-300">
                            Available: {availableStock} boxes
                          </span>
                        </>
                      )}
                      {expiryInfo && (
                        <span
                          className={`text-sm px-2 py-1 rounded border ${
                            expiryInfo.isNearExpiry
                              ? "bg-red-100 text-red-800 border-red-300"
                              : "bg-green-100 text-green-800 border-green-300"
                          }`}
                          title={`Nearest expiry: ${new Date(
                            expiryInfo.nearestExpiry
                          ).toLocaleDateString()} (${
                            expiryInfo.daysUntilExpiry
                          } days)`}
                        >
                          {expiryInfo.isNearExpiry ? "⚠️ " : ""}
                          Expires: {expiryInfo.daysUntilExpiry} days
                          {expiryInfo.batchCount > 1 &&
                            ` (${expiryInfo.batchCount} batches)`}
                        </span>
                      )}
                      {hasStockProblem && (
                        <span className="text-red-600 text-sm font-medium">
                          ⚠️ Total quantity exceeds available stock
                        </span>
                      )}
                      {/* MR badge */}
                      {saleType === 'mr' && product.selectedMrName && (
                        <span className="text-sm px-2 py-1 bg-purple-100 text-purple-800 rounded border border-purple-300">
                          MR: {product.selectedMrName}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleView(index)}
                  disabled={isFormDisabled}
                  className={`font-medium ${
                    isFormDisabled
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-blue-600 hover:text-blue-800"
                  }`}
                >
                  {isProductExpanded(index) ? "Hide" : "View"}
                </button>
              </div>

              {/* EXPANDED PRODUCT DETAILS */}
              {isProductExpanded(index) && (
                <div className="border rounded-lg p-4 mt-2">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">
                      Product Details
                    </h3>
                    {form.products.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeProduct(index)}
                        disabled={isFormDisabled}
                        className={`${
                          isFormDisabled
                            ? "text-gray-400 cursor-not-allowed"
                            : "text-red-600 hover:text-red-800"
                        }`}
                      >
                        <MinusSquare className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 🔥 MR Sale: per‑product MR dropdown – now uses mrStockList */}
                    {saleType === 'mr' && (
                      <div className="relative flex flex-col">
                        <SearchableDropdown
                          value={product.selectedMrId || ''}
                          onChange={(mrId) => enhancedProductChange(index, 'selectedMrId', mrId)}
                          options={[
                            { value: "", label: "Select Medical Representative" },
                            ...mrStockList.map((mr) => ({
                              value: mr._id,
                              label: `${mr.mrName} (${mr.totalProducts || 0} products, ${mr.totalQuantity || 0} boxes)`,
                            })),
                          ]}
                          placeholder="Select Medical Representative"
                          required={true}
                          loading={mrStockListLoading}
                          error={errors[`selectedMrId_${index}`]}
                          label="Medical Representative"
                          disabled={isFormDisabled}
                        />
                        {errors[`selectedMrId_${index}`] && (
                          <p className="text-red-500 text-xs mt-0.5">
                            {errors[`selectedMrId_${index}`]}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Product Name (with suggestions) – filtered by MR's available products */}
                    <div className="relative flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        Product Name
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      <input
                        ref={productSuggestions.getInputRef(index)}
                        type="text"
                        value={product.productName}
                        onChange={(e) =>
                          enhancedProductChange(index, "productName", e.target.value)
                        }
                        onKeyDown={(e) => handleProductNameKeyDown(index, e)}
                        onFocus={() => handleProductNameFocus(index)}
                        onBlur={() =>
                          setTimeout(
                            () => productSuggestions.setIsOpen(index, false),
                            150
                          )
                        }
                        disabled={isFormDisabled || (saleType === 'mr' && !product.selectedMrId)}
                        className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
                          errors[`productName_${index}`]
                            ? "border-red-500"
                            : "border-gray-300"
                        } ${
                          isFormDisabled || (saleType === 'mr' && !product.selectedMrId) ? "bg-gray-100 cursor-not-allowed" : ""
                        }`}
                        placeholder={saleType === 'mr' && !product.selectedMrId 
                          ? "Select MR first" 
                          : "Type to search or click to see all options"}
                        autoComplete="off"
                      />
                      {productSuggestions.suggestionsList[index]?.isOpen &&
                        productSuggestions.filteredItems[index]?.length > 0 &&
                        !isFormDisabled && (
                          <ul
                            className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
                            style={{
                              top: productSuggestions.suggestionsList[index]
                                .dropdownTop,
                            }}
                          >
                            {productSuggestions.filteredItems[index].map(
                              (item, idx) => {
                                const allowedNames = getProductNamesForRow(index);
                                if (saleType === 'mr' && allowedNames.length > 0 && !allowedNames.includes(typeof item === 'string' ? item : item.name)) {
                                  return null;
                                }
                                return (
                                  <li
                                    key={
                                      typeof item === "object"
                                        ? item._id ?? idx
                                        : idx
                                    }
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() =>
                                      productSuggestions.selectSuggestion(
                                        index,
                                        typeof item === "string"
                                          ? item
                                          : item.name,
                                        (value) =>
                                          enhancedProductChange(
                                            index,
                                            "productName",
                                            value
                                          )
                                      )
                                    }
                                    onMouseEnter={() =>
                                      handleProductRowHighlight(index, idx)
                                    }
                                    className={`cursor-pointer px-3 py-2 ${
                                      productSuggestions.suggestionsList[index]
                                        .highlightedIndex === idx
                                        ? "bg-blue-600 text-white"
                                        : "bg-white text-gray-900 hover:bg-gray-100"
                                    }`}
                                  >
                                    {typeof item === "string" ? item : item.name}
                                  </li>
                                );
                              }
                            )}
                          </ul>
                        )}
                      {errors[`productName_${index}`] && (
                        <p className="text-red-500 text-xs mt-0.5">
                          {errors[`productName_${index}`]}
                        </p>
                      )}
                    </div>

                    {/* Other fields (unchanged) */}
                    <InputField
                      label="Sales Quantity"
                      name={`salesQty_${index}`}
                      type="text"
                      value={product.salesQty}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(index, "salesQty", e.target.value)
                        );
                      }}
                      error={errors[`salesQty_${index}`]}
                      required
                      disabled={isFormDisabled}
                    />
                    <InputField
                      label="Bonus Quantity"
                      name={`bonusQty_${index}`}
                      type="text"
                      value={product.bonusQty}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(index, "bonusQty", e.target.value)
                        );
                      }}
                      error={errors[`bonusQty_${index}`]}
                      disabled={isFormDisabled}
                    />
                    <InputField
                      label="Selling Price"
                      name={`sellingPrice_${index}`}
                      type="text"
                      value={product.sellingPrice}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(index, "sellingPrice", e.target.value)
                        );
                      }}
                      error={errors[`sellingPrice_${index}`]}
                      required
                      disabled={isFormDisabled}
                    />
                    <InputField
                      label="Discount"
                      name={`discount_${index}`}
                      type="text"
                      value={product.discount}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(index, "discount", e.target.value)
                        );
                      }}
                      error={errors[`discount_${index}`]}
                      disabled={isFormDisabled}
                    />
                    <InputField
                      label="LC"
                      name={`lc_${index}`}
                      value={product.lc}
                      readOnly
                      disabled={true}
                    />
                    <InputField
                      label="FOB (USD)"
                      name={`fob_${index}`}
                      value={product.fob}
                      readOnly
                      disabled={true}
                    />
                    <InputField
                      label="CIF (USD)"
                      name={`cif_${index}`}
                      value={product.cif}
                      readOnly
                      disabled={true}
                    />
                    <InputField
                      label="Total Quantity"
                      name={`totalQty_${index}`}
                      value={product.totalQty}
                      readOnly
                      disabled={true}
                    />
                    <InputField
                      label="Amount"
                      name={`amount_${index}`}
                      value={product.amount}
                      readOnly
                      disabled={true}
                    />
                    <InputField
                      label="Net Selling Amount"
                      name={`netSellingAmount_${index}`}
                      value={product.netSellingAmount}
                      readOnly
                      disabled={true}
                    />
                    <InputField
                      label="Average Unit Price"
                      name={`averageUnitPrice_${index}`}
                      value={product.averageUnitPrice}
                      readOnly
                      disabled={true}
                    />
                    <InputField
                      label="Profit / Loss"
                      name={`profitLoss_${index}`}
                      value={product.profitLoss}
                      readOnly
                      disabled={true}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FORM FOOTER (common fields) */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <DatePickerField
            label="Recording Date"
            name="recordingDate"
            value={form.recordingDate}
            onChange={enhancedHandleChange}
            error={errors.recordingDate}
            required
            placeholder="Select recording date"
            maxDate={new Date()}
            disabled={isFormDisabled}
          />
          <InputField
            label="Invoice Number"
            name="invoiceNumber"
            value={form.invoiceNumber}
            onChange={(e) =>
              handleAlphanumericInputChange(e, enhancedHandleChange)
            }
            error={errors.invoiceNumber}
            required
            placeholder="Enter invoice number"
            disabled={isFormDisabled}
          />
          <DatePickerField
            label="Invoice Date"
            name="invoiceDate"
            value={form.invoiceDate}
            onChange={enhancedHandleChange}
            error={errors.invoiceDate}
            required
            placeholder="Select invoice date"
            maxDate={new Date()}
            disabled={isFormDisabled}
          />

          {/* Normal Sale: header MR dropdown (unchanged) */}
          {saleType !== 'mr' && (
            <SearchableDropdown
              value={form.mrId}
              onChange={handleMRChange}
              options={mrOptions}
              placeholder="Select Medical Representative"
              required={true}
              loading={mrListLoading}
              error={errors.mrName}
              label="Medical Representative"
              disabled={isFormDisabled}
            />
          )}

          <SearchableDropdown
            value={form.customerId}
            onChange={handleCustomerChange}
            options={customerOptions}
            placeholder="Select Customer"
            required={true}
            loading={customerListLoading}
            error={errors.customerCode}
            label="Customer"
            disabled={isFormDisabled}
          />

          <DatePickerField
            label="Delivery Date"
            name="deliveryDate"
            value={form.deliveryDate}
            onChange={enhancedHandleChange}
            error={errors.deliveryDate}
            readOnly
            placeholder="Delivery date will be set automatically"
            disabled={isFormDisabled}
          />
        </div>

        {/* Payment section (unchanged) */}
        <div
          className={`grid grid-cols-1 ${
            paidInFull ? "sm:grid-cols-2" : "sm:grid-cols-3"
          } gap-4 mb-6`}
        >
          <InputField
            label="Total Amount"
            name="totalAmount"
            value={form.totalAmount}
            onChange={enhancedHandleChange}
            error={errors.totalAmount}
            readOnly
            disabled={true}
          />
          <InputField
            label="Paid Amount"
            name="paidAmount"
            type="text"
            value={form.paidAmount}
            onChange={(e) => handleNumericInputChange(e, enhancedHandleChange)}
            error={errors.paidAmount}
            disabled={isFormDisabled}
          />

          {!paidInFull && (
            <>
              <InputField
                label="Credit Days"
                name="creditDays"
                type="text"
                value={form.creditDays}
                onChange={(e) =>
                  handleNumericInputChange(e, enhancedHandleChange)
                }
                error={errors.creditDays}
                disabled={isFormDisabled}
              />
              <DatePickerField
                label="Due Date"
                name="dueDate"
                value={form.dueDate}
                onChange={enhancedHandleChange}
                error={errors.dueDate}
                readOnly
                placeholder="Due date will be calculated from current date + credit days"
                disabled={isFormDisabled}
              />
            </>
          )}

          <InputField
            label="Due Amount"
            name="dueAmount"
            value={form.dueAmount}
            onChange={enhancedHandleChange}
            error={errors.dueAmount}
            readOnly
            disabled={true}
          />

          <SuggestionInput
            label="Payment Status"
            name="paymentStatus"
            value={form.paymentStatus}
            onChange={enhancedHandleChange}
            error={errors.paymentStatus}
            suggestions={paymentStatusSuggestions.filteredItems}
            isOpen={paymentStatusSuggestions.isOpen}
            highlightedIndex={paymentStatusSuggestions.highlightedIndex}
            inputRef={paymentStatusSuggestions.inputRef}
            dropdownTop={paymentStatusSuggestions.dropdownTop}
            onFocus={handlePaymentStatusFocus}
            onBlur={() =>
              setTimeout(() => paymentStatusSuggestions.setIsOpen(false), 150)
            }
            onSuggestionSelect={(value) =>
              updateFormField("paymentStatus", value)
            }
            getSuggestionValue={(item) => item.type}
            getSuggestionDisplay={(item) => item.type}
            setHighlightedIndex={paymentStatusSuggestions.setHighlightedIndex}
            handleKeyDown={handlePaymentStatusKeyDown}
            required
            disabled={isFormDisabled}
          />

          <div className={`${paidInFull ? "sm:col-span-2" : "sm:col-span-3"}`}>
            <label className="text-sm font-medium text-gray-700 mb-1">
              Remark
            </label>
            <textarea
              name="remark"
              value={form.remark}
              onChange={enhancedHandleChange}
              rows={2}
              disabled={isFormDisabled}
              className={`border rounded-md px-3 py-2 w-full ${
                errors.remark ? "border-red-500" : "border-gray-300"
              } ${isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
              placeholder="Enter remarks"
            />
            {errors.remark && (
              <p className="text-red-500 text-xs mt-0.5">{errors.remark}</p>
            )}
          </div>
        </div>

        {errors.products && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded">
            <p className="text-red-700 text-sm">{errors.products}</p>
          </div>
        )}

        <div className="flex justify-end mt-6 gap-3">
          <button
            type="submit"
            disabled={!isAddSaleEnabled || isFormDisabled}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg shadow transition-colors ${
              isAddSaleEnabled && !isFormDisabled
                ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
            }`}
          >
            Add Sale
          </button>
          <button
            type="button"
            onClick={() => navigate("/salelayout/sale")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddSale;