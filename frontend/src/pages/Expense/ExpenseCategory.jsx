import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Plus, Edit, Trash2, Loader, X, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { confirmDialog } from "../../utils/confirmationDialog.js";
import { showToast } from "../../utils/toast";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const expenseCategoryAPI = {
  fetchExpenseCategories: async () => {
    const response = await fetch(`${backendUrl}/api/expense-categary`);
    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }
    return response.json();
  },

  fetchOriginalCategories: async () => {
    const response = await fetch(
      `${backendUrl}/api/expense-categories-original`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }
    return response.json();
  },

  createExpenseCategory: async (categoryData) => {
    const response = await fetch(`${backendUrl}/api/expense-categary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(categoryData),
    });
    if (!response.ok) {
      throw new Error("Failed to create category");
    }
    return response.json();
  },

  // Update category
  updateExpenseCategory: async (id, categoryData) => {
    const response = await fetch(`${backendUrl}/api/expense-categary/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(categoryData),
    });
    if (!response.ok) {
      throw new Error("Failed to update category");
    }
    return response.json();
  },

  // Delete category
  deleteExpenseCategory: async (id) => {
    const response = await fetch(`${backendUrl}/api/expense-categary/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Failed to delete category");
    }
    return response.json();
  },
};

const ExpenseCategory = () => {
  const [categories, setCategories] = useState([]);
  const [originalCategories, setOriginalCategories] = useState([]); // Store original categories for CRUD
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [form, setForm] = useState({
    category: "",
    description: "",
    amountUntilYear: "",
    amountMonthly: "",
    isActive: true,
  });
  const inputRef = useRef(null);

  const navigate = useNavigate();
  const itemsPerPage = 5;

  // Fetch categories on component mount
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await expenseCategoryAPI.fetchExpenseCategories();

      if (result.success) {
        // Add unique IDs for React keys since the response doesn't have _id
        const categoriesWithIds = result.data.map((cat, index) => ({
          ...cat,
          uniqueId: `cat-${index}-${cat.Category}`, // Create a unique ID for React keys
          // Map the response fields to match your component expectations
          category: cat.Category,
          description: cat.Remarks,
          amountUntilYear: cat["Amount Until Year ($)"],
          amountMonthly: cat["Monthly Amount ($)"],
        }));

        setCategories(categoriesWithIds);

        // If you need the original categories for editing, you might need a separate API call
        // For now, we'll use the same data but you should create a separate endpoint
        setOriginalCategories(categoriesWithIds);
      } else {
        throw new Error(result.message || "Failed to fetch categories");
      }
    } catch (err) {
      setError(err.message);
      console.error("Error fetching categories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Edit category function - UPDATED
  const editCategory = (category) => {
    // Since we don't have the original _id, we use the uniqueId
    setForm({
      category: category.category,
      description: category.description,
      amountUntilYear: category.amountUntilYear || "",
      amountMonthly: category.amountMonthly || "",
      isActive: true, // Default to true since response doesn't have this field
    });
    setEditingId(category.uniqueId);
    setIsEditModalOpen(true);
  };

  // Handle form input changes
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }, []);

  // Handle numeric input changes
  const handleNumericInputChange = useCallback((e, onChangeFunc) => {
    const { name, value } = e.target;
    // Allow only numbers and decimal point
    const numericValue = value.replace(/[^0-9.]/g, "");
    onChangeFunc({
      target: { name, value: numericValue },
    });
  }, []);

  // Handle form submission for update - UPDATED
  const handleUpdateCategory = useCallback(
    async (e) => {
      e.preventDefault();

      try {
        setLoading(true);

        // NOTE: Since your response data doesn't have IDs, you'll need to:
        // 1. Either update using category name (not recommended)
        // 2. Or create a separate endpoint to get original categories with IDs
        // 3. Or modify your backend to return IDs in the expense summary

        // For now, we'll show a message that this needs backend adjustment
        showToast(
          "info",
          "Update functionality requires backend adjustment to include category IDs"
        );
        setIsEditModalOpen(false);

        // Temporary: Just refresh the data
        fetchCategories();
      } catch (err) {
        setError(err.message);
        console.error("Error updating category:", err);
        showToast("error", `Failed to update category: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [form, editingId, fetchCategories]
  );

  // Filter categories based on search (client-side fallback)
  const filteredCategories = useMemo(() => {
    if (!search) return categories;

    const searchLower = search.toLowerCase();
    return categories.filter(
      (cat) =>
        cat.category?.toLowerCase().includes(searchLower) ||
        cat.description?.toLowerCase().includes(searchLower)
    );
  }, [categories, search]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);
  const currentRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCategories.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCategories, currentPage, itemsPerPage]);

  // Totals calculation - UPDATED to use the new field names
  const totals = useMemo(
    () => ({
      totalCategories: categories.length,
      totalYearlyAmount: categories.reduce(
        (sum, cat) => sum + (cat.amountUntilYear || 0),
        0
      ),
      totalMonthlyAmount: categories.reduce(
        (sum, cat) => sum + (cat.amountMonthly || 0),
        0
      ),
    }),
    [categories]
  );

  // Utility function
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat().format(amount);
  }, []);

  // CRUD operations - UPDATED

  const handleEdit = useCallback(
    (uniqueId) => {
      const categoryToEdit = categories.find(
        (cat) => cat.uniqueId === uniqueId
      );
      if (categoryToEdit) {
        editCategory(categoryToEdit);
      }
    },
    [categories]
  );

  const handleDelete = useCallback(
    async (uniqueId) => {
      // Find the category to get its name for the confirmation message
      const categoryToDelete = categories.find(
        (cat) => cat.uniqueId === uniqueId
      );

      if (!categoryToDelete) return;

      const confirmDelete = await confirmDialog({
        title: "Delete Category",
        text: `Are you sure you want to delete <b>${categoryToDelete.category}</b>?`,
        icon: "warning",
        confirmButtonText: "Yes, delete",
        cancelButtonText: "Cancel",
      });

      if (confirmDelete.isConfirmed) {
        try {
          setLoading(true);

          // NOTE: Since your response data doesn't have IDs, you'll need to:
          // 1. Either delete using category name (not recommended)
          // 2. Or create a separate endpoint to get original categories with IDs
          // 3. Or modify your backend to return IDs in the expense summary

          // For now, we'll show a message and just remove from UI
          showToast(
            "info",
            "Delete functionality requires backend adjustment to include category IDs"
          );

          // Temporary: Remove from local state only
          setCategories((prev) =>
            prev.filter((cat) => cat.uniqueId !== uniqueId)
          );

          // Reset to first page if current page becomes empty
          if (currentRows.length === 1 && currentPage > 1) {
            setCurrentPage((prev) => prev - 1);
          }
        } catch (err) {
          setError(err.message);
          console.error("Error deleting category:", err);
          showToast("error", `Failed to delete category: ${err.message}`);
        } finally {
          setLoading(false);
        }
      }
    },
    [categories, currentRows.length, currentPage]
  );

  // Handle search change
  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  if (loading && categories.length === 0) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Loader className="animate-spin text-indigo-600" size={32} />
        <span className="ml-2 text-gray-600">Loading categories...</span>
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
        {/* Left side - Add New Category button */}
        <div className="flex items-center">
          <button
            onClick={() => navigate("/expenselayout/expensecategories/new")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer`}
          >
            {loading ? (
              <Loader className="animate-spin" size={18} />
            ) : (
              <Plus size={18} />
            )}
            Add New Category
          </button>
        </div>

        {categories.length > 0 && (
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
                placeholder="Search categories or descriptions..."
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                value={search}
                onChange={handleSearchChange}
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-xl overflow-hidden w-full">
        <table className="w-full border-collapse table-fixed text-center">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-16 px-4 py-4 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Sr
              </th>
              <th className="w-1/6 px-4 py-4 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Category
              </th>
              <th className="w-2/6 px-4 py-4 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Description
              </th>
              <th className="w-1/6 px-4 py-4 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Amount Until Year ($)
              </th>
              <th className="w-1/6 px-4 py-4 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Monthly Amount ($)
              </th>
              <th className="w-32 px-4 py-4 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentRows.map((cat, index) => (
              <tr
                key={cat.uniqueId}
                className={`hover:bg-gray-50 transition-colors`}
              >
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                  {(currentPage - 1) * itemsPerPage + index + 1}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {cat.category}
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 truncate">
                  {cat.description}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                  {cat.amountUntilYear
                    ? formatCurrency(cat.amountUntilYear)
                    : "NO Expense Added"}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">
                  {cat.amountMonthly
                    ? formatCurrency(cat.amountMonthly)
                    : "NO Expense Added"}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm">
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => handleEdit(cat.uniqueId)}
                      className={`p-1 rounded-lg transition-colors text-green-600 hover:bg-green-100 cursor-pointer`}
                      title="Edit category"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.uniqueId)}
                      className={`p-1 rounded-lg transition-colors text-red-600 hover:bg-red-100 cursor-pointer`}
                      title="Delete category"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {currentRows.length === 0 && !loading && (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  {search
                    ? "No matching categories found."
                    : "No categories added yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {loading && categories.length > 0 && (
          <div className="flex justify-center items-center py-4">
            <Loader className="animate-spin text-indigo-600" size={20} />
            <span className="ml-2 text-gray-600">Updating...</span>
          </div>
        )}
      </div>

      {/* Pagination - Only show when currentRows.length > 0 */}
      {currentRows.length > 0 && (
        <div className="flex justify-start items-center mt-3 gap-2">
          <button
            disabled={currentPage === 1 || loading}
            onClick={() => setCurrentPage((prev) => prev - 1)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              currentPage === 1 || loading
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
            }`}
          >
             ← Prev
          </button>

          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => setCurrentPage(i + 1)}
                disabled={loading}
                className={`px-3 py-2 rounded-lg transition-colors ${
                  currentPage === i + 1
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } ${
                  loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            disabled={currentPage === totalPages || loading}
            onClick={() => setCurrentPage((prev) => prev + 1)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              currentPage === totalPages || loading
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
            }`}
          >
           Next →
          </button>
        </div>
      )}

      {/* Summary - Only show when there are categories */}
      {categories.length > 0 && (
        <div className="mt-6 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-4 text-lg">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {totals.totalCategories}
              </div>
              <div className="text-sm text-blue-800">Total Categories</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${formatCurrency(totals.totalYearlyAmount)}
              </div>
              <div className="text-sm text-green-800">Total Yearly Amount</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                ${formatCurrency(totals.totalMonthlyAmount)}
              </div>
              <div className="text-sm text-purple-800">
                Total Monthly Amount
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
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
                Edit Expense Category
              </h2>

              <form className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh]">
                {/* Category Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Category Name
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Enter category name"
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Enter category description"
                  />
                </div>

                {/* Amount Until Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Amount Until Year ($)
                  </label>
                  <input
                    type="text"
                    name="amountUntilYear"
                    value={form.amountUntilYear}
                    onChange={(e) => handleNumericInputChange(e, handleChange)}
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                {/* Monthly Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Monthly Amount ($)
                  </label>
                  <input
                    type="text"
                    name="amountMonthly"
                    value={form.amountMonthly}
                    onChange={(e) => handleNumericInputChange(e, handleChange)}
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                {/* Active Status */}
                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={form.isActive}
                      onChange={handleChange}
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Active Category
                    </span>
                  </label>
                </div>

                {/* Footer buttons */}
                <div className="md:col-span-2 mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    onClick={handleUpdateCategory}
                    disabled={loading}
                    className={`bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg transition-colors ${
                      loading
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    {loading ? "Updating..." : "Update Category"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ExpenseCategory;
