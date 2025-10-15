// components/Expenses.jsx
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Plus, Edit, Trash2, Loader, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { confirmDialog } from "../../utils/confirmationDialog.js";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const expensesAPI = {
  fetchExpenses: async () => {
    const resp = await axios.get(`${backendUrl}/api/expenses`);
    return resp.data;
  },
  fetchExpenseCategories: async () => {
    const resp = await axios.get(`${backendUrl}/api/expense-categary`);
    return resp.data;
  },
  fetchSourceAccounts: async () => {
    const resp = await axios.get(`${backendUrl}/api/accounts/destinations`);
    return resp.data;
  },
  deleteExpense: async (id) => {
    const resp = await axios.delete(`${backendUrl}/api/expenses/${id}`);
    return resp.data;
  },
  updateExpense: async (id, data) => {
    const resp = await axios.put(`${backendUrl}/api/expenses/${id}`, data);
    return resp.data;
  },
};

const Expenses = () => {
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [sourceAccounts, setSourceAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editForm, setEditForm] = useState({
    sourceAccount: "",
    category: "",
    description: "",
    amount: "",
    date: "",
  });
  const [updateLoading, setUpdateLoading] = useState(false);

  const inputRef = useRef(null);
  const expensesPerPage = 10;

  // For checkbox selection
  const [selectedRows, setSelectedRows] = useState([]);

  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [expensesResp, categoriesResp, accountsResp] = await Promise.all([
        expensesAPI.fetchExpenses(),
        expensesAPI.fetchExpenseCategories(),
        expensesAPI.fetchSourceAccounts(),
      ]);

      if (expensesResp.success) {
        setExpenses(expensesResp.data);
      } else {
        throw new Error(expensesResp.message || "Failed to fetch expenses");
      }

      if (categoriesResp.success) {
        setExpenseCategories(categoriesResp.data);
      }

      if (accountsResp.success) {
        setSourceAccounts(accountsResp.data);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.message || "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get category name from categories list
  const getCategoryName = useCallback(
    (categoryId) => {
      const cat = expenseCategories.find((c) => c._id === categoryId);
      return cat ? cat.category : "Unknown";
    },
    [expenseCategories]
  );

  // Search filter
  const filteredExpenses = useMemo(() => {
    if (!searchQuery) return expenses;

    const lower = searchQuery.toLowerCase();
    return expenses.filter((exp) => {
      const catName = exp.category?.category ?? getCategoryName(exp.category);
      const sourceName = exp.sourceAccount?.name ?? "";
      const desc = exp.description ?? "";
      const dt = formatDateToReadable(exp.date).toLowerCase();

      return (
        catName.toLowerCase().includes(lower) ||
        sourceName.toLowerCase().includes(lower) ||
        desc.toLowerCase().includes(lower) ||
        dt.includes(lower)
      );
    });
  }, [expenses, searchQuery, getCategoryName]);

  // Pagination indices
  const indexOfLastExpense = currentPage * expensesPerPage;
  const indexOfFirstExpense = indexOfLastExpense - expensesPerPage;
  const currentExpenses = filteredExpenses.slice(
    indexOfFirstExpense,
    indexOfLastExpense
  );
  const totalPages = Math.ceil(filteredExpenses.length / expensesPerPage);

  const totalAmountOnPage = currentExpenses.reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  );

  // Checkbox handlers
  const handleSelectRow = useCallback(
    (id) => {
      setSelectedRows((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    },
    [setSelectedRows]
  );

  const handleSelectAll = useCallback(() => {
    if (selectedRows.length === currentExpenses.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(currentExpenses.map((e) => e._id));
    }
  }, [currentExpenses, selectedRows]);

  const handleDelete = useCallback(
    async (id) => {
      const exp = expenses.find((e) => e._id === id);
      if (!exp) return;

      const sourceName = exp.sourceAccount?.name || "Unknown Account";

      const result = await confirmDialog({
        title: "Delete Expense",
        text: `Are you sure you want to delete this expense <b>${exp.category.category}</b> for <b>$${exp.amount}</b> from <b>${sourceName}</b>?`,
        icon: "warning",
        confirmButtonText: "Yes, delete",
        cancelButtonText: "Cancel",
      });

      if (result.isConfirmed) {
        try {
          setLoading(true);
          const delRes = await expensesAPI.deleteExpense(id);
          if (delRes.success) {
            showToast(
              "success",
              `Deleted expense <b>${exp.category.category}</b> of <b>$${exp.amount}</b> from <b>${sourceName}</b> successfully`
            );
            setExpenses((prev) => prev.filter((e) => e._id !== id));
          } else {
            throw new Error(delRes.message || "Delete failed");
          }
        } catch (err) {
          console.error("Delete error:", err);
          showToast("error", `Failed: ${err.message}`);
        } finally {
          setLoading(false);
        }
      }
    },
    [expenses]
  );

  const handleEdit = useCallback((exp) => {
    setEditingExpense(exp);
    setEditForm({
      sourceAccount: exp.sourceAccount?._id || "",
      category: exp.category?._id || "",
      description: exp.description || "",
      amount: exp.amount || "",
      date: exp.date ? new Date(exp.date).toISOString().split('T')[0] : "",
    });
    setIsEditModalOpen(true);
  }, []);

  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    if (!editingExpense) return;

    try {
      setUpdateLoading(true);
      const updateRes = await expensesAPI.updateExpense(editingExpense._id, editForm);
      
      if (updateRes.success) {
        showToast("success", "Expense updated successfully");
        setIsEditModalOpen(false);
        setEditingExpense(null);
        fetchData(); // Refresh the data
      } else {
        throw new Error(updateRes.message || "Update failed");
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast("error", `Failed to update expense: ${err.message}`);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }, []);

  const formatCurrency = useCallback((amt) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amt);
  }, []);

  // Generate visible page numbers (e.g. for pagination)
  const visiblePages = useMemo(() => {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }, [totalPages]);

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
      <div className="flex justify-between items-center mb-6">
        {/* Left side - Add New Expense button */}
        <div className="flex items-center">
          <button
            onClick={() => navigate("/expenselayout/expenses/new")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
          >
            <Plus size={18} /> Add New Expense
          </button>
        </div>

        {/* Right side - Search Box */}
        <div className="flex items-center gap-4">
          <div className="relative w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by Source Account, Expense Category, or description..."
              className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-xl overflow-hidden w-full">
        <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                <div className="flex items-center gap-4">
                  {currentExpenses.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        selectedRows.length === currentExpenses.length &&
                        currentExpenses.length > 0
                      }
                      onChange={handleSelectAll}
                    />
                  )}
                  <span>Sr</span>
                </div>
              </th>
              <th className="p-3 min-w-[150px] text-sm font-medium">Source Account</th>
              <th className="p-3 min-w-[180px] text-sm font-medium">Expense Category</th>
              <th className="p-3 min-w-[200px] text-sm font-medium">Description</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Amount ($)</th>
              <th className="p-3 min-w-[150px] text-sm font-medium">Date</th>
              <th className="p-3 min-w-[150px] text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentExpenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  {searchQuery
                    ? "No matching expenses found."
                    : "No data available"}
                </td>
              </tr>
            ) : (
              currentExpenses.map((exp, idx) => (
                <tr
                  key={exp._id}
                  className={`hover:bg-gray-50 ${
                    (idx + 1) % expensesPerPage === 0 ||
                    idx + 1 === currentExpenses.length
                      ? ""
                      : "border-b"
                  }`}
                >
                  <td className="p-3 min-w-[120px]">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(exp._id)}
                        onChange={() => handleSelectRow(exp._id)}
                      />
                      <span>
                        {(currentPage - 1) * expensesPerPage + idx + 1}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 capitalize">
                    {exp.sourceAccount?.name ?? "N/A"}
                  </td>
                  <td className="p-3">{exp.category?.category ?? "N/A"}</td>
                  <td className="p-3">{exp.description}</td>
                  <td className="p-3 font-semibold">
                    {formatCurrency(exp.amount)}
                  </td>
                  <td className="p-3">{formatDateToReadable(exp.date)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => handleEdit(exp)}
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={() => handleDelete(exp._id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex justify-start gap-2 text-sm">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Prev
        </button>
        <div className="flex gap-1">
          {visiblePages.map((pg) => (
            <button
              key={pg}
              onClick={() => setCurrentPage(pg)}
              className={`px-3 py-2 rounded-lg min-w-[40px] cursor-pointer ${
                currentPage === pg
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {pg}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>

      {expenses.length > 0 && (
        <div className="mt-6 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-4 text-lg">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {filteredExpenses.length}
              </div>
              <div className="text-sm text-blue-800">Total Expenses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${" "}
                {formatCurrency(
                  filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
                )}
              </div>
              <div className="text-sm text-green-800">Total Amount</div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Expense
              </h2>

              <form onSubmit={handleUpdateExpense} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Source Account */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Account
                  </label>
                  <select
                    value={editForm.sourceAccount}
                    onChange={(e) => setEditForm({ ...editForm, sourceAccount: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    required
                  >
                    <option value="">Select Source Account</option>
                    {sourceAccounts.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Expense Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expense Category
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    required
                  >
                    <option value="">Select Category</option>
                    {expenseCategories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    required
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    required
                  />
                </div>

                {/* Description - Full width */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    placeholder="Enter expense description..."
                  />
                </div>
              </form>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  disabled={updateLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateExpense}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer flex items-center gap-2"
                  disabled={updateLoading}
                >
                  {updateLoading ? <Loader className="animate-spin" size={16} /> : null}
                  {updateLoading ? "Updating..." : "Update Expense"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Expenses;