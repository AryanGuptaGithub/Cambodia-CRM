import React, { useState } from "react";
import { UserPlus, Trash2, Edit } from "lucide-react";

// Sample static purchase data
const purchaseData = [
  {
    id: 1,
    invoiceNo: "PUR001",
    purchaseDate: "2025-08-02",
    supplier: "ABC Supplies",
    purchaseStatus: "Received",
    totalAmount: 2500,
    paidAmount: 2500,
    paymentStatus: "Paid",
  },
  {
    id: 2,
    invoiceNo: "PUR002",
    purchaseDate: "2025-08-06",
    supplier: "XYZ Traders",
    purchaseStatus: "Ordered",
    totalAmount: 1800,
    paidAmount: 1000,
    paymentStatus: "Unpaid",
  },
  {
    id: 3,
    invoiceNo: "PUR003",
    purchaseDate: "2025-08-10",
    supplier: "Global Distributors",
    purchaseStatus: "Pending",
    totalAmount: 3000,
    paidAmount: 0,
    paymentStatus: "Unpaid",
  },
  {
    id: 4,
    invoiceNo: "PUR004",
    purchaseDate: "2025-08-12",
    supplier: "Fresh Foods Ltd.",
    purchaseStatus: "Received",
    totalAmount: 1200,
    paidAmount: 1200,
    paymentStatus: "Paid",
  },
];

function Purchase  ()  {
  const [purchases, setPurchases] = useState(purchaseData);
  const [selectedTab, setSelectedTab] = useState("All Purchase");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const purchasesPerPage = 10;

  // Filter purchases based on tab + search
  const filteredPurchases = purchases.filter((p) => {
    const matchesTab =
      selectedTab === "All Purchase"
        ? true
        : selectedTab === "Paid"
        ? p.paymentStatus === "Paid"
        : p.paymentStatus === "Unpaid";

    if (!matchesTab) return false;

    if (searchTerm.trim() === "") return true;
    const lowerSearch = searchTerm.toLowerCase();

    return (
      p.invoiceNo.toLowerCase().includes(lowerSearch) ||
      p.supplier.toLowerCase().includes(lowerSearch) ||
      p.purchaseStatus.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination
  const indexOfLast = currentPage * purchasesPerPage;
  const indexOfFirst = indexOfLast - purchasesPerPage;
  const currentPurchases = filteredPurchases.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredPurchases.length / purchasesPerPage);

  // Selection handlers
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentPurchases.map((p) => p.id));
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected purchase(s)?`
      )
    ) {
      setPurchases((prev) => prev.filter((p) => !selected.includes(p.id)));
      setSelected([]);
    }
  };

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
            onClick={() => alert("Add new purchase clicked")}
          >
            <UserPlus size={18} /> Add New Purchase
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
          placeholder="Search invoice, supplier, status..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="border border-gray-300 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-indigo-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["All Purchase", "Paid", "Unpaid"].map((tab) => (
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
                    selected.length === currentPurchases.length &&
                    currentPurchases.length > 0
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Invoice Number</th>
              <th className="p-3 text-left">Purchase Date</th>
              <th className="p-3 text-left">Supplier</th>
              <th className="p-3 text-left">Purchase Status</th>
              <th className="p-3 text-left">Total Amount</th>
              <th className="p-3 text-left">Paid Amount</th>
              <th className="p-3 text-left">Due Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPurchases.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500">
                  No purchases found.
                </td>
              </tr>
            ) : (
              currentPurchases.map((purchase) => {
                const dueAmount =
                  purchase.totalAmount - purchase.paidAmount;
                return (
                  <tr
                    key={purchase.id}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(purchase.id)}
                        onChange={() => toggleSelect(purchase.id)}
                      />
                    </td>
                    <td className="p-3">{purchase.invoiceNo}</td>
                    <td className="p-3">{purchase.purchaseDate}</td>
                    <td className="p-3">{purchase.supplier}</td>
                    <td className="p-3">{purchase.purchaseStatus}</td>
                    <td className="p-3">₹{purchase.totalAmount}</td>
                    <td className="p-3">₹{purchase.paidAmount}</td>
                    <td className="p-3">₹{dueAmount}</td>
                    <td className="p-3">{purchase.paymentStatus}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() =>
                          alert(`Edit purchase ${purchase.invoiceNo}`)
                        }
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete purchase ${purchase.invoiceNo}?`
                            )
                          ) {
                            setPurchases((prev) =>
                              prev.filter((p) => p.id !== purchase.id)
                            );
                            setSelected((prev) =>
                              prev.filter((id) => id !== purchase.id)
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

export default Purchase;
