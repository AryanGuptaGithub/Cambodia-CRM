import React, { useState } from 'react';
import { Search } from 'lucide-react';

const expenseData = [
  { id: 1, date: '2025-09-01', category: 'Travel', user: 'John Doe', amount: 1200 },
  { id: 2, date: '2025-09-02', category: 'Meals', user: 'Jane Smith', amount: 450 },
  { id: 3, date: '2025-09-02', category: 'Supplies', user: 'Tom White', amount: 780 },
  { id: 4, date: '2025-09-03', category: 'Utilities', user: 'Alice Brown', amount: 1500 },
  { id: 5, date: '2025-09-03', category: 'Maintenance', user: 'Chris Evans', amount: 1100 },
  { id: 6, date: '2025-09-04', category: 'Travel', user: 'Sarah King', amount: 950 },
  { id: 7, date: '2025-09-05', category: 'Entertainment', user: 'Natalie Lee', amount: 300 },
  { id: 8, date: '2025-09-05', category: 'Office Rent', user: 'Bruce Wayne', amount: 2500 },
  { id: 9, date: '2025-09-06', category: 'Internet', user: 'Clark Kent', amount: 600 },
  { id: 10, date: '2025-09-07', category: 'Miscellaneous', user: 'Diana Prince', amount: 400 },
  { id: 11, date: '2025-09-08', category: 'Travel', user: 'Tony Stark', amount: 1700 },
];

const ITEMS_PER_PAGE = 10;

const ExpenseReport = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = expenseData.filter(item =>
    item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.user.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0);
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{'>'}</span> Expense Report
      </div>

      {/* Search Bar */}
      <div className="flex justify-end mb-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by Category or User"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 text-sm">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Expense Category</th>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Amount</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3">{item.date}</td>
                  <td className="p-3">{item.category}</td>
                  <td className="p-3">{item.user}</td>
                  <td className="p-3 text-red-600 font-medium">-₹{item.amount.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="text-center py-4 text-gray-500">
                  No expense records found.
                </td>
              </tr>
            )}
          </tbody>

          {/* Footer Total */}
          <tfoot>
            <tr className="bg-gray-100 font-semibold text-sm">
              <td colSpan="3" className="text-right p-3">Total:</td>
              <td className="p-3 text-red-600">-₹{totalAmount.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex justify-center gap-2 text-sm">
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`px-3 py-1 rounded ${
              currentPage === page
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default ExpenseReport;
