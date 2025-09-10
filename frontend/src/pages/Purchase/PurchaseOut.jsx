import React, { useState } from "react";
import { UserPlus, Trash2, Edit } from "lucide-react";

const paymentData = [
  {
    id: 1,
    paymentDate: "2025-08-01",
    taxNo: "TX1001",
    userName: "John Doe",
    amount: 1500,
  },
  {
    id: 2,
    paymentDate: "2025-08-05",
    taxNo: "TX1002",
    userName: "Jane Smith",
    amount: 2000,
  },
  {
    id: 3,
    paymentDate: "2025-08-10",
    taxNo: "TX1003",
    userName: "Acme Corp",
    amount: 3000,
  },
  {
    id: 4,
    paymentDate: "2025-08-12",
    taxNo: "TX1004",
    userName: "XYZ Ltd.",
    amount: 500,
  },
  {
    id: 5,
    paymentDate: "2025-08-15",
    taxNo: "TX1005",
    userName: "Global Tech",
    amount: 1200,
  },
  {
    id: 6,
    paymentDate: "2025-08-18",
    taxNo: "TX1006",
    userName: "Mega Store",
    amount: 800,
  },
  // Add more if needed
];

const PurchaseOut = () => {
  const [payments, setPayments] = useState(paymentData);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const paymentsPerPage = 10;

  // Filter payments by search term (paymentDate, taxNo, userName)
  const filteredPayments = payments.filter((p) => {
    if (searchTerm.trim() === "") return true;

    const lowerSearch = searchTerm.toLowerCase();
    return (
      p.paymentDate.toLowerCase().includes(lowerSearch) ||
      p.taxNo.toLowerCase().includes(lowerSearch) ||
      p.userName.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination calculations
  const indexOfLastPayment = currentPage * paymentsPerPage;
  const indexOfFirstPayment = indexOfLastPayment - paymentsPerPage;
  const currentPayments = filteredPayments.slice(
    indexOfFirstPayment,
    indexOfLastPayment
  );
  const totalPages = Math.ceil(filteredPayments.length / paymentsPerPage);

  // Toggle checkbox select of one row
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select/Deselect all on current page
  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentPayments.map((p) => p.id));
    } else {
      setSelected([]);
    }
  };

  // Delete selected payments
  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected payment(s)?`
      )
    ) {
      setPayments((prev) => prev.filter((p) => !selected.includes(p.id)));
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
            onClick={() => alert("Add new sales payment clicked")}
          >
            <UserPlus size={18} /> Add New  Payment Out
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
          placeholder="Search payment date, tax no, user..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="border border-gray-300 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-indigo-600"
        />
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
                    selected.length === currentPayments.length &&
                    currentPayments.length > 0
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Payment Date</th>
              <th className="p-3 text-left">Tax No</th>
              <th className="p-3 text-left">User Name</th>
              <th className="p-3 text-left">Amount</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPayments.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  No payments found.
                </td>
              </tr>
            ) : (
              currentPayments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selected.includes(payment.id)}
                      onChange={() => toggleSelect(payment.id)}
                    />
                  </td>
                  <td className="p-3">{payment.paymentDate}</td>
                  <td className="p-3">{payment.taxNo}</td>
                  <td className="p-3">{payment.userName}</td>
                  <td className="p-3">₹{payment.amount}</td>
                  <td className="p-3 flex items-center justify-center gap-3">
                    <button
                      className="text-green-600 hover:text-green-800"
                      onClick={() => alert(`Edit payment ${payment.id}`)}
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      className="text-red-600 hover:text-red-800"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Are you sure you want to delete payment ${payment.id}?`
                          )
                        ) {
                          setPayments((prev) =>
                            prev.filter((p) => p.id !== payment.id)
                          );
                          setSelected((prev) =>
                            prev.filter((id) => id !== payment.id)
                          );
                        }
                      }}
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
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

export default PurchaseOut;
