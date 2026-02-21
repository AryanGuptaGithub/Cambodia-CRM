import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AddSupplier = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    address: "",
    siteRegistrationDate: null,
    siteRegistrationExpiryDate: null,
    enabled: true,
  });

  const [errors, setErrors] = useState({});

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* ===================== DATE FORMATTER (IMPORTANT FIX) ===================== */
  const formatDateOnly = (date) => {
    if (!date) return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`; // YYYY-MM-DD
  };

  /* ===================== VALIDATION ===================== */
  const validate = () => {
    const newErrors = {};

    if (!form.name?.trim()) newErrors.name = "Name is required";
    if (!form.address?.trim()) newErrors.address = "Address is required";

    if (!form.siteRegistrationDate) {
      newErrors.siteRegistrationDate = "Registration date is required";
    } else {
      const regDate = new Date(form.siteRegistrationDate);
      regDate.setHours(0, 0, 0, 0);
      if (regDate.getTime() > today.getTime()) {
        newErrors.siteRegistrationDate =
          "Future dates are not allowed for registration date";
      }
    }

    if (!form.siteRegistrationExpiryDate) {
      newErrors.siteRegistrationExpiryDate = "Expiry date is required";
    } else if (
      form.siteRegistrationDate &&
      new Date(form.siteRegistrationExpiryDate) <=
        new Date(form.siteRegistrationDate)
    ) {
      newErrors.siteRegistrationExpiryDate =
        "Expiry date must be after registration date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /* ===================== SUBMIT ===================== */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const payload = {
        name: form.name.trim().toLowerCase(),
        address: form.address.trim().toLowerCase(),
        siteRegistrationDate: formatDateOnly(form.siteRegistrationDate),
        siteRegistrationExpiryDate: formatDateOnly(
          form.siteRegistrationExpiryDate
        ),
        enabled: form.enabled,
      };

      const res = await axios.post(`${backendUrl}/api/suppliers`, payload);

      showToast("success", res.data.message || "Supplier added successfully");
      navigate("/masterlayout/supplier");
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || err.message || "Failed to add supplier"
      );
    }
  };

  /* ===================== UI ===================== */
  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add Supplier</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, name: e.target.value }));
                setErrors((prev) => ({ ...prev, name: "" }));
              }}
              className={`mt-1 w-full border rounded-md px-3 py-2 ${
                errors.name ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, address: e.target.value }));
                setErrors((prev) => ({ ...prev, address: "" }));
              }}
              className={`mt-1 w-full border rounded-md px-3 py-2 ${
                errors.address ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.address && (
              <p className="text-red-500 text-sm mt-1">{errors.address}</p>
            )}
          </div>

          {/* Registration Date */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Site Registration Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              selected={form.siteRegistrationDate}
              onChange={(date) => {
                setForm((prev) => ({ ...prev, siteRegistrationDate: date }));
                setErrors((prev) => ({ ...prev, siteRegistrationDate: "" }));
              }}
              maxDate={today}
              dateFormat="yyyy-MM-dd"
              className={`mt-1 w-full border rounded-md px-3 py-2 ${
                errors.siteRegistrationDate
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              showYearDropdown
              showMonthDropdown
              dropdownMode="select"
            />
            {errors.siteRegistrationDate && (
              <p className="text-red-500 text-sm mt-1">
                {errors.siteRegistrationDate}
              </p>
            )}
          </div>

          {/* Expiry Date */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Site Registration Expiry Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              selected={form.siteRegistrationExpiryDate}
              onChange={(date) => {
                setForm((prev) => ({
                  ...prev,
                  siteRegistrationExpiryDate: date,
                }));
                setErrors((prev) => ({
                  ...prev,
                  siteRegistrationExpiryDate: "",
                }));
              }}
              minDate={
                form.siteRegistrationDate
                  ? new Date(
                      form.siteRegistrationDate.getTime() + 86400000
                    )
                  : null
              }
              dateFormat="yyyy-MM-dd"
              className={`mt-1 w-full border rounded-md px-3 py-2 ${
                errors.siteRegistrationExpiryDate
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              showYearDropdown
              showMonthDropdown
              dropdownMode="select"
            />
            {errors.siteRegistrationExpiryDate && (
              <p className="text-red-500 text-sm mt-1">
                {errors.siteRegistrationExpiryDate}
              </p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium text-gray-700">Status</label>
            <select
              value={form.enabled}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  enabled: e.target.value === "true",
                }))
              }
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="md:col-span-2 flex justify-end gap-4 mt-4">
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"
            >
              Add Supplier
            </button>
            <button
              type="button"
              onClick={() => navigate("/masterlayout/supplier")}
              className="bg-gray-300 hover:bg-gray-400 px-6 py-2 rounded-lg"
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