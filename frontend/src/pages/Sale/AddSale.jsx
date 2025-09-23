import React, { useState } from "react";
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
};

const AddSale = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerCode } = location.state || {};

  const [form, setForm] = useState({
    ...initialFormState,
    customerCode: customerCode || "",
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!form.recordingDate) newErrors.recordingDate = "Recording Date is required";
    if (!form.invoiceNumber) newErrors.invoiceNumber = "Invoice Number is required";
    if (!form.invoiceDate) newErrors.invoiceDate = "Invoice Date is required";
    if (!form.mrName) newErrors.mrName = "Medical Representative Name is required";
    if (!form.customerCode) newErrors.customerCode = "Customer Code is required";
    if (!form.productName) newErrors.productName = "Product Name is required";
    if (form.salesQty <= 0) newErrors.salesQty = "Sales Quantity must be greater than zero";
    if (form.sellingPrice <= 0) newErrors.sellingPrice = "Selling Price must be greater than zero";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const val = type === "number" ? (value === "" ? "" : Number(value)) : value;
    setForm((prev) => ({ ...prev, [name]: val }));
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

  const renderInput = (
    label,
    name,
    type = "text",
    placeholder = "",
    required = false,
    disabled = false
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
        disabled={disabled}
        min={type === "number" ? 0 : undefined}
      />
      {errors[name] && <p className="text-red-500 text-xs mt-0.5">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Sale</h2>

      <form onSubmit={handleSubmit}>
        {/* Grid container with 3 columns and gap */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderInput("Recording Date", "recordingDate", "date")}
          {renderInput("Invoice Number", "invoiceNumber")}
          {renderInput("Invoice Date", "invoiceDate", "date")}

          {renderInput("Medical Representative Name", "mrName")}
          {renderInput("Customer Code", "customerCode")}
          {renderInput("Product Name", "productName")}

          {renderInput("Sales Quantity", "salesQty", "number")}
          {renderInput("Bonus Quantity", "bonusQty", "number")}
          {renderInput("Total Quantity", "totalQty", "number")}

          {renderInput("Selling Price ($)", "sellingPrice", "number")}
          {renderInput("Amount ($)", "amount", "number")}
          {renderInput("Discount ($)", "discount", "number")}

          {renderInput("Net Selling Amount ($)", "netSellingAmount", "number")}
          {renderInput("Average Unit Price ($)", "averageUnitPrice", "number")}
          {renderInput("Profit/Loss ($)", "profitLoss", "number")}

          {renderInput("Credit Days", "creditDays", "number")}
          {renderInput("Due Date", "dueDate", "date")}
          {renderInput("Delivery Date", "deliveryDate", "date")}

          {renderInput("Paid Amount ($)", "paidAmount", "number")}
          {renderInput("Due Amount ($)", "dueAmount", "number")}
          {renderInput("Payment Status", "paymentStatus")}

          {/* Remark can be full width below */}
          <div className="sm:col-span-3">
            {renderInput("Remark", "remark")}
          </div>
        </div>

        <div className="flex justify-end mt-8 gap-4">
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
