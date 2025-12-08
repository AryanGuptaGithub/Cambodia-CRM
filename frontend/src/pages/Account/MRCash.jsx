import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  X,
  Users,
  DollarSign,
  RefreshCw,
  Download,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Modal states
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  
  // Form states
  const [formData, setFormData] = useState({
    mrId: "",
    currentCash: "",
    cashTransferredToAdmin: "",
    notes: ""
  });
  
  const [transferForm, setTransferForm] = useState({
    amount: "",
    notes: ""
  });
  
  // MR List for dropdown
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);
  
  // Sorting
  const [sortConfig, setSortConfig] = useState({
    field: "createdAt",
    direction: "desc"
  });
  
  const inputRef = useRef(null);

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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
      const response = await axios.get(`${backendUrl}/api/accounts/mrcash/mr-list`);
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

  // Fetch MR Cash records
  const fetchMRCashes = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        page,
        limit: ITEMS_PER_PAGE,
        search: searchTerm,
        sortBy: sortConfig.field,
        sortOrder: sortConfig.direction
      };
      
      const response = await axios.get(`${backendUrl}/api/accounts/mrcash`, { params });
      
      if (response.data.success) {
        setMrCashes(response.data.data || []);
        setTotalPages(response.data.pagination?.pages || 1);
        setTotalCount(response.data.pagination?.total || 0);
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (error) {
      setError(error.response?.data?.message || error.message || "Failed to load MR Cash data");
      showToast("error", "Failed to load MR Cash data");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, sortConfig]);

  // Initial load
  useEffect(() => {
    fetchMRCashes(currentPage);
    fetchMRList();
  }, [currentPage, fetchMRCashes, fetchMRList]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchMRCashes(1);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [searchTerm, fetchMRCashes]);

  // Handle sort
  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc"
    }));
  };

  // Handle add new MR Cash
  const handleAdd = () => {
    setFormData({
      mrId: "",
      currentCash: "",
      cashTransferredToAdmin: "",
      notes: ""
    });
    setIsAddModalOpen(true);
  };

  // Handle view details
  const handleView = (record) => {
    setSelectedRecord(record);
    setIsViewModalOpen(true);
  };

  // Handle edit
  const handleEdit = (record) => {
    setSelectedRecord(record);
    setFormData({
      mrId: record.mrId?._id || record.mrId,
      currentCash: record.currentCash,
      cashTransferredToAdmin: record.cashTransferredToAdmin,
      notes: record.notes || ""
    });
    setIsEditModalOpen(true);
  };

  // Handle transfer cash
  const handleTransfer = (record) => {
    setSelectedRecord(record);
    setTransferForm({
      amount: "",
      notes: ""
    });
    setIsTransferModalOpen(true);
  };

  // Handle delete
  const handleDelete = async (record) => {
    const confirm = await confirmDialog({
      title: "Delete MR Cash Record",
      text: `Are you sure you want to delete the cash record for <b>${record.mrName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel"
    });

    if (confirm.isConfirmed) {
      try {
        await axios.delete(`${backendUrl}/api/accounts/mrcash/${record._id}`);
        showToast("success", "MR Cash record deleted successfully");
        fetchMRCashes(currentPage);
      } catch (error) {
        showToast("error", error.response?.data?.message || "Failed to delete record");
      }
    }
  };

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle transfer form changes
  const handleTransferFormChange = (e) => {
    const { name, value } = e.target;
    setTransferForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle MR selection
  const handleMRSelect = (value) => {
    const selectedMR = mrList.find(mr => mr.value === value);
    setFormData(prev => ({
      ...prev,
      mrId: value,
      mrName: selectedMR?.label || ""
    }));
  };

  // Submit add form
  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.post(`${backendUrl}/api/accounts/mrcash`, formData);
      
      if (response.data.success) {
        showToast("success", "MR Cash record created successfully");
        setIsAddModalOpen(false);
        fetchMRCashes(currentPage);
        fetchMRList(); // Refresh MR list
      }
    } catch (error) {
      showToast("error", error.response?.data?.message || "Failed to create record");
    }
  };

  // Submit edit form
  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.put(
        `${backendUrl}/api/accounts/mrcash/${selectedRecord._id}`,
        formData
      );
      
      if (response.data.success) {
        showToast("success", "MR Cash record updated successfully");
        setIsEditModalOpen(false);
        fetchMRCashes(currentPage);
      }
    } catch (error) {
      showToast("error", error.response?.data?.message || "Failed to update record");
    }
  };

  // Submit transfer form
  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.post(
        `${backendUrl}/api/accounts/mrcash/${selectedRecord._id}/transfer`,
        transferForm
      );
      
      if (response.data.success) {
        showToast("success", "Cash transferred to admin successfully");
        setIsTransferModalOpen(false);
        fetchMRCashes(currentPage);
      }
    } catch (error) {
      showToast("error", error.response?.data?.message || "Failed to transfer cash");
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return mrCashes.reduce(
      (acc, record) => ({
        currentCash: acc.currentCash + (record.currentCash || 0),
        transferred: acc.transferred + (record.cashTransferredToAdmin || 0),
        total: acc.total + ((record.currentCash || 0) + (record.cashTransferredToAdmin || 0))
      }),
      { currentCash: 0, transferred: 0, total: 0 }
    );
  }, [mrCashes]);

  // Render sort icon
  const renderSortIcon = (field) => {
    if (sortConfig.field !== field) {
      return <ChevronDown className="w-4 h-4 opacity-50" />;
    }
    return sortConfig.direction === "asc" ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
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
        Dashboard <span className="mx-2">{">"}</span> Accounts <span className="mx-2">{">"}</span> MR Cash
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">MR Cash Management</h1>
          <p className="text-gray-600">Manage MR cash balances and transfers to admin</p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer"
          >
            <Plus size={18} /> Add New MR Cash
          </button>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Current Cash Balance</p>
              <p className="text-2xl font-bold text-blue-700">{formatCurrency(totals.currentCash)}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Transferred to Admin</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(totals.transferred)}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Cash Managed</p>
              <p className="text-2xl font-bold text-purple-700">{formatCurrency(totals.total)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <span className="text-gray-700">Total Records: <span className="font-semibold">{totalCount}</span></span>
        </div>
        
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

      {/* Table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th 
                  className="p-4 text-left cursor-pointer"
                  onClick={() => handleSort("mrName")}
                >
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-gray-500" />
                    <span>MR Name</span>
                    {renderSortIcon("mrName")}
                  </div>
                </th>
                <th 
                  className="p-4 text-left cursor-pointer"
                  onClick={() => handleSort("currentCash")}
                >
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-blue-500" />
                    <span>Current Cash</span>
                    {renderSortIcon("currentCash")}
                  </div>
                </th>
                <th 
                  className="p-4 text-left cursor-pointer"
                  onClick={() => handleSort("cashTransferredToAdmin")}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-green-500" />
                    <span>Transferred to Admin</span>
                    
                </div>
                </th>
                <th className="p-4 text-left">Total Cash</th>
                <th 
                  className="p-4 text-left cursor-pointer"
                  onClick={() => handleSort("lastTransferDate")}
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-500" />
                    <span>Last Transfer Date</span>
                    
                  </div>
                </th>
                <th 
                  className="p-4 text-left cursor-pointer"
                  onClick={() => handleSort("updatedAt")}
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-500" />
                    <span>Updated Date</span>
                    {renderSortIcon("updatedAt")}
                  </div>
                </th>
                <th className="p-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mrCashes.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    {searchTerm ? "No matching records found" : "No MR Cash records available"}
                  </td>
                </tr>
              ) : (
                mrCashes.map((record, index) => (
                  <tr 
                    key={record._id} 
                    className={`hover:bg-gray-50 ${index < mrCashes.length - 1 ? "border-b" : ""}`}
                  >
                    <td className="p-4">
                      <div>
                        <div className="font-medium text-gray-900">{record.mrName}</div>
                        {record.mrDetails && (
                          <div className="text-sm text-gray-500 mt-1">
                            <div className="flex items-center gap-2">
                              <Phone size={14} />
                              <span>{record.mrDetails.phone || "N/A"}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Mail size={14} />
                              <span>{record.mrDetails.email || "N/A"}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-blue-700 font-semibold">
                        {formatCurrency(record.currentCash)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-green-700 font-semibold">
                        {formatCurrency(record.cashTransferredToAdmin)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-purple-700 font-bold">
                        {formatCurrency(record.totalCash)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-gray-700">
                        {record.lastTransferDate ? formatDate(record.lastTransferDate) : "N/A"}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-gray-700">
                        {formatDate(record.updatedAt)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleView(record)}
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-green-600 hover:text-green-800 cursor-pointer"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleTransfer(record)}
                          className="text-purple-600 hover:text-purple-800 cursor-pointer"
                          title="Transfer Cash"
                        >
                          <RefreshCw size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(record)}
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
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
                  onClick={() => setCurrentPage(pageNum)}
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
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* View Modal */}
      {isViewModalOpen && selectedRecord && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">MR Cash Details</h2>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">MR Name</label>
                  <div className="p-3 bg-gray-50 rounded-lg font-medium">{selectedRecord.mrName}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Current Cash</label>
                  <div className="p-3 bg-blue-50 rounded-lg font-bold text-blue-700">
                    {formatCurrency(selectedRecord.currentCash)}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Transferred to Admin</label>
                  <div className="p-3 bg-green-50 rounded-lg font-bold text-green-700">
                    {formatCurrency(selectedRecord.cashTransferredToAdmin)}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Total Cash</label>
                  <div className="p-3 bg-purple-50 rounded-lg font-bold text-purple-700">
                    {formatCurrency(selectedRecord.totalCash)}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Last Transfer Date</label>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    {selectedRecord.lastTransferDate ? formatDate(selectedRecord.lastTransferDate) : "N/A"}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Created Date</label>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    {formatDate(selectedRecord.createdAt)}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Updated Date</label>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    {formatDate(selectedRecord.updatedAt)}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Notes</label>
                  <div className="p-3 bg-gray-50 rounded-lg min-h-[100px]">
                    {selectedRecord.notes || "No notes"}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t flex justify-end">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Modal */}
      {isAddModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Add New MR Cash</h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmitAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select MR <span className="text-red-500">*</span>
                </label>
                <SearchableDropdown
                  value={formData.mrId}
                  onChange={handleMRSelect}
                  options={mrList}
                  placeholder={mrListLoading ? "Loading MRs..." : "Select MR"}
                  required
                  disabled={mrListLoading || mrList.length === 0}
                />
                {mrList.length === 0 && !mrListLoading && (
                  <p className="text-sm text-red-500 mt-1">No available MRs found</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Initial Cash Balance ($)
                </label>
                <input
                  type="number"
                  name="currentCash"
                  value={formData.currentCash}
                  onChange={handleFormChange}
                  min="0"
                  step="0.01"
                  className="w-full border px-3 py-2 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  rows="3"
                  className="w-full border px-3 py-2 rounded-lg"
                  placeholder="Additional notes..."
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                  disabled={!formData.mrId}
                >
                  Add Record
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Modal */}
      {isEditModalOpen && selectedRecord && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Edit MR Cash</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmitEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">MR Name</label>
                <div className="p-3 bg-gray-50 rounded-lg font-medium">{selectedRecord.mrName}</div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Cash ($)
                </label>
                <input
                  type="number"
                  name="currentCash"
                  value={formData.currentCash}
                  onChange={handleFormChange}
                  min="0"
                  step="0.01"
                  className="w-full border px-3 py-2 rounded-lg"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transferred to Admin ($)
                </label>
                <input
                  type="number"
                  name="cashTransferredToAdmin"
                  value={formData.cashTransferredToAdmin}
                  onChange={handleFormChange}
                  min="0"
                  step="0.01"
                  className="w-full border px-3 py-2 rounded-lg"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  rows="3"
                  className="w-full border px-3 py-2 rounded-lg"
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && selectedRecord && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Transfer Cash to Admin</h2>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmitTransfer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">MR Name</label>
                <div className="p-3 bg-gray-50 rounded-lg font-medium">{selectedRecord.mrName}</div>
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
                  disabled={!transferForm.amount || parseFloat(transferForm.amount) > selectedRecord.currentCash}
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