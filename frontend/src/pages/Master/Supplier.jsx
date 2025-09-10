import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserPlus,
  Upload,
  Search,
  Eye,
  Edit,
  Trash2,
  X,
} from "lucide-react";

const Supplier = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
 const [suppliers, setSuppliers] = useState([
  {
    id: 1,
    name: "Mihir Patel",
    email: "mihir@example.com",
    createdAt: "2025-08-01",
    balance: 1200,
    status: "To Collect",
    enabled: true,
  },
  {
    id: 2,
    name: "Ananya Sharma",
    email: "ananya@example.com",
    createdAt: "2025-08-03",
    balance: -800,
    status: "To Pay",
    enabled: false,
  },
  {
    id: 3,
    name: "Ravi Kumar",
    email: "ravi@example.com",
    createdAt: "2025-08-10",
    balance: 500,
    status: "To Collect",
    enabled: true,
  },
  {
    id: 4,
    name: "Neha Mehta",
    email: "neha@example.com",
    createdAt: "2025-08-12",
    balance: -300,
    status: "To Pay",
    enabled: false,
  },
  {
    id: 5,
    name: "Arjun Verma",
    email: "arjun@example.com",
    createdAt: "2025-08-14",
    balance: 2500,
    status: "To Collect",
    enabled: true,
  },
  {
    id: 6,
    name: "Sneha Joshi",
    email: "sneha@example.com",
    createdAt: "2025-08-15",
    balance: -1500,
    status: "To Pay",
    enabled: true,
  },
  {
    id: 7,
    name: "Rahul Desai",
    email: "rahul@example.com",
    createdAt: "2025-08-16",
    balance: 0,
    status: "To Collect",
    enabled: false,
  },
  {
    id: 8,
    name: "Kritika Nair",
    email: "kritika@example.com",
    createdAt: "2025-08-17",
    balance: 800,
    status: "To Collect",
    enabled: true,
  },
  {
    id: 9,
    name: "Vikas Malhotra",
    email: "vikas@example.com",
    createdAt: "2025-08-18",
    balance: -600,
    status: "To Pay",
    enabled: true,
  },
  {
    id: 10,
    name: "Ishita Roy",
    email: "ishita@example.com",
    createdAt: "2025-08-20",
    balance: 100,
    status: "To Collect",
    enabled: false,
  },
]);

  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
const suppliersPerPage = 5; // Show 5 suppliers per page

  // Popup state
  const [showImportModal, setShowImportModal] = useState(false);
  const [file, setFile] = useState(null);

  // Handle checkbox selection
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = () => {
    setSuppliers((prev) => prev.filter((s) => !selected.includes(s.id)));
    setSelected([]);
  };

  // Filter by search
  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

const filteredByTab = filteredSuppliers.filter((s) => {
  if (activeTab === "To Collect") return s.status === "To Collect";
  if (activeTab === "To Pay") return s.status === "To Pay";
  return true;
});

const indexOfLastSupplier = currentPage * suppliersPerPage;
const indexOfFirstSupplier = indexOfLastSupplier - suppliersPerPage;
const currentSuppliers = filteredByTab.slice(indexOfFirstSupplier, indexOfLastSupplier);
const totalPages = Math.ceil(filteredByTab.length / suppliersPerPage);

// At the bottom of Supplier component
useEffect(() => {
  setCurrentPage(1);
}, [activeTab, search]);

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500 mb-4">
        Dashboard <span className="mx-2">{">"}</span> Master{" "}
        <span className="mx-2">{">"}</span>{" "}
        <span className="font-semibold text-gray-700">Supplier</span>
      </div>

      {/* Top bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => navigate("/masterlayout/supplier/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md"
          >
            <UserPlus size={18} /> Add New Supplier
          </button>
          <button
            onClick={() => setShowImportModal(true)}
             className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md"
          >
            <Upload size={18} /> Import CSV
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

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 mb-6">
        {["All", "To Collect", "To Pay"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl shadow-md ${
              activeTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 hover:bg-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
              checked={selected.length === currentSuppliers.length && currentSuppliers.length > 0}

                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? displayedSuppliers.map((s) => s.id) : []
                    )
                  }
                />
              </th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Created At</th>
              <th className="p-3 text-left">Balance</th>
              <th className="p-3 text-left">Enabled</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentSuppliers.map((supplier) => (
              <tr key={supplier.id} className="border-b hover:bg-gray-50">
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(supplier.id)}
                    onChange={() => toggleSelect(supplier.id)}
                  />
                </td>
                <td className="p-3">{supplier.name}</td>
                <td className="p-3">{supplier.email}</td>
                <td className="p-3">{supplier.createdAt}</td>
                <td
                  className={`p-3 font-medium ${
                    supplier.balance < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {supplier.balance < 0
                    ? `₹${Math.abs(supplier.balance)}`
                    : `₹${supplier.balance}`}
                </td>
                <td className="p-3">
                  <button
                    onClick={() =>
                      setSuppliers((prev) =>
                        prev.map((s) =>
                          s.id === supplier.id
                            ? { ...s, enabled: !s.enabled }
                            : s
                        )
                      )
                    }
                    className={`px-3 py-1 rounded-full text-sm ${
                      supplier.enabled
                        ? "bg-green-100 text-green-600"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {supplier.enabled ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td className="p-3 flex items-center justify-center gap-3">
                  <button className="text-blue-600 hover:text-blue-800">
                    <Eye size={18} />
                  </button>
                  <button className="text-green-600 hover:text-green-800">
                    <Edit size={18} />
                  </button>
                  <button className="text-red-600 hover:text-red-800">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
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

  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
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
    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
    disabled={currentPage === totalPages}
    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
  >
    Next
  </button>
</div>

      </div>

      {/* Import CSV Modal */}
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
                  console.log("Uploaded File:", file);
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

export default Supplier;
