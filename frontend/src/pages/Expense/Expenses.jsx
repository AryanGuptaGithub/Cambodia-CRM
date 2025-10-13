// components/Expenses.jsx
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, Edit, Trash2, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { confirmDialog } from "../../utils/confirmationDialog.js";
import { showToast } from "../../utils/toast";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// API service functions
const expensesAPI = {
  // Fetch all expenses
  fetchExpenses: async () => {
    const response = await fetch(`${backendUrl}/api/expenses`);
    if (!response.ok) {
      throw new Error("Failed to fetch expenses");
    }
    return response.json();
  },

  // Fetch expense categories
  fetchExpenseCategories: async () => {
    const response = await fetch(`${backendUrl}/api/expense-categary`);
    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }
    return response.json();
  },

  // Delete expense
  deleteExpense: async (id) => {
    const response = await fetch(`${backendUrl}/api/expenses/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Failed to delete expense");
    }
    return response.json();
  },
};

const Expenses = () => {
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const expensesPerPage = 10;

  const navigate = useNavigate();

  // Fetch expenses and categories on component mount
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [expensesResult, categoriesResult] = await Promise.all([
        expensesAPI.fetchExpenses(),
        expensesAPI.fetchExpenseCategories(),
      ]);

      if (expensesResult.success) {
        setExpenses(expensesResult.data);
      } else {
        throw new Error(expensesResult.message || "Failed to fetch expenses");
      }

      if (categoriesResult.success) {
        setExpenseCategories(categoriesResult.data);
      }
    } catch (err) {
      setError(err.message);
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get category name by ID
  const getCategoryName = useCallback(
    (categoryId) => {
      const category = expenseCategories.find((cat) => cat._id === categoryId);
      return category ? category.category : "Unknown Category";
    },
    [expenseCategories]
  );

  // Filter expenses based on search query
  const filteredExpenses = useMemo(() => {
    if (!searchQuery) return expenses;

    const searchLower = searchQuery.toLowerCase();
    return expenses.filter(
      (exp) =>
        getCategoryName(exp.expenseCategory)
          .toLowerCase()
          .includes(searchLower) ||
        exp.sourceAccount.toLowerCase().includes(searchLower) ||
        exp.description.toLowerCase().includes(searchLower) ||
        exp.date.includes(searchQuery)
    );
  }, [expenses, searchQuery, getCategoryName]);

  // Pagination
  const indexOfLastExpense = currentPage * expensesPerPage;
  const indexOfFirstExpense = indexOfLastExpense - expensesPerPage;
  const currentExpenses = filteredExpenses.slice(
    indexOfFirstExpense,
    indexOfLastExpense
  );

  const totalPages = Math.ceil(filteredExpenses.length / expensesPerPage);

  // Total of current page
  const totalAmount = currentExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  // Handle delete expense
  const handleDelete = useCallback(
    async (id) => {
      const expenseToDelete = expenses.find((exp) => exp._id === id);
      if (!expenseToDelete) return;

      const confirmDelete = await confirmDialog({
        title: "Delete Expense",
        text: `Are you sure you want to delete this expense of $${expenseToDelete.amount}?`,
        icon: "warning",
        confirmButtonText: "Yes, delete",
        cancelButtonText: "Cancel",
      });

      if (confirmDelete.isConfirmed) {
        try {
          setLoading(true);
          const result = await expensesAPI.deleteExpense(id);

          if (result.success) {
            showToast("success", "Expense deleted successfully");
            setExpenses((prev) => prev.filter((exp) => exp._id !== id));
            // Refresh data to ensure consistency
            fetchData();
          } else {
            throw new Error(result.message || "Failed to delete expense");
          }
        } catch (err) {
          setError(err.message);
          console.error("Error deleting expense:", err);
          showToast("error", `Failed to delete expense: ${err.message}`);
        } finally {
          setLoading(false);
        }
      }
    },
    [expenses, fetchData]
  );

  // Handle edit expense
  const handleEdit = useCallback(
    (id) => {
      navigate(`/expenselayout/expenses/edit/${id}`);
    },
    [navigate]
  );

  // Handle search change
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  // Format currency
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, []);

  if (loading && expenses.length === 0) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Loader className="animate-spin text-indigo-600" size={32} />
        <span className="ml-2 text-gray-600">Loading expenses...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <strong>Error:</strong> {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => navigate("/expenselayout/expenses/new")}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
        >
          <Plus size={18} /> Add New Expense
        </button>

        <input
          type="text"
          placeholder="Search by category, account, or description..."
          className="w-72 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-2xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left w-16">Sr</th>
              <th className="px-4 py-3 text-left">Source Account</th>
              <th className="px-4 py-3 text-left">Expense Category</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Amount ($)</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentExpenses.map((exp, index) => (
              <tr key={exp._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {(currentPage - 1) * expensesPerPage + index + 1}
                </td>
                <td className="px-4 py-3 capitalize">
                  {exp.sourceAccount}
                  {console.log(exp)}
                </td>
                <td className="px-4 py-3">
                  {getCategoryName(exp.expenseCategory)}
                </td>
                <td className="px-4 py-3">{exp.description}</td>
                <td className="px-4 py-3 font-semibold">
                  ${formatCurrency(exp.amount)}
                </td>
                <td className="px-4 py-3">
                  {new Date(exp.date).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 flex gap-2">
                  <button
                    onClick={() => handleEdit(exp._id)}
                    className="p-2 text-green-600 hover:bg-green-100 rounded-lg"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(exp._id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}

            {/* Total Row */}
            {currentExpenses.length > 0 && (
              <tr className="bg-gray-100 font-semibold">
                <td className="px-4 py-3 text-right" colSpan={4}>
                  Page Total
                </td>
                <td className="px-4 py-3">${formatCurrency(totalAmount)}</td>
                <td className="px-4 py-3" colSpan={2}></td>
              </tr>
            )}

            {currentExpenses.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                  {searchQuery
                    ? "No matching expenses found."
                    : "No expenses added yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className={`px-3 py-1 rounded-lg ${
              currentPage === 1
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            Prev
          </button>

          {[...Array(totalPages)].map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPage(idx + 1)}
              className={`px-3 py-1 rounded-lg ${
                currentPage === idx + 1
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {idx + 1}
            </button>
          ))}

          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className={`px-3 py-1 rounded-lg ${
              currentPage === totalPages
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            Next
          </button>
        </div>
      )}

      {/* Summary */}
      {expenses.length > 0 && (
        <div className="mt-6 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-4 text-lg">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {expenses.length}
              </div>
              <div className="text-sm text-blue-800">Total Expenses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                $
                {formatCurrency(
                  expenses.reduce((sum, exp) => sum + exp.amount, 0)
                )}
              </div>
              <div className="text-sm text-green-800">Total Amount</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
