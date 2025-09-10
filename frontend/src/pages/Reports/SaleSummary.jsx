import React, { useState } from 'react';
import { Search } from 'lucide-react';

const saleData = [
  {
    id: 1,
    orderDate: '2025-08-20',
    invoiceNumber: 'INV001',
    clientName: 'Acme Corp',
    amount: 1200,
    paymentStatus: 'Paid',
    createdBy: 'John Doe',
  },
  {
    id: 2,
    orderDate: '2025-08-21',
    invoiceNumber: 'INV002',
    clientName: 'Beta Ltd',
    amount: 850,
    paymentStatus: 'Unpaid',
    createdBy: 'Jane Smith',
  },
  {
    id: 3,
    orderDate: '2025-08-22',
    invoiceNumber: 'INV003',
    clientName: 'Gamma Inc',
    amount: 1500,
    paymentStatus: 'Paid',
    createdBy: 'Tom White',
  },
  {
    id: 4,
    orderDate: '2025-08-23',
    invoiceNumber: 'INV004',
    clientName: 'Delta LLC',
    amount: 970,
    paymentStatus: 'Unpaid',
    createdBy: 'Alice Brown',
  },
  {
    id: 5,
    orderDate: '2025-08-24',
    invoiceNumber: 'INV005',
    clientName: 'Omega Pvt Ltd',
    amount: 1900,
    paymentStatus: 'Paid',
    createdBy: 'Sarah King',
  },
  {
    id: 6,
    orderDate: '2025-08-25',
    invoiceNumber: 'INV006',
    clientName: 'Zeta Corp',
    amount: 1300,
    paymentStatus: 'Unpaid',
    createdBy: 'Clark Kent',
  },
  {
    id: 7,
    orderDate: '2025-08-26',
    invoiceNumber: 'INV007',
    clientName: 'Theta Enterprises',
    amount: 2100,
    paymentStatus: 'Paid',
    createdBy: 'Diana Prince',
  },
  {
    id: 8,
    orderDate: '2025-08-27',
    invoiceNumber: 'INV008',
    clientName: 'Lambda Group',
    amount: 750,
    paymentStatus: 'Paid',
    createdBy: 'Bruce Wayne',
  },
  {
    id: 9,
    orderDate: '2025-08-28',
    invoiceNumber: 'INV009',
    clientName: 'Sigma Holdings',
    amount: 1000,
    paymentStatus: 'Unpaid',
    createdBy: 'Peter Parker',
  },
  {
    id: 10,
    orderDate: '2025-08-29',
    invoiceNumber: 'INV010',
    clientName: 'Epsilon Ltd',
    amount: 1150,
    paymentStatus: 'Paid',
    createdBy: 'Tony Stark',
  },
  {
    id: 11,
    orderDate: '2025-08-30',
    invoiceNumber: 'INV011',
    clientName: 'Omega Traders',
    amount: 980,
    paymentStatus: 'Unpaid',
    createdBy: 'Steve Rogers',
  },
];

const ITEMS_PER_PAGE = 10;

const SaleSummary = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = saleData.filter(item =>
    item.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.clientName.toLowerCase().includes(searchTerm.toLowerCase())
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
        Dashboard <span className="mx-2">{'>'}</span> Sale Summary
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-xs mb-4">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search by Invoice Number or Client"
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
              <th className="p-3 text-left">Order Date</th>
              <th className="p-3 text-left">Invoice Number</th>
              <th className="p-3 text-left">Client Name</th>
              <th className="p-3 text-left">Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-left">Created By</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3">{item.orderDate}</td>
                  <td className="p-3">{item.invoiceNumber}</td>
                  <td className="p-3">{item.clientName}</td>
                  <td className="p-3 font-medium">₹{item.amount.toFixed(2)}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 text-xs rounded-full font-semibold ${
                        item.paymentStatus === 'Paid'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {item.paymentStatus}
                    </span>
                  </td>
                  <td className="p-3">{item.createdBy}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="text-center py-4 text-gray-500">
                  No sales found.
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

export default SaleSummary;
