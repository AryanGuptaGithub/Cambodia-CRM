import React, { useState } from 'react';
import {
  Plus,
  Upload,
  Trash2,
  Search,
  Eye,
  Edit,
  X,
  Trash,
} from 'lucide-react';
import { useNavigate } from "react-router-dom";
const stockTransferData = [
  // Transfers
  {
    id: 1,
    type: 'transfer',
    invoiceNo: 'INV001',
    date: '2025-08-25',
    warehouse: 'Warehouse A',
    totalAmount: 1000,
    paidAmount: 700,
    paymentStatus: 'Partial',
  },
  {
    id: 2,
    type: 'transfer',
    invoiceNo: 'INV002',
    date: '2025-08-26',
    warehouse: 'Warehouse B',
    totalAmount: 2000,
    paidAmount: 2000,
    paymentStatus: 'Paid',
  },
  {
    id: 3,
    type: 'transfer',
    invoiceNo: 'INV003',
    date: '2025-08-27',
    warehouse: 'Warehouse C',
    totalAmount: 1500,
    paidAmount: 0,
    paymentStatus: 'Due',
  },
  // Recieve
  {
    id: 4,
    type: 'recieve',
    invoiceNo: 'RCV001',
    date: '2025-08-20',
    warehouse: 'Warehouse A',
    totalAmount: 800,
    paidAmount: 800,
    paymentStatus: 'Collected',
  },
  {
    id: 5,
    type: 'recieve',
    invoiceNo: 'RCV002',
    date: '2025-08-21',
    warehouse: 'Warehouse B',
    totalAmount: 1200,
    paidAmount: 400,
    paymentStatus: 'Partial',
  },
  {
    id: 6,
    type: 'recieve',
    invoiceNo: 'RCV003',
    date: '2025-08-22',
    warehouse: 'Warehouse C',
    totalAmount: 1000,
    paidAmount: 0,
    paymentStatus: 'Pending',
  },
];

const ITEMS_PER_PAGE = 4;

const StockTransfer = () => {
    const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('transfer');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

    // Popup state
    const [showImportModal, setShowImportModal] = useState(false);
    const [file, setFile] = useState(null);

  const filteredData = stockTransferData.filter(item =>
    item.type === activeTab &&
    item.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSelectRow = (id) => {
    setSelectedRows(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleDelete = () => {
    alert(`Deleted rows: ${selectedRows.join(', ')}`);
    setSelectedRows([]);
  };

  const totalAmount = filteredData.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalPaid = filteredData.reduce((sum, item) => sum + item.paidAmount, 0);
  const totalDue = totalAmount - totalPaid;
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  const isRecieveTab = activeTab === 'recieve';

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard  <span className="mx-2">{'>'}</span> Stock Transfer
      </div>

      {/* Header Buttons & Search */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => navigate('/stocktransferform')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md">
            <Plus size={18} /> Add New Stock Transfer
          
          </button>
          <button
                   onClick={() => setShowImportModal(true)}
                   className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md"
                 >
                   <Upload size={18} /> Import CSV
                 </button>
          {selectedRows.length > 0 && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete Selected
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by Invoice No"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {['transfer', 'recieve'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSelectedRows([]);
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 text-sm">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  checked={
                    selectedRows.length > 0 &&
                    paginatedData.every(row => selectedRows.includes(row.id))
                  }
                  onChange={(e) =>
                    setSelectedRows(
                      e.target.checked ? paginatedData.map(row => row.id) : []
                    )
                  }
                />
              </th>
              <th className="p-3 text-left">Invoice No</th>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Warehouse</th>
              <th className="p-3 text-left">Total Amount</th>
              <th className="p-3 text-left">{isRecieveTab ? 'Collected Amount' : 'Paid Amount'}</th>
              <th className="p-3 text-left">Due Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(item.id)}
                      onChange={() => handleSelectRow(item.id)}
                    />
                  </td>
                  <td className="p-3">{item.invoiceNo}</td>
                  <td className="p-3">{item.date}</td>
                  <td className="p-3">{item.warehouse}</td>
                  <td className="p-3">₹{item.totalAmount.toFixed(2)}</td>
                  <td className="p-3">₹{item.paidAmount.toFixed(2)}</td>
                  <td className="p-3 text-red-600 font-medium">
                    ₹{(item.totalAmount - item.paidAmount).toFixed(2)}
                  </td>
                  <td className="p-3">{item.paymentStatus}</td>
                  <td className="p-3">
                    <div className="flex justify-center gap-2">
                      <button className="text-blue-600 hover:text-blue-800">
                        <Eye size={18} />
                      </button>
                      <button className="text-green-600 hover:text-green-800">
                        <Edit size={18} />
                      </button>
                      <button className="text-red-600 hover:text-red-800">
                        <Trash size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9" className="text-center py-4 text-gray-500">
                  No data found
                </td>
              </tr>
            )}
          </tbody>

          {/* Footer Totals */}
          <tfoot>
            <tr className="bg-gray-100 font-semibold text-sm">
              <td colSpan="4" className="text-right p-3">Total:</td>
              <td className="p-3">₹{totalAmount.toFixed(2)}</td>
              <td className="p-3">₹{totalPaid.toFixed(2)}</td>
              <td className="p-3 text-red-600">₹{totalDue.toFixed(2)}</td>
              <td colSpan="2"></td>
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
         {/* CSV Upload Modal */}
       {showImportModal && (
        <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            {/* Close */}
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Import Supplier
            </h2>

            {/* Sample CSV link */}
            <a
              href="/sample.csv"
              download
              className="text-blue-600 hover:underline text-sm mb-4 block"
            >
              Click here to download Sample CSV file
            </a>

            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-gray-700 mb-2">File</label>
              <input
                type="file"
                accept=".csv, .xlsx"
                onChange={(e) => setFile(e.target.files[0])}
                className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowImportModal(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowImportModal(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockTransfer;
