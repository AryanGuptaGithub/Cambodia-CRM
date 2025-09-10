import React, { useState, useMemo } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";

const Expenses = () => {
  // Sample static data
  const [expenses, setExpenses] = useState([
    { id: 1, category: "Office Supplies", amount: 1500, date: "2025-08-25", user: "Ravi Kumar" },
    { id: 2, category: "Travel", amount: 4200, date: "2025-08-28", user: "Amit Sharma" },
    { id: 3, category: "Utilities", amount: 3000, date: "2025-08-30", user: "Sneha Patel" },
    { id: 4, category: "Maintenance", amount: 2500, date: "2025-08-29", user: "Ravi Kumar" },
    { id: 5, category: "Snacks", amount: 800, date: "2025-08-26", user: "Amit Sharma" },
    { id: 6, category: "Fuel", amount: 2200, date: "2025-08-27", user: "Sneha Patel" },
    { id: 7, category: "Rent", amount: 10000, date: "2025-08-01", user: "Ravi Kumar" },
    { id: 8, category: "Subscriptions", amount: 1200, date: "2025-08-05", user: "Amit Sharma" },
    { id: 9, category: "Insurance", amount: 3500, date: "2025-08-12", user: "Sneha Patel" },
    { id: 10, category: "Software", amount: 5000, date: "2025-08-15", user: "Ravi Kumar" },
    { id: 11, category: "Travel", amount: 2700, date: "2025-08-18", user: "Amit Sharma" },
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const expensesPerPage = 10;

  // Filter expenses based on search query
  const filteredExpenses = useMemo(() => {
    return expenses.filter(
      (exp) =>
        exp.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exp.date.includes(searchQuery)
    );
  }, [expenses, searchQuery]);

  // Pagination
  const indexOfLastExpense = currentPage * expensesPerPage;
  const indexOfFirstExpense = indexOfLastExpense - expensesPerPage;
  const currentExpenses = filteredExpenses.slice(indexOfFirstExpense, indexOfLastExpense);

  const totalPages = Math.ceil(filteredExpenses.length / expensesPerPage);

  // Total of current page
  const totalAmount = currentExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="p-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-6">
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">
          <Plus size={18} /> Add New Expense
        </button>

        <input
          type="text"
          placeholder="Search..."
          className="w-72 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1); // Reset to first page on search
          }}
        />
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-2xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">Expense Category</th>
              <th className="px-4 py-3 text-left">Amount (₹)</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentExpenses.map((exp) => (
              <tr key={exp.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{exp.category}</td>
                <td className="px-4 py-3">₹{exp.amount}</td>
                <td className="px-4 py-3">{exp.date}</td>
                <td className="px-4 py-3">{exp.user}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button className="p-2 text-green-600 hover:bg-green-100 rounded-lg">
                    <Edit size={18} />
                  </button>
                  <button className="p-2 text-red-600 hover:bg-red-100 rounded-lg">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}

            {/* Total Row */}
            <tr className="bg-gray-100 font-semibold">
              <td className="px-4 py-3 text-right">Total</td>
              <td className="px-4 py-3">₹{totalAmount}</td>
              <td className="px-4 py-3" colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
    </div>
  );
};

export default Expenses;
