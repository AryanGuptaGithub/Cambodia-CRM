import React, { useState } from 'react';
import { Search } from 'lucide-react';

const stockSummaryData = [
  {
    id: 1,
    product: 'Apple iPhone 14',
    itemCode: 'APL-IP14',
    category: 'Smartphones',
    brand: 'Apple',
    purchasePrice: 60000,
    salesPrice: 75000,
    currentStock: 5,
  },
  {
    id: 2,
    product: 'Samsung Galaxy S22',
    itemCode: 'SSG-GS22',
    category: 'Smartphones',
    brand: 'Samsung',
    purchasePrice: 50000,
    salesPrice: 65000,
    currentStock: 3,
  },
  {
    id: 3,
    product: 'Sony WH-1000XM5',
    itemCode: 'SNY-WHXM5',
    category: 'Headphones',
    brand: 'Sony',
    purchasePrice: 20000,
    salesPrice: 26000,
    currentStock: 8,
  },
  {
    id: 4,
    product: 'Logitech MX Master 3S',
    itemCode: 'LOG-MX3S',
    category: 'Accessories',
    brand: 'Logitech',
    purchasePrice: 7500,
    salesPrice: 9000,
    currentStock: 10,
  },
  {
    id: 5,
    product: 'Dell XPS 13',
    itemCode: 'DLL-XPS13',
    category: 'Laptops',
    brand: 'Dell',
    purchasePrice: 100000,
    salesPrice: 115000,
    currentStock: 2,
  },
  {
    id: 6,
    product: 'HP Envy 15',
    itemCode: 'HP-ENVY15',
    category: 'Laptops',
    brand: 'HP',
    purchasePrice: 110000,
    salesPrice: 125000,
    currentStock: 3,
  },
  {
    id: 7,
    product: 'Canon EOS M50',
    itemCode: 'CNS-EOS50',
    category: 'Cameras',
    brand: 'Canon',
    purchasePrice: 50000,
    salesPrice: 55000,
    currentStock: 1,
  },
  {
    id: 8,
    product: 'Google Pixel 7',
    itemCode: 'GGL-PXL7',
    category: 'Smartphones',
    brand: 'Google',
    purchasePrice: 58000,
    salesPrice: 63000,
    currentStock: 4,
  },
  {
    id: 9,
    product: 'Asus ROG Strix',
    itemCode: 'ASU-ROG',
    category: 'Laptops',
    brand: 'Asus',
    purchasePrice: 125000,
    salesPrice: 140000,
    currentStock: 1,
  },
  {
    id: 10,
    product: 'Lenovo ThinkPad X1',
    itemCode: 'LNV-TPX1',
    category: 'Laptops',
    brand: 'Lenovo',
    purchasePrice: 90000,
    salesPrice: 95000,
    currentStock: 2,
  },
  {
    id: 11,
    product: 'Sony Alpha A6400',
    itemCode: 'SNY-A6400',
    category: 'Cameras',
    brand: 'Sony',
    purchasePrice: 74000,
    salesPrice: 77000,
    currentStock: 2,
  },
];

const ITEMS_PER_PAGE = 10;

const StockSummary = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = stockSummaryData.filter(item =>
    item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.brand.toLowerCase().includes(searchTerm.toLowerCase())
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
        Dashboard <span className="mx-2">{'>'}</span> Stock Summary
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-xs mb-4">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search by Product, Item Code or Brand"
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
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Brand</th>
              <th className="p-3 text-left">Purchase Price</th>
              <th className="p-3 text-left">Sales Price</th>
              <th className="p-3 text-left">Current Stock</th>
              <th className="p-3 text-left">Stock Value</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map(item => {
                const stockValue = item.purchasePrice * item.currentStock;
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                    <td className="p-3">{item.product}</td>
                    <td className="p-3">{item.itemCode}</td>
                    <td className="p-3">{item.category}</td>
                    <td className="p-3">{item.brand}</td>
                    <td className="p-3">₹{item.purchasePrice.toLocaleString()}</td>
                    <td className="p-3 text-green-600 font-medium">₹{item.salesPrice.toLocaleString()}</td>
                    <td className="p-3">{item.currentStock}</td>
                    <td className="p-3 font-semibold text-gray-700">₹{stockValue.toLocaleString()}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="text-center py-4 text-gray-500">
                  No products match your search.
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

export default StockSummary;
