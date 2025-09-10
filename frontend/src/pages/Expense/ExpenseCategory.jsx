import React, { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";

const ExpenseCategory = () => {
  const [categories, setCategories] = useState([
    { id: 1, category: "Office Supplies", description: "Stationery & office utilities", amount: 5000 },
    { id: 2, category: "Travel", description: "Flight tickets & local transport", amount: 12000 },
    { id: 3, category: "Utilities", description: "Electricity, water, internet bills", amount: 8000 },
    { id: 4, category: "Marketing", description: "Online ads & promotion", amount: 15000 },
    { id: 5, category: "Maintenance", description: "Repair & upkeep of office", amount: 3000 },
  ]);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Search filter
  const filteredData = categories.filter(
    (cat) =>
      cat.category.toLowerCase().includes(search.toLowerCase()) ||
      cat.description.toLowerCase().includes(search.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);

  return (
    <div className="p-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-6">
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">
          <Plus size={18} /> Add New Category
        </button>

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-72 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-2xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">Expense Category</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Amount (₹)</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((cat) => (
              <tr key={cat.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{cat.category}</td>
                <td className="px-4 py-3">{cat.description}</td>
                <td className="px-4 py-3">₹{cat.amount}</td>
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

            {currentRows.length === 0 && (
              <tr>
                <td colSpan="4" className="px-4 py-3 text-center text-gray-500">
                  No matching categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center mt-4 gap-2">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((prev) => prev - 1)}
          className={`px-3 py-1 rounded-lg ${
            currentPage === 1 ? "bg-gray-200 text-gray-500" : "bg-indigo-600 text-white"
          }`}
        >
          Prev
        </button>

        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i + 1}
            onClick={() => setCurrentPage(i + 1)}
            className={`px-3 py-1 rounded-lg ${
              currentPage === i + 1 ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            {i + 1}
          </button>
        ))}

        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((prev) => prev + 1)}
          className={`px-3 py-1 rounded-lg ${
            currentPage === totalPages ? "bg-gray-200 text-gray-500" : "bg-indigo-600 text-white"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default ExpenseCategory;
