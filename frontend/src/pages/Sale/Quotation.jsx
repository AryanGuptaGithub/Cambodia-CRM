import React, { useState } from "react";
import { UserPlus, Trash2, Edit } from "lucide-react";

const quotationData = [
  {
    id: 1,
    invoiceNo: "QTN001",
    quotationDate: "2025-08-01",
    customerName: "John Doe",
    quotationStatus: "Received",
    totalAmount: 1500,
    paidAmount: 1500,
    paymentStatus: "Paid",
  },
  {
    id: 2,
    invoiceNo: "QTN002",
    quotationDate: "2025-08-05",
    customerName: "Jane Smith",
    quotationStatus: "Pending",
    totalAmount: 2000,
    paidAmount: 1000,
    paymentStatus: "Unpaid",
  },
  {
    id: 3,
    invoiceNo: "QTN003",
    quotationDate: "2025-08-10",
    customerName: "Acme Corp",
    quotationStatus: "Received",
    totalAmount: 3000,
    paidAmount: 3000,
    paymentStatus: "Paid",
  },
  {
    id: 4,
    invoiceNo: "QTN004",
    quotationDate: "2025-08-12",
    customerName: "XYZ Ltd.",
    quotationStatus: "Pending",
    totalAmount: 500,
    paidAmount: 0,
    paymentStatus: "Unpaid",
  },
  {
    id: 5,
    invoiceNo: "QTN005",
    quotationDate: "2025-08-15",
    customerName: "Global Tech",
    quotationStatus: "Received",
    totalAmount: 1200,
    paidAmount: 1200,
    paymentStatus: "Paid",
  },
  {
    id: 6,
    invoiceNo: "QTN006",
    quotationDate: "2025-08-18",
    customerName: "Mega Store",
    quotationStatus: "Pending",
    totalAmount: 800,
    paidAmount: 300,
    paymentStatus: "Unpaid",
  },
  // Add more if needed
];

const Quotation = () => {
  const [quotations, setQuotations] = useState(quotationData);
  const [selectedTab, setSelectedTab] = useState("All Quotation");
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const quotationsPerPage = 5;

  // Filter quotations based on tab and search term
  const filteredQuotations = quotations.filter((q) => {
    // Filter by tab
    if (selectedTab === "Paid" && q.paymentStatus !== "Paid") return false;
    if (selectedTab === "Unpaid" && q.paymentStatus !== "Unpaid") return false;

    // Filter by search term (invoiceNo, customerName, quotationDate)
    if (!searchTerm.trim()) return true;
    const lowerSearch = searchTerm.toLowerCase();
    return (
      q.invoiceNo.toLowerCase().includes(lowerSearch) ||
      q.customerName.toLowerCase().includes(lowerSearch) ||
      q.quotationDate.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination calculations
  const indexOfLastQuotation = currentPage * quotationsPerPage;
  const indexOfFirstQuotation = indexOfLastQuotation - quotationsPerPage;
  const currentQuotations = filteredQuotations.slice(
    indexOfFirstQuotation,
    indexOfLastQuotation
  );
  const totalPages = Math.ceil(filteredQuotations.length / quotationsPerPage);

  // Toggle checkbox select of one row
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select/Deselect all on current page
  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentQuotations.map((q) => q.id));
    } else {
      setSelected([]);
    }
  };

  // Delete selected quotations
  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected quotation(s)?`
      )
    ) {
      setQuotations((prev) => prev.filter((q) => !selected.includes(q.id)));
      setSelected([]);
    }
  };

  // Reset selection and page when search or tab changes
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  const handleTabClick = (tab) => {
    setSelectedTab(tab);
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
            onClick={() => alert("Add new quotation clicked")}
          >
            <UserPlus size={18} /> Add New Quotation
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
          placeholder="Search invoice, customer or date..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="border border-gray-300 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-indigo-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["All Quotation", "Paid", "Unpaid"].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabClick(tab)}
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
                    selected.length === currentQuotations.length &&
                    currentQuotations.length > 0
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Invoice No</th>
              <th className="p-3 text-left">Quotation Date</th>
              <th className="p-3 text-left">Customer Name</th>
              <th className="p-3 text-left">Quotation Status</th>
              <th className="p-3 text-left">Total Amount</th>
              <th className="p-3 text-left">Paid Amount</th>
              <th className="p-3 text-left">Due Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentQuotations.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500">
                  No quotations found.
                </td>
              </tr>
            ) : (
              currentQuotations.map((q) => {
                const dueAmount = q.totalAmount - q.paidAmount;
                return (
                  <tr key={q.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(q.id)}
                        onChange={() => toggleSelect(q.id)}
                      />
                    </td>
                    <td className="p-3">{q.invoiceNo}</td>
                    <td className="p-3">{q.quotationDate}</td>
                    <td className="p-3">{q.customerName}</td>
                    <td className="p-3">{q.quotationStatus}</td>
                    <td className="p-3">₹{q.totalAmount}</td>
                    <td className="p-3">₹{q.paidAmount}</td>
                    <td className="p-3">₹{dueAmount}</td>
                    <td className="p-3">{q.paymentStatus}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() => alert(`Edit quotation ${q.invoiceNo}`)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete quotation ${q.invoiceNo}?`
                            )
                          ) {
                            setQuotations((prev) =>
                              prev.filter((item) => item.id !== q.id)
                            );
                            setSelected((prev) =>
                              prev.filter((id) => id !== q.id)
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

export default Quotation;
