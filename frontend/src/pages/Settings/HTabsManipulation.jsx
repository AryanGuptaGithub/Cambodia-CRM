import React, { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Eye,
  EyeOff,
  GripVertical,
  Save,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const HTabsManipulation = () => {
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [reportTypes, setReportTypes] = useState(["Hide/Show Tabs", "Sequence Number"]);
  const [selectedReportType, setSelectedReportType] = useState("Hide/Show Tabs");
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const inputRef = useRef(null);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  // Calculate serial number based on current page and items per page
  const getSerialNumber = (index) => {
    const itemsPerPage = 7;
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  const fetchTabsData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page: page,
        limit: 7,
        reportType: selectedReportType,
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(`${backendUrl}/api/h-tabs`, {
        params,
      });
      setTabs(response.data.data?.tabs || []);
      setPagination(
        response.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        }
      );
    } catch (error) {
      console.error("Error fetching tabs data:", error);
      showToast("error", "Failed to fetch tabs data");

      // Reset data on error
      setTabs([]);
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        hasNext: false,
        hasPrev: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTabsData(1);
  }, [selectedReportType]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchTabsData(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchTabsData(1);
  };

  // Debounced search effect
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchTabsData(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchTabsData(1);
    }
  };

  const handleReportTypeChange = (type) => {
    setSelectedReportType(type);
  };

  const handleToggleVisibility = async (tabId) => {
    try {
      const updatedTabs = tabs.map(tab =>
        tab.id === tabId ? { ...tab, isVisible: !tab.isVisible } : tab
      );
      setTabs(updatedTabs);
      
      // Optional: Save immediately when toggling visibility
      // await saveVisibilityChanges([{ id: tabId, isVisible: !tabs.find(t => t.id === tabId).isVisible }]);
      
      showToast("success", "Tab visibility updated");
    } catch (error) {
      showToast("error", "Failed to update visibility");
    }
  };

  const handleSequenceChange = (tabId, newSequence) => {
    if (newSequence < 1) return;
    
    setTabs(prevTabs => {
      const updatedTabs = prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, sequence: newSequence } : tab
      );
      return updatedTabs.sort((a, b) => a.sequence - b.sequence);
    });
  };

  // Drag and drop functionality for sequence reordering
  const handleDragStart = (index) => {
    setDragIndex(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) return;

    const newTabs = [...tabs];
    const [draggedItem] = newTabs.splice(dragIndex, 1);
    newTabs.splice(dropIndex, 0, draggedItem);

    // Update sequence numbers based on new order
    const updatedTabs = newTabs.map((tab, index) => ({
      ...tab,
      sequence: index + 1
    }));

    setTabs(updatedTabs);
    setDragIndex(null);
    showToast("success", "Tab order updated");
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      if (selectedReportType === "Hide/Show Tabs") {
        // Save visibility changes
        const visibilityUpdates = tabs.map(tab => ({
          id: tab.id,
          isVisible: tab.isVisible
        }));
        
        await axios.put(`${backendUrl}/api/h-tabs/visibility`, {
          updates: visibilityUpdates
        });
        showToast("success", "Visibility changes saved successfully");
      } else {
        // Save sequence changes
        const sequenceUpdates = tabs.map(tab => ({
          id: tab.id,
          sequence: tab.sequence
        }));
        
        await axios.put(`${backendUrl}/api/h-tabs/sequence`, {
          updates: sequenceUpdates
        });
        showToast("success", "Sequence changes saved successfully");
      }
      
      // Refresh data to get latest from server
      fetchTabsData(pagination.currentPage);
    } catch (error) {
      console.error("Error saving changes:", error);
      showToast("error", "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  // Render Pagination Component
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasPrev
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <ChevronLeft size={16} />
          Prev
        </button>

        {/* Page Numbers */}
        <div className="flex gap-1">
          {visiblePages.map((page, index) => (
            <button
              key={index}
              onClick={() =>
                typeof page === "number" ? handlePageChange(page) : null
              }
              className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${
                page === pagination.currentPage
                  ? "bg-indigo-600 text-white"
                  : typeof page === "number"
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  : "bg-transparent text-gray-500 cursor-default"
              }`}
              disabled={typeof page !== "number"}
            >
              {page}
            </button>
          ))}
        </div>

        {/* Next Button */}
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasNext
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Tabs</p>
            <p className="text-2xl font-bold text-gray-800">
              {tabs.length.toLocaleString()}
            </p>
          </div>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-bold">{tabs.length}</span>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Visible Tabs</p>
            <p className="text-2xl font-bold text-gray-800">
              {tabs.filter(tab => tab.isVisible).length.toLocaleString()}
            </p>
          </div>
          <Eye className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Hidden Tabs</p>
            <p className="text-2xl font-bold text-gray-800">
              {tabs.filter(tab => !tab.isVisible).length.toLocaleString()}
            </p>
          </div>
          <EyeOff className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    </div>
  );

  const renderTableHeaders = () => {
    if (selectedReportType === "Hide/Show Tabs") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium text-left">Sr.No</th>
            <th className="p-3 text-sm font-medium text-left">Tab ID</th>
            <th className="p-3 text-sm font-medium text-left">Tab Name</th>
            <th className="p-3 text-sm font-medium text-left">Description</th>
            <th className="p-3 text-sm font-medium text-left">Current Status</th>
            <th className="p-3 text-sm font-medium text-left">Action</th>
          </tr>
        </thead>
      );
    } else {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium text-left">Drag</th>
            <th className="p-3 text-sm font-medium text-left">Sr.No</th>
            <th className="p-3 text-sm font-medium text-left">Tab ID</th>
            <th className="p-3 text-sm font-medium text-left">Tab Name</th>
            <th className="p-3 text-sm font-medium text-left">Current Sequence</th>
            <th className="p-3 text-sm font-medium text-left">New Sequence</th>
          </tr>
        </thead>
      );
    }
  };

  const renderTableRow = (tab, index) => {
    if (selectedReportType === "Hide/Show Tabs") {
      return (
        <tr
          key={tab.id}
          className={`hover:bg-gray-50 ${
            index === tabs.length - 1 ? "" : "border-b"
          }`}
        >
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium">
              {getSerialNumber(index)}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium">
              {tab.id || "N/A"}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm font-medium text-gray-900 capitalize">
              {tab.name}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-600 max-w-xs truncate">
              {tab.description || "No description available"}
            </div>
          </td>
          <td className="p-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                tab.isVisible
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {tab.isVisible ? "Visible" : "Hidden"}
            </span>
          </td>
          <td className="p-3">
            <button
              onClick={() => handleToggleVisibility(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                tab.isVisible
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-green-100 text-green-700 hover:bg-green-200"
              }`}
            >
              {tab.isVisible ? (
                <>
                  <EyeOff size={16} />
                  Hide
                </>
              ) : (
                <>
                  <Eye size={16} />
                  Show
                </>
              )}
            </button>
          </td>
        </tr>
      );
    } else {
      return (
        <tr
          key={tab.id}
          className={`hover:bg-gray-50 transition-colors ${
            index === tabs.length - 1 ? "" : "border-b"
          } ${dragIndex === index ? "bg-blue-50" : ""}`}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(index)}
        >
          <td className="p-3">
            <GripVertical 
              className="text-gray-400 cursor-move hover:text-gray-600" 
              size={18} 
            />
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium">
              {getSerialNumber(index)}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium">
              {tab.id || "N/A"}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm font-medium text-gray-900 capitalize">
              {tab.name}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded">
              {tab.sequence || index + 1}
            </div>
          </td>
          <td className="p-3">
            <input
              type="number"
              min="1"
              max={tabs.length}
              value={tab.sequence || index + 1}
              onChange={(e) => handleSequenceChange(tab.id, parseInt(e.target.value) || 1)}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </td>
        </tr>
      );
    }
  };

  // Calculate colspan for loading and empty states
  const getColSpan = () => {
    return selectedReportType === "Hide/Show Tabs" ? 6 : 6;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            HTabs Manipulation
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by tab name..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyPress={handleSearch}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
              size={18}
              onClick={() => inputRef.current?.focus()}
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            onClick={saveChanges}
            disabled={isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors ${
              isSaving
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700"
            } text-white`}
          >
            <Save size={18} />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          {reportTypes.map((type) => (
            <button
              key={type}
              onClick={() => handleReportTypeChange(type)}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedReportType === type
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        
        {/* Instructions */}
        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
          {selectedReportType === "Hide/Show Tabs" 
            ? "Toggle visibility of tabs by clicking the Show/Hide buttons. Changes will be saved when you click 'Save Changes'."
            : "Drag and drop rows to reorder sequence, or edit sequence numbers directly. Changes will be saved when you click 'Save Changes'."}
        </div>
      </div>

      {renderSummaryCards()}
      
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-left shadow-sm">
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={getColSpan()} className="p-6 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="text-gray-600">Loading tabs data...</span>
                  </div>
                </td>
              </tr>
            ) : tabs.length > 0 ? (
              tabs.map((tab, index) => renderTableRow(tab, index))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className="p-6 text-center text-gray-500"
                >
                  No tabs data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}
    </div>
  );
};

export default HTabsManipulation;