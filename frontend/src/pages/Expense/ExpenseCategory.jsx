import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Plus, Edit, Trash2, Loader, Search, X, Menu, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { confirmDialog } from "../../utils/confirmationDialog.js";
import { showToast } from "../../utils/toast";
import ReactDOM from "react-dom";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const expenseCategoryAPI = {
  // Fetch categories with computed amounts (for display)
  fetchExpenseCategories: async () => {
    const response = await fetch(`${backendUrl}/api/expense-categories`);
    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }
    return response.json();
  },

  // Create new category
  createExpenseCategory: async (categoryData) => {
    const response = await fetch(`${backendUrl}/api/expense-categories`, {
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
    const response = await fetch(`${backendUrl}/api/expense-categories/${id}`, {
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
    const response = await fetch(`${backendUrl}/api/expense-categories/${id}`, {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingCategory, setViewingCategory] = useState(null);
  const [form, setForm] = useState({
    category: "",
    description: "",
  });
  const inputRef = useRef(null);

  // Mobile detection and sidebar state
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const navigate = useNavigate();
  const itemsPerPage = 8;

  // Fetch categories on component mount
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await expenseCategoryAPI.fetchExpenseCategories();

      if (result.success) {
        setCategories(result.data);
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

  // Handle form input changes for edit modal
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  // Open view modal with selected category
  const handleView = useCallback((category) => {
    setViewingCategory(category);
    setIsViewModalOpen(true);
  }, []);

  // Open edit modal with selected category
  const handleEdit = useCallback((category) => {
    setEditingCategory(category);
    setForm({
      category: category.category,
      description: category.description,
    });
    setIsEditModalOpen(true);
  }, []);

  // Handle form submission for update
  const handleUpdateCategory = useCallback(
    async (e) => {
      e.preventDefault();

      if (!editingCategory?._id) {
        showToast("error", "Cannot update: missing category ID");
        return;
      }

      try {
        setLoading(true);
        const updateData = {
          category: form.category.trim(),
          description: form.description.trim(),
        };

        const response = await expenseCategoryAPI.updateExpenseCategory(
          editingCategory._id,
          updateData,
        );

        if (response.success) {
          showToast(
            "success",
            response.message || "Category updated successfully",
          );
          setIsEditModalOpen(false);
          setEditingCategory(null);
          await fetchCategories();
        } else {
          throw new Error(response.message || "Update failed");
        }
      } catch (err) {
        console.error("Error updating category:", err);
        showToast("error", `Failed to update category: ${err.message}`);
        if (err.message.includes("already exists")) {
          setError("A category with this name already exists.");
        }
      } finally {
        setLoading(false);
      }
    },
    [form, editingCategory, fetchCategories],
  );

  // Handle delete
  const handleDelete = useCallback(
    async (category) => {
      const confirmDelete = await confirmDialog({
        title: "Delete Category",
        text: `Are you sure you want to delete <b>${category.category}</b>?`,
        icon: "warning",
        confirmButtonText: "Yes, delete",
        cancelButtonText: "Cancel",
      });

      if (confirmDelete.isConfirmed) {
        try {
          setLoading(true);
          const response = await expenseCategoryAPI.deleteExpenseCategory(
            category._id,
          );

          if (response.success) {
            showToast(
              "success",
              response.message || "Category deleted successfully",
            );
            setCategories((prev) => prev.filter((c) => c._id !== category._id));
            if (categories.length % itemsPerPage === 1 && currentPage > 1) {
              setCurrentPage((prev) => prev - 1);
            }
          } else {
            throw new Error(response.message || "Delete failed");
          }
        } catch (err) {
          console.error("Error deleting category:", err);
          showToast("error", `Failed to delete category: ${err.message}`);
        } finally {
          setLoading(false);
        }
      }
    },
    [categories.length, currentPage, itemsPerPage],
  );

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!search) return categories;

    const searchLower = search.toLowerCase();
    return categories.filter(
      (cat) =>
        cat.category?.toLowerCase().includes(searchLower) ||
        cat.description?.toLowerCase().includes(searchLower),
    );
  }, [categories, search]);

  // Pagination
  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);
  const showPagination = filteredCategories.length > itemsPerPage;

  const currentRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCategories.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCategories, currentPage, itemsPerPage]);

  // Totals calculation
  const totals = useMemo(
    () => ({
      totalCategories: categories.length,
      totalYearlyAmount: categories.reduce(
        (sum, cat) => sum + (cat.amountUntilYear || 0),
        0,
      ),
      totalMonthlyAmount: categories.reduce(
        (sum, cat) => sum + (cat.monthlyAmount || 0),
        0,
      ),
    }),
    [categories],
  );

  // Format currency
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat().format(amount);
  }, []);

  // Handle search change
  const handleSearchChange = useCallback((e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  }, []);

  // Mobile card view component (without edit and delete buttons)
  const MobileCategoryCard = ({ cat, index }) => (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-3">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800 text-lg">
            {cat.category}
          </h3>
        </div>
        <button
          onClick={() => handleView(cat)}
          className="p-2 rounded-lg transition-colors text-blue-600 hover:bg-blue-100 cursor-pointer"
          title="View Details"
        >
          <Eye size={18} />
        </button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Yearly Amount:</span>
          <span className="font-semibold text-gray-900">
            {cat.amountUntilYear
              ? `$${formatCurrency(cat.amountUntilYear)}`
              : "NO Expense Added"}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Monthly Amount:</span>
          <span className="font-semibold text-blue-600">
            {cat.monthlyAmount
              ? `$${formatCurrency(cat.monthlyAmount)}`
              : "NO Expense Added"}
          </span>
        </div>
      </div>
    </div>
  );

  if (loading && categories.length === 0) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Loader className="animate-spin text-indigo-600" size={32} />
        <span className="ml-2 text-gray-600">Loading categories...</span>
      </div>
    );
  }

  return (
    <div className={`${isMobileView ? "px-3 pb-20" : "p-6"} relative`}>
      {/* Sidebar for mobile */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* Mobile Header with Hamburger Menu */}
      {isMobileView && (
        <div className="bg-gray-200 shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40 rounded-2xl mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <h1 className="text-base font-bold text-gray-800">
              Expense Categories
            </h1>
          </div>
        </div>
      )}

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

      {/* Desktop Header */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate("/expenselayout/expensecategories/new")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
          >
            {loading ? (
              <Loader className="animate-spin" size={18} />
            ) : (
              <Plus size={18} />
            )}
            Add New Category
          </button>

          {categories.length > 0 && (
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
          )}
        </div>
      )}

      {/* Mobile Search Bar */}
      {isMobileView && categories.length > 0 && (
        <div className="relative mb-4">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
            size={16}
            onClick={() => inputRef.current?.focus()}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search categories..."
            className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 text-sm"
            value={search}
            onChange={handleSearchChange}
          />
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white shadow rounded-xl overflow-hidden w-full">
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
              <tr key={cat._id} className="hover:bg-gray-50 transition-colors">
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
                    ? `$${formatCurrency(cat.amountUntilYear)}`
                    : "NO Expense Added"}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">
                  {cat.monthlyAmount
                    ? `$${formatCurrency(cat.monthlyAmount)}`
                    : "NO Expense Added"}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm">
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => handleView(cat)}
                      className="p-1 rounded-lg transition-colors text-blue-600 hover:bg-blue-100 cursor-pointer"
                      title="View category"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => handleEdit(cat)}
                      className="p-1 rounded-lg transition-colors text-green-600 hover:bg-green-100 cursor-pointer"
                      title="Edit category"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-1 rounded-lg transition-colors text-red-600 hover:bg-red-100 cursor-pointer"
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

      {/* Mobile Card View - No Edit/Delete buttons */}
      <div className="md:hidden">
        {currentRows.length > 0 ? (
          currentRows.map((cat, index) => (
            <MobileCategoryCard
              key={cat._id}
              cat={cat}
              index={(currentPage - 1) * itemsPerPage + index + 1}
            />
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            {search
              ? "No matching categories found."
              : categories.length === 0
                ? "No categories added yet."
                : "No data available"}
          </div>
        )}
      </div>

      {/* Pagination - Only show when needed */}
      {showPagination && (
        <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-2 text-sm">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1 || loading}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            ← Prev
          </button>

          {!isMobileView ? (
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  disabled={loading}
                  className={`px-3 py-2 rounded-lg min-w-[40px] transition-colors ${
                    currentPage === pg
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {pg}
                </button>
              ))}
            </div>
          ) : (
            <span className="px-3 py-2 text-sm text-gray-700 font-medium">
              Page {currentPage} of {totalPages}
            </span>
          )}

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || loading}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Next →
          </button>
        </div>
      )}

      {categories.length > 0 && (
        <div
          className={`${
            isMobileView ? "mt-4 p-4 mb-2" : "mt-6 p-6 mb-6"
          } bg-blue-50 rounded-lg border border-blue-200`}
        >
          <h3
            className={`font-semibold text-blue-800 text-lg ${
              isMobileView ? "text-center mb-3" : "mb-4"
            }`}
          >
            Summary
          </h3>

          {isMobileView ? (
            // Mobile: Vertical layout with center alignment
            <div className="space-y-1">
              <div>
                <div className="text-xl text-blue-800">
                 <span className="mt-2"> Total Categories :{" "} </span>
                  <span className="text-xl font-bold text-blue-600">
                    {totals.totalCategories}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xl text-green-800">
                  Total Yearly Amount :{" "}
                  <span className="text-xl font-bold text-blue-600">
                    ${formatCurrency(totals.totalYearlyAmount)}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xl text-purple-800">
                  Total Monthly Amount :{" "}
                  <span className="text-xl font-bold text-blue-600">
                    ${formatCurrency(totals.totalMonthlyAmount)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            // Desktop: Horizontal grid layout
            <div className="grid grid-cols-3 gap-6">
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
                <div className="text-sm text-green-800">
                  Total Yearly Amount
                </div>
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
          )}
        </div>
      )}

      {/* View Modal - For viewing full description on mobile */}
      {isViewModalOpen &&
        viewingCategory &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative max-h-[80vh] overflow-y-auto">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4 pr-6">
                Category Details
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Category Name
                  </label>
                  <p className="text-gray-900 font-medium">
                    {viewingCategory.category}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Description
                  </label>
                  <p className="text-gray-700 whitespace-pre-wrap break-words">
                    {viewingCategory.description || "No description provided"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Yearly Amount
                  </label>
                  <p className="text-gray-900 font-semibold">
                    {viewingCategory.amountUntilYear
                      ? `$${formatCurrency(viewingCategory.amountUntilYear)}`
                      : "NO Expense Added"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Monthly Amount
                  </label>
                  <p className="text-gray-900 font-semibold text-blue-600">
                    {viewingCategory.monthlyAmount
                      ? `$${formatCurrency(viewingCategory.monthlyAmount)}`
                      : "NO Expense Added"}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Edit Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Expense Category
              </h2>

              <form
                onSubmit={handleUpdateCategory}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
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
                    required
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
                    required
                  />
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
          document.body,
        )}
    </div>
  );
};

export default ExpenseCategory;
