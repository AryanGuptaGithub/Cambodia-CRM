import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import {
  Plus,
  Search,
  Eye,
  X,
  DollarSign,
  TrendingUp,
  History,
} from "lucide-react";
import axios from "axios";
import { format } from "date-fns";
import { showToast } from "../../utils/toast.jsx";
import { confirmDialog } from "../../utils/confirmationDialog.js";
import SearchableDropdown from "../../components/common/SearchableDropdown";

const ITEMS_PER_PAGE = 10;
const backendUrl = import.meta.env.VITE_BACKEND_URL;

function MRCash() {
  const [mrCashes, setMrCashes] = useState([]);
  const [allMRCashes, setAllMRCashes] = useState([]); // Store all data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState("carry");

  // Totals from backend
  const [totals, setTotals] = useState({
    totalCurrentCash: 0,
    totalTransferred: 0,
    totalAll: 0,
  });

  // Modal states
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedMRCash, setSelectedMRCash] = useState(null);

  // Transfer history state
  const [transferHistory, setTransferHistory] = useState([]);
  const [transferHistoryLoading, setTransferHistoryLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    mrCashId: "",
    transferAmount: "",
    notes: "",
  });

  const [transferForm, setTransferForm] = useState({
    amount: "",
    notes: "",
  });

  // MR List for dropdown
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);

  const inputRef = useRef(null);

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "dd MMM yyyy, hh:mm a");
    } catch (error) {
      return "Invalid Date";
    }
  };

  // Fetch MR list for dropdown
  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/mr-cash/mr-list-with-cash`
      );
      if (response.data.success) {
        setMrList(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching MR list:", error);
      showToast("error", "Failed to load MR list");
    } finally {
      setMrListLoading(false);
    }
  }, []);

  // Fetch transfer history for a specific MR
  const fetchTransferHistory = useCallback(async (mrCashId) => {
    try {
      setTransferHistoryLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/mr-cash/${mrCashId}/transfers`,
        {
          params: {
            limit: 30,
            page: 1,
          },
        }
      );
      if (response.data.success) {
        setTransferHistory(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching transfer history:", error);
      showToast("error", "Failed to load transfer history");
      setTransferHistory([]);
    } finally {
      setTransferHistoryLoading(false);
    }
  }, []);

  // Fetch all MR Cash records (no pagination from backend)
  const fetchAllMRCashes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${backendUrl}/api/mr-cash`, {
        params: {
          limit: 1000, // Get all records in one request
          page: 1,
        },
      });

      if (response.data.success) {
        const allData = response.data.data || [];
        setAllMRCashes(allData); // Store all data

        // Set totals from backend
        setTotals(
          response.data.totals || {
            totalCurrentCash: 0,
            totalTransferred: 0,
            totalAll: 0,
          }
        );

        // Apply initial filter and pagination
        filterAndPaginateData(allData, currentPage, activeTab, searchTerm);
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (error) {
      setError(
        error.response?.data?.message ||
          error.message ||
          "Failed to load MR Cash data"
      );
      showToast("error", "Failed to load MR Cash data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter and paginate data locally
  const filterAndPaginateData = (data, page, tab, search = "") => {
    // Apply search filter
    let filteredData = data;
    if (search) {
      filteredData = data.filter(
        (record) =>
          record.mrName?.toLowerCase().includes(search.toLowerCase()) ||
          record.notes?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Apply tab filter
    if (tab === "carry") {
      filteredData = filteredData.filter((record) => record.currentCash > 0);
    } else {
      filteredData = filteredData.filter(
        (record) => record.cashTransferredToAdmin > 0
      );
    }

    // Calculate pagination
    const total = filteredData.length;
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    // Update state
    setMrCashes(paginatedData);
    setTotalCount(total);
    setTotalPages(totalPages);
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    filterAndPaginateData(allMRCashes, 1, tab, searchTerm);
  };

  // Handle search
  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    filterAndPaginateData(allMRCashes, 1, activeTab, searchTerm);
  }, [allMRCashes, activeTab, searchTerm]);

  // Initial load
  useEffect(() => {
    fetchAllMRCashes();
    fetchMRList();
  }, [fetchAllMRCashes, fetchMRList]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, handleSearch]);

  // Handle add new MR Cash transfer
  const handleAdd = () => {
    setFormData({
      mrCashId: "",
      transferAmount: "",
      notes: "",
    });
    setSelectedMRCash(null);
    setIsAddModalOpen(true);
    fetchMRList();
  };

  // Handle view details
  const handleView = async (record) => {
    setSelectedRecord(record);
    setIsViewModalOpen(true);
    await fetchTransferHistory(record._id);
  };

  // Handle delete
  const handleDelete = async (record) => {
    const confirm = await confirmDialog({
      title: "Delete MR Cash Record",
      text: `Are you sure you want to delete the cash record for <b>${record.mrName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        await axios.delete(`${backendUrl}/api/mrcash/${record._id}`);
        showToast("success", "MR Cash record deleted successfully");
        fetchAllMRCashes();
        fetchMRList();
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete record"
        );
      }
    }
  };

  // Handle form input changes for Add Modal
  const handleFormChange = (e) => {
    const { name, value } = e.target;

    if (name === "transferAmount" && selectedMRCash) {
      const maxAmount = selectedMRCash.currentCash || 0;
      const inputAmount = parseFloat(value) || 0;

      if (inputAmount > maxAmount) {
        showToast(
          "error",
          `Cannot transfer more than available cash (${formatCurrency(
            maxAmount
          )})`
        );
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle transfer form changes
  const handleTransferFormChange = (e) => {
    const { name, value } = e.target;
    setTransferForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle MR selection in Add Modal
  const handleMRSelect = (value) => {
    const selectedMR = mrList.find((mr) => mr.value === value);
    if (selectedMR) {
      setSelectedMRCash(selectedMR);
      setFormData((prev) => ({
        ...prev,
        mrCashId: value,
        transferAmount:
          selectedMR.currentCash > 0 ? selectedMR.currentCash.toString() : "0",
        notes: "",
      }));
    }
  };

  // Submit add form (for transferring cash to admin)
  const handleSubmitTransferToAdmin = async (e) => {
    e.preventDefault();

    if (
      !formData.mrCashId ||
      !formData.transferAmount ||
      parseFloat(formData.transferAmount) <= 0
    ) {
      showToast(
        "error",
        "Please select an MR and enter a valid transfer amount"
      );
      return;
    }

    const selectedMR = mrList.find((mr) => mr.value === formData.mrCashId);
    const transferAmount = parseFloat(formData.transferAmount);

    if (selectedMR && transferAmount > selectedMR.currentCash) {
      showToast(
        "error",
        `Insufficient cash available. Available: ${formatCurrency(
          selectedMR.currentCash
        )}, Requested: ${formatCurrency(transferAmount)}`
      );
      return;
    }

    try {
      const response = await axios.post(
        `${backendUrl}/api/mr-cash/${formData.mrCashId}/transfer`,
        {
          amount: transferAmount,
          notes: formData.notes,
        }
      );

      if (response.data.success) {
        showToast("success", "Cash transferred to admin successfully");
        setIsAddModalOpen(false);
        // Reset form
        setFormData({
          mrCashId: "",
          transferAmount: "",
          notes: "",
        });
        setSelectedMRCash(null);
        // Refresh data
        fetchAllMRCashes();
        fetchMRList();
      }
    } catch (error) {
      console.error("Transfer error:", error);
      showToast(
        "error",
        error.response?.data?.message ||
          error.message ||
          "Failed to transfer cash"
      );
    }
  };

  // Submit transfer form (from table row)
  const handleSubmitTransfer = async (e) => {
    e.preventDefault();

    const transferAmount = parseFloat(transferForm.amount);

    if (transferAmount > selectedRecord.currentCash) {
      showToast(
        "error",
        `Insufficient cash available. Available: ${formatCurrency(
          selectedRecord.currentCash
        )}, Requested: ${formatCurrency(transferAmount)}`
      );
      return;
    }

    try {
      const response = await axios.post(
        `${backendUrl}/api/mr-cash/${selectedRecord._id}/transfer`,
        {
          amount: transferAmount,
          notes: transferForm.notes,
        }
      );

      if (response.data.success) {
        showToast("success", "Cash transferred to admin successfully");
        setIsTransferModalOpen(false);
        setTransferForm({ amount: "", notes: "" });
        // Refresh data
        fetchAllMRCashes();
        fetchMRList();
      }
    } catch (error) {
      console.error("Transfer error:", error);
      showToast(
        "error",
        error.response?.data?.message ||
          error.message ||
          "Failed to transfer cash"
      );
    }
  };

  // Handle opening transfer modal from table
  const handleOpenTransferModal = (record) => {
    setSelectedRecord(record);
    setTransferForm({
      amount: record.currentCash > 0 ? record.currentCash.toString() : "0",
      notes: "",
    });
    setIsTransferModalOpen(true);
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    filterAndPaginateData(allMRCashes, newPage, activeTab, searchTerm);
  };

  if (loading && mrCashes.length === 0) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-gray-600">Loading MR Cash data...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Accounts{" "}
        <span className="mx-2">{">"}</span> MR Cash
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer"
          >
            <TrendingUp size={18} /> Transfer Cash to Admin
          </button>
        </div>

        <div className="flex gap-3">
          <div className="relative w-full lg:w-80">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={18}
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by MR name or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <X size={20} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Totals Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">All MR Carry Current Cash</p>
              <p className="text-2xl font-bold text-blue-700">
                {formatCurrency(totals.totalCurrentCash)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Sum of all MRs' current cash
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">
                Total Transferred to Admin (All MRs)
              </p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(totals.totalTransferred)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Sum of all transfers to admin
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-4">
          <button
            onClick={() => handleTabChange("carry")}
            className={`py-2 px-4 font-medium text-sm transition-colors ${
              activeTab === "carry"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            MR Carry Cash
            <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
              {
                allMRCashes.filter(
                  (record) =>
                    record.currentCash > 0 &&
                    (searchTerm === "" ||
                      record.mrName
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                      record.notes
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()))
                ).length
              }
            </span>
          </button>
          <button
            onClick={() => handleTabChange("transferred")}
            className={`py-2 px-4 font-medium text-sm transition-colors ${
              activeTab === "transferred"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            MR Transfer Cash To Admin
            <span className="ml-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
              {
                allMRCashes.filter(
                  (record) =>
                    record.cashTransferredToAdmin > 0 &&
                    (searchTerm === "" ||
                      record.mrName
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                      record.notes
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()))
                ).length
              }
            </span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span>MR Name</span>
                  </div>
                </th>
                {activeTab === "carry" ? (
                  <>
                    <th className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span>Current Cash</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span>Last Transfer</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </>
                ) : (
                  <>
                    <th className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span>Transferred to Admin</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span>Last Transfer</span>
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {mrCashes.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-gray-500 text-center">
                    {searchTerm
                      ? "No matching records found"
                      : activeTab === "carry"
                      ? "No MRs with current cash available"
                      : "No MRs with transferred cash to admin"}
                  </td>
                </tr>
              ) : (
                mrCashes.map((record, index) => (
                  <tr
                    key={record._id}
                    className={`hover:bg-gray-50 ${
                      index < mrCashes.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-center">
                      <div className="font-medium text-gray-900">
                        {record.mrName}
                      </div>
                    </td>

                    {activeTab === "carry" ? (
                      <>
                        <td className="py-3 px-4 text-center">
                          <div className="text-blue-700 font-semibold">
                            {formatCurrency(record.currentCash)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="text-gray-700">
                            {record.lastTransferDate
                              ? formatDate(record.lastTransferDate)
                              : "N/A"}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => handleView(record)}
                              className="text-blue-600 hover:text-blue-800 cursor-pointer"
                              title="View Details"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => handleOpenTransferModal(record)}
                              className="text-green-600 hover:text-green-800 cursor-pointer"
                              title="Transfer to Admin"
                              disabled={record.currentCash <= 0}
                            >
                              <TrendingUp size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 text-center">
                          <div className="text-green-700 font-semibold">
                            {formatCurrency(record.cashTransferredToAdmin)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="text-gray-700">
                            {record.lastTransferDate
                              ? formatDate(record.lastTransferDate)
                              : "N/A"}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => handleView(record)}
                              className="text-blue-600 hover:text-blue-800 cursor-pointer"
                              title="View Transfer History"
                            >
                              <History size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination - FIXED */}
      {totalPages > 1 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            >
              <span>Previous</span>
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1 rounded-lg min-w-[40px] cursor-pointer ${
                      currentPage === pageNum
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            >
              <span>Next</span>
            </button>
          </div>
        </div>
      )}

      {isViewModalOpen &&
        selectedRecord &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setIsViewModalOpen(false);
                setTransferHistory([]);
              }}
            />

            <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => {
                  setIsViewModalOpen(false);
                  setTransferHistory([]);
                }}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              {activeTab === "carry" ? (
                <>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">
                    MR Cash Details
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        MR Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {selectedRecord.mrName}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Current Cash
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 font-bold text-blue-700">
                        {formatCurrency(selectedRecord.currentCash)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Last Transfer Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {selectedRecord.lastTransferDate
                          ? formatDate(selectedRecord.lastTransferDate)
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">
                    MR Transfer History - {selectedRecord.mrName}
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        MR Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {selectedRecord.mrName}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Total Transferred to Admin
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 font-bold text-green-700">
                        {formatCurrency(selectedRecord.cashTransferredToAdmin)}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Last Transfer Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {selectedRecord.lastTransferDate
                          ? formatDate(selectedRecord.lastTransferDate)
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Transfer History Table */}
                  <div className="mb-6">
                    <h3 className="text-lg font-medium text-gray-700 mb-3">
                      Last 30 Transfer Records
                    </h3>

                    {transferHistoryLoading ? (
                      <div className="text-center py-4">
                        <div className="text-gray-600">
                          Loading transfer history...
                        </div>
                      </div>
                    ) : transferHistory.length === 0 ? (
                      <div className="text-center py-4 border rounded-lg bg-gray-50">
                        <div className="text-gray-500">
                          No transfer records found
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full min-w-max text-center">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="py-3 px-4 font-medium text-gray-700">
                                Transfer Date
                              </th>
                              <th className="py-3 px-4 font-medium text-gray-700">
                                Amount
                              </th>
                              <th className="py-3 px-4 font-medium text-gray-700">
                                Notes
                              </th>
                              <th className="py-3 px-4 font-medium text-gray-700">
                                Transferred By
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {transferHistory.map((transfer, index) => (
                              <tr
                                key={transfer._id}
                                className={`hover:bg-gray-50 ${
                                  index < transferHistory.length - 1
                                    ? "border-b"
                                    : ""
                                }`}
                              >
                                <td className="py-3 px-4">
                                  {formatDate(transfer.transferredAt)}
                                </td>
                                <td className="py-3 px-4 font-medium text-green-700">
                                  {formatCurrency(transfer.amount)}
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  {transfer.notes || "N/A"}
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  {transfer.transferredBy?.name || "System"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="mt-6 flex justify-end border-t border-gray-300 pt-4">
                <button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    setTransferHistory([]);
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {isAddModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-bold text-gray-800">
                  MR Cash Transfer To Admin
                </h2>
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setSelectedMRCash(null);
                    setFormData({
                      mrCashId: "",
                      transferAmount: "",
                      notes: "",
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <form
                onSubmit={handleSubmitTransferToAdmin}
                className="p-6 space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select MR <span className="text-red-500">*</span>
                  </label>
                  <SearchableDropdown
                    value={formData.mrCashId}
                    onChange={handleMRSelect}
                    options={mrList}
                    placeholder={
                      mrListLoading ? "Loading MRs with cash..." : "Select MR"
                    }
                    required
                    disabled={mrListLoading || mrList.length === 0}
                  />
                  {mrList.length === 0 && !mrListLoading && (
                    <p className="text-sm text-gray-500 mt-1">
                      No MRs found with positive cash balance
                    </p>
                  )}
                </div>

                {/* Show selected MR's current cash */}
                {selectedMRCash && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">
                        Available Cash:
                      </span>
                      <span className="text-lg font-bold text-blue-700">
                        {formatCurrency(selectedMRCash.currentCash)}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transfer Amount ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="transferAmount"
                    value={formData.transferAmount}
                    onChange={handleFormChange}
                    min="0.01"
                    max={selectedMRCash?.currentCash || 0}
                    step="0.01"
                    className="w-full border px-3 py-2 rounded-lg"
                    placeholder="Enter amount to transfer"
                    required
                    disabled={!selectedMRCash}
                  />
                  {selectedMRCash && (
                    <p className="text-sm text-gray-500 mt-1">
                      Maximum transferable:{" "}
                      {formatCurrency(selectedMRCash.currentCash)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transfer Notes
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleFormChange}
                    rows="3"
                    className="w-full border px-3 py-2 rounded-lg"
                    placeholder="Reason for transfer..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setSelectedMRCash(null);
                      setFormData({
                        mrCashId: "",
                        transferAmount: "",
                        notes: "",
                      });
                    }}
                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer"
                    disabled={
                      !formData.mrCashId ||
                      !formData.transferAmount ||
                      parseFloat(formData.transferAmount) <= 0 ||
                      (selectedMRCash &&
                        parseFloat(formData.transferAmount) >
                          selectedMRCash.currentCash)
                    }
                  >
                    Transfer to Admin
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
      {isTransferModalOpen &&
        selectedRecord &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-bold text-gray-800">
                  Transfer Cash to Admin
                </h2>
                <button
                  onClick={() => setIsTransferModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmitTransfer} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    MR Name
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg font-medium">
                    {selectedRecord.mrName}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Available Cash
                  </label>
                  <div className="p-3 bg-blue-50 rounded-lg font-bold text-blue-700">
                    {formatCurrency(selectedRecord.currentCash)}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transfer Amount ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="amount"
                    value={transferForm.amount}
                    onChange={handleTransferFormChange}
                    min="0.01"
                    max={selectedRecord.currentCash}
                    step="0.01"
                    className="w-full border px-3 py-2 rounded-lg"
                    placeholder="Enter amount"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Maximum: {formatCurrency(selectedRecord.currentCash)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transfer Notes
                  </label>
                  <textarea
                    name="notes"
                    value={transferForm.notes}
                    onChange={handleTransferFormChange}
                    rows="3"
                    className="w-full border px-3 py-2 rounded-lg"
                    placeholder="Reason for transfer..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer"
                    disabled={
                      !transferForm.amount ||
                      parseFloat(transferForm.amount) <= 0 ||
                      parseFloat(transferForm.amount) >
                        selectedRecord.currentCash
                    }
                  >
                    Transfer
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default MRCash;
