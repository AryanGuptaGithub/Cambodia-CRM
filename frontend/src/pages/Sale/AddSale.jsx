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
} from "../../pages/ProductManager/common/fetchDropdown.jsx";

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
  profitLoss: "",
};

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  mrName: "",
  mrId: "",
  customerCode: "",
  customerId: "",
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

// Custom hook for suggestions
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

// Custom hook for product suggestions
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

// Custom hook for form state management
const useSaleForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    ...INITIAL_FORM_STATE,
    customerCode: initialCustomerCode,
  });
  const [errors, setErrors] = useState({});
  const [expandedProductIndex, setExpandedProductIndex] = useState(0);
  const [mrList, setMrList] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [customerListLoading, setCustomerListLoading] = useState(true);

  const parseNumber = useCallback((val) => {
    if (val === "" || val === null || val === undefined) return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }, []);

  // Calculate total amount from all products
  const calculateTotalAmount = useCallback((products) => {
    const total = products.reduce((sum, product) => {
      return sum + parseFloat(product.netSellingAmount || 0);
    }, 0);
    return total.toFixed(2);
  }, []);

  // Calculate total net amount from all products
  const calculateTotalNetAmount = useCallback((products) => {
    const total = products.reduce((sum, product) => {
      return sum + parseFloat(product.netSellingAmount || 0);
    }, 0);
    return total.toFixed(2);
  }, []);

  // Auto-set payment status based on paid amount and total amount
  const autoSetPaymentStatus = useCallback((currentForm) => {
    const totalAmount = parseFloat(currentForm.totalAmount) || 0;
    const paidAmount = parseFloat(currentForm.paidAmount) || 0;
    const dueAmount = parseFloat(currentForm.dueAmount) || 0;

    let paymentStatus = "Credit"; // Default to Credit

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
        // Remove due date calculation from invoice date
      }

      if (name === "creditDays") {
        const creditDays = parseInt(value, 10);
        if (!isNaN(creditDays) && creditDays > 0) {
          try {
            // Use current date instead of invoice date for due date calculation
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
        const newDueAmount = (parseFloat(totalNetAmount) - paidAmount).toFixed(
          2
        );

        updatedForm.dueAmount = newDueAmount;

        // Auto-set payment status when paid amount changes
        updatedForm.paymentStatus = autoSetPaymentStatus({
          ...updatedForm,
          paidAmount: value,
          dueAmount: newDueAmount,
          totalAmount: totalNetAmount,
        });
      }

      // Auto-set payment status when total amount changes (from product updates)
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
      }

      return updatedForm;
    },
    [parseNumber, calculateTotalNetAmount, autoSetPaymentStatus]
  );

  // Handle form field changes
  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setForm((prev) => {
        return calculateDerivedFields(name, value, prev);
      });
    },
    [calculateDerivedFields]
  );

  // Fetch MR list using imported function
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

  // Fetch Customer list using imported function
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

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Handle MR selection
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

  // Handle Customer selection
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
        }));
      }
      setErrors((prev) => ({ ...prev, customerCode: "" }));
    },
    [customerList]
  );

  // Toggle product view
  const toggleView = useCallback((index) => {
    setExpandedProductIndex((prevIndex) => (prevIndex === index ? -1 : index));
  }, []);

  // Check if a product is expanded
  const isProductExpanded = useCallback(
    (index) => {
      return expandedProductIndex === index;
    },
    [expandedProductIndex]
  );

  const isProductFilled = useCallback((product) => {
    return product.productName.trim() !== "";
  }, []);

  // Check if all required common fields are filled
  const areCommonFieldsFilled = useCallback((currentForm) => {
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerCode",
      "paymentStatus",
    ];

    return requiredFields.every(
      (field) =>
        currentForm[field] && currentForm[field].toString().trim() !== ""
    );
  }, []);

  // Check if at least one product is filled
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
        },
      ];

      const totalAmount = calculateTotalAmount(newProducts);
      const totalNetAmount = calculateTotalNetAmount(newProducts);
      const dueAmount = (
        parseFloat(totalNetAmount) - parseFloat(prev.paidAmount || 0)
      ).toFixed(2);

      // Recalculate payment status
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
  }, [
    form.products.length,
    calculateTotalAmount,
    calculateTotalNetAmount,
    autoSetPaymentStatus,
  ]);

  // Remove product
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

          // Recalculate payment status
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

        setExpandedProductIndex((prevIndex) => {
          if (prevIndex === index) {
            return 0;
          } else if (prevIndex > index) {
            return prevIndex - 1;
          }
          return prevIndex;
        });
      }
    },
    [
      form.products,
      calculateTotalAmount,
      calculateTotalNetAmount,
      autoSetPaymentStatus,
    ]
  );

  // Calculate derived fields for a single product
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
    const profitLoss = (parseFloat(netSellingAmount) - lc * totalQty).toFixed(
      2
    );

    return {
      ...product,
      totalQty: totalQty.toString(),
      amount,
      netSellingAmount,
      averageUnitPrice,
      profitLoss,
    };
  }, []);

  // Update product field
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

        // Recalculate payment status
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
    [
      calculateTotalAmount,
      calculateTotalNetAmount,
      calculateProductFields,
      autoSetPaymentStatus,
    ]
  );

  // Validate total quantity (sales + bonus) against available stock
  const validateTotalQuantity = useCallback((product, index, productsData) => {
    if (!product.productName) return null;

    const productData = productsData.find(
      (p) => p.productName === product.productName
    );
    if (!productData || !productData.inStock) return null;

    const availableStock = productData.inStock.boxes || 0;
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const totalQty = salesQty + bonusQty;

    if (totalQty > availableStock) {
      return `Total quantity (Sales + Bonus = ${totalQty}) cannot exceed available stock (${availableStock} boxes)`;
    }

    return null;
  }, []);

  // Check if product has stock issues
  const hasStockIssue = useCallback((product, productsData) => {
    if (!product.productName) return false;

    const productData = productsData.find(
      (p) => p.productName === product.productName
    );
    if (!productData || !productData.inStock) return false;

    const availableStock = productData.inStock.boxes || 0;
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const totalQty = salesQty + bonusQty;

    return totalQty > availableStock;
  }, []);

  // Calculate remaining stock for a product
  const calculateRemainingStock = useCallback((product, productsData) => {
    if (!product.productName) return null;

    const productData = productsData.find(
      (p) => p.productName === product.productName
    );
    if (!productData || !productData.inStock) return null;

    const availableStock = productData.inStock.boxes || 0;
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const totalQty = salesQty + bonusQty;

    return availableStock - totalQty;
  }, []);

  // Real-time validation for individual product fields
  const validateProductField = useCallback(
    (index, field, value, productsData) => {
      const product = { ...form.products[index], [field]: value };
      const newErrors = { ...errors };

      // Clear previous errors for this field
      delete newErrors[`${field}_${index}`];

      if (field === "productName" && !value.trim()) {
        newErrors[`productName_${index}`] = `Product Name for item ${
          index + 1
        } is required`;
      }

      if (field === "salesQty") {
        const salesQtyStr = value?.toString().trim();
        if (!salesQtyStr || salesQtyStr === "") {
          newErrors[`salesQty_${index}`] = `Sales Quantity for item ${
            index + 1
          } is required`;
        } else {
          const qty = Number(salesQtyStr);
          if (isNaN(qty) || qty <= 0) {
            newErrors[`salesQty_${index}`] = `Sales Quantity for item ${
              index + 1
            } must be greater than 0`;
          } else {
            // Stock validation only if product name exists
            if (form.products[index].productName) {
              const stockError = validateTotalQuantity(
                { ...form.products[index], salesQty: value },
                index,
                productsData
              );
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
          newErrors[`sellingPrice_${index}`] = `Selling Price for item ${
            index + 1
          } is required`;
        } else {
          const price = Number(sellingPriceStr);
          if (isNaN(price) || price <= 0) {
            newErrors[`sellingPrice_${index}`] = `Selling Price for item ${
              index + 1
            } must be greater than 0`;
          }
        }
      }

      setErrors(newErrors);
    },
    [form.products, errors, validateTotalQuantity]
  );

  const validate = useCallback(
    (productsData = []) => {
      const newErrors = {};

      // Validate common fields
      if (!form.recordingDate?.trim()) {
        newErrors.recordingDate = "Recording Date is required";
      }
      if (!form.invoiceNumber?.trim()) {
        newErrors.invoiceNumber = "Invoice Number is required";
      }
      if (!form.invoiceDate?.trim()) {
        newErrors.invoiceDate = "Invoice Date is required";
      }
      if (!form.mrName?.trim()) {
        newErrors.mrName = "Medical Representative is required";
      }
      if (!form.customerCode?.trim()) {
        newErrors.customerCode = "Customer is required";
      }
      if (!form.paymentStatus?.trim()) {
        newErrors.paymentStatus = "Payment Status is required";
      }

      // Validate products
      form.products.forEach((product, index) => {
        if (product.productName.trim()) {
          // Product Name validation
          if (!product.productName.trim()) {
            newErrors[`productName_${index}`] = `Product Name for item ${
              index + 1
            } is required`;
          }

          // Sales Quantity validation
          const salesQtyStr = product.salesQty?.toString().trim();
          if (!salesQtyStr || salesQtyStr === "") {
            newErrors[`salesQty_${index}`] = `Sales Quantity for item ${
              index + 1
            } is required`;
          } else {
            const qty = Number(salesQtyStr);
            if (isNaN(qty) || qty <= 0) {
              newErrors[`salesQty_${index}`] = `Sales Quantity for item ${
                index + 1
              } must be greater than 0`;
            }
          }

          // Selling Price validation
          const sellingPriceStr = product.sellingPrice?.toString().trim();
          if (!sellingPriceStr || sellingPriceStr === "") {
            newErrors[`sellingPrice_${index}`] = `Selling Price for item ${
              index + 1
            } is required`;
          } else {
            const price = Number(sellingPriceStr);
            if (isNaN(price) || price <= 0) {
              newErrors[`sellingPrice_${index}`] = `Selling Price for item ${
                index + 1
              } must be greater than 0`;
            }
          }

          // Stock validation
          const stockError = validateTotalQuantity(
            product,
            index,
            productsData
          );
          if (stockError) {
            newErrors[`salesQty_${index}`] = stockError;
          }
        }
      });

      // Check if at least one product is filled
      const hasProducts = form.products.some(
        (product) => product.productName.trim() !== ""
      );
      if (!hasProducts) {
        newErrors.products = "At least one product is required";
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [form, validateTotalQuantity]
  );

  return {
    form,
    errors,
    mrList,
    customerList,
    mrListLoading,
    customerListLoading,
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
    addProduct,
    removeProduct,
    updateProduct,
    toggleView,
    isProductExpanded,
    isProductFilled,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    setErrors,
  };
};

// DatePicker Field Component
const DatePickerField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    required = false,
    readOnly = false,
    placeholder = "Select a date",
    className = "",
    maxDate = null,
    minDate = null,
  }) => {
    const today = useMemo(() => new Date(), []);

    const handleDateChange = useCallback(
      (date) => {
        if (date && !isNaN(date.getTime())) {
          const event = {
            target: {
              name: name,
              value: date.toISOString().split("T")[0],
            },
          };
          onChange(event);
        } else {
          const event = {
            target: {
              name: name,
              value: "",
            },
          };
          onChange(event);
        }
      },
      [name, onChange]
    );

    // Safely parse the date value
    const selectedDate = useMemo(() => {
      if (!value) return null;
      try {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      } catch (error) {
        console.error("Invalid date value:", value, error);
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
          readOnly={readOnly}
          maxDate={maxDate !== null ? maxDate : today}
          minDate={minDate}
          className={`w-full border rounded-md px-3 py-2 ${
            error ? "border-red-500" : "border-gray-300"
          } ${readOnly ? "bg-gray-200" : ""} ${className}`}
          autoComplete="off"
        />
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

// Enhanced Suggestion Input Component
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
  }) => {
    const handleMouseEnter = useCallback(
      (index) => {
        setHighlightedIndex(index);
      },
      [setHighlightedIndex]
    );

    const handleClick = useCallback(
      (item) => {
        const value = getSuggestionValue(item);
        onSuggestionSelect && onSuggestionSelect(value);
      },
      [onSuggestionSelect, getSuggestionValue]
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
          className={`border rounded-md px-3 py-2 ${
            error ? "border-red-500" : "border-gray-300"
          }`}
          placeholder="Type to search..."
          autoComplete="off"
        />
        {isOpen && suggestions.length > 0 && (
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

const AddSale = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerCode } = location.state || {};
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const {
    form,
    errors,
    mrList,
    customerList,
    mrListLoading,
    customerListLoading,
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
    addProduct,
    removeProduct,
    updateProduct,
    toggleView,
    isProductExpanded,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
  } = useSaleForm(customerCode);
  const { statuses, products, productNames, loading } = useInitialSaleData();

  // Fetch MR and Customer lists on component mount
  useEffect(() => {
    fetchMRList();
    fetchCustomerList();
  }, [fetchMRList, fetchCustomerList]);

  // Memoized MR options for dropdown
  const mrOptions = useMemo(() => {
    return [
      { value: "", label: "Select Medical Representative" },
      ...mrList.map((mr) => ({
        value: mr._id,
        label: `${mr.medicalRepName}`,
      })),
    ];
  }, [mrList]);

  // Memoized Customer options for dropdown
  const customerOptions = useMemo(() => {
    return [
      { value: "", label: "Select Customer" },
      ...customerList.map((customer) => ({
        value: customer._id,
        label: `${customer.customerCode} - ${customer.name}`,
      })),
    ];
  }, [customerList]);

  // Payment Status Suggestions
  const paymentStatusSuggestions = useSuggestions(
    statuses,
    "type",
    form.paymentStatus
  );

  // Product Suggestions using custom hook for product rows
  const productSuggestions = useProductSuggestions(form.products, productNames);

  // Enhanced handleChange for payment status
  const enhancedHandleChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      // Handle payment status input separately to allow manual selection
      if (name === "paymentStatus") {
        updateFormField("paymentStatus", value);
        paymentStatusSuggestions.setIsOpen(true);
        paymentStatusSuggestions.setHighlightedIndex(0);
      } else {
        handleChange(e);
      }

      if (name === "paidAmount") {
        // Force payment status update when paid amount changes
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
    [
      handleChange,
      paymentStatusSuggestions,
      updateFormField,
      form.totalAmount,
      form.paymentStatus,
    ]
  );

  const getProductDetails = (productName) => {
    const product = products.find((p) => p.productName === productName);
    return {
      lc: product ? product.lc : "",
      sellingPrice: product ? product.sellingPrice : "",
      inStock: product ? product.inStock : { boxes: 0 },
    };
  };

  // Enhanced product change with real-time validation
  const enhancedProductChange = useCallback(
    (index, field, value) => {
      // First update the product field
      updateProduct(index, field, value);

      if (field === "productName") {
        const productDetails = getProductDetails(value);
        updateProduct(index, "lc", productDetails.lc);
        updateProduct(index, "sellingPrice", productDetails.sellingPrice);

        productSuggestions.setIsOpen(index, true);
        productSuggestions.setDropdownTop(index);
        productSuggestions.setHighlightedIndex(index, 0);
      }

      // Real-time validation for critical fields
      if (
        ["salesQty", "bonusQty", "sellingPrice", "productName"].includes(field)
      ) {
        // Use setTimeout to ensure state is updated before validation
        setTimeout(() => {
          validateProductField(index, field, value, products);
        }, 10);
      }
    },
    [updateProduct, productSuggestions, validateProductField, products]
  );

  // Handle payment status keyboard events
  const handlePaymentStatusKeyDown = useCallback(
    (e) => {
      paymentStatusSuggestions.handleKeyDown(e, (value) => {
        updateFormField("paymentStatus", value);
      });
    },
    [paymentStatusSuggestions, updateFormField]
  );

  // Handle product name keyboard events for specific index
  const handleProductNameKeyDown = useCallback(
    (index, e) => {
      productSuggestions.handleKeyDown(index, e, (value) => {
        enhancedProductChange(index, "productName", value);
      });
    },
    [productSuggestions, enhancedProductChange]
  );

  // Handle payment status focus
  const handlePaymentStatusFocus = useCallback(() => {
    paymentStatusSuggestions.setIsOpen(true);
    paymentStatusSuggestions.setHighlightedIndex(0);
  }, [paymentStatusSuggestions]);

  // Handle product name focus
  const handleProductNameFocus = useCallback(
    (index) => {
      productSuggestions.setIsOpen(index, true);
      productSuggestions.setDropdownTop(index);
      productSuggestions.setHighlightedIndex(index, 0);
    },
    [productSuggestions]
  );

  const handleProductRowHighlight = useCallback(
    (productIndex, suggestionIndex) => {
      productSuggestions.setHighlightedIndex(productIndex, suggestionIndex);
    },
    [productSuggestions]
  );

  // Check if "Add Sale" button should be enabled
  const isAddSaleEnabled = useMemo(() => {
    return areCommonFieldsFilled(form) && hasAtLeastOneProduct(form.products);
  }, [form, areCommonFieldsFilled, hasAtLeastOneProduct]);

  // Check if "Add Product" button should be enabled - UPDATED with stock validation
  const isCurrentProductValid = useCallback(() => {
    const currentProduct = form.products[form.products.length - 1];
    const salesQty = currentProduct.salesQty?.toString().trim();
    const sellingPrice = currentProduct.sellingPrice?.toString().trim();

    // Check basic validation
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

    if (!basicValidation) {
      return false;
    }

    // Check stock validation - disable button if stock is exceeded
    const hasStockProblem = hasStockIssue(currentProduct, products);
    if (hasStockProblem) {
      return false;
    }

    return true;
  }, [form.products, products, hasStockIssue]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // First validate form fields
    if (!validate(products)) {
      showToast("error", "Please fix the validation errors before submitting");
      return;
    }

    try {
      // Filter out empty products
      const validProducts = form.products.filter(
        (product) => product.productName.trim() !== ""
      );

      if (validProducts.length === 0) {
        showToast("error", "Please add at least one product");
        return;
      }

      // Validate total quantity (sales + bonus) for all products before submission
      const stockErrors = [];
      validProducts.forEach((product, index) => {
        const productData = products.find(
          (p) => p.productName === product.productName
        );
        if (productData && productData.inStock) {
          const availableStock = productData.inStock.boxes || 0;
          const salesQty = parseInt(product.salesQty) || 0;
          const bonusQty = parseInt(product.bonusQty) || 0;
          const totalQty = salesQty + bonusQty;

          if (totalQty > availableStock) {
            stockErrors.push(
              `Product "${product.productName}": Total quantity (Sales + Bonus = ${totalQty}) exceeds available stock (${availableStock} boxes)`
            );
          }
        }
      });

      if (stockErrors.length > 0) {
        showToast("error", stockErrors.join(", "));
        return;
      }

      // Helper function to safely format dates
      const safeFormatDate = (dateString) => {
        if (!dateString) return "";
        try {
          const date = new Date(dateString);
          return isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
        } catch (error) {
          console.error("Invalid date format:", dateString, error);
          return "";
        }
      };

      // Create sales data object with products array (single sale record)
      const saleData = {
        recordingDate: safeFormatDate(form.recordingDate),
        invoiceNumber: form.invoiceNumber,
        invoiceDate: safeFormatDate(form.invoiceDate),
        mrName: form.mrName,
        mrId: form.mrId,
        customerCode: form.customerCode,
        customerId: form.customerId,
        products: validProducts.map((product) => ({
          productName: product.productName,
          salesQty: Number(product.salesQty),
          bonusQty: Number(product.bonusQty) || 0,
          totalQty: Number(product.totalQty),
          sellingPrice: Number(product.sellingPrice),
          amount: Number(product.amount),
          discount: Number(product.discount) || 0,
          netSellingAmount: Number(product.netSellingAmount),
          averageUnitPrice: Number(product.averageUnitPrice),
          lc: Number(product.lc) || 0,
          profitLoss: Number(product.profitLoss) || 0,
          isProductAccept: true,
        })),
        creditDays: form.creditDays ? Number(form.creditDays) : null,
        dueDate: safeFormatDate(form.dueDate),
        deliveryDate: safeFormatDate(form.deliveryDate),
        paidAmount: Number(form.paidAmount) || 0,
        dueAmount: Number(form.dueAmount) || 0,
        totalAmount: Number(form.totalAmount),
        paymentStatus: form.paymentStatus,
        remark: form.remark || "",
      };
     
      const response = await fetch(`${backendUrl}/api/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(saleData), // Send single sale object with products array
      });

      const respData = await response.json();

      if (!response.ok) {
        throw new Error(respData.error || "Something went wrong");
      }

      showToast("success", respData.message || "Sale added successfully");
      navigate("/salelayout/sale");
    } catch (err) {
      console.error("Error submitting sale:", err);
      showToast("error", err.message || "Error submitting sale");
    }
  };

  // Handle numeric input change
  const handleNumericInputChange = useCallback((e, updateFunc) => {
    const value = e.target.value;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      updateFunc(e);
    }
  }, []);

  // Handle alphanumeric input for Invoice Number
  const handleAlphanumericInputChange = useCallback((e, updateFunc) => {
    const value = e.target.value;
    if (value === "" || /^[a-zA-Z0-9\-\/\s]*$/.test(value)) {
      updateFunc(e);
    }
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
        <div className="flex justify-center items-center h-32">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Add New Sale</h2>
        <button
          type="button"
          disabled={!isCurrentProductValid()}
          onClick={addProduct}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            isCurrentProductValid()
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
          }`}
        >
          <PlusSquare className="w-5 h-5" />
          Add Product
        </button>
      </div>

      <div className="mb-6">
        {form.products.map((product, index) => {
          const productData = products.find(
            (p) => p.productName === product.productName
          );
          const stockInfo = productData?.inStock;
          const availableStock = stockInfo?.boxes || 0;
          const salesQty = parseInt(product.salesQty) || 0;
          const bonusQty = parseInt(product.bonusQty) || 0;
          const totalQty = salesQty + bonusQty;
          const remainingStock = calculateRemainingStock(product, products);
          const hasStockProblem = totalQty > availableStock;

          return (
            <div key={index} className="border p-4 mb-4 rounded shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-semibold">
                    {product.productName || `Product ${index + 1}`}
                  </h3>

                  {product.productName && stockInfo && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm px-3 py-2 rounded ${
                          remainingStock < 0
                            ? "bg-red-100 text-red-800 border border-red-300"
                            : remainingStock <= 10
                            ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                            : "bg-green-100 text-green-800 border border-green-300"
                        }`}
                      >
                        Remaining: {remainingStock} boxes
                      </span>
                      {/* Stock validation warning - now checks total quantity */}
                      {hasStockProblem && (
                        <span className="text-red-600 text-sm font-medium">
                          ⚠️ Total quantity exceeds available stock
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleView(index)}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  {isProductExpanded(index) ? "Hide" : "View"}
                </button>
              </div>

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
                        className="text-red-600 hover:text-red-800"
                      >
                        <MinusSquare className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Product Name Input */}
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
                          enhancedProductChange(
                            index,
                            "productName",
                            e.target.value
                          )
                        }
                        onKeyDown={(e) => handleProductNameKeyDown(index, e)}
                        onFocus={() => handleProductNameFocus(index)}
                        onBlur={() =>
                          setTimeout(
                            () => productSuggestions.setIsOpen(index, false),
                            150
                          )
                        }
                        className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
                          errors[`productName_${index}`]
                            ? "border-red-500"
                            : "border-gray-300"
                        }`}
                        placeholder="Type to search or click to see all options"
                        autoComplete="off"
                      />
                      {productSuggestions.suggestionsList[index]?.isOpen &&
                        productSuggestions.filteredItems[index]?.length > 0 && (
                          <ul
                            className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
                            style={{
                              top: productSuggestions.suggestionsList[index]
                                .dropdownTop,
                            }}
                          >
                            {productSuggestions.filteredItems[index].map(
                              (item, idx) => (
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
                              )
                            )}
                          </ul>
                        )}
                      {errors[`productName_${index}`] && (
                        <p className="text-red-500 text-xs mt-0.5">
                          {errors[`productName_${index}`]}
                        </p>
                      )}
                    </div>

                    <InputField
                      label="Sales Quantity"
                      name={`salesQty_${index}`}
                      type="text"
                      value={product.salesQty}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(
                            index,
                            "salesQty",
                            e.target.value
                          )
                        );
                      }}
                      error={errors[`salesQty_${index}`]}
                      required
                    />

                    <InputField
                      label="Bonus Quantity"
                      name={`bonusQty_${index}`}
                      type="text"
                      value={product.bonusQty}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(
                            index,
                            "bonusQty",
                            e.target.value
                          )
                        );
                      }}
                      error={errors[`bonusQty_${index}`]}
                    />

                    <InputField
                      label="Selling Price"
                      name={`sellingPrice_${index}`}
                      type="text"
                      value={product.sellingPrice}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(
                            index,
                            "sellingPrice",
                            e.target.value
                          )
                        );
                      }}
                      error={errors[`sellingPrice_${index}`]}
                      required
                    />

                    <InputField
                      label="Discount"
                      name={`discount_${index}`}
                      type="text"
                      value={product.discount}
                      onChange={(e) => {
                        handleNumericInputChange(e, (e) =>
                          enhancedProductChange(
                            index,
                            "discount",
                            e.target.value
                          )
                        );
                      }}
                      error={errors[`discount_${index}`]}
                    />

                    <InputField
                      label="LC"
                      name={`lc_${index}`}
                      value={product.lc}
                      readOnly
                    />

                    {/* Calculated Fields */}
                    <InputField
                      label="Total Quantity"
                      name={`totalQty_${index}`}
                      value={product.totalQty}
                      readOnly
                    />
                    <InputField
                      label="Amount"
                      name={`amount_${index}`}
                      value={product.amount}
                      readOnly
                    />
                    <InputField
                      label="Net Selling Amount"
                      name={`netSellingAmount_${index}`}
                      value={product.netSellingAmount}
                      readOnly
                    />
                    <InputField
                      label="Average Unit Price"
                      name={`averageUnitPrice_${index}`}
                      value={product.averageUnitPrice}
                      readOnly
                    />
                    <InputField
                      label="Profit / Loss"
                      name={`profitLoss_${index}`}
                      value={product.profitLoss}
                      readOnly
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rest of the form */}
      <form onSubmit={handleSubmit}>
        {/* Common Fields */}
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
          />

          {/* Medical Representative Dropdown */}
          <SearchableDropdown
            value={form.mrId}
            onChange={handleMRChange}
            options={mrOptions}
            placeholder="Select Medical Representative"
            required={true}
            loading={mrListLoading}
            error={errors.mrName}
            label="Medical Representative"
          />

          {/* Customer Dropdown */}
          <SearchableDropdown
            value={form.customerId}
            onChange={handleCustomerChange}
            options={customerOptions}
            placeholder="Select Customer"
            required={true}
            loading={customerListLoading}
            error={errors.customerCode}
            label="Customer"
          />

          <DatePickerField
            label="Delivery Date"
            name="deliveryDate"
            value={form.deliveryDate}
            onChange={enhancedHandleChange}
            error={errors.deliveryDate}
            readOnly
            placeholder="Delivery date will be set automatically"
          />
        </div>

        {/* Additional Common Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <InputField
            label="Credit Days"
            name="creditDays"
            type="text"
            value={form.creditDays}
            onChange={(e) => handleNumericInputChange(e, enhancedHandleChange)}
            error={errors.creditDays}
          />

          <DatePickerField
            label="Due Date"
            name="dueDate"
            value={form.dueDate}
            onChange={enhancedHandleChange}
            error={errors.dueDate}
            readOnly
            placeholder="Due date will be calculated from current date + credit days"
          />

          <InputField
            label="Total Amount"
            name="totalAmount"
            value={form.totalAmount}
            onChange={enhancedHandleChange}
            error={errors.totalAmount}
            readOnly
          />

          <InputField
            label="Paid Amount"
            name="paidAmount"
            type="text"
            value={form.paidAmount}
            onChange={(e) => handleNumericInputChange(e, enhancedHandleChange)}
            error={errors.paidAmount}
          />

          <InputField
            label="Due Amount"
            name="dueAmount"
            value={form.dueAmount}
            onChange={enhancedHandleChange}
            error={errors.dueAmount}
            readOnly
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
          />

          <div className="sm:col-span-3">
            <InputField
              label="Remark"
              name="remark"
              value={form.remark}
              onChange={enhancedHandleChange}
              error={errors.remark}
            />
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
            disabled={!isAddSaleEnabled}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg shadow transition-colors ${
              isAddSaleEnabled
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
