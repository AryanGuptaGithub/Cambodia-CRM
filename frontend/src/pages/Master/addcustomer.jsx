import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";

const AddCustomer = () => {
  const backendUrl = "http://localhost:3001";
  const navigate = useNavigate();
  const [form, setForm] = useState({
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
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    let newErrors = {};
    if (!form.warehouse) newErrors.warehouse = "Warehouse is required";
    if (!form.name) newErrors.name = "Name is required";
    if (!form.phone) newErrors.phone = "Phone number is required";
    if (!/^\d{10}$/.test(form.phone))
      newErrors.phone = "Phone must be 10 digits";
    if (!form.email) newErrors.email = "Email is required";
    if (!/\S+@\S+\.\S+/.test(form.email))
      newErrors.email = "Enter a valid email";
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));
  };

  return (
    <div className="max-w-5xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add New Customer
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Profile Image */}
          <div className="flex flex-col items-center justify-start md:col-span-1">
            <label className="text-sm font-medium text-gray-700 mb-2">
              Profile image
            </label>
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

          {/* Form Fields */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Warehouse */}
            <div className="col-span-2 flex gap-2 items-end">
              <div className="w-full">
                <label className="text-sm font-medium text-gray-700">
                  Warehouse
                </label>
                <input
                  type="text"
                  name="warehouse"
                  value={form.warehouse}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="Select or enter warehouse"
                />
                {errors.warehouse && (
                  <p className="text-red-500 text-sm">{errors.warehouse}</p>
                )}
              </div>
              <button
                type="button"
                className="px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                +
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Please enter name"
              />
              {errors.name && (
                <p className="text-red-500 text-sm">{errors.name}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Phone number
              </label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Please enter number"
              />
              {errors.phone && (
                <p className="text-red-500 text-sm">{errors.phone}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Please enter email"
              />
              {errors.email && (
                <p className="text-red-500 text-sm">{errors.email}</p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Status
              </label>
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

            {/* Password */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Please enter password"
              />
              {errors.password && (
                <p className="text-red-500 text-sm">{errors.password}</p>
              )}
            </div>

            {/* Tax Number */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Tax Number
              </label>
              <input
                type="text"
                name="taxNumber"
                value={form.taxNumber}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
                placeholder="Please enter tax number"
              />
            </div>

            {/* Opening Balance */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Opening Balance
              </label>
              <input
                type="number"
                name="openingBalance"
                value={form.openingBalance}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
                placeholder="$ 0"
              />
              {errors.openingBalance && (
                <p className="text-red-500 text-sm">{errors.openingBalance}</p>
              )}
            </div>

            {/* Receive / Pay */}
            <div>
              <label
                htmlFor="type"
                className="text-sm font-medium text-gray-700"
              >
                Customer Type
              </label>
              <select
                id="type"
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2 mt-1"
                required
              >
                <option value="">-- Select Type --</option>{" "}
                {/* Optional default */}
                <option value="receive">Receive</option>
                <option value="pay">Pay</option>
              </select>
            </div>

            {/* Credit Period */}
            <div className="flex items-center gap-2">
              <div className="w-full">
                <label className="text-sm font-medium text-gray-700">
                  Credit Period
                </label>
                <input
                  type="number"
                  name="creditPeriod"
                  value={form.creditPeriod}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="$ 30"
                />
                {errors.creditPeriod && (
                  <p className="text-red-500 text-sm">{errors.creditPeriod}</p>
                )}
              </div>
              <span className="mt-6 text-sm text-gray-500">Days</span>
            </div>

            {/* Credit Limit */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Credit Limit
              </label>
              <input
                type="number"
                name="creditLimit"
                value={form.creditLimit}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2"
                placeholder="$ 0"
              />
              {errors.creditLimit && (
                <p className="text-red-500 text-sm">{errors.creditLimit}</p>
              )}
            </div>
          </div>
        </div>

        {/* Buttons */}
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
