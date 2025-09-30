  import React, { useState, useEffect, useRef } from "react";
  import { useNavigate, useLocation } from "react-router-dom";
  import { showToast } from "../../utils/toast";

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const initialFormState = {
    _id: null,
    recordingDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    mrName: "",
    customerCode: "",
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
    creditDays: "",
    dueDate: "",
    deliveryDate: "",
    paidAmount: "",
    dueAmount: "",
    paymentStatus: "",
    remark: "",
  };

  const AddSale = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { customerCode } = location.state || {};

    const [form, setForm] = useState({
      ...initialFormState,
      customerCode: customerCode || "",
    });
    const [statuses, setStatuses] = useState([]); // for payment status suggestions
    const [productNames, setProductNames] = useState([]); // for product name suggestions
    const [errors, setErrors] = useState({});

    // For suggestion dropdowns
    const [showStatusSuggestions, setShowStatusSuggestions] = useState(false);
    const [statusHighlightedIndex, setStatusHighlightedIndex] = useState(-1);
    const statusInputRef = useRef(null);
    const [statusDropdownTop, setStatusDropdownTop] = useState(0);

    const [showProductSuggestions, setShowProductSuggestions] = useState(false);
    const [productHighlightedIndex, setProductHighlightedIndex] = useState(-1);
    const productInputRef = useRef(null);
    const [productDropdownTop, setProductDropdownTop] = useState(0);

    useEffect(() => {
      const fetchPaymentStatuses = async () => {
        try {
          const res = await fetch(`${backendUrl}/api/sales/payment-status`);
          if (!res.ok) throw new Error(`Status fetch error ${res.status}`);
          const data = await res.json();
          setStatuses(data); // assume array of { _id, type }
        } catch (err) {
          console.error("Error fetching statuses:", err);
        }
      };
      fetchPaymentStatuses();
    }, []);

    useEffect(() => {
      const fetchProductNames = async () => {
        try {
          const res = await fetch(`${backendUrl}/api/sales/unique-names`);
          if (!res.ok) throw new Error(`Product names fetch error ${res.status}`);
          const data = await res.json();
          console.log('values of data',data);
          setProductNames(data.productNames); 
        } catch (err) {
          console.error("Error fetching product names:", err);
        }
      };
      fetchProductNames();
    }, []);

    // Filtered lists
    const filteredStatusSuggestions = statuses
      .filter((st) =>
        st.type.toLowerCase().startsWith(form.paymentStatus.toLowerCase())
      )
      .sort((a, b) => a.type.localeCompare(b.type));

    const filteredProductSuggestions = productNames
      .filter((pn) => {
        const name = typeof pn === "string" ? pn : pn.name;
        return name.toLowerCase().startsWith(form.productName.toLowerCase());
      })
      .sort((a, b) => {
        const na = typeof a === "string" ? a : a.name;
        const nb = typeof b === "string" ? b : b.name;
        return na.localeCompare(nb);
      });

    // Suggestion handlers for Payment Status
    const handleStatusKeyDown = (e) => {
      if (!showStatusSuggestions || filteredStatusSuggestions.length === 0)
        return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setStatusHighlightedIndex((prev) =>
            prev < filteredStatusSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setStatusHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredStatusSuggestions.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (statusHighlightedIndex >= 0) {
            const sel = filteredStatusSuggestions[statusHighlightedIndex].type;
            selectStatusSuggestion(sel);
          }
          break;
        case "Escape":
          setShowStatusSuggestions(false);
          break;
        default:
          break;
      }
    };

    const selectStatusSuggestion = (value) => {
      setForm((prev) => ({ ...prev, paymentStatus: value }));
      setShowStatusSuggestions(false);
      setStatusHighlightedIndex(-1);
    };

    // Suggestion handlers for Product Name
    const handleProductKeyDown = (e) => {
      if (!showProductSuggestions || filteredProductSuggestions.length === 0)
        return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setProductHighlightedIndex((prev) =>
            prev < filteredProductSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setProductHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredProductSuggestions.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (productHighlightedIndex >= 0) {
            const sel =
              typeof filteredProductSuggestions[productHighlightedIndex] ===
              "string"
                ? filteredProductSuggestions[productHighlightedIndex]
                : filteredProductSuggestions[productHighlightedIndex].name;
            selectProductSuggestion(sel);
          }
          break;
        case "Escape":
          setShowProductSuggestions(false);
          break;
        default:
          break;
      }
    };

    const selectProductSuggestion = (value) => {
      setForm((prev) => ({ ...prev, productName: value }));
      setShowProductSuggestions(false);
      setProductHighlightedIndex(-1);
    };

    const handleChange = (e) => {
      const { name, value } = e.target;

      if (name === "paymentStatus") {
        setForm((prev) => ({ ...prev, paymentStatus: value }));
        setShowStatusSuggestions(true);
        setStatusHighlightedIndex(-1);
        return;
      }
      if (name === "productName") {
        setForm((prev) => ({ ...prev, productName: value }));
        setShowProductSuggestions(true);
        setProductHighlightedIndex(-1);
        return;
      }

      let updatedForm = { ...form, [name]: value };

      const parseNumber = (val) => {
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num;
      };

      // totalQty
      if (name === "salesQty" || name === "bonusQty") {
        const salesQty =
          name === "salesQty"
            ? parseInt(value, 10) || 0
            : parseInt(form.salesQty, 10) || 0;
        const bonusQty =
          name === "bonusQty"
            ? parseInt(value, 10) || 0
            : parseInt(form.bonusQty, 10) || 0;
        updatedForm.totalQty = salesQty + bonusQty;
      }

      // deliveryDate default
      if (name === "invoiceDate" && !form.deliveryDate) {
        updatedForm.deliveryDate = value;
      }

      // creditDays -> dueDate
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

      // amount = sellingPrice * salesQty
      if (name === "sellingPrice" || name === "salesQty") {
        const price = parseFloat(
          name === "sellingPrice" ? value : form.sellingPrice || "0"
        );
        const qty = parseInt(
          name === "salesQty" ? value : form.salesQty || "0",
          10
        );
        updatedForm.amount =
          isNaN(price) || isNaN(qty) ? "" : (price * qty).toFixed(2);
      }

      // netSellingAmount = amount - discount
      if (["amount", "discount", "sellingPrice", "salesQty"].includes(name)) {
        const amount = parseNumber(
          name === "amount" ? value : updatedForm.amount || form.amount
        );
        const discount = parseNumber(name === "discount" ? value : form.discount);
        updatedForm.netSellingAmount = (amount - discount).toFixed(2);
      }

      // profitLoss = amount - discount - lc * totalQty
      if (
        ["amount", "discount", "lc", "totalQty", "salesQty", "bonusQty"].includes(
          name
        )
      ) {
        const amount = parseNumber(updatedForm.amount || form.amount);
        const discount = parseNumber(updatedForm.discount || form.discount);
        const lc = parseNumber(updatedForm.lc || form.lc);
        const totalQty = parseInt(updatedForm.totalQty || form.totalQty || 0, 10);
        updatedForm.profitLoss = (amount - discount - lc * totalQty).toFixed(2);
      }

      // dueAmount
      if (["netSellingAmount", "paidAmount"].includes(name)) {
        const amount = parseNumber(
          updatedForm.netSellingAmount || form.netSellingAmount
        );
        const paidAmount = parseNumber(
          name === "paidAmount" ? value : form.paidAmount
        );
        updatedForm.dueAmount = (amount - paidAmount).toFixed(2);
      }

      // averageUnitPrice = netSellingAmount / totalQty
      if (
        [
          "netSellingAmount",
          "salesQty",
          "bonusQty",
          "discount",
          "sellingPrice",
        ].includes(name)
      ) {
        const net = parseNumber(
          updatedForm.netSellingAmount || form.netSellingAmount
        );
        const totalQty = parseInt(updatedForm.totalQty || form.totalQty || 0, 10);
        updatedForm.averageUnitPrice =
          totalQty > 0 ? (net / totalQty).toFixed(2) : "";
      }

      setForm(updatedForm);
    };

    const validate = () => {
      const newErrors = {};
      if (!form.recordingDate)
        newErrors.recordingDate = "Recording Date is required";
      if (!form.invoiceNumber)
        newErrors.invoiceNumber = "Invoice Number is required";
      if (!form.invoiceDate) newErrors.invoiceDate = "Invoice Date is required";
      if (!form.mrName) newErrors.mrName = "MR Name is required";
      if (!form.customerCode)
        newErrors.customerCode = "Customer Code is required";
      if (!form.productName) newErrors.productName = "Product Name is required";
      if (!form.salesQty || Number(form.salesQty) <= 0)
        newErrors.salesQty = "Sales Quantity must be > 0";
      if (!form.sellingPrice || Number(form.sellingPrice) <= 0)
        newErrors.sellingPrice = "Selling Price must be > 0";
      if (!form.paymentStatus)
        newErrors.paymentStatus = "Payment Status is required";

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!validate()) return;

      try {
        const resp = await fetch(`${backendUrl}/api/sales`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const respData = await resp.json();
        if (!resp.ok) {
          showToast("error", respData.message || "Error submitting");
        } else {
          showToast("success", respData.message || "Sale added");
          navigate("/salelayout/sale");
        }
      } catch (err) {
        showToast("error", err.message || "Network error");
      }
    };

    // Positioning dropdowns
    useEffect(() => {
      if (showStatusSuggestions && statusInputRef.current) {
        const h = statusInputRef.current.offsetHeight;
        setStatusDropdownTop((2*h)-8);
      }
    }, [showStatusSuggestions]);

    useEffect(() => {
      if (showProductSuggestions && productInputRef.current) {
        const h = productInputRef.current.offsetHeight;
        setProductDropdownTop((2*h)-8);
      }
    }, [showProductSuggestions]);

    const renderInput = (
      label,
      name,
      type = "text",
      placeholder = "",
      required = false,
      readOnly = false
    ) => (
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          type={type}
          name={name}
          value={form[name]}
          onChange={handleChange}
          placeholder={placeholder}
          className="border rounded-md px-2 py-1"
          autoComplete="off"
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : 0}
        />
        {errors[name] && (
          <p className="text-red-500 text-xs mt-0.5">{errors[name]}</p>
        )}
      </div>
    );

    const renderStatusSuggestionInput = () => (
      <div className="relative flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          Payment Status
        </label>
        <input
          ref={statusInputRef}
          type="text"
          name="paymentStatus"
          value={form.paymentStatus}
          onChange={handleChange}
          onKeyDown={handleStatusKeyDown}
          onFocus={() => setShowStatusSuggestions(true)}
          onBlur={() =>
            setTimeout(() => {
              setShowStatusSuggestions(false);
              setStatusHighlightedIndex(-1);
            }, 150)
          }
          className="border rounded-md px-2 py-1"
          placeholder="Type to search..."
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showStatusSuggestions}
          role="combobox"
        />
        {showStatusSuggestions && filteredStatusSuggestions.length > 0 && (
          <ul
            className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
            style={{ top: statusDropdownTop, left: 0, position: "absolute" }}
          >
            {filteredStatusSuggestions.map((st, idx) => (
              <li
                key={st._id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectStatusSuggestion(st.type);
                }}
                onMouseEnter={() => setStatusHighlightedIndex(idx)}
                className={`cursor-pointer px-3 py-2 ${
                  statusHighlightedIndex === idx
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-900"
                }`}
              >
                {st.type}
              </li>
            ))}
          </ul>
        )}
        {errors.paymentStatus && (
          <p className="text-red-500 text-xs mt-0.5">{errors.paymentStatus}</p>
        )}
      </div>
    );

    const renderProductSuggestionInput = () => (
      <div className="relative flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          Product Name
        </label>
        <input
          ref={productInputRef}
          type="text"
          name="productName"
          value={form.productName}
          onChange={handleChange}
          onKeyDown={handleProductKeyDown}
          onFocus={() => setShowProductSuggestions(true)}
          onBlur={() =>
            setTimeout(() => {
              setShowProductSuggestions(false);
              setProductHighlightedIndex(-1);
            }, 150)
          }
          className="border rounded-md px-2 py-1"
          placeholder="Type to search..."
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showProductSuggestions}
          role="combobox"
        />
        {showProductSuggestions && filteredProductSuggestions.length > 0 && (
          <ul
            className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
            style={{ top: productDropdownTop, left: 0, position: "absolute" }}
          >
            {filteredProductSuggestions.map((pn, idx) => {
              const name = typeof pn === "string" ? pn : pn.name;
              const id = typeof pn === "object" && pn._id ? pn._id : idx;
              return (
                <li
                  key={id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectProductSuggestion(name);
                  }}
                  onMouseEnter={() => setProductHighlightedIndex(idx)}
                  className={`cursor-pointer px-3 py-2 ${
                    productHighlightedIndex === idx
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-900"
                  }`}
                >
                  {name}
                </li>
              );
            })}
          </ul>
        )}
        {errors.productName && (
          <p className="text-red-500 text-xs mt-0.5">{errors.productName}</p>
        )}
      </div>
    );

    return (
      <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Sale</h2>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {renderInput("Recording Date", "recordingDate", "date")}
            {renderInput("Invoice Number", "invoiceNumber")}
            {renderInput("Invoice Date", "invoiceDate", "date")}
            {renderInput("Medical Representative Name", "mrName")}
            {renderInput("Customer Code", "customerCode")}
            {renderProductSuggestionInput()}
            {renderInput("Sales Quantity", "salesQty", "text")}
            {renderInput("Bonus Quantity", "bonusQty", "text")}
            {renderInput("Total Quantity", "totalQty", "text", "", false, true)}
            {renderInput("Selling Price", "sellingPrice", "text")}
            {renderInput("Amount", "amount", "text", "", false, true)}
            {renderInput("Discount", "discount", "text")}
            {renderInput(
              "Net Selling Amount",
              "netSellingAmount",
              "text",
              "",
              false,
              true
            )}
            {renderInput(
              "Average Unit Price",
              "averageUnitPrice",
              "text",
              "",
              false,
              true
            )}
            {renderInput("LC", "lc", "text")}
            {renderInput("Profit / Loss", "profitLoss", "text", "", false, true)}
            {renderInput("Credit Days", "creditDays", "text")}
            {renderInput("Due Date", "dueDate", "date", "", false, true)}
            {renderInput(
              "Delivery Date",
              "deliveryDate",
              "date",
              "",
              false,
              true
            )}
            {renderInput("Paid Amount", "paidAmount", "text")}
            {renderInput("Due Amount", "dueAmount", "text", "", false, true)}

            {renderStatusSuggestionInput()}
            <div className="sm:col-span-3">{renderInput("Remark", "remark")}</div>
          </div>

          <div className="flex justify-end mt-6 gap-3">
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => navigate("/salelayout/sale")}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  };

  export default AddSale;
