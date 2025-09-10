import React, { useState } from "react";
import { UserPlus, Trash2, Edit } from "lucide-react";

const salesData = [
  {
    id: 1,
    invoiceNo: "INV001",
    salesDate: "2025-08-01",
    customerName: "John Doe",
    salesStatus: "Ordered",
    totalAmount: 1500,
    paidAmount: 1500,
    paymentStatus: "Paid",
  },
  {
    id: 2,
    invoiceNo: "INV002",
    salesDate: "2025-08-05",
    customerName: "Jane Smith",
    salesStatus: "Pending",
    totalAmount: 2000,
    paidAmount: 1000,
    paymentStatus: "Unpaid",
  },
  {
    id: 3,
    invoiceNo: "INV003",
    salesDate: "2025-08-10",
    customerName: "Acme Corp",
    salesStatus: "Delivered",
    totalAmount: 3000,
    paidAmount: 3000,
    paymentStatus: "Paid",
  },
  {
    id: 4,
    invoiceNo: "INV004",
    salesDate: "2025-08-12",
    customerName: "XYZ Ltd.",
    salesStatus: "Shipped",
    totalAmount: 500,
    paidAmount: 0,
    paymentStatus: "Unpaid",
  },
  {
    id: 5,
    invoiceNo: "INV005",
    salesDate: "2025-08-15",
    customerName: "Global Tech",
    salesStatus: "Ordered",
    totalAmount: 1200,
    paidAmount: 1200,
    paymentStatus: "Paid",
  },
  {
    id: 6,
    invoiceNo: "INV006",
    salesDate: "2025-08-18",
    customerName: "Mega Store",
    salesStatus: "Pending",
    totalAmount: 800,
    paidAmount: 300,
    paymentStatus: "Unpaid",
  },
  // Add more if needed
];

const Sales = () => {
  const [sales, setSales] = useState(salesData);
  const [selectedTab, setSelectedTab] = useState("All Sales");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const salesPerPage = 10;

  // Filter sales based on tab and search term
  const filteredSales = sales.filter((s) => {
    // Filter by tab
    const matchesTab =
      selectedTab === "All Sales"
        ? true
        : selectedTab === "Paid"
        ? s.paymentStatus === "Paid"
        : s.paymentStatus === "Unpaid";

    if (!matchesTab) return false;

    // Filter by search term (invoiceNo, customerName, salesStatus)
    if (searchTerm.trim() === "") return true;

    const lowerSearch = searchTerm.toLowerCase();
    return (
      s.invoiceNo.toLowerCase().includes(lowerSearch) ||
      s.customerName.toLowerCase().includes(lowerSearch) ||
      s.salesStatus.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination calculations
  const indexOfLastSale = currentPage * salesPerPage;
  const indexOfFirstSale = indexOfLastSale - salesPerPage;
  const currentSales = filteredSales.slice(indexOfFirstSale, indexOfLastSale);
  const totalPages = Math.ceil(filteredSales.length / salesPerPage);

  // Toggle checkbox select of one row
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select/Deselect all on current page
  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentSales.map((s) => s.id));
    } else {
      setSelected([]);
    }
  };

  // Delete selected sales
  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected sale(s)?`
      )
    ) {
      setSales((prev) => prev.filter((s) => !selected.includes(s.id)));
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
            onClick={() => alert("Add new sales clicked")}
          >
            <UserPlus size={18} /> Add New Sales
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
        {["All Sales", "Paid", "Unpaid"].map((tab) => (
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
                    selected.length === currentSales.length &&
                    currentSales.length > 0
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Invoice No</th>
              <th className="p-3 text-left">Sales Date</th>
              <th className="p-3 text-left">Customer Name</th>
              <th className="p-3 text-left">Sales Status</th>
              <th className="p-3 text-left">Total Amount</th>
              <th className="p-3 text-left">Paid Amount</th>
              <th className="p-3 text-left">Due Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentSales.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500">
                  No sales found.
                </td>
              </tr>
            ) : (
              currentSales.map((sale) => {
                const dueAmount = sale.totalAmount - sale.paidAmount;
                return (
                  <tr key={sale.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(sale.id)}
                        onChange={() => toggleSelect(sale.id)}
                      />
                    </td>
                    <td className="p-3">{sale.invoiceNo}</td>
                    <td className="p-3">{sale.salesDate}</td>
                    <td className="p-3">{sale.customerName}</td>
                    <td className="p-3">{sale.salesStatus}</td>
                    <td className="p-3">₹{sale.totalAmount}</td>
                    <td className="p-3">₹{sale.paidAmount}</td>
                    <td className="p-3">₹{dueAmount}</td>
                    <td className="p-3">{sale.paymentStatus}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() => alert(`Edit sale ${sale.invoiceNo}`)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete sale ${sale.invoiceNo}?`
                            )
                          ) {
                            setSales((prev) =>
                              prev.filter((s) => s.id !== sale.id)
                            );
                            setSelected((prev) =>
                              prev.filter((id) => id !== sale.id)
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

export default Sales;
