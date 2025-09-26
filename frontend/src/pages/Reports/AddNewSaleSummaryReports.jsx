// src/pages/AddSaleSummaryReports.jsx

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  date: "", // ✅ Fixed: Added date field
  productName: "",
  salesQuantity: 0,
  bonusQuantity: 0,
  totalQty: 0,
  amount: 0,
};

const AddDailySummaryReports = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  const [productOptions, setProductOptions] = useState([]);

  // Fetch product names
  useEffect(() => {
    const fetchProductNames = async () => {
      try {
        const resp = await axios.get(
          `${backendUrl}/api/dailysummary/unique-names`
        );
        setProductOptions(resp.data.productNames || []);
      } catch (err) {
        showToast("error", "Failed to load product names");
      }
    };
    fetchProductNames();
  }, []);

  // Form validation
  const validate = () => {
    const newErrors = {};
    if (!form.date) newErrors.date = "Date is required";
    if (!form.productName) newErrors.productName = "Product Name is required";

    const numericFields = [
      { key: "salesQuantity", label: "Sales Quantity" },
      { key: "bonusQuantity", label: "Bonus Quantity" },
      { key: "totalQty", label: "Total Quantity" },
      { key: "amount", label: "Amount" },
    ];

    numericFields.forEach(({ key, label }) => {
      if (form[key] < 0) {
        newErrors[key] = `${label} must be 0 or more`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Input handler
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const resp = await fetch(`${backendUrl}/api/dailysummary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await resp.json();

      if (!resp.ok) {
        showToast("error", data.message || "Something went wrong");
        return;
      }

      showToast(
        "success",
        `Daily sample report <b>${form.productName}</b> added successfully`
      );
      navigate("/reportlayout/salesummary");
    } catch (err) {
      showToast("error", err.message || "Network error");
    }
  };

  const renderInput = (
    label,
    name,
    type = "text",
    placeholder = "",
    disabled = false
  ) => (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full border rounded-md px-3 py-2"
        disabled={disabled}
        min={type === "number" ? 0 : undefined}
      />
      {errors[name] && <p className="text-red-500 text-sm">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add Daily Sample Report
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderInput("Date", "date", "date")}

          {/* Product dropdown */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Product Name
            </label>
            <select
              name="productName"
              value={form.productName}
              onChange={handleChange}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="">-- Select Product --</option>
              {productOptions.map((name, idx) => (
                <option key={idx} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {errors.productName && (
              <p className="text-red-500 text-sm">{errors.productName}</p>
            )}
          </div>

          {renderInput("Sales Quantity", "salesQuantity", "number")}
          {renderInput("Bonus Quantity", "bonusQuantity", "number")}
          {renderInput("Total Quantity", "totalQty", "number")}
          {renderInput("Amount", "amount", "number")}
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
            onClick={() => navigate("/reportlayout/salesummary")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddDailySummaryReports;
