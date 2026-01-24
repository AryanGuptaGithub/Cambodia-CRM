import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const SalaryHistory = () => {
  const { employeeId } = useParams();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employeeName, setEmployeeName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSalary, setNewSalary] = useState({
    basicSalary: "",
    effectiveFrom: "",
    remarks: ""
  });

  useEffect(() => {
    fetchSalaryHistory();
  }, [employeeId]);

  const fetchSalaryHistory = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/mr-basic-payrolls/${employeeId}/history`);
      
      if (response.data.success) {
        setHistory(response.data.data.salaryHistory);
        setEmployeeName(response.data.data.employeeName);
      }
    } catch (error) {
      console.error("Error fetching salary history:", error);
      toast.error("Failed to load salary history");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSalary = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        `${backendUrl}/api/mr-basic-payrolls/${employeeId}/salary`,
        newSalary
      );
      
      if (response.data.success) {
        toast.success("New salary entry added successfully");
        setShowAddForm(false);
        setNewSalary({ basicSalary: "", effectiveFrom: "", remarks: "" });
        fetchSalaryHistory();
      }
    } catch (error) {
      console.error("Error adding salary:", error);
      toast.error(error.response?.data?.message || "Failed to add salary");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Present";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return <div className="text-center py-8">Loading salary history...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            Salary History - {employeeName}
          </h2>
          <p className="text-gray-600 mt-1">
            Track all basic salary changes for this employee
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
        >
          Add New Salary
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Add New Salary Entry</h3>
          <form onSubmit={handleAddSalary} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Basic Salary ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newSalary.basicSalary}
                  onChange={(e) => setNewSalary({...newSalary, basicSalary: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Effective From
                </label>
                <input
                  type="date"
                  value={newSalary.effectiveFrom}
                  onChange={(e) => setNewSalary({...newSalary, effectiveFrom: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Remarks
                </label>
                <input
                  type="text"
                  value={newSalary.remarks}
                  onChange={(e) => setNewSalary({...newSalary, remarks: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Optional remarks"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                Save Salary Entry
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Effective Period
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Basic Salary
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Remarks
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {history.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                  No salary history found
                </td>
              </tr>
            ) : (
              history.map((entry, index) => (
                <tr key={entry._id || index} className={!entry.effectiveUntil ? "bg-green-50" : ""}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(entry.effectiveFrom)} - {formatDate(entry.effectiveUntil)}
                    {!entry.effectiveUntil && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${entry.basicSalary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entry.remarks || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-700 mb-2">How Salary History Works:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Each salary entry has an effective date range</li>
          <li>• The system automatically uses the correct salary based on the payroll period</li>
          <li>• When adding a new salary, the previous salary's effective period is closed</li>
          <li>• The current active salary is highlighted in green</li>
        </ul>
      </div>
    </div>
  );
};

export default SalaryHistory;