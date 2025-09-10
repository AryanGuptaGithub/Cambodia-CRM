import React, { useState } from "react";
import { UserPlus, Trash2, Edit } from "lucide-react";

const saleReturnData = [
  {
    id: 1,
    invoiceNo: "SR001",
    salesDate: "2025-08-01",
    customerName: "John Doe",
    returnStatus: "Received",
    totalAmount: 1500,
    paidAmount: 1500,
    paymentStatus: "Paid",
  },
  {
    id: 2,
    invoiceNo: "SR002",
    salesDate: "2025-08-05",
    customerName: "Jane Smith",
    returnStatus: "Pending",
    totalAmount: 2000,
    paidAmount: 1000,
    paymentStatus: "Unpaid",
  },
  {
    id: 3,
    invoiceNo: "SR003",
    salesDate: "2025-08-10",
    customerName: "Acme Corp",
    returnStatus: "Received",
    totalAmount: 3000,
    paidAmount: 3000,
    paymentStatus: "Paid",
  },
  {
    id: 4,
    invoiceNo: "SR004",
    salesDate: "2025-08-12",
    customerName: "XYZ Ltd.",
    returnStatus: "Pending",
    totalAmount: 500,
    paidAmount: 0,
    paymentStatus: "Unpaid",
  },
  {
    id: 5,
    invoiceNo: "SR005",
    salesDate: "2025-08-15",
    customerName: "Global Tech",
    returnStatus: "Received",
    totalAmount: 1200,
    paidAmount: 1200,
    paymentStatus: "Paid",
  },
  {
    id: 6,
    invoiceNo: "SR006",
    salesDate: "2025-08-18",
    customerName: "Mega Store",
    returnStatus: "Pending",
    totalAmount: 800,
    paidAmount: 300,
    paymentStatus: "Unpaid",
  },
  // Add more if needed
];

const SaleReturn = () => {
  const [returns, setReturns] = useState(saleReturnData);
  const [selectedTab, setSelectedTab] = useState("All Sales Return/Cr.Note");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const returnsPerPage = 10;

  // Filter data by tab and search term
  const filteredReturns = returns.filter((r) => {
    // Filter by tab
    const matchesTab =
      selectedTab === "All Sales Return/Cr.Note"
        ? true
        : selectedTab === "Paid"
        ? r.paymentStatus === "Paid"
        : r.paymentStatus === "Unpaid";

    if (!matchesTab) return false;

    // Filter by search term (invoiceNo, customerName, returnStatus)
    if (searchTerm.trim() === "") return true;

    const lowerSearch = searchTerm.toLowerCase();
    return (
      r.invoiceNo.toLowerCase().includes(lowerSearch) ||
      r.customerName.toLowerCase().includes(lowerSearch) ||
      r.returnStatus.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination calculations
  const indexOfLastReturn = currentPage * returnsPerPage;
  const indexOfFirstReturn = indexOfLastReturn - returnsPerPage;
  const currentReturns = filteredReturns.slice(
    indexOfFirstReturn,
    indexOfLastReturn
  );
  const totalPages = Math.ceil(filteredReturns.length / returnsPerPage);

  // Toggle checkbox select of one row
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select/Deselect all on current page
  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentReturns.map((r) => r.id));
    } else {
      setSelected([]);
    }
  };

  // Delete selected returns
  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected sale return(s)?`
      )
    ) {
      setReturns((prev) => prev.filter((r) => !selected.includes(r.id)));
      setSelected([]);
    }
  };

  // Reset selection and page when search changes
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  return (
    <div className="p-6">
      {/* Top Buttons + Search */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex gap-3 items-center">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md"
            onClick={() => alert("Add new sales return clicked")}
          >
            <UserPlus size={18} /> Add New Sales Return
          </button>

          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Search invoice, customer, status..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="border border-gray-300 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-indigo-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["All Sales Return/Cr.Note", "Paid", "Unpaid"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setSelectedTab(tab);
              setCurrentPage(1);
              setSelected([]);
            }}
            className={`px-4 py-2 rounded-lg ${
              selectedTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3 text-center">
                <input
                  type="checkbox"
                  checked={
                    selected.length === currentReturns.length &&
                    currentReturns.length > 0
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Invoice No</th>
              <th className="p-3 text-left">Sales Date</th>
              <th className="p-3 text-left">Customer Name</th>
              <th className="p-3 text-left">Return Status</th>
              <th className="p-3 text-left">Total Amount</th>
              <th className="p-3 text-left">Paid Amount</th>
              <th className="p-3 text-left">Due Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentReturns.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500">
                  No sale returns found.
                </td>
              </tr>
            ) : (
              currentReturns.map((ret) => {
                const dueAmount = ret.totalAmount - ret.paidAmount;
                return (
                  <tr key={ret.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(ret.id)}
                        onChange={() => toggleSelect(ret.id)}
                      />
                    </td>
                    <td className="p-3">{ret.invoiceNo}</td>
                    <td className="p-3">{ret.salesDate}</td>
                    <td className="p-3">{ret.customerName}</td>
                    <td className="p-3">{ret.returnStatus}</td>
                    <td className="p-3">₹{ret.totalAmount}</td>
                    <td className="p-3">₹{ret.paidAmount}</td>
                    <td className="p-3">₹{dueAmount}</td>
                    <td className="p-3">{ret.paymentStatus}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() => alert(`Edit sale return ${ret.invoiceNo}`)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete sale return ${ret.invoiceNo}?`
                            )
                          ) {
                            setReturns((prev) =>
                              prev.filter((r) => r.id !== ret.id)
                            );
                            setSelected((prev) =>
                              prev.filter((id) => id !== ret.id)
                            );
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded ${
                  currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {page}
              </button>
            )
          )}

          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaleReturn;
