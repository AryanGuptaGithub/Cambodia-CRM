import React, { useState } from 'react';
import { Search } from 'lucide-react';

const productSalesData = [
  {
    id: 1,
    product: 'Apple iPhone 14',
    itemCode: 'APL-IP14',
    unitSold: 10,
    totalPurchase: 800000,
    totalSales: 850000,
  },
  {
    id: 2,
    product: 'Samsung Galaxy S22',
    itemCode: 'SSG-GS22',
    unitSold: 8,
    totalPurchase: 560000,
    totalSales: 600000,
  },
  {
    id: 3,
    product: 'Sony WH-1000XM5',
    itemCode: 'SNY-WHXM5',
    unitSold: 15,
    totalPurchase: 420000,
    totalSales: 450000,
  },
  {
    id: 4,
    product: 'Dell XPS 13',
    itemCode: 'DLL-XPS13',
    unitSold: 5,
    totalPurchase: 600000,
    totalSales: 650000,
  },
  {
    id: 5,
    product: 'HP Envy 15',
    itemCode: 'HP-ENVY15',
    unitSold: 6,
    totalPurchase: 660000,
    totalSales: 720000,
  },
  {
    id: 6,
    product: 'Google Pixel 7',
    itemCode: 'GGL-PXL7',
    unitSold: 12,
    totalPurchase: 780000,
    totalSales: 820000,
  },
  {
    id: 7,
    product: 'Canon EOS M50',
    itemCode: 'CNS-EOS50',
    unitSold: 4,
    totalPurchase: 240000,
    totalSales: 260000,
  },
  {
    id: 8,
    product: 'Sony Alpha A6400',
    itemCode: 'SNY-A6400',
    unitSold: 7,
    totalPurchase: 490000,
    totalSales: 525000,
  },
  {
    id: 9,
    product: 'Logitech MX Master 3S',
    itemCode: 'LOG-MX3S',
    unitSold: 20,
    totalPurchase: 190000,
    totalSales: 210000,
  },
  {
    id: 10,
    product: 'Lenovo ThinkPad X1',
    itemCode: 'LNV-TPX1',
    unitSold: 3,
    totalPurchase: 270000,
    totalSales: 300000,
  },
  {
    id: 11,
    product: 'Asus ROG Strix',
    itemCode: 'ASU-ROG',
    unitSold: 2,
    totalPurchase: 290000,
    totalSales: 310000,
  },
];

const ITEMS_PER_PAGE = 10;

const ProductSalesSummary = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = productSalesData.filter(item =>
    item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalPurchase = filteredData.reduce((sum, item) => sum + item.totalPurchase, 0);
  const totalSales = filteredData.reduce((sum, item) => sum + item.totalSales, 0);
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{'>'}</span> Product Sales Summary
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
              <th className="p-3 text-left">Unit Sold</th>
              <th className="p-3 text-left">Total Purchase Price</th>
              <th className="p-3 text-left">Total Sales Price</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3">{item.product}</td>
                  <td className="p-3">{item.itemCode}</td>
                  <td className="p-3">{item.unitSold}</td>
                  <td className="p-3 text-gray-700">₹{item.totalPurchase.toLocaleString()}</td>
                  <td className="p-3 text-green-700 font-medium">₹{item.totalSales.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="text-center py-4 text-gray-500">
                  No records found.
                </td>
              </tr>
            )}
          </tbody>

          {/* Footer Total */}
          <tfoot>
            <tr className="bg-gray-100 font-semibold text-sm">
              <td colSpan="3" className="text-right p-3">Total:</td>
              <td className="p-3 text-gray-700">₹{totalPurchase.toLocaleString()}</td>
              <td className="p-3 text-green-700">₹{totalSales.toLocaleString()}</td>
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

export default ProductSalesSummary;
