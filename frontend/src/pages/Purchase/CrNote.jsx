import React, { useState } from "react";
import { UserPlus, Trash2, Edit } from "lucide-react";

// Sample static credit note data
const creditNoteData = [
  {
    id: 1,
    invoiceNo: "CRN001",
    crNoteDate: "2025-08-05",
    customer: "John Doe",
    crNoteStatus: "Issued",
    totalAmount: 1200,
    paidAmount: 1200,
    paymentStatus: "Paid",
  },
  {
    id: 2,
    invoiceNo: "CRN002",
    crNoteDate: "2025-08-10",
    customer: "Jane Smith",
    crNoteStatus: "Pending",
    totalAmount: 2000,
    paidAmount: 500,
    paymentStatus: "Unpaid",
  },
  {
    id: 3,
    invoiceNo: "CRN003",
    crNoteDate: "2025-08-15",
    customer: "Acme Corp",
    crNoteStatus: "Processed",
    totalAmount: 3000,
    paidAmount: 3000,
    paymentStatus: "Paid",
  },
];

const CrNote = () => {
  const [creditNotes, setCreditNotes] = useState(creditNoteData);
  const [selectedTab, setSelectedTab] = useState("All Credit Notes");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const notesPerPage = 10;

  // Filter notes by tab + search
  const filteredNotes = creditNotes.filter((note) => {
    const matchesTab =
      selectedTab === "All Credit Notes"
        ? true
        : selectedTab === "Paid"
        ? note.paymentStatus === "Paid"
        : note.paymentStatus === "Unpaid";

    if (!matchesTab) return false;

    if (searchTerm.trim() === "") return true;
    const lowerSearch = searchTerm.toLowerCase();

    return (
      note.invoiceNo.toLowerCase().includes(lowerSearch) ||
      note.customer.toLowerCase().includes(lowerSearch) ||
      note.crNoteStatus.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination
  const indexOfLast = currentPage * notesPerPage;
  const indexOfFirst = indexOfLast - notesPerPage;
  const currentNotes = filteredNotes.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredNotes.length / notesPerPage);

  // Selection handlers
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentNotes.map((n) => n.id));
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected credit note(s)?`
      )
    ) {
      setCreditNotes((prev) => prev.filter((n) => !selected.includes(n.id)));
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
            onClick={() => alert("Add new credit note clicked")}
          >
            <UserPlus size={18} /> Add New Purchase Return
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
        {["All Purchase Returns/Dr.Note", "Paid", "Unpaid"].map((tab) => (
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
                    selected.length === currentNotes.length &&
                    currentNotes.length > 0
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Invoice Number</th>
              <th className="p-3 text-left">Credit Note Date</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Return Status</th>
              <th className="p-3 text-left">Total Amount</th>
              <th className="p-3 text-left">Paid Amount</th>
              <th className="p-3 text-left">Due Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentNotes.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500">
                  No credit notes found.
                </td>
              </tr>
            ) : (
              currentNotes.map((note) => {
                const dueAmount = note.totalAmount - note.paidAmount;
                return (
                  <tr key={note.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(note.id)}
                        onChange={() => toggleSelect(note.id)}
                      />
                    </td>
                    <td className="p-3">{note.invoiceNo}</td>
                    <td className="p-3">{note.crNoteDate}</td>
                    <td className="p-3">{note.customer}</td>
                    <td className="p-3">{note.crNoteStatus}</td>
                    <td className="p-3">₹{note.totalAmount}</td>
                    <td className="p-3">₹{note.paidAmount}</td>
                    <td className="p-3">₹{dueAmount}</td>
                    <td className="p-3">{note.paymentStatus}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() =>
                          alert(`Edit credit note ${note.invoiceNo}`)
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
                              `Are you sure you want to delete credit note ${note.invoiceNo}?`
                            )
                          ) {
                            setCreditNotes((prev) =>
                              prev.filter((n) => n.id !== note.id)
                            );
                            setSelected((prev) =>
                              prev.filter((id) => id !== note.id)
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

export default CrNote;
