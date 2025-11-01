import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AddSupplier = () => {
  const navigate = useNavigate();

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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

    // Validation for registration date (❌ future date not allowed)
    if (name === "siteRegistrationDate" && value) {
      const selectedDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate > today) {
        setErrors((prev) => ({
          ...prev,
          [name]: "Future dates are not allowed for registration date",
        }));
        return;
      }
    }

    // ✅ Expiry date can be future, so no check here

    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const newErrors = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!form.name) newErrors.name = "Name is required";
    if (!form.address) newErrors.address = "Address is required";

    // Site Registration Date validation
    if (!form.siteRegistrationDate) {
      newErrors.siteRegistrationDate = "Registration date is required";
    } else {
      const registrationDate = new Date(form.siteRegistrationDate);
      if (registrationDate > today) {
        newErrors.siteRegistrationDate =
          "Future dates are not allowed for registration date";
      }
    }

    // ✅ Site Registration Expiry Date validation (future date allowed)
    if (!form.siteRegistrationExpiryDate) {
      newErrors.siteRegistrationExpiryDate = "Expiry date is required";
    } else if (
      form.siteRegistrationDate &&
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
      showToast("success", data.message || "Supplier added successfully");
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
    disabled = false,
    max = ""
  ) => (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          errors[name] ? "border-red-500" : "border-gray-300"
        }`}
        disabled={disabled}
        autoComplete="off"
        max={name === "siteRegistrationDate" ? getTodayDate() : undefined} // ✅ Only restrict registration date
      />
      {errors[name] && (
        <p className="text-red-500 text-sm mt-1">{errors[name]}</p>
      )}
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

            {/* Registration date - cannot be future */}
            {renderInput(
              "Site Registration Date",
              "siteRegistrationDate",
              "date",
              "",
              true
            )}

            {/* Expiry date - ✅ can be in the future */}
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
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow cursor-pointer transition-colors"
            >
              Add Supplier
            </button>
            <button
              type="button"
              onClick={() => navigate("/masterlayout/supplier")}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer transition-colors"
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
