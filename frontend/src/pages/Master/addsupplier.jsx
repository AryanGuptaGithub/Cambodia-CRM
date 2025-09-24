import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AddSupplier = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    address: "",
    siteRegistrationDate: "",
    siteRegistrationExpiryDate: "",
    enabled: "enabled",
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name) newErrors.name = "Name is required";
    if (!form.address) newErrors.address = "Address is required";
    if (!form.siteRegistrationDate)
      newErrors.siteRegistrationDate = "Registration date is required";
    if (!form.siteRegistrationExpiryDate)
      newErrors.siteRegistrationExpiryDate = "Expiry date is required";
    if (
      form.siteRegistrationDate &&
      form.siteRegistrationExpiryDate &&
      new Date(form.siteRegistrationExpiryDate) <
        new Date(form.siteRegistrationDate)
    ) {
      newErrors.siteRegistrationExpiryDate =
        "Expiry date must be after registration date";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const res = await fetch(`${backendUrl}/api/suppliers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
    
      if (!res.ok) throw new Error(data.message || "Failed to add supplier");
      showToast("success", data.message || "Supplier added");
      navigate("/masterlayout/supplier");
    } catch (err) {
      showToast("error", err.message);
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
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add Supplier</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderInput("Name", "name", "text", "Enter name", true)}
            {renderInput("Address", "address", "text", "Enter address", true)}
            {renderInput(
              "Site Registration Date",
              "siteRegistrationDate",
              "date",
              "",
              true
            )}
            {renderInput(
              "Site Registration Expiry Date",
              "siteRegistrationExpiryDate",
              "date",
              "",
              true
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Status</label>
            <select
              name="enabled"
              value={form.enabled}
              onChange={handleChange}
              className="mt-1 block w-full border rounded-md px-3 py-2"
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
            {errors.enabled && (
              <p className="text-red-500 text-sm mt-1">{errors.enabled}</p>
            )}
          </div>

          <div className="md:col-span-2 flex justify-end gap-4 mt-8">
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow cursor-pointer"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => navigate("/masterlayout/supplier")}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AddSupplier;
