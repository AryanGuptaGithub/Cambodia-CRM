import React, { useState } from 'react';
import { Search } from 'lucide-react';

const paymentData = [
  {
    id: 1,
    paymentDate: '2025-08-25',
    referenceNumber: 'REF001',
    paymentType: 'Income',
    user: 'John Doe',
    paymentMode: 'Cash',
    amount: 1000,
  },
  {
    id: 2,
    paymentDate: '2025-08-26',
    referenceNumber: 'REF002',
    paymentType: 'Expense',
    user: 'Jane Smith',
    paymentMode: 'Bank',
    amount: 2000,
  },
  {
    id: 3,
    paymentDate: '2025-08-27',
    referenceNumber: 'REF003',
    paymentType: 'Income',
    user: 'Alice Brown',
    paymentMode: 'Cash',
    amount: 1500,
  },
  {
    id: 4,
    paymentDate: '2025-08-28',
    referenceNumber: 'REF004',
    paymentType: 'Expense',
    user: 'Tom White',
    paymentMode: 'Bank',
    amount: 1200,
  },
  {
    id: 5,
    paymentDate: '2025-08-29',
    referenceNumber: 'REF005',
    paymentType: 'Income',
    user: 'Sarah King',
    paymentMode: 'Cash',
    amount: 1750,
  },
  {
    id: 6,
    paymentDate: '2025-08-30',
    referenceNumber: 'REF006',
    paymentType: 'Refund',
    user: 'Chris Evans',
    paymentMode: 'Bank',
    amount: 500,
  },
  {
    id: 7,
    paymentDate: '2025-09-01',
    referenceNumber: 'REF007',
    paymentType: 'Expense',
    user: 'Natalie Lee',
    paymentMode: 'Cash',
    amount: 800,
  },
  {
    id: 8,
    paymentDate: '2025-09-02',
    referenceNumber: 'REF008',
    paymentType: 'Income',
    user: 'Mike Jordan',
    paymentMode: 'Card',
    amount: 2300,
  },
  {
    id: 9,
    paymentDate: '2025-09-03',
    referenceNumber: 'REF009',
    paymentType: 'Income',
    user: 'Emily Clarke',
    paymentMode: 'Online',
    amount: 2600,
  },
  {
    id: 10,
    paymentDate: '2025-09-04',
    referenceNumber: 'REF010',
    paymentType: 'Expense',
    user: 'Bruce Wayne',
    paymentMode: 'Bank',
    amount: 1900,
  },
  {
    id: 11,
    paymentDate: '2025-09-05',
    referenceNumber: 'REF011',
    paymentType: 'Income',
    user: 'Clark Kent',
    paymentMode: 'Cash',
    amount: 2100,
  },
  {
    id: 12,
    paymentDate: '2025-09-06',
    referenceNumber: 'REF012',
    paymentType: 'Refund',
    user: 'Diana Prince',
    paymentMode: 'Bank',
    amount: 300,
  },
  {
    id: 13,
    paymentDate: '2025-09-07',
    referenceNumber: 'REF013',
    paymentType: 'Expense',
    user: 'Peter Parker',
    paymentMode: 'Online',
    amount: 950,
  },
  {
    id: 14,
    paymentDate: '2025-09-08',
    referenceNumber: 'REF014',
    paymentType: 'Income',
    user: 'Tony Stark',
    paymentMode: 'Cash',
    amount: 3200,
  },
  {
    id: 15,
    paymentDate: '2025-09-09',
    referenceNumber: 'REF015',
    paymentType: 'Expense',
    user: 'Steve Rogers',
    paymentMode: 'Card',
    amount: 1400,
  },
];


const ITEMS_PER_PAGE = 10;

const CashandBank = () => {
  const [activeTab, setActiveTab] = useState('Cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = paymentData.filter(item =>
    (activeTab === 'Cash' ? item.paymentMode === 'Cash' : item.paymentMode !== 'Cash') &&
    item.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase())
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
        Dashboard <span className="mx-2">{'>'}</span> Cash & Bank
      </div>
<div className="flex flex-wrap justify-between items-center mb-4">
      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {['Cash', 'Bank'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg capitalize ${
              activeTab === tab
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="relative w-full max-w-xs mb-4">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search by Reference Number"
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
        <th className="p-3 text-left">Payment Date</th>
        <th className="p-3 text-left">Reference Number</th>
        <th className="p-3 text-left">Payment Type</th>
        <th className="p-3 text-left">User</th>
        <th className="p-3 text-left">Mode Type</th>
        <th className="p-3 text-left">Amount</th>
      </tr>
    </thead>
    <tbody>
      {paginatedData.length > 0 ? (
        paginatedData.map(item => (
          <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
            <td className="p-3">{item.paymentDate}</td>
            <td className="p-3">{item.referenceNumber}</td>
            <td className="p-3">{item.paymentType}</td>
            <td className="p-3">{item.user}</td>
            <td className="p-3">{item.paymentMode}</td>
            <td className={`p-3 font-medium ${item.paymentType === 'Expense' ? 'text-red-600' : 'text-green-700'}`}>
              {item.paymentType === 'Expense' ? '-' : ''}₹{item.amount.toFixed(2)}
            </td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan="6" className="text-center py-4 text-gray-500">
            No data found
          </td>
        </tr>
      )}
    </tbody>

    {/* Footer Total */}
    <tfoot>
      <tr className="bg-gray-100 font-semibold text-sm">
        <td colSpan="5" className="text-right p-3">Total:</td>
        <td className={`p-3 ${totalAmount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          ₹{totalAmount.toFixed(2)}
        </td>
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

export default CashandBank;
