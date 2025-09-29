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
  unitPrice: "",
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
  const [statuses, setStatuses] = useState([]);
  const [errors, setErrors] = useState({});
  const { customerCode } = location.state || {};

  const [form, setForm] = useState({
    ...initialFormState,
    customerCode: customerCode || "",
  });

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  useEffect(() => {
    const fetchPaymentStatuses = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/sales/payment-status`);
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        const data = await res.json();
        setStatuses(data);
      } catch (err) {
        console.error("❌ Error fetching payment statuses:", err.message);
      }
    };

    fetchPaymentStatuses();
  }, []);

  const filteredStatuses = statuses
    .filter((status) =>
      status.type.toLowerCase().startsWith(form.paymentStatus.toLowerCase())
    )
    .sort((a, b) => a.type.localeCompare(b.type));

  const handlePaymentStatusKeyDown = (e) => {
    if (!showSuggestions || filteredStatuses.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredStatuses.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredStatuses.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleSelect(filteredStatuses[highlightedIndex].type);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
      default:
        break;
    }
  };

  const handleSelect = (value) => {
    setForm((prev) => ({ ...prev, paymentStatus: value }));
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "paymentStatus") {
      setForm((prev) => ({ ...prev, paymentStatus: value }));
      setShowSuggestions(true);
      setHighlightedIndex(-1);
      return;
    }

    let updatedForm = { ...form, [name]: value };

    const parseNumber = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    };

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

    if (name === "invoiceDate" && !form.deliveryDate) {
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

    if (name === "sellingPrice" || name === "salesQty") {
      const price = parseFloat(
        name === "sellingPrice" ? value : form.sellingPrice || 0
      );
      const qty = parseInt(
        name === "salesQty" ? value : form.salesQty || 0,
        10
      );
      updatedForm.amount =
        isNaN(price) || isNaN(qty) ? "" : (price * qty).toFixed(2);
    }

    if (["amount", "discount", "sellingPrice", "salesQty"].includes(name)) {
      const amount = parseNumber(
        name === "amount" ? value : updatedForm.amount || form.amount
      );
      const discount = parseNumber(name === "discount" ? value : form.discount);
      updatedForm.netSellingAmount = (amount - discount).toFixed(2);
    }

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

    if (["netSellingAmount", "paidAmount"].includes(name)) {
      const amount = parseNumber(
        updatedForm.netSellingAmount || form.netSellingAmount
      );
      const paidAmount = parseNumber(
        name === "paidAmount" ? value : form.paidAmount
      );
      updatedForm.dueAmount = (amount - paidAmount).toFixed(2);
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
    if (!form.mrName)
      newErrors.mrName = "Medical Representative Name is required";
    if (!form.customerCode)
      newErrors.customerCode = "Customer Code is required";
    if (!form.productName) newErrors.productName = "Product Name is required";
    if (!form.salesQty || Number(form.salesQty) <= 0)
      newErrors.salesQty = "Sales Quantity must be greater than zero";
    if (!form.sellingPrice || Number(form.sellingPrice) <= 0)
      newErrors.sellingPrice = "Selling Price must be greater than zero";
    if (!form.paymentStatus)
      newErrors.paymentStatus = "Payment Status is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch(`${backendUrl}/api/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Something went wrong");
        return;
      }

      showToast("success", data.message || "Sale added successfully");
      navigate("/salelayout/sale");
    } catch (error) {
      showToast("error", error.message || "Network error");
    }
  };

  // Update dropdown position when showSuggestions changes or form.paymentStatus changes
  useEffect(() => {
    if (showSuggestions && inputRef.current) {
      const inputHeight = inputRef.current.offsetHeight;
      setDropdownTop(inputHeight + 26); // 4px gap below input
    }
  }, [showSuggestions, form.paymentStatus]);

  // Updated renderInput to skip focus on readOnly fields
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
        tabIndex={readOnly ? -1 : 0} // <-- prevent tab focus if readOnly
      />
      {errors[name] && (
        <p className="text-red-500 text-xs mt-0.5">{errors[name]}</p>
      )}
    </div>
  );

  const renderPaymentStatusInputWithSuggestions = () => {
    return (
      <div className="relative flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          Payment Status
        </label>
        <input
          ref={inputRef}
          type="text"
          name="paymentStatus"
          value={form.paymentStatus}
          onChange={handleChange}
          onKeyDown={handlePaymentStatusKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() =>
            setTimeout(() => {
              setShowSuggestions(false);
              setHighlightedIndex(-1);
            }, 150)
          }
          className="border rounded-md px-2 py-1"
          placeholder="Type to search..."
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls="payment-status-listbox"
          aria-expanded={showSuggestions}
          role="combobox"
        />
        {showSuggestions && filteredStatuses.length > 0 && (
          <ul
            id="payment-status-listbox"
            role="listbox"
            className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
            style={{ top: dropdownTop, left: 0, position: "absolute" }}
          >
            {filteredStatuses.map((status, index) => (
              <li
                key={status._id}
                role="option"
                aria-selected={highlightedIndex === index}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(status.type);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`cursor-pointer px-3 py-2 ${
                  highlightedIndex === index
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-900"
                }`}
              >
                {status.type}
              </li>
            ))}
          </ul>
        )}
        {errors.paymentStatus && (
          <p className="text-red-500 text-xs mt-0.5">{errors.paymentStatus}</p>
        )}
      </div>
    );
  };

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
          {renderInput("Product Name", "productName")}
          {renderInput("Sales Quantity", "salesQty", "text")}
          {renderInput("Bonus Quantity", "bonusQty", "text")}
          {/* totalQty is calculated and readOnly */}
          {renderInput("Total Quantity", "totalQty", "text", "", false, true)}
          {renderInput("Selling Price", "sellingPrice", "text")}
          {/* amount is calculated and readOnly */}
          {renderInput("Amount", "amount", "text", "", false, true)}
          {renderInput("Discount", "discount", "text")}
          {/* netSellingAmount is calculated and readOnly */}
          {renderInput(
            "Net Selling Amount",
            "netSellingAmount",
            "text",
            "",
            false,
            true
          )}
          {renderInput("Average Unit Price", "averageUnitPrice", "text")}
          {renderInput("Unit Price", "unitPrice", "text")}
          {renderInput("LC", "lc", "text")}
          {/* profitLoss is calculated and readOnly */}
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

          {renderPaymentStatusInputWithSuggestions()}
          <div className="sm:col-span-3">{renderInput("Remark", "remark")}</div>
        </div>

        <div className="flex justify-end mt-6 gap-3">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow cursor-pointer"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => navigate("/salelayout/sale")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddSale;
