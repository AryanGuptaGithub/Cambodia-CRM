import React, { useState } from 'react';
import { Search } from 'lucide-react';

const stockData = [
  { id: 1, product: 'Apple iPhone 14', itemCode: 'APL-IP14', currentStock: 5, quantityAlert: 10 },
  { id: 2, product: 'Samsung Galaxy S22', itemCode: 'SSG-GS22', currentStock: 3, quantityAlert: 5 },
  { id: 3, product: 'Sony WH-1000XM5', itemCode: 'SNY-WHXM5', currentStock: 2, quantityAlert: 4 },
  { id: 4, product: 'Dell XPS 13', itemCode: 'DLL-XPS13', currentStock: 1, quantityAlert: 3 },
  { id: 5, product: 'Logitech MX Master 3S', itemCode: 'LOG-MX3S', currentStock: 4, quantityAlert: 6 },
  { id: 6, product: 'HP Envy 15', itemCode: 'HP-ENVY15', currentStock: 2, quantityAlert: 5 },
  { id: 7, product: 'MacBook Air M2', itemCode: 'APL-MBAIR', currentStock: 0, quantityAlert: 3 },
  { id: 8, product: 'Canon EOS M50', itemCode: 'CNS-EOS50', currentStock: 6, quantityAlert: 8 },
  { id: 9, product: 'Asus ROG Strix', itemCode: 'ASU-ROG', currentStock: 1, quantityAlert: 4 },
  { id: 10, product: 'Google Pixel 7', itemCode: 'GGL-PXL7', currentStock: 7, quantityAlert: 10 },
  { id: 11, product: 'Lenovo ThinkPad X1', itemCode: 'LNV-TPX1', currentStock: 2, quantityAlert: 5 },
];

const ITEMS_PER_PAGE = 10;

const StockAlert = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = stockData.filter(item =>
    item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{'>'}</span> Stock Alert
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-xs mb-4">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search by Product or Item Code"
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 text-sm">
            <tr>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Item Code</th>
              <th className="p-3 text-left">Current Stock</th>
              <th className="p-3 text-left">Quantity Alert</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3">{item.product}</td>
                  <td className="p-3">{item.itemCode}</td>
                  <td className="p-3">{item.currentStock}</td>
                  <td className={`p-3 font-medium ${item.currentStock < item.quantityAlert ? 'text-red-600' : 'text-green-700'}`}>
                    {item.quantityAlert}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="text-center py-4 text-gray-500">
                  No items match your search.
                </td>
              </tr>
            )}
          </tbody>
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

export default StockAlert;
