import { useNavigate } from "react-router-dom";
import { UserPlus, Upload, Search, Eye, Edit, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import * as XLSX from "xlsx";

const backendUrl = "http://localhost:3001";
const suppliersPerPage = 5;

const Supplier = () => {
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);

  // Fetch suppliers
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/suppliers`);
        if (!response.ok) throw new Error("Failed to fetch suppliers");
        const data = await response.json();
        setSupplier(data);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchSuppliers();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search]);

  // Filtered + searched + tabbed suppliers
  const filteredSuppliers = useMemo(() => {
    return supplier.filter((s) => {
      const matchesTab =
        activeTab === "All" ||
        (activeTab === "To Collect" && s.status === "To Collect") ||
        (activeTab === "To Pay" && s.status === "To Pay");

      const matchesSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [supplier, activeTab, search]);

  // Pagination logic
  const totalPages = Math.ceil(filteredSuppliers.length / suppliersPerPage);
  const currentSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * suppliersPerPage,
    currentPage * suppliersPerPage
  );

  // Select/unselect supplier
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked) => {
    setSelected(checked ? currentSuppliers.map((s) => s._id) : []);
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete ${selected.length} suppliers?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/suppliers`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Suppliers deleted successfully");
          const refreshed = await fetch(`${backendUrl}/api/suppliers`);
          const updated = await refreshed.json();
          setSupplier(updated);
          setSelected([]);
        }
      } catch (err) {
        showToast("error", "Failed to delete suppliers.");
      }
    } else {
      setSelected([]); // uncheck all if user cancels
    }
  };

  // Delete one
  const deleteSupplier = async (supplier) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete ${supplier.name}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/suppliers/${supplier._id}`
        );

        if (res.status === 200) {
          showToast("success", "Supplier deleted");
          const refreshed = await fetch(`${backendUrl}/api/suppliers`);
          const updated = await refreshed.json();
          setSupplier(updated);
        }
      } catch (err) {
        showToast("error", "Failed to delete supplier.");
      }
    }
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      setParsedData(jsonData);
    };
    reader.readAsArrayBuffer(file);
  };

  // Import suppliers
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a file first");
      return;
    }

    try {
      const res = await axios.post(`${backendUrl}/api/suppliers/import`, parsedData);
      if (res.status === 200) {
        showToast("success", "Suppliers imported successfully");
        setShowImportModal(false);
        const refreshed = await fetch(`${backendUrl}/api/suppliers`);
        const updated = await refreshed.json();
        setSupplier(updated);
      }
    } catch (err) {
      showToast("error", "Import failed");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

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
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  checked={
                    selected.length === currentSuppliers.length &&
                    currentSuppliers.length > 0
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? displayedSuppliers.map((s) => s.id)
                        : []
                    )
                  }
                />
              </th>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Created At</th>
              <th className="p-3">Balance</th>
              <th className="p-3">Enabled</th>
              <th className="p-3">Action</th>
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
        <div className="mt-4 flex justify-start gap-2 p-5">
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
