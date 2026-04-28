import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Plus, Edit, Trash2, Loader, Search, X, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { confirmDialog } from "../../utils/confirmationDialog.js";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import ReactDOM from "react-dom";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Categories that require an MR to be selected
const TOUR_MR_CATEGORY_KEYWORDS = [
  "tour allowance",
  "tour petrol expense",
  "province marketing expense",
  "rent expense - vans",
];

// ✅ Salary-type category keywords — expenses in these categories
// can ONLY be deleted by deleting the linked Payroll record.
const SALARY_CATEGORY_KEYWORDS = [
  "salary expenses",
  "salary expense",
  "salary",
];

const isMrRequiredCategory = (categoryName = "") => {
  const lower = categoryName.toLowerCase().trim();
  return TOUR_MR_CATEGORY_KEYWORDS.some((kw) => lower.includes(kw));
};

// ✅ Returns true when an expense belongs to a salary-type category
const isSalaryExpenseCategory = (categoryName = "") => {
  const lower = categoryName.toLowerCase().trim();
  return SALARY_CATEGORY_KEYWORDS.some((kw) => lower.includes(kw));
};

const expensesAPI = {
  fetchExpenses: async () => {
    const resp = await axios.get(`${backendUrl}/api/expenses`);
    return resp.data;
  },
  fetchExpenseCategories: async () => {
    const resp = await axios.get(`${backendUrl}/api/expense-categories`);
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
    mrId: "",
    mrName: "",
  });
  const [updateLoading, setUpdateLoading] = useState(false);
  const [categoryBalances, setCategoryBalances] = useState({});
  const [selectedRows, setSelectedRows] = useState([]);
  const inputRef = useRef(null);
  const expensesPerPage = 10;
  const navigate = useNavigate();

  const userRole = localStorage.getItem("role")?.toLowerCase();
  const isSuperAdmin = userRole === "super admin" || userRole === "superadmin";

  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [expensesResp, categoriesResp, accountsResp] = await Promise.all([
        expensesAPI.fetchExpenses(),
        expensesAPI.fetchExpenseCategories(),
        expensesAPI.fetchSourceAccounts(),
      ]);

      if (!expensesResp.success)
        throw new Error(expensesResp.message || "Failed to fetch expenses");
      if (!categoriesResp.success)
        throw new Error(categoriesResp.message || "Failed to fetch categories");

      const accountsArray = accountsResp?.data || [];
      setExpenses(expensesResp.data);
      setExpenseCategories(categoriesResp.data);
      setSourceAccounts(Array.isArray(accountsArray) ? accountsArray : []);

      const balances = {};
      categoriesResp.data.forEach((cat) => {
        balances[cat._id] = cat.availableAmount || 0;
      });
      setCategoryBalances(balances);
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

  const getCategoryName = useCallback(
    (categoryId) => {
      const cat = expenseCategories.find((c) => c._id === categoryId);
      return cat ? cat.category : "Unknown";
    },
    [expenseCategories],
  );

  // Derive the category name for a given expense object
  const getExpenseCategoryName = useCallback(
    (exp) => {
      return (
        exp.category?.category ||
        (typeof exp.category === "string"
          ? getCategoryName(exp.category)
          : "") ||
        ""
      );
    },
    [getCategoryName],
  );

  const editCategoryName = useMemo(() => {
    if (!editForm.category) return "";
    const cat = expenseCategories.find((c) => c._id === editForm.category);
    return cat?.category || "";
  }, [editForm.category, expenseCategories]);

  const editNeedsMr = useMemo(
    () => isMrRequiredCategory(editCategoryName),
    [editCategoryName],
  );

  const expenseNeedsMr = useCallback(
    (exp) => isMrRequiredCategory(getExpenseCategoryName(exp)),
    [getExpenseCategoryName],
  );

  const filteredExpenses = useMemo(() => {
    if (!searchQuery) return expenses;
    const lower = searchQuery.toLowerCase();
    return expenses.filter((exp) => {
      const sourceName = exp.sourceAccount?.name ?? "";
      const catName = exp.category?.category ?? getCategoryName(exp.category);
      const desc = exp.description ?? exp.remarks ?? "";
      const dt = formatDateToReadable(exp.date).toLowerCase();
      const amountStr = (exp.amount ?? 0).toString();
      const mrName = (exp.mrName ?? "").toLowerCase();
      return (
        sourceName.toLowerCase().includes(lower) ||
        catName.toLowerCase().includes(lower) ||
        desc.toLowerCase().includes(lower) ||
        dt.includes(lower) ||
        amountStr.includes(lower) ||
        mrName.includes(lower)
      );
    });
  }, [expenses, searchQuery, getCategoryName]);

  const indexOfLastExpense = currentPage * expensesPerPage;
  const indexOfFirstExpense = indexOfLastExpense - expensesPerPage;
  const currentExpenses = filteredExpenses.slice(
    indexOfFirstExpense,
    indexOfLastExpense,
  );
  const totalPages = Math.ceil(filteredExpenses.length / expensesPerPage);
  const showPagination = filteredExpenses.length > expensesPerPage;

  const formatCurrency = useCallback((amt) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amt);
  }, []);

  const handleAmountChange = (value) => {
    const sanitized = value.replace(/[^0-9.]/g, "");
    const decimalCount = (sanitized.match(/\./g) || []).length;
    let final = sanitized;
    if (decimalCount > 1) {
      const parts = sanitized.split(".");
      final = parts[0] + "." + parts.slice(1).join("");
    }
    setEditForm((prev) => ({ ...prev, amount: final }));
  };

  const handleKeyPress = (e) => {
    const charCode = e.which ? e.which : e.keyCode;
    const char = String.fromCharCode(charCode);
    if (
      !/[\d.]/.test(char) &&
      charCode > 31 &&
      (charCode < 48 || charCode > 57)
    ) {
      e.preventDefault();
      return false;
    }
    if (char === "." && e.target.value.includes(".")) {
      e.preventDefault();
      return false;
    }
    return true;
  };

  const handleDelete = useCallback(
    async (id) => {
      if (isSuperAdmin) {
        showToast("error", "SuperAdmin cannot delete expenses");
        return;
      }

      const exp = expenses.find((e) => e._id === id);
      if (!exp) return;

      // ✅ Block deletion of salary-type expenses
      const catName = getExpenseCategoryName(exp);
      if (isSalaryExpenseCategory(catName)) {
        showToast(
          "error",
          `<b>${catName}</b> expenses cannot be deleted directly. Please delete the linked <b>Payroll</b> record instead — that will automatically remove this expense.`,
        );
        return;
      }

      const sourceName = exp.sourceAccount?.name || "Unknown Account";
      const result = await confirmDialog({
        title: "Delete Expense",
        text: `Are you sure you want to delete this expense <b>${
          catName || "Unknown"
        }</b> for <b>$${exp.amount}</b> from <b>${sourceName}</b>?`,
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
              `Deleted expense <b>${catName || "Unknown"}</b> of <b>$${exp.amount}</b> from <b>${sourceName}</b> successfully`,
            );
            setExpenses((prev) => prev.filter((e) => e._id !== id));
            const catId = exp.category?._id || exp.category;
            setCategoryBalances((prevBal) => {
              const clone = { ...prevBal };
              clone[catId] = (clone[catId] ?? 0) + (exp.amount || 0);
              return clone;
            });
          } else {
            throw new Error(delRes.message || "Delete failed");
          }
        } catch (err) {
          showToast("error", `Failed: ${err.message}`);
        } finally {
          setLoading(false);
        }
      }
    },
    [expenses, isSuperAdmin, getExpenseCategoryName],
  );

  const handleSelectRow = useCallback((id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedRows.length === currentExpenses.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(currentExpenses.map((e) => e._id));
    }
  }, [currentExpenses, selectedRows]);

  const handleEdit = useCallback(
    (exp) => {
      if (isSuperAdmin) {
        showToast("error", "SuperAdmin cannot edit expenses");
        return;
      }

      // ✅ Block editing of salary-type expenses
      const catName = getExpenseCategoryName(exp);
      if (isSalaryExpenseCategory(catName)) {
        showToast(
          "error",
          `<b>${catName}</b> expenses cannot be edited directly. Please edit the linked <b>Payroll</b> record instead.`,
        );
        return;
      }

      setEditingExpense(exp);
      setEditForm({
        sourceAccount: exp.sourceAccount?._id || exp.sourceAccount || "",
        category: exp.category?._id || exp.category || "",
        description: exp.description || exp.remarks || "",
        amount: exp.amount?.toString() || "",
        date: exp.date ? new Date(exp.date).toISOString().split("T")[0] : "",
        mrId: exp.mrId?._id || exp.mrId || "",
        mrName: exp.mrName || "",
      });
      setIsEditModalOpen(true);
    },
    [isSuperAdmin, getExpenseCategoryName],
  );

  const handleUpdateExpense = async (e) => {
    e.preventDefault();
    if (!editingExpense) return;

    const newCat = editForm.category;
    const newAmt = parseFloat(editForm.amount || "0");
    const oldCat = editingExpense.category?._id || editingExpense.category;
    const oldAmt = editingExpense.amount || 0;
    const account = sourceAccounts.find(
      (item) => item._id === editForm.sourceAccount,
    );
    const avail = account?.totalAmount ?? 0;

    if (newAmt > avail) {
      showToast(
        "error",
        `Entered amount $${formatCurrency(newAmt)} exceeds available $${formatCurrency(avail)}`,
      );
      return;
    }

    if (editNeedsMr && !editForm.mrId) {
      showToast(
        "error",
        `This expense requires an MR for category "${editCategoryName}". Please go back and create the expense with an MR selected.`,
      );
      return;
    }

    try {
      setUpdateLoading(true);
      const payload = {
        sourceAccount: editForm.sourceAccount,
        category: editForm.category,
        description: editForm.description?.trim() || "",
        amount: newAmt,
        date: editForm.date,
        ...(editNeedsMr && editForm.mrId
          ? { mrId: editForm.mrId, mrName: editForm.mrName }
          : {}),
      };

      const updateRes = await expensesAPI.updateExpense(
        editingExpense._id,
        payload,
      );
      if (updateRes.success) {
        showToast("success", "Expense updated successfully");
        setExpenses((prev) =>
          prev.map((e) =>
            e._id === editingExpense._id ? { ...e, ...payload } : e,
          ),
        );
        setCategoryBalances((prevBal) => {
          const clone = { ...prevBal };
          if (oldCat) clone[oldCat] = (clone[oldCat] ?? 0) + oldAmt;
          if (newCat) clone[newCat] = (clone[newCat] ?? 0) - newAmt;
          return clone;
        });
        await fetchData();
        setIsEditModalOpen(false);
        setEditingExpense(null);
      } else {
        throw new Error(updateRes.message || "Update failed");
      }
    } catch (err) {
      showToast("error", `Failed to update expense: ${err.message}`);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }, []);

  const getSafeValue = (obj, path, defaultValue = "") => {
    const keys = path.split(".");
    let result = obj;
    for (const key of keys) {
      result = result?.[key];
      if (result === undefined || result === null) return defaultValue;
    }
    return result;
  };

  // Mobile card
  const MobileExpenseCard = ({ exp, onEdit, onDelete }) => {
    const needsMr = expenseNeedsMr(exp);
    const catName = getExpenseCategoryName(exp);
    const isSalary = isSalaryExpenseCategory(catName);

    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-3">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <p className="text-sm text-gray-500">
              Source:{" "}
              {exp.sourceAccount?.name ||
                (typeof exp.sourceAccount === "string"
                  ? exp.sourceAccount
                  : getSafeValue(exp, "sourceAccount.name", "Unknown"))}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Category: {catName || "Unknown"}
              {/* ✅ Salary badge on mobile */}
              {isSalary && (
                <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                  Payroll
                </span>
              )}
            </p>
            {needsMr && (
              <p className="text-sm text-indigo-600 mt-1 font-medium">
                MR:{" "}
                {exp.mrName ? (
                  exp.mrName
                ) : (
                  <span className="text-red-500 italic">Not assigned</span>
                )}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-bold text-green-600 text-lg">
              ${formatCurrency(exp.amount || 0)}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex">
            <span className="text-gray-600 w-24">Description:</span>
            <span className="text-gray-800 flex-1">
              {exp.description || exp.remarks || "-"}
            </span>
          </div>
          <div className="flex">
            <span className="text-gray-600 w-24">Date:</span>
            <span className="text-gray-800 flex-1">
              {exp.date ? formatDateToReadable(exp.date) : "-"}
            </span>
          </div>
        </div>

        {isSuperAdmin ? (
          <div className="mt-3 pt-2 border-t border-gray-100 text-center">
            <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full italic">
              👁️ View Only
            </span>
          </div>
        ) : isSalary ? (
          /* ✅ Salary expenses: show info label instead of edit/delete buttons */
          <div className="mt-3 pt-2 border-t border-gray-100 text-center">
            <span className="text-xs bg-orange-50 text-orange-600 px-3 py-1 rounded-full italic">
              🔒 Manage via Payroll
            </span>
          </div>
        ) : (
          <div className="flex justify-end gap-4 mt-3 pt-2 border-t border-gray-100">
            <button
              onClick={() => onEdit(exp)}
              className="text-green-600 hover:text-green-800 p-2 active:bg-green-50 rounded-full"
            >
              <Edit size={20} />
            </button>
            <button
              onClick={() => onDelete(exp._id)}
              className="text-red-600 hover:text-red-800 p-2 active:bg-red-50 rounded-full"
            >
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading && expenses.length === 0) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Loader className="animate-spin text-indigo-600" size={32} />
        <span className="ml-2 text-gray-600">Loading expenses...</span>
      </div>
    );
  }

  return (
    <div className={`${isMobileView ? "px-3 pb-20" : "p-6"} relative`}>
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {isMobileView && (
        <div className="bg-gray-200 shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40 rounded-2xl mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <h1 className="text-base font-bold text-gray-800">Expenses</h1>
          </div>
          {isSuperAdmin && (
            <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
              👁️ View Only
            </span>
          )}
        </div>
      )}

      {!isMobileView && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            {!isSuperAdmin && (
              <button
                onClick={() => navigate("/expenselayout/expenses/new")}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 w-full sm:w-auto justify-center"
              >
                <Plus size={18} /> Add New Expense
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-96">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by Source Account, Category, Description, Amount, or Date..."
              className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      )}

      {isMobileView && (
        <div className="relative mb-4">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search expenses..."
            className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 text-sm"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
      )}

      {isMobileView && !isSuperAdmin && (
        <button
          onClick={() => navigate("/expenselayout/expenses/new")}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 mb-4 text-sm"
        >
          <Plus size={16} /> Add New Expense
        </button>
      )}

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

      {/* Desktop Table */}
      <div className="hidden md:block bg-white shadow rounded-xl overflow-x-auto w-full">
        <table className="min-w-[800px] w-full border-collapse bg-white rounded-2xl text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">
                <div className="flex items-center gap-4">
                  {currentExpenses.length > 0 && (
                    <input
                      type="checkbox"
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
              <th className="p-3 text-sm font-medium">Source Account</th>
              <th className="p-3 text-sm font-medium">Expense Category</th>
              <th className="p-3 text-sm font-medium">MR</th>
              <th className="p-3 text-sm font-medium">Description</th>
              <th className="p-3 text-sm font-medium">Amount ($)</th>
              <th className="p-3 text-sm font-medium">Date</th>
              {!isSuperAdmin && (
                <th className="p-3 text-sm font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {currentExpenses.length === 0 ? (
              <tr>
                <td
                  colSpan={isSuperAdmin ? 7 : 8}
                  className="p-4 text-center text-gray-500"
                >
                  {searchQuery
                    ? "No matching expenses found."
                    : expenses.length === 0
                      ? "No expenses added yet."
                      : "No data available"}
                </td>
              </tr>
            ) : (
              currentExpenses.map((exp, idx) => {
                const needsMr = expenseNeedsMr(exp);
                const catName = getExpenseCategoryName(exp);
                const isSalary = isSalaryExpenseCategory(catName);

                return (
                  <tr
                    key={exp._id}
                    className={`hover:bg-gray-50 ${
                      (idx + 1) % expensesPerPage === 0 ||
                      idx + 1 === currentExpenses.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
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
                      {exp.sourceAccount?.name ||
                        (typeof exp.sourceAccount === "string"
                          ? exp.sourceAccount
                          : getSafeValue(exp, "sourceAccount.name", ""))}
                    </td>
                    <td className="p-3">
                      <span>{catName}</span>
                      {/* ✅ Payroll badge in table for salary expenses */}
                      {isSalary && (
                        <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                          Payroll
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {needsMr ? (
                        exp.mrName ? (
                          <span className="text-indigo-700 font-medium">
                            {exp.mrName}
                          </span>
                        ) : (
                          <span className="text-red-500 italic text-xs">
                            Not assigned
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {exp.description || exp.remarks || ""}
                    </td>
                    <td className="p-3 font-semibold">
                      {formatCurrency(exp.amount || 0)}
                    </td>
                    <td className="p-3">
                      {exp.date ? formatDateToReadable(exp.date) : ""}
                    </td>
                    {!isSuperAdmin && (
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            className="text-green-600 hover:text-green-800"
                            onClick={() => handleEdit(exp)}
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            className="text-red-600 hover:text-red-800"
                            onClick={() => handleDelete(exp._id)}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        {currentExpenses.length > 0 ? (
          currentExpenses.map((exp) => (
            <MobileExpenseCard
              key={exp._id}
              exp={exp}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            {searchQuery
              ? "No matching expenses found."
              : expenses.length === 0
                ? "No expenses added yet."
                : "No data available"}
          </div>
        )}
      </div>

      {/* Pagination */}
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

      {/* Summary Box */}
      {filteredExpenses.length > 0 && (
        <div
          className={`${
            isMobileView ? "mt-6 p-3 mb-2" : "mt-6 p-6 mb-6"
          } bg-blue-50 rounded-lg border border-blue-200`}
        >
          <h3
            className={`font-semibold text-blue-800 text-lg ${
              isMobileView ? "text-center mb-2" : "mb-4"
            }`}
          >
            Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="text-center">
              <div
                className={`font-bold text-blue-600 ${
                  isMobileView ? "text-xl" : "text-2xl"
                }`}
              >
                {filteredExpenses.length}
              </div>
              <div className="text-blue-800 text-sm">Total Expenses</div>
            </div>
            <div className="text-center">
              <div
                className={`font-bold text-green-600 ${
                  isMobileView ? "text-xl" : "text-2xl"
                }`}
              >
                ${" "}
                {formatCurrency(
                  filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
                )}
              </div>
              <div className="text-green-800 text-sm">Total Amount</div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen &&
        !isSuperAdmin &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Expense
              </h2>
              <form
                onSubmit={handleUpdateExpense}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Account
                  </label>
                  <select
                    value={editForm.sourceAccount}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        sourceAccount: e.target.value,
                      })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    required
                  >
                    <option value="">Select Account</option>
                    {sourceAccounts.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expense Category
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) =>
                      setEditForm({ ...editForm, category: e.target.value })
                    }
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

                {editNeedsMr && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      MR
                      <span className="ml-2 text-xs text-indigo-500 font-normal">
                        (assigned at creation — cannot be changed here)
                      </span>
                    </label>
                    <div className="w-full border px-3 py-2 rounded-lg bg-gray-50 text-gray-800 flex items-center gap-2">
                      {editForm.mrName ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                          <span className="font-medium text-indigo-700">
                            {editForm.mrName}
                          </span>
                        </>
                      ) : (
                        <span className="text-red-500 italic text-sm">
                          No MR assigned to this expense
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="text"
                    value={editForm.amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    placeholder="0.00"
                    required
                  />
                  {editForm.sourceAccount && (
                    <p className="text-sm text-gray-500 mt-1">
                      Available: $
                      {formatCurrency(
                        sourceAccounts.find(
                          (item) => item._id === editForm.sourceAccount,
                        )?.totalAmount ?? 0,
                      )}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) =>
                      setEditForm({ ...editForm, date: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full border px-3 py-2 rounded-lg focus:ring focus:ring-indigo-200"
                    placeholder="Enter expense description..."
                  />
                </div>

                <div className="md:col-span-2 mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
                    disabled={updateLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg flex items-center gap-2"
                    disabled={updateLoading}
                  >
                    {updateLoading && (
                      <Loader className="animate-spin" size={16} />
                    )}
                    {updateLoading ? "Updating..." : "Update Expense"}
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

export default Expenses;
