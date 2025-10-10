import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const profitLossByOrders = [
  { id: 1, particulars: 'Order #INV001 - Profit', amount: 1200 },
  { id: 2, particulars: 'Order #INV002 - Loss', amount: -400 },
  { id: 3, particulars: 'Order #INV003 - Profit', amount: 700 },
  { id: 4, particulars: 'Order #INV004 - Profit', amount: 600 },
  { id: 5, particulars: 'Order #INV005 - Loss', amount: -300 },
];

const profitLossByDates = [
  { id: 1, particulars: '2025-09-01', amount: 900 },
  { id: 2, particulars: '2025-09-02', amount: -500 },
  { id: 3, particulars: '2025-09-03', amount: 1200 },
  { id: 4, particulars: '2025-09-04', amount: 450 },
  { id: 5, particulars: '2025-09-05', amount: -250 },
];

const ProfitLoss = () => {
  const [activeTab, setActiveTab] = useState('By Orders');
  const [sortDirection, setSortDirection] = useState('Newest');

  const handleSortToggle = () => {
    setSortDirection(prev => (prev === 'Newest' ? 'Oldest' : 'Newest'));
  };

  const data = activeTab === 'By Orders' ? profitLossByOrders : profitLossByDates;

  const sortedData = [...data].sort((a, b) => {
    const aDate = new Date(a.particulars.match(/\d{4}-\d{2}-\d{2}/)?.[0] || a.particulars);
    const bDate = new Date(b.particulars.match(/\d{4}-\d{2}-\d{2}/)?.[0] || b.particulars);
    return sortDirection === 'Newest' ? bDate - aDate : aDate - bDate;
  });

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{'>'}</span> Profit & Loss
      </div>

      {/* Top Bar: Tabs + Sort */}
      <div className="flex flex-wrap justify-between items-center mb-4">
        {/* Tabs */}
        <div className="flex gap-4 mb-4">
          {['By Orders', 'By Dates'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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

        {/* Sort Dropdown (styled as search) */}
        <div className="relative w-full max-w-xs mb-4">
          <button
            onClick={handleSortToggle}
            className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm text-left text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
          >
            Sort by Date: {sortDirection}
            <ChevronDown className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 text-sm">
            <tr>
              <th className="p-3 text-left">Particulars</th>
              <th className="p-3 text-left">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length > 0 ? (
              sortedData.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3">{item.particulars}</td>
                  <td
                    className={`p-3 font-medium ${
                      item.amount < 0 ? 'text-red-600' : 'text-green-700'
                    }`}
                  >
                    {item.amount < 0 ? '-' : ''}${Math.abs(item.amount).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="2" className="text-center py-4 text-gray-500">
                  No data available
                </td>
              </tr>
            )}
          </tbody>

          {/* Footer Total */}
          <tfoot>
            <tr className="bg-gray-100 font-semibold text-sm">
              <td className="p-3 text-right">Total:</td>
              <td
                className={`p-3 ${
                  totalAmount < 0 ? 'text-red-600' : 'text-green-700'
                }`}
              >
                {totalAmount < 0 ? '-' : ''}${Math.abs(totalAmount).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default ProfitLoss;
