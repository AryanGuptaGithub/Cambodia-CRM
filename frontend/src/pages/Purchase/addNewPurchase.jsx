import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  id: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  expiredDate: "",
  productName: "",
  type: "",
  packing: "",
  qtyMain: 0,
  qty: 0,
  unitPrice: 0,
  amount: 0,
  otherExpenses: 0,
  totalAmount: 0,
  unitCost: 0,
  remark: "",
};

const AddNewPurchase = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const parsedValue = type === "number" ? Number(value) : value;
    setForm((prev) => ({ ...prev, [name]: parsedValue }));
  };

  const handleDateChange = (name, date) => {
    setForm((prev) => ({
      ...prev,
      [name]: date ? new Date(date).toISOString() : "",
    }));
  };

  const validate = () => {
    const newErrors = {};

    if (!form.invoiceNumber)
      newErrors.invoiceNumber = "Invoice number is required";
    if (!form.productName) newErrors.productName = "Product name is required";
    if (!form.unitPrice || form.unitPrice < 0)
      newErrors.unitPrice = "Unit price must be positive";
    if (!form.qty || form.qty <= 0)
      newErrors.qty = "Quantity must be greater than 0";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch(`${backendUrl}/api/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Error adding purchase");
        return;
      }

      showToast("success", data.message || "Purchase added successfully");
      navigate("/purchaselayout/purchase");
    } catch (err) {
      showToast("error", err.message || "Network error");
    }
  };

  const renderInput = (label, name, type = "text", placeholder = "") => (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full border rounded-md px-3 py-2 mt-1"
        min={type === "number" ? 0 : undefined}
      />
      {errors[name] && (
        <p className="text-red-500 text-sm mt-1">{errors[name]}</p>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add New Purchase
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {renderInput("Invoice Number", "invoiceNumber")}
          {renderInput("Delivery Number", "deliveryNumber")}
          {renderInput("Product Name", "productName")}
          {renderInput("Type", "type")}
          {renderInput("Packing", "packing")}
          {renderInput("Qty (Main)", "qtyMain", "number")}
          {renderInput("Qty", "qty", "number")}
          {renderInput("Unit Price", "unitPrice", "number")}
          {/* {renderInput("Amount", "amount", "number")} */}
          {renderInput("Other Expenses", "otherExpenses", "number")}
          {renderInput("Total Amount", "totalAmount", "number")}
          {/* {renderInput("Unit Cost", "unitCost", "number")} */}
          {renderInput("Remark", "remark")}
        </div>

        {/* Dates in One Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">
              Invoice Date
            </label>
            <DatePicker
              selected={
                form.invoiceDate ? new Date(form.invoiceDate) : null
              }
              onChange={(date) => handleDateChange("invoiceDate", date)}
              dateFormat="yyyy-MM-dd"
              placeholderText="Select date"
              className="w-full border px-3 py-2 rounded-md mt-1"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">
              Received Date
            </label>
            <DatePicker
              selected={
                form.receivedDate ? new Date(form.receivedDate) : null
              }
              onChange={(date) => handleDateChange("receivedDate", date)}
              dateFormat="yyyy-MM-dd"
              placeholderText="Select date"
              className="w-full border px-3 py-2 rounded-md mt-1"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">
              Expired Date
            </label>
            <DatePicker
              selected={
                form.expiredDate ? new Date(form.expiredDate) : null
              }
              onChange={(date) => handleDateChange("expiredDate", date)}
              dateFormat="yyyy-MM-dd"
              placeholderText="Select date"
              className="w-full border px-3 py-2 rounded-md mt-1"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg cursor-pointer"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => navigate("/purchaselayout/purchase")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddNewPurchase;
