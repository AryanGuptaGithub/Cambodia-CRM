import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AddStaffMember = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    date: "",
    enabled: "enabled",
    _id: null,
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!form.medicalRepName) newErrors.medicalRepName = "Medical rep name is required";
    if (!form.teamName) newErrors.teamName = "Team name is required";
    if (!form.date) newErrors.date = "Date is required";
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

    try {
      const response = await fetch(`${backendUrl}/api/staffs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to add staff member");
      }

      showToast("success", data.message || "Staff member added successfully!");
      navigate("/staffmemberLayout/staffmember");  // <-- absolute path here (fix)
    } catch (error) {
      showToast("error", error.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add Staff Member</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Medical Rep Name */}
        <div>
          <label className="text-sm font-medium text-gray-700">Medical Rep Name</label>
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

        {/* Team Name */}
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

        {/* Date */}
        <div>
          <label className="text-sm font-medium text-gray-700">Join Date</label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={handleChange}
            className="w-full border rounded-md px-3 py-2"
          />
          {errors.date && <p className="text-red-500 text-sm">{errors.date}</p>}
        </div>

        {/* Status */}
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

        {/* Submit and Cancel */}
        <div className="md:col-span-2 flex justify-end gap-4 mt-8">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow cursor-pointer"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => navigate("/staffmemberLayout/staffmember")}  // <-- absolute path fix
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
