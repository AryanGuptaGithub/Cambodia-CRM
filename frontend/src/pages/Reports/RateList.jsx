import React, { useState } from 'react';
import { Search } from 'lucide-react';

const rateListData = [
  {
    id: 1,
    product: 'Apple iPhone 14',
    itemCode: 'APL-IP14',
    category: 'Smartphones',
    brand: 'Apple',
    mrp: 85000,
    salesPrice: 80000,
  },
  {
    id: 2,
    product: 'Samsung Galaxy S22',
    itemCode: 'SSG-GS22',
    category: 'Smartphones',
    brand: 'Samsung',
    mrp: 75000,
    salesPrice: 72000,
  },
  {
    id: 3,
    product: 'Sony WH-1000XM5',
    itemCode: 'SNY-WHXM5',
    category: 'Headphones',
    brand: 'Sony',
    mrp: 30000,
    salesPrice: 28000,
  },
  {
    id: 4,
    product: 'Dell XPS 13',
    itemCode: 'DLL-XPS13',
    category: 'Laptops',
    brand: 'Dell',
    mrp: 125000,
    salesPrice: 120000,
  },
  {
    id: 5,
    product: 'Canon EOS M50',
    itemCode: 'CNS-EOS50',
    category: 'Cameras',
    brand: 'Canon',
    mrp: 65000,
    salesPrice: 60000,
  },
  {
    id: 6,
    product: 'HP Envy 15',
    itemCode: 'HP-ENVY15',
    category: 'Laptops',
    brand: 'HP',
    mrp: 115000,
    salesPrice: 110000,
  },
  {
    id: 7,
    product: 'Google Pixel 7',
    itemCode: 'GGL-PXL7',
    category: 'Smartphones',
    brand: 'Google',
    mrp: 70000,
    salesPrice: 68000,
  },
  {
    id: 8,
    product: 'Logitech MX Master 3S',
    itemCode: 'LOG-MX3S',
    category: 'Accessories',
    brand: 'Logitech',
    mrp: 9800,
    salesPrice: 9500,
  },
  {
    id: 9,
    product: 'Sony Alpha A6400',
    itemCode: 'SNY-A6400',
    category: 'Cameras',
    brand: 'Sony',
    mrp: 77000,
    salesPrice: 74000,
  },
  {
    id: 10,
    product: 'Lenovo ThinkPad X1',
    itemCode: 'LNV-TPX1',
    category: 'Laptops',
    brand: 'Lenovo',
    mrp: 105000,
    salesPrice: 99000,
  },
  {
    id: 11,
    product: 'Asus ROG Strix',
    itemCode: 'ASU-ROG',
    category: 'Laptops',
    brand: 'Asus',
    mrp: 150000,
    salesPrice: 145000,
  },
];

const ITEMS_PER_PAGE = 10;

const RateList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = rateListData.filter(item =>
    item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.brand.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  return (
    <div className="p-6">
   

      {/* Top Bar with Search */}
      <div className="flex justify-end mb-4">
        <div className="relative w-full max-w-xs">
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
              <th className="p-3 text-left">MRP</th>
              <th className="p-3 text-left">Sales Price</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3">{item.product}</td>
                  <td className="p-3">{item.itemCode}</td>
                  <td className="p-3">{item.category}</td>
                  <td className="p-3">{item.brand}</td>
                  <td className="p-3 text-gray-700">₹{item.mrp.toLocaleString()}</td>
                  <td className="p-3 text-green-600 font-medium">₹{item.salesPrice.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="text-center py-4 text-gray-500">
                  No matching products found.
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

export default RateList;
