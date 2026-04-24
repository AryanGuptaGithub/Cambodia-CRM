import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AddStaffMember = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    contactNo: "",
    email: "",
    password: "",
    date: "",
    enabled: "enabled",
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!form.medicalRepName)
      newErrors.medicalRepName = "Medical rep name is required";
    if (!form.teamName) newErrors.teamName = "Team name is required";
    if (!form.contactNo) newErrors.contactNo = "Contact number is required";
    else if (!/^[0-9]{10,15}$/.test(form.contactNo))
      newErrors.contactNo = "Enter a valid contact number (10–15 digits)";
    if (!form.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email))
      newErrors.email = "Enter a valid email address";
    if (!form.password) newErrors.password = "Password is required";
    else if (form.password.length < 6)
      newErrors.password = "Password must be at least 6 characters";
    if (!form.date) newErrors.date = "Joining date is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);

    try {
      // Get token from localStorage (or wherever you store it)
      const token = localStorage.getItem("token"); // Adjust based on where you store token

      if (!token) {
        throw new Error("No authentication token found. Please login again.");
      }

      const response = await fetch(`${backendUrl}/api/staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // Add authorization header
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      // Handle unauthorized specifically
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login with admin credentials.");
      }

      if (response.status === 403) {
        throw new Error("Access denied. Admin privileges required.");
      }

      if (!response.ok)
        throw new Error(data.message || "Failed to add staff member");

      showToast("success", data.message || "Staff member added successfully!");
      navigate("/hrmlayout/dashboard");
    } catch (error) {
      console.error("Error adding staff:", error);
      showToast("error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add Staff Member
      </h2>
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <div>
          <label className="text-sm font-medium text-gray-700">
            Medical Rep Name
          </label>
          <input
            type="text"
            name="medicalRepName"
            value={form.medicalRepName}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
            placeholder="Enter medical representative name"
          />
          {errors.medicalRepName && (
            <p className="text-red-500 text-sm">{errors.medicalRepName}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Team Name</label>
          <input
            type="text"
            name="teamName"
            value={form.teamName}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
            placeholder="Enter team name"
          />
          {errors.teamName && (
            <p className="text-red-500 text-sm">{errors.teamName}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">
            Contact Number
          </label>
          <input
            type="text"
            name="contactNo"
            value={form.contactNo}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
            placeholder="Enter contact number"
          />
          {errors.contactNo && (
            <p className="text-red-500 text-sm">{errors.contactNo}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
            placeholder="Enter email address"
          />
          {errors.email && (
            <p className="text-red-500 text-sm">{errors.email}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
            placeholder="Enter password"
          />
          {errors.password && (
            <p className="text-red-500 text-sm">{errors.password}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">
            Joining Date
          </label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
          />
          {errors.date && <p className="text-red-500 text-sm">{errors.date}</p>}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select
            name="enabled"
            value={form.enabled}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div className="md:col-span-2 flex justify-end gap-4 mt-8">
          <button
            type="submit"
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Adding..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/hrmlayout/dashboard")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddStaffMember;
