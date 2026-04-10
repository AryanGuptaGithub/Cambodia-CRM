import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import { PlusSquare, Trash2 } from "lucide-react";
import { fetchCustomerList } from "../ProductManager/common/fetchDropdown";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialProduct = { productName: "", totalQty: "" };

// Helper: get nearest expiry info from batches
const getNearestExpiryInfo = (stockData) => {
  if (!stockData?.batches || !Array.isArray(stockData.batches)) return null;
  const validBatches = stockData.batches.filter(
    (batch) => batch.boxes > 0 && batch.expiryDate,
  );
  if (validBatches.length === 0) return null;
  const sorted = [...validBatches].sort(
    (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate),
  );
  const nearest = sorted[0];
  const today = new Date();
  const expiryDate = new Date(nearest.expiryDate);
  const daysUntilExpiry = Math.ceil(
    (expiryDate - today) / (1000 * 60 * 60 * 24),
  );
  return {
    expiryDate: nearest.expiryDate,
    daysUntilExpiry,
    isNearExpiry: daysUntilExpiry <= 30,
  };
};

// Custom hook for product suggestions & stock data from reportsInHand
const useProductSuggestions = (
  productsList,
  formProducts,
  setForm,
  setErrors,
) => {
  const [productStock, setProductStock] = useState({});
  const [loadingStock, setLoadingStock] = useState({});
  const inputRefs = useRef([]);
  const [suggestionsList, setSuggestionsList] = useState([]);

  useEffect(() => {
    setSuggestionsList(
      formProducts.map(() => ({
        isOpen: false,
        highlightedIndex: -1,
        dropdownTop: 0,
      })),
    );
    inputRefs.current = formProducts.map(
      (_, i) => inputRefs.current[i] || React.createRef(),
    );
  }, [formProducts.length]);

  // Fetch stock data from reportsInHand for a product name
  const fetchProductStock = useCallback(
    async (productName) => {
      if (!productName) return null;
      if (productStock[productName]) return productStock[productName];

      setLoadingStock((prev) => ({ ...prev, [productName]: true }));
      try {
        const response = await axios.get(
          `${backendUrl}/api/stock-in-hand/product/${encodeURIComponent(productName)}`,
        );
        if (response.data && response.data.success && response.data.data) {
          const stockData = response.data.data;
          const stock = stockData.totalBoxes || 0;
          const expiryInfo = getNearestExpiryInfo(stockData);
          const result = { stock, expiryInfo, rawData: stockData };
          setProductStock((prev) => ({ ...prev, [productName]: result }));
          return result;
        } else {
          const result = { stock: 0, expiryInfo: null, rawData: null };
          setProductStock((prev) => ({ ...prev, [productName]: result }));
          return result;
        }
      } catch (error) {
        console.error(`Failed to fetch stock for ${productName}:`, error);
        const result = { stock: 0, expiryInfo: null, rawData: null };
        setProductStock((prev) => ({ ...prev, [productName]: result }));
        return result;
      } finally {
        setLoadingStock((prev) => ({ ...prev, [productName]: false }));
      }
    },
    [productStock, backendUrl],
  );

  const handleProductChange = useCallback(
    async (index, field, value) => {
      const newProducts = [...formProducts];
      newProducts[index][field] = value;
      setForm((prev) => ({ ...prev, products: newProducts }));
      setErrors((prev) => ({
        ...prev,
        [`productName_${index}`]: "",
        [`totalQty_${index}`]: "",
        [`stock_${index}`]: "",
      }));

      if (field === "productName" && value) {
        const stockInfo = await fetchProductStock(value);
        if (stockInfo) {
          const qty = parseInt(newProducts[index].totalQty);
          if (!isNaN(qty) && qty > stockInfo.stock && stockInfo.stock > 0) {
            setErrors((prev) => ({
              ...prev,
              [`stock_${index}`]: `Quantity exceeds available stock (${stockInfo.stock})`,
            }));
          }
        }
      }

      if (field === "totalQty") {
        const qty = parseInt(value);
        const productName = newProducts[index].productName;
        if (productName && productStock[productName]) {
          const stock = productStock[productName].stock;
          if (!isNaN(qty) && qty > stock && stock > 0) {
            setErrors((prev) => ({
              ...prev,
              [`stock_${index}`]: `Quantity exceeds available stock (${stock})`,
            }));
          } else {
            setErrors((prev) => ({ ...prev, [`stock_${index}`]: "" }));
          }
        }
      }
    },
    [formProducts, setForm, setErrors, fetchProductStock, productStock],
  );

  const setIsOpen = useCallback((index, isOpen) => {
    setSuggestionsList((prev) =>
      prev.map((s, i) => (i === index ? { ...s, isOpen } : s)),
    );
  }, []);

  const setHighlightedIndex = useCallback((index, highlightedIndex) => {
    setSuggestionsList((prev) =>
      prev.map((s, i) => (i === index ? { ...s, highlightedIndex } : s)),
    );
  }, []);

  const setDropdownTop = useCallback((index) => {
    const inputRef = inputRefs.current[index];
    if (inputRef?.current) {
      const height = inputRef.current.offsetHeight;
      setSuggestionsList((prev) =>
        prev.map((s, i) =>
          i === index ? { ...s, dropdownTop: 2 * height - 8 } : s,
        ),
      );
    }
  }, []);

  const getFilteredProducts = useCallback(
    (index) => {
      const currentProductName = formProducts[index]?.productName || "";
      const selectedNames = formProducts
        .filter((_, i) => i !== index)
        .map((p) => p.productName)
        .filter(Boolean);
      return (productsList || [])
        .filter((p) => !selectedNames.includes(p.productName))
        .filter((p) =>
          p.productName
            .toLowerCase()
            .includes(currentProductName.toLowerCase()),
        )
        .sort((a, b) => a.productName.localeCompare(b.productName));
    },
    [productsList, formProducts],
  );

  const handleKeyDown = useCallback(
    (index, e, onSelect) => {
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
    },
    [suggestionsList, getFilteredProducts, setHighlightedIndex, setIsOpen],
  );

  const selectSuggestion = useCallback(
    (index, value, onSelect) => {
      onSelect(value);
      setIsOpen(index, false);
      setHighlightedIndex(index, -1);
    },
    [setIsOpen, setHighlightedIndex],
  );

  const getInputRef = useCallback((index) => inputRefs.current[index], []);

  return {
    suggestionsList,
    getFilteredProducts,
    setIsOpen,
    setHighlightedIndex,
    setDropdownTop,
    handleKeyDown,
    selectSuggestion,
    getInputRef,
    handleProductChange,
    productStock,
    loadingStock,
  };
};

const AddDailySampleReport = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    date: "",
    mrName: "",
    mrId: "",
    customerId: "",
    customerName: "",
    customerCode: "",
    products: [{ ...initialProduct }],
    remark: "",
  });
  const [errors, setErrors] = useState({});
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [customerList, setCustomerList] = useState([]);
  const [customerListLoading, setCustomerListLoading] = useState(true);
  const [productsList, setProductsList] = useState([]);
  const [productsListLoading, setProductsListLoading] = useState(true);

  // Fetch MRs
  useEffect(() => {
    const fetchMR = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/staff`);
        const data = await res.json();
        if (data) setMrList(data);
      } catch (err) {
        console.error(err);
        showToast("error", "Failed to load MRs");
      } finally {
        setMrListLoading(false);
      }
    };
    fetchMR();
  }, []);

  // Fetch Customers
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setCustomerListLoading(true);
        const result = await fetchCustomerList();
        if (result.success) setCustomerList(result.data || []);
        else showToast("error", result.error);
      } catch (err) {
        showToast("error", "Failed to load customers");
      } finally {
        setCustomerListLoading(false);
      }
    };
    loadCustomers();
  }, []);

  // Fetch all product names (for dropdown) – no stock info here
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setProductsListLoading(true);
        const res = await fetch(`${backendUrl}/api/products`);
        const data = await res.json();
        let products = [];
        if (data && Array.isArray(data)) products = data;
        else if (data.products) products = data.products;
        else products = [];
        setProductsList(products);
      } catch (err) {
        console.error(err);
        showToast("error", "Failed to load products");
      } finally {
        setProductsListLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const mrOptions = useMemo(() => {
    if (mrList.length === 0 && !mrListLoading)
      return [{ value: "", label: "No MRs available", disabled: true }];
    return [
      { value: "", label: "Select MR" },
      ...mrList.map((mr) => ({ value: mr._id, label: mr.medicalRepName })),
    ];
  }, [mrList, mrListLoading]);

  const customerOptions = useMemo(() => {
    if (customerList.length === 0 && !customerListLoading)
      return [{ value: "", label: "No customers", disabled: true }];
    return [
      { value: "", label: "Select Customer" },
      ...customerList.map((c) => ({
        value: c._id,
        label: `${c.customerCode} - ${c.name}`,
      })),
    ];
  }, [customerList, customerListLoading]);

  const handleMRChange = (mrId) => {
    const mr = mrList.find((m) => m._id === mrId);
    if (mr) setForm((prev) => ({ ...prev, mrId, mrName: mr.medicalRepName }));
    setErrors((prev) => ({ ...prev, mrName: "" }));
  };

  const handleCustomerChange = (customerId) => {
    const cust = customerList.find((c) => c._id === customerId);
    if (cust)
      setForm((prev) => ({
        ...prev,
        customerId,
        customerName: cust.name,
        customerCode: cust.customerCode,
      }));
    setErrors((prev) => ({ ...prev, customerId: "" }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const {
    suggestionsList,
    getFilteredProducts,
    setIsOpen,
    setHighlightedIndex,
    setDropdownTop,
    handleKeyDown,
    selectSuggestion,
    getInputRef,
    handleProductChange,
    productStock,
    loadingStock,
  } = useProductSuggestions(productsList, form.products, setForm, setErrors);

  const addProduct = () => {
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, { ...initialProduct }],
    }));
  };

  const removeProduct = (idx) => {
    if (form.products.length === 1) {
      showToast("warning", "At least one product is required");
      return;
    }
    const newProducts = form.products.filter((_, i) => i !== idx);
    setForm((prev) => ({ ...prev, products: newProducts }));
    const newErrors = { ...errors };
    delete newErrors[`productName_${idx}`];
    delete newErrors[`totalQty_${idx}`];
    delete newErrors[`stock_${idx}`];
    setErrors(newErrors);
  };

  const handleProductNameChange = (idx, value) => {
    handleProductChange(idx, "productName", value);
    // ✅ When the input is cleared (backspaced to empty), show all products
    if (value === "") {
      setIsOpen(idx, true);
      setDropdownTop(idx);
      setHighlightedIndex(idx, 0);
    }
  };

  const handleQuantityChange = (idx, value) => {
    const numericValue = value.replace(/[^0-9]/g, "");
    if (numericValue === "") {
      handleProductChange(idx, "totalQty", "");
    } else {
      handleProductChange(idx, "totalQty", numericValue);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.date) newErrors.date = "Date is required";
    if (!form.mrName) newErrors.mrName = "MR Name is required";
    if (!form.customerId) newErrors.customerId = "Customer is required";
    let hasValidProduct = false;
    form.products.forEach((prod, idx) => {
      if (!prod.productName)
        newErrors[`productName_${idx}`] = "Product name required";
      if (!prod.totalQty || Number(prod.totalQty) <= 0) {
        newErrors[`totalQty_${idx}`] = "Quantity must be > 0";
      } else {
        hasValidProduct = true;
        const stockInfo = productStock[prod.productName];
        if (
          stockInfo &&
          Number(prod.totalQty) > stockInfo.stock &&
          stockInfo.stock > 0
        ) {
          newErrors[`stock_${idx}`] =
            `Insufficient stock. Available: ${stockInfo.stock}`;
        }
      }
    });
    if (!hasValidProduct)
      newErrors.products =
        "At least one product with valid quantity is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const submitData = {
      date: form.date,
      mrName: form.mrName,
      mrId: form.mrId,
      customerId: form.customerId,
      customerName: form.customerName,
      customerCode: form.customerCode,
      products: form.products.map((p) => ({
        productName: p.productName,
        totalQty: Number(p.totalQty),
      })),
      remark: form.remark,
    };

    try {
      const res = await fetch(`${backendUrl}/api/reports/daily-sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast("success", "Daily sample report added");
      navigate("/reportlayout/dailysample");
    } catch (err) {
      showToast("error", err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6">Add Daily Sample Report</h2>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-sm font-medium">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className={`w-full border rounded-md px-3 py-2 ${errors.date ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.date && (
              <p className="text-red-500 text-xs">{errors.date}</p>
            )}
          </div>
          <SearchableDropdown
            value={form.mrId}
            onChange={handleMRChange}
            options={mrOptions}
            placeholder="Select MR"
            required
            loading={mrListLoading}
            error={errors.mrName}
            label="MR Name"
          />
          <SearchableDropdown
            value={form.customerId}
            onChange={handleCustomerChange}
            options={customerOptions}
            placeholder="Select Customer"
            required
            loading={customerListLoading}
            error={errors.customerId}
            label="Customer"
          />
        </div>

        {/* Products Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium">
              Products <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addProduct}
              className="text-green-600 hover:text-green-800 flex items-center gap-1 text-sm"
            >
              <PlusSquare size={16} /> Add Product
            </button>
          </div>
          {form.products.map((prod, idx) => {
            const stockInfo = productStock[prod.productName];
            const stock = stockInfo?.stock ?? 0;
            const expiryInfo = stockInfo?.expiryInfo;
            const enteredQty = parseInt(prod.totalQty) || 0;
            const remainingStock = stock - enteredQty;
            const filteredProducts = getFilteredProducts(idx);
            const isLoading = loadingStock[prod.productName];

            return (
              <div key={idx} className="border p-4 rounded mb-3 relative">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product Name with custom dropdown */}
                  <div className="relative flex flex-col">
                    <label className="text-sm font-medium">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={getInputRef(idx)}
                      type="text"
                      value={prod.productName}
                      onChange={(e) =>
                        handleProductNameChange(idx, e.target.value)
                      }
                      onKeyDown={(e) =>
                        handleKeyDown(idx, e, (value) =>
                          handleProductNameChange(idx, value),
                        )
                      }
                      onFocus={() => {
                        setIsOpen(idx, true);
                        setDropdownTop(idx);
                        setHighlightedIndex(idx, 0);
                      }}
                      onBlur={() =>
                        setTimeout(() => setIsOpen(idx, false), 150)
                      }
                      className={`w-full border rounded-md px-3 py-2 ${errors[`productName_${idx}`] ? "border-red-500" : "border-gray-300"}`}
                      placeholder="Type to search..."
                      autoComplete="off"
                    />
                    {suggestionsList[idx]?.isOpen &&
                      filteredProducts.length > 0 && (
                        <ul
                          className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
                          style={{ top: suggestionsList[idx].dropdownTop }}
                        >
                          {filteredProducts.map((product, pIdx) => (
                            <li
                              key={product._id || pIdx}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() =>
                                selectSuggestion(
                                  idx,
                                  product.productName,
                                  (value) =>
                                    handleProductNameChange(idx, value),
                                )
                              }
                              onMouseEnter={() =>
                                setHighlightedIndex(idx, pIdx)
                              }
                              className={`cursor-pointer px-3 py-2 ${suggestionsList[idx].highlightedIndex === pIdx ? "bg-blue-600 text-white" : "bg-white text-gray-900 hover:bg-gray-100"}`}
                            >
                              {product.productName}
                            </li>
                          ))}
                        </ul>
                      )}
                    {errors[`productName_${idx}`] && (
                      <p className="text-red-500 text-xs mt-0.5">
                        {errors[`productName_${idx}`]}
                      </p>
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="text-sm font-medium">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={prod.totalQty}
                      onChange={(e) =>
                        handleQuantityChange(idx, e.target.value)
                      }
                      className={`w-full border rounded-md px-3 py-2 ${errors[`totalQty_${idx}`] || errors[`stock_${idx}`] ? "border-red-500" : "border-gray-300"}`}
                      placeholder="Enter quantity"
                    />
                    {errors[`totalQty_${idx}`] && (
                      <p className="text-red-500 text-xs">
                        {errors[`totalQty_${idx}`]}
                      </p>
                    )}
                    {errors[`stock_${idx}`] && (
                      <p className="text-red-500 text-xs">
                        {errors[`stock_${idx}`]}
                      </p>
                    )}
                    {isLoading && (
                      <p className="text-gray-400 text-xs">Loading stock...</p>
                    )}
                  </div>
                </div>

                {/* Stock & Expiry Information */}
                {prod.productName && stockInfo && !isLoading && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <span
                      className={`px-2 py-1 rounded ${remainingStock < 0 ? "bg-red-100 text-red-800" : remainingStock <= 10 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}
                    >
                      Remaining: {remainingStock} boxes
                    </span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                      Available: {stock} boxes
                    </span>
                    {expiryInfo && (
                      <span
                        className={`px-2 py-1 rounded ${expiryInfo.isNearExpiry ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
                      >
                        Expires: {expiryInfo.daysUntilExpiry} days
                      </span>
                    )}
                    {stock === 0 && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded">
                        Out of stock
                      </span>
                    )}
                  </div>
                )}

                {form.products.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProduct(idx)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            );
          })}
          {errors.products && (
            <p className="text-red-500 text-sm mt-1">{errors.products}</p>
          )}
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium">Remark</label>
          <textarea
            name="remark"
            value={form.remark}
            onChange={handleChange}
            rows={2}
            className="w-full border rounded-md px-3 py-2 border-gray-300"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"
          >
            Add Report
          </button>
          <button
            type="button"
            onClick={() => navigate("/reportlayout/dailysample")}
            className="bg-gray-300 hover:bg-gray-400 px-6 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddDailySampleReport;