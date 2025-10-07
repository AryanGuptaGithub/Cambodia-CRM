import React, { useState, useEffect } from "react";
import {
  Plus,
  Upload,
  Trash2,
  Search,
  Eye,
  Edit,
  X,
  Trash,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const ITEMS_PER_PAGE = 4;

const StockTransfer = () => {
  const navigate = useNavigate();

  // State management
  const [activeTab, setActiveTab] = useState("transfer");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [stockTransferData, setStockTransferData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  // Fetch data from API
  const fetchStockTransfers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/stock-transfers`);
      if (!response.ok) throw new Error("Failed to fetch data");

      const data = await response.json();
      setStockTransferData(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when component mounts or activeTab changes
  useEffect(() => {
    fetchStockTransfers();
  }, [activeTab]);

  // Filter data based on search term and active tab
  const filteredData = stockTransferData.filter(
    (item) =>
      item.type === activeTab &&
      item.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Row selection handler
  const handleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    );
  };

  // Select all rows on current page
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(paginatedData.map((row) => row.id));
    } else {
      setSelectedRows([]);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!selectedRows.length) return;

    try {
      const deletePromises = selectedRows.map((id) =>
        fetch(`${backendUrl}/api/stock-transfers/${id}`, { method: "DELETE" })
      );
      await Promise.all(deletePromises);

      fetchStockTransfers();
      setSelectedRows([]);

      alert("Selected items deleted successfully");
    } catch (err) {
      alert("Error deleting items");
      console.error("Delete error:", err);
    }
  };

  // Single item delete handler
  const handleDeleteSingle = async (id, invoiceNo) => {
    if (
      window.confirm(`Are you sure you want to delete invoice ${invoiceNo}?`)
    ) {
      try {
        await fetch(`${backendUrl}/api/stock-transfers/${id}`, {
          method: "DELETE",
        });

        fetchStockTransfers();
        alert("Item deleted successfully");
      } catch (err) {
        alert("Error deleting item");
        console.error("Delete error:", err);
      }
    }
  };

  // View handler
  const handleView = (id) => {
    navigate(`/stock-transfer/view/${id}`);
  };

  // Edit handler
  const handleEdit = (id) => {
    navigate(`/stock-transfer/edit/${id}`);
  };

  // Calculate totals
  const totalAmount = filteredData.reduce(
    (sum, item) => sum + item.totalAmount,
    0
  );
  const totalPaid = filteredData.reduce(
    (sum, item) => sum + item.paidAmount,
    0
  );
  const totalDue = totalAmount - totalPaid;
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  const isRecieveTab = activeTab === "recieve";

  // Reset states when tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedRows([]);
    setCurrentPage(1);
    setSearchTerm("");
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Stock Transfer
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}

      {/* Header Buttons & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/stocktransferform")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors cursor-pointer"
          >
            <Plus size={18} /> Add New Stock Transfer
          </button>

          {selectedRows.length > 0 && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <Trash2 size={18} /> Delete Selected ({selectedRows.length})
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            type="text"
            placeholder="Search by Invoice No"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200
             focus:border-indigo-400 outline-none transition-colors"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        {["transfer", "recieve"].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-6 py-2 rounded-lg capitalize font-medium transition-colors cursor-pointer ${
              activeTab === tab
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {tab} ({filteredData.length})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 text-gray-700 text-sm">
            <tr>
              <th className="p-4 w-12">
                <input
                  type="checkbox"
                  checked={
                    paginatedData.length > 0 &&
                    selectedRows.length === paginatedData.length
                  }
                  onChange={handleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="p-4 text-left font-semibold">Invoice No</th>
              <th className="p-4 text-left font-semibold">Date</th>
              <th className="p-4 text-left font-semibold">Warehouse 1</th>
              <th className="p-4 text-left font-semibold">Total Amount</th>
              <th className="p-4 text-left font-semibold">
                {isRecieveTab ? "Collected Amount" : "Paid Amount"}
              </th>
              <th className="p-4 text-left font-semibold">Due Amount</th>
              <th className="p-4 text-left font-semibold">Payment Status</th>
              <th className="p-4 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-gray-100 hover:bg-gray-50 text-sm transition-colors"
                >
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(item.id)}
                      onChange={() => handleSelectRow(item.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="p-4 font-medium text-gray-900">
                    {item.invoiceNo}
                  </td>
                  <td className="p-4 text-gray-600">
                    {new Date(item.date).toLocaleDateString("en-GB")}
                  </td>
                  <td className="p-4 text-gray-600">{item.warehouse}</td>
                  <td className="p-4 font-semibold text-gray-900">
                    ₹{item.totalAmount.toFixed(2)}
                  </td>
                  <td className="p-4 text-gray-600">
                    ₹{item.paidAmount.toFixed(2)}
                  </td>
                  <td className="p-4 font-semibold text-red-600">
                    ₹{(item.totalAmount - item.paidAmount).toFixed(2)}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        item.paymentStatus === "Paid" ||
                        item.paymentStatus === "Collected"
                          ? "bg-green-100 text-green-800"
                          : item.paymentStatus === "Partial"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {item.paymentStatus}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center gap-3">
                      <button
                        onClick={() => handleView(item.id)}
                        className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleEdit(item.id)}
                        className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-50"
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() =>
                          handleDeleteSingle(item.id, item.invoiceNo)
                        }
                        className="text-red-600 hover:text-red-800 transition-colors p-1 rounded hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9" className="text-center py-8 text-gray-500">
                  {searchTerm
                    ? "No matching records found"
                    : "No data available"}
                </td>
              </tr>
            )}
          </tbody>

          {/* Footer Totals */}
          {filteredData.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-sm">
                <td colSpan="4" className="p-4 text-right text-gray-700">
                  Total:
                </td>
                <td className="p-4 text-gray-900">₹{totalAmount.toFixed(2)}</td>
                <td className="p-4 text-gray-900">₹{totalPaid.toFixed(2)}</td>
                <td className="p-4 text-red-600">₹{totalDue.toFixed(2)}</td>
                <td colSpan="2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-2 text-sm">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-2 rounded-lg min-w-[40px] transition-colors ${
                  currentPage === page
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default StockTransfer;
