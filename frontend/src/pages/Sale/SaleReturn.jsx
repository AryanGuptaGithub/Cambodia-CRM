import React, { useState, useEffect } from "react";
import { UserPlus, Trash2, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateToReadable } from "../../utils/dateUtil";

const SaleReturn = () => {
  const [saleReturns, setSaleReturns] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All Sales Return/Cr.Note");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const navigate = useNavigate();
  const returnsPerPage = 10;

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const showToast = (type, message) => {
    
  };

  const fetchSaleReturn = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales/return`);
      if (!res.ok) throw new Error("Failed to fetch sale returns");
      const data = await res.json();
      setSaleReturns(data.data || []);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale returns");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSaleReturn();
  }, []);

  // Filtering logic
  const filteredReturns = saleReturns.filter((r) => {
    const matchesTab =
      selectedTab === "All Sales Return/Cr.Note"
        ? true
        : selectedTab === "Paid"
        ? r.paymentStatus === "Paid"
        : r.paymentStatus === "Unpaid";

    if (!matchesTab) return false;
    if (searchTerm.trim() === "") return true;
    const lower = searchTerm.toLowerCase();
    return (
      r.invoiceNumber?.toLowerCase().includes(lower) ||
      false ||
      r.customerName?.toLowerCase().includes(lower) ||
      false ||
      r.paymentStatus?.toLowerCase().includes(lower) ||
      false
    );
  });

  // Pagination
  const indexOfLast = currentPage * returnsPerPage;
  const indexOfFirst = indexOfLast - returnsPerPage;
  const currentReturns = filteredReturns.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredReturns.length / returnsPerPage);

  const toggleSelect = (ret) => {
    setSelected((prev) => {
      return prev.some((s) => s === ret._id)
        ? prev.filter((s) => s !== ret._id)
        : [...prev, ret._id];
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentReturns.map((r) => r._id));
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected sale return(s)?`
      )
    ) {
      setSaleReturns((prev) => prev.filter((r) => !selected.includes(r._id)));
      setSelected([]);
    }
  };

  const handleDeleteSingle = (id, invoiceNumber) => {
    if (window.confirm(`Delete sale return ${invoiceNumber}?`)) {
      setSaleReturns((prev) => prev.filter((r) => r._id !== id));
      setSelected((prev) => prev.filter((s) => s !== id));
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  if (loadingData) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-lg">Loading sale returns...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/salelayout/salereturn/new")}
            >
              <UserPlus size={18} /> Add New Sales Return
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
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

        <div className="overflow-x-hidden md:overflow-x-auto whitespace-nowrap shadow">
          <table className="w-full min-w-max border-collapse bg-white rounded-lg text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-4">
                    {currentReturns.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select all return sales"
                        checked={
                          selected.length === currentReturns.length &&
                          currentReturns.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span>Invoice No</span>
                  </div>
                </th>
                <th className="p-3">Invoice Date</th>
                <th className="p-3">Product Name</th>
                <th className="p-3">MR Name</th>
                <th className="p-3">Customer Name</th>
                <th className="p-3">Sales Qty</th>
                <th className="p-3">Return Qty</th>
                <th className="p-3">Used Qty</th>
                <th className="p-3">Selling Price ($)</th>
                <th className="p-3">Discount ($)</th>
                <th className="p-3">Paid Amount</th>
                <th className="p-3">Due Amount</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentReturns.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-4 text-center text-gray-500">
                    No sale returns found.
                  </td>
                </tr>
              ) : (
                currentReturns.map((ret, index) => (
                  <tr
                    key={ret._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % returnsPerPage === 0 ||
                      index + 1 === currentReturns.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.includes(ret._id)}
                          onChange={() => toggleSelect(ret)}
                        />
                        <span className="capitalize">{ret.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {formatDateToReadable(ret.invoiceDate)}
                    </td>
                    <td className="p-3">{ret.productName}</td>
                    <td className="p-3">{ret.mrName}</td>
                    <td className="p-3">{ret.customerName || "--"}</td>
                    <td className="p-3">{ret.salesQty}</td>
                    <td className="p-3">{ret.returnQuantity}</td>
                    <td className="p-3">{ret.usedQty}</td>
                    <td className="p-3">{ret.sellingPrice}</td>
                    <td className="p-3">{ret.discount}</td>
                    <td className="p-3">{ret.paidAmount}</td>
                    <td className="p-3">{ret.dueAmount}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => editReturn(ret)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={() =>
                          handleDeleteSingle(ret._id, ret.invoiceNumber)
                        }
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
        </div>

        <div className="mt-4 p-5 flex justify-start gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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
          ))}

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
