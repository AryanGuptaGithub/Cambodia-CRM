import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";

const backendUrl = process.env.REACT_APP_BACKEND_URL;
const initialFormState = {
  warehouse: "",
  name: "",
  phone: "",
  email: "",
  status: "enabled",
  password: "",
  taxNumber: "",
  openingBalance: "",
  type: "",
  creditPeriod: "",
  creditLimit: "",
  profileImage: null,
};

const AddCustomer = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!form.warehouse) newErrors.warehouse = "Warehouse is required";
    if (!form.name) newErrors.name = "Name is required";

    if (!form.phone) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\d{10}$/.test(form.phone)) {
      newErrors.phone = "Phone must be 10 digits";
    }

    if (!form.email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = "Enter a valid email";
    }

    if (!form.password) newErrors.password = "Password is required";

    if (form.openingBalance < 0)
      newErrors.openingBalance = "Opening balance cannot be negative";

    if (!form.creditLimit || form.creditLimit <= 0)
      newErrors.creditLimit = "Credit limit must be greater than 0";

    if (!form.creditPeriod || form.creditPeriod < 0)
      newErrors.creditPeriod = "Credit period must be positive";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    setForm((prevForm) => ({
      ...prevForm,
      [name]: type === "file" ? files[0] : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch(`${backendUrl}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Something went wrong");
        return;
      }

      showToast("success", data.message || "Customer added successfully");
      navigate("/masterlayout/customer");
    } catch (error) {
      showToast("error", error.message || "Network error");
    }
  };

  const renderInput = (label, name, type = "text", placeholder = "", required = false) => (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full border rounded-md px-3 py-2"
      />
      {errors[name] && (
        <p className="text-red-500 text-sm">{errors[name]}</p>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Customer</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Profile Image Upload */}
          <div className="flex flex-col items-center md:col-span-1">
            <label className="text-sm font-medium text-gray-700 mb-2">Profile Image</label>
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-4xl text-blue-500 cursor-pointer">
              +
            </div>
            <input
              type="file"
              name="profileImage"
              accept="image/*"
              onChange={handleChange}
              className="mt-2 text-sm"
            />
          </div>

          {/* Customer Form */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Warehouse Field with Add button */}
            <div className="col-span-2 flex gap-2 items-end">
              <div className="w-full">
                {renderInput("Warehouse", "warehouse", "text", "Select or enter warehouse")}
              </div>
              <button type="button" className="px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300">+</button>
            </div>

            {renderInput("Name", "name")}
            {renderInput("Phone Number", "phone", "text", "10-digit number")}
            {renderInput("Email", "email", "email")}
            {renderInput("Password", "password", "password")}
            {renderInput("Tax Number", "taxNumber")}
            {renderInput("Opening Balance", "openingBalance", "number")}
            {renderInput("Credit Limit", "creditLimit", "number")}

            {/* Customer Type */}
            <div>
              <label className="text-sm font-medium text-gray-700">Customer Type</label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2 mt-1"
              >
                <option value="receive">Receive</option>
                <option value="pay">Pay</option>
              </select>
            </div>

            {/* Credit Period */}
            <div className="flex items-center gap-2">
              <div className="w-full">
                {renderInput("Credit Period", "creditPeriod", "number", "30")}
              </div>
              <span className="mt-6 text-sm text-gray-500">Days</span>
            </div>

            {/* Status */}
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => navigate("/masterlayout/customer")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCustomer;
