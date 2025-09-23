import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  requestNumber: "",
  date: "",
  mrName: "",
  description: "",
  productName: "",
  qtyBigBox: 0,
  qtySmallBox: 0,
  totalQty: 0,
  qtyPerBox: 0,
  remark: "",
};

const AddDailySampleReport = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!form.requestNumber) newErrors.requestNumber = "Request Number is required";
    if (!form.date) newErrors.date = "Date is required";
    if (!form.mrName) newErrors.mrName = "MR Name is required";
    if (!form.productName) newErrors.productName = "Product Name is required";
    if (form.qtyBigBox < 0) newErrors.qtyBigBox = "Quantity must be 0 or more";
    if (form.qtySmallBox < 0) newErrors.qtySmallBox = "Quantity must be 0 or more";
    if (form.totalQty < 0) newErrors.totalQty = "Total Quantity must be 0 or more";
    if (form.qtyPerBox < 0) newErrors.qtyPerBox = "Qty per Box must be 0 or more";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm((prevForm) => ({
      ...prevForm,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch(`${backendUrl}/api/dailysample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Something went wrong");
        return;
      }

      showToast("success", data.message || "Daily sample report added successfully");
      navigate("/masterlayout/dailysample"); // Change route if needed
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
      />
      {errors[name] && <p className="text-red-500 text-sm">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add Daily Sample Report
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderInput("Request Number", "requestNumber")}
          {renderInput("Date", "date", "date")}
          {renderInput("MR Name", "mrName")}
          {renderInput("Description", "description")}
          {renderInput("Product Name", "productName")}
          {renderInput("Quantity (Big Box)", "qtyBigBox", "number")}
          {renderInput("Quantity (Small Box)", "qtySmallBox", "number")}
          {renderInput("Total Quantity", "totalQty", "number")}
          {renderInput("Qty per Box (Strip)", "qtyPerBox", "number")}
          {renderInput("Remark", "remark")}
        </div>

        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => navigate("/masterlayout/dailysample")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddDailySampleReport;
