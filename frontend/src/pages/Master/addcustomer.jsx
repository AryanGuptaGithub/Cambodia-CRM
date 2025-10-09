import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  customerCode: "",
  date: "",
  medicalRepName: "",
  name: "",
  typeOfBusiness: "",
  customerNumber: "",
  address: "",
  zone: "",
  location: "",
  remark: "",
};

const AddCustomer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerCode } = location.state || {};

  const [form, setForm] = useState({
    ...initialFormState,
    customerCode: customerCode || "", // Set the customerCode if passed
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!form.date) newErrors.date = "Date is required";
    if (!form.medicalRepName)
      newErrors.medicalRepName = "Medical Representative Name is required";
    if (!form.name) newErrors.name = "Customer Name is required";
    if (!form.typeOfBusiness)
      newErrors.typeOfBusiness = "Type of Business is required";
    if (!form.customerNumber)
      newErrors.customerNumber = "Customer Number is required";
    if (!form.address) newErrors.address = "Customer Address is required";
    if (!form.zone) newErrors.zone = "Zone is required";
    if (!form.location) newErrors.location = "Location is required";

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
        autoComplete="off"
      />
      {errors[name] && <p className="text-red-500 text-sm">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add New Customer
      </h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderInput("Customer Code", "customerCode", "text", "", false, true)}
            {renderInput("Date", "date", "date")}
            {renderInput("Medical Representative Name", "medicalRepName")}
            {renderInput("Customer Name in English", "name")}
            {renderInput("Types of Business", "typeOfBusiness")}
            {renderInput("Customer Number", "customerNumber")}
            {renderInput("Customer Address", "address")}
            {renderInput("Zone", "zone")}
            {renderInput("Location", "location")}
            {renderInput("Remark", "remark")}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow"
          >
            Add
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
