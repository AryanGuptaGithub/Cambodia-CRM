import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  UserPlus,
  Upload,
  X,
  Eye,
  Edit,
  Trash2,
  FileDown,
  Filter,
  TrendingUp,
  Package,
  Calendar,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactDOM from "react-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";

const saleSummaryPerPage = 7;

const SaleSummary = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [salesRecords, setSalesRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [selectedTab, setSelectedTab] = useState("daily");
  const [viewRecord, setViewRecord] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [summaryData, setSummaryData] = useState([]);

  const inputRef = useRef(null);
  const navigate = useNavigate();

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Fetch sales records based on date range
  useEffect(() => {
    const fetchSalesRecords = async () => {
      setIsLoading(true);
      try {
        let url = `${backendUrl}/api/sales-summary/summary`;
        
        const params = new URLSearchParams();
        if (customDateRange.startDate) {
          params.append("startDate", customDateRange.startDate.toISOString().split('T')[0]);
        }
        if (customDateRange.endDate) {
          params.append("endDate", customDateRange.endDate.toISOString().split('T')[0]);
        }
        
        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
          setSummaryData(data.data || []);
          // Also fetch individual records for single view
          if (selectedTab === "single") {
            fetchIndividualRecords();
          }
        }
      } catch (error) {
        console.error("Error fetching sales summary:", error);
        showToast("error", "Failed to fetch sales summary data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSalesRecords();
  }, [customDateRange.startDate, customDateRange.endDate, selectedTab]);

  // Fetch individual sales records for single view
  const fetchIndividualRecords = async () => {
    try {
      let url = `${backendUrl}/api/sales-summary/records`;
      
      const params = new URLSearchParams();
      if (customDateRange.startDate) {
        params.append("startDate", customDateRange.startDate.toISOString().split('T')[0]);
      }
      if (customDateRange.endDate) {
        params.append("endDate", customDateRange.endDate.toISOString().split('T')[0]);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setSalesRecords(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching individual records:", error);
    }
  };

  // Calculate aggregated data for daily view
  const calculateDailySummary = () => {
    const dailyMap = {};
    
    summaryData.forEach(record => {
      const date = new Date(record.recordingDate).toLocaleDateString();
      
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          products: {},
          totalSales: 0,
          totalQuantity: 0,
          totalAmount: 0,
          totalProfit: 0
        };
      }
      
      record.products.forEach(product => {
        const productName = product.productName;
        
        if (!dailyMap[date].products[productName]) {
          dailyMap[date].products[productName] = {
            productName,
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0
          };
        }
        
        dailyMap[date].products[productName].salesQuantity += product.salesQty || 0;
        dailyMap[date].products[productName].bonusQuantity += product.bonusQty || 0;
        dailyMap[date].products[productName].totalQuantity += product.totalQty || 0;
        dailyMap[date].products[productName].amount += product.netSellingAmount || 0;
        dailyMap[date].products[productName].profit += product.profitLoss || 0;
        
        dailyMap[date].totalSales += product.netSellingAmount || 0;
        dailyMap[date].totalQuantity += product.totalQty || 0;
        dailyMap[date].totalAmount += product.netSellingAmount || 0;
        dailyMap[date].totalProfit += product.profitLoss || 0;
      });
    });
    
    return Object.values(dailyMap);
  };

  // Calculate aggregated data for combine view (date range)
  const calculateCombineSummary = () => {
    const productMap = {};
    
    summaryData.forEach(record => {
      record.products.forEach(product => {
        const productName = product.productName;
        
        if (!productMap[productName]) {
          productMap[productName] = {
            productName,
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0
          };
        }
        
        productMap[productName].salesQuantity += product.salesQty || 0;
        productMap[productName].bonusQuantity += product.bonusQty || 0;
        productMap[productName].totalQuantity += product.totalQty || 0;
        productMap[productName].amount += product.netSellingAmount || 0;
        productMap[productName].profit += product.profitLoss || 0;
      });
    });
    
    return Object.values(productMap);
  };

  // Get data based on selected tab
  const getFilteredData = () => {
    let data = [];
    
    if (selectedTab === "daily") {
      data = calculateDailySummary();
    } else if (selectedTab === "combine") {
      data = calculateCombineSummary();
    } else if (selectedTab === "single") {
      data = salesRecords;
    }
    
    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      data = data.filter(item => 
        item.productName?.toLowerCase().includes(search) ||
        item.date?.toLowerCase().includes(search) ||
        item.invoiceNumber?.toLowerCase().includes(search) ||
        item.mrName?.toLowerCase().includes(search) ||
        item.customerName?.toLowerCase().includes(search)
      );
    }
    
    return data;
  };

  const filteredData = getFilteredData();
  
  // Pagination
  const totalPages = Math.ceil(filteredData.length / saleSummaryPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentData = filteredData.slice(
    (currentPage - 1) * saleSummaryPerPage,
    currentPage * saleSummaryPerPage
  );

  // Calculate totals for summary cards
  const calculateTotals = () => {
    let totalSales = 0;
    let totalQuantity = 0;
    let totalProfit = 0;
    let totalProducts = 0;
    
    if (selectedTab === "daily") {
      const dailySummary = calculateDailySummary();
      dailySummary.forEach(day => {
        totalSales += day.totalSales || 0;
        totalQuantity += day.totalQuantity || 0;
        totalProfit += day.totalProfit || 0;
        totalProducts += Object.keys(day.products || {}).length || 0;
      });
    } else if (selectedTab === "combine") {
      const combineSummary = calculateCombineSummary();
      combineSummary.forEach(product => {
        totalSales += product.amount || 0;
        totalQuantity += product.totalQuantity || 0;
        totalProfit += product.profit || 0;
      });
      totalProducts = combineSummary.length;
    } else if (selectedTab === "single") {
      salesRecords.forEach(record => {
        totalSales += record.totalAmount || 0;
        totalProfit += record.totalProfitLoss || 0;
        record.products?.forEach(product => {
          totalQuantity += product.totalQty || 0;
        });
      });
      totalProducts = salesRecords.length;
    }
    
    return { totalSales, totalQuantity, totalProfit, totalProducts };
  };

  const totals = calculateTotals();

  // Handle view record
  const handleViewRecord = (record) => {
    setViewRecord(record);
    setShowViewModal(true);
  };

  // Handle export to Excel
  const handleExportToExcel = async () => {
    if (filteredData.length === 0) {
      showToast("warning", "No data found to export");
      return;
    }

    setExportLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/sales-summary/export`,
        {
          params: {
            tab: selectedTab,
            search: searchTerm.trim() || undefined,
            startDate: customDateRange.startDate
              ? customDateRange.startDate.toISOString().split('T')[0]
              : undefined,
            endDate: customDateRange.endDate
              ? customDateRange.endDate.toISOString().split('T')[0]
              : undefined,
          },
          responseType: "blob",
        }
      );

      let filename = "sales-summary-report.xlsx";
      const contentDisposition = response.headers["content-disposition"];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast("success", "Excel report downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      if (error.response && error.response.status === 404) {
        showToast("warning", "No data found for the selected filters");
      } else {
        showToast("error", "Failed to export Excel report");
      }
    } finally {
      setExportLoading(false);
    }
  };

  // Handle custom date filter
  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

  const handleApplyCustomFilter = () => {
    if (!customDateRange.startDate || !customDateRange.endDate) {
      showToast("warning", "Please select both start and end dates");
      return;
    }

    if (customDateRange.startDate > customDateRange.endDate) {
      showToast("warning", "Start date cannot be after end date");
      return;
    }

    setShowCustomFilter(false);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setCustomDateRange({
      startDate: null,
      endDate: null,
    });
    setSearchTerm("");
    setSelectedTab("daily");
    setShowCustomFilter(false);
    setCurrentPage(1);
  };

  const getSerialNumber = (index) => {
    return (currentPage - 1) * saleSummaryPerPage + index + 1;
  };

  const getActiveFilterDisplay = () => {
    if (customDateRange.startDate && customDateRange.endDate) {
      const start = formatDateToReadable(customDateRange.startDate);
      const end = formatDateToReadable(customDateRange.endDate);
      return `${start} - ${end}`;
    }
    return "All Dates";
  };

  // Render summary cards
  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Sales</p>
            <p className="text-2xl font-bold text-gray-800">
              ${totals.totalSales.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {getActiveFilterDisplay()}
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Quantity</p>
            <p className="text-2xl font-bold text-gray-800">
              {totals.totalQuantity.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {getActiveFilterDisplay()}
            </p>
          </div>
          <Package className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Profit</p>
            <p className="text-2xl font-bold text-gray-800">
              ${totals.totalProfit.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {getActiveFilterDisplay()}
            </p>
          </div>
          <TrendingUp className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total {selectedTab === "single" ? "Invoices" : "Products"}</p>
            <p className="text-2xl font-bold text-gray-800">
              {totals.totalProducts.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {selectedTab === "single" ? "Invoices" : "Unique Products"}
            </p>
          </div>
          <BarChart3 className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  // Render table headers based on selected tab
  const renderTableHeaders = () => {
    if (selectedTab === "daily") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium">Sr.No</th>
            <th className="p-3 text-sm font-medium">Date</th>
            <th className="p-3 text-sm font-medium">Product Name</th>
            <th className="p-3 text-sm font-medium">Sales Qty</th>
            <th className="p-3 text-sm font-medium">Bonus Qty</th>
            <th className="p-3 text-sm font-medium">Total Qty</th>
            <th className="p-3 text-sm font-medium">Amount ($)</th>
            <th className="p-3 text-sm font-medium">Profit ($)</th>
            <th className="p-3 text-sm font-medium">View</th>
          </tr>
        </thead>
      );
    } else if (selectedTab === "combine") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium">Sr.No</th>
            <th className="p-3 text-sm font-medium">Product Name</th>
            <th className="p-3 text-sm font-medium">Sales Qty</th>
            <th className="p-3 text-sm font-medium">Bonus Qty</th>
            <th className="p-3 text-sm font-medium">Total Qty</th>
            <th className="p-3 text-sm font-medium">Amount ($)</th>
            <th className="p-3 text-sm font-medium">Profit ($)</th>
            <th className="p-3 text-sm font-medium">View</th>
          </tr>
        </thead>
      );
    } else if (selectedTab === "single") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium">Sr.No</th>
            <th className="p-3 text-sm font-medium">Date</th>
            <th className="p-3 text-sm font-medium">Invoice No</th>
            <th className="p-3 text-sm font-medium">MR Name</th>
            <th className="p-3 text-sm font-medium">Customer</th>
            <th className="p-3 text-sm font-medium">Total Amount ($)</th>
            <th className="p-3 text-sm font-medium">Total Profit ($)</th>
            <th className="p-3 text-sm font-medium">View</th>
          </tr>
        </thead>
      );
    }
  };

  // Render table rows based on selected tab
  const renderTableRow = (item, index) => {
    if (selectedTab === "daily") {
      const products = Object.values(item.products || {});
      if (products.length === 0) return null;
      
      return products.map((product, productIndex) => (
        <tr
          key={`${item.date}-${product.productName}-${productIndex}`}
          className="hover:bg-gray-50 border-b"
        >
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium">
              {getSerialNumber(index)}
            </div>
          </td>
          <td className="p-3 text-sm text-gray-600">
            {item.date}
          </td>
          <td className="p-3 text-sm font-medium text-gray-900 capitalize">
            {product.productName}
          </td>
          <td className="p-3 text-sm text-gray-800">
            {product.salesQuantity}
          </td>
          <td className="p-3 text-sm text-gray-800">
            {product.bonusQuantity}
          </td>
          <td className="p-3 text-sm text-gray-800">
            {product.totalQuantity}
          </td>
          <td className="p-3 text-sm font-semibold text-green-600">
            ${product.amount.toFixed(2)}
          </td>
          <td className="p-3 text-sm font-semibold text-blue-600">
            ${product.profit.toFixed(2)}
          </td>
          <td className="p-3 flex items-center justify-center">
            <button
              onClick={() => handleViewRecord({ ...product, date: item.date })}
              className="text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <Eye size={18} />
            </button>
          </td>
        </tr>
      ));
    } else if (selectedTab === "combine") {
      return (
        <tr
          key={`${item.productName}-${index}`}
          className="hover:bg-gray-50 border-b"
        >
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium">
              {getSerialNumber(index)}
            </div>
          </td>
          <td className="p-3 text-sm font-medium text-gray-900 capitalize">
            {item.productName}
          </td>
          <td className="p-3 text-sm text-gray-800">
            {item.salesQuantity}
          </td>
          <td className="p-3 text-sm text-gray-800">
            {item.bonusQuantity}
          </td>
          <td className="p-3 text-sm text-gray-800">
            {item.totalQuantity}
          </td>
          <td className="p-3 text-sm font-semibold text-green-600">
            ${item.amount.toFixed(2)}
          </td>
          <td className="p-3 text-sm font-semibold text-blue-600">
            ${item.profit.toFixed(2)}
          </td>
          <td className="p-3 flex items-center justify-center">
            <button
              onClick={() => handleViewRecord(item)}
              className="text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <Eye size={18} />
            </button>
          </td>
        </tr>
      );
    } else if (selectedTab === "single") {
      return (
        <tr
          key={`${item._id}-${index}`}
          className="hover:bg-gray-50 border-b"
        >
          <td className="p-3">
            <div className="text-sm text-gray-600 font-medium">
              {getSerialNumber(index)}
            </div>
          </td>
          <td className="p-3 text-sm text-gray-600">
            {formatDateToReadable(item.recordingDate)}
          </td>
          <td className="p-3 text-sm font-medium text-gray-900">
            {item.invoiceNumber}
          </td>
          <td className="p-3 text-sm text-gray-800 capitalize">
            {item.mrName}
          </td>
          <td className="p-3 text-sm text-gray-800">
            {item.customerName}
          </td>
          <td className="p-3 text-sm font-semibold text-green-600">
            ${item.totalAmount?.toFixed(2)}
          </td>
          <td className="p-3 text-sm font-semibold text-blue-600">
            ${item.totalProfitLoss?.toFixed(2)}
          </td>
          <td className="p-3 flex items-center justify-center">
            <button
              onClick={() => handleViewRecord(item)}
              className="text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <Eye size={18} />
            </button>
          </td>
        </tr>
      );
    }
  };

  // Render pagination
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            currentPage > 1
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          ← Prev
        </button>

        <div className="flex gap-1">
          {visiblePages.map((page, idx) =>
            page === "..." ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-3 py-2 text-gray-500 select-none cursor-pointer"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${
                  currentPage === page
                    ? "bg-indigo-600 text-white"
                    : typeof page === "number"
                    ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                    : "bg-transparent text-gray-500 cursor-default"
                }`}
                disabled={typeof page !== "number"}
              >
                {page}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => {
            setCurrentPage((prev) => Math.min(prev + 1, totalPages));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          disabled={currentPage === totalPages}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            currentPage < totalPages
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next →
        </button>
      </div>
    );
  };

  // View modal content
  const renderViewModal = () => {
    if (!viewRecord) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
          <button
            onClick={() => setShowViewModal(false)}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            {selectedTab === "single" ? "Sales Invoice Details" : "Product Sales Details"}
          </h2>

          {selectedTab === "single" ? (
            // Single invoice view
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">Invoice Number</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">{viewRecord.invoiceNumber}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Date</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(viewRecord.recordingDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">MR Name</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">{viewRecord.mrName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Customer</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">{viewRecord.customerName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Total Amount</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 font-semibold text-green-600">
                    ${viewRecord.totalAmount?.toFixed(2)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">Total Profit</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 font-semibold text-blue-600">
                    ${viewRecord.totalProfitLoss?.toFixed(2)}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">Products</h3>
                <table className="w-full border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-sm font-medium text-left">Product</th>
                      <th className="p-2 text-sm font-medium text-center">Sales Qty</th>
                      <th className="p-2 text-sm font-medium text-center">Bonus Qty</th>
                      <th className="p-2 text-sm font-medium text-center">Total Qty</th>
                      <th className="p-2 text-sm font-medium text-center">Unit Price</th>
                      <th className="p-2 text-sm font-medium text-center">Amount</th>
                      <th className="p-2 text-sm font-medium text-center">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewRecord.products?.map((product, index) => (
                      <tr key={product._id} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-sm capitalize">{product.productName}</td>
                        <td className="p-2 text-sm text-center">{product.salesQty}</td>
                        <td className="p-2 text-sm text-center">{product.bonusQty}</td>
                        <td className="p-2 text-sm text-center">{product.totalQty}</td>
                        <td className="p-2 text-sm text-center">${product.sellingPrice?.toFixed(2)}</td>
                        <td className="p-2 text-sm text-center text-green-600 font-medium">
                          ${product.netSellingAmount?.toFixed(2)}
                        </td>
                        <td className="p-2 text-sm text-center text-blue-600 font-medium">
                          ${product.profitLoss?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            // Product view (daily or combine)
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600">Product Name</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                  {viewRecord.productName}
                </p>
              </div>
              {selectedTab === "daily" && (
                <div>
                  <label className="block text-sm font-medium text-gray-600">Date</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">{viewRecord.date}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-600">Sales Quantity</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">{viewRecord.salesQuantity}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Bonus Quantity</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">{viewRecord.bonusQuantity}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Total Quantity</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">{viewRecord.totalQuantity}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Total Amount</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 font-semibold text-green-600">
                  ${(viewRecord.amount || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Total Profit</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 font-semibold text-blue-600">
                  ${(viewRecord.profit || 0).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowViewModal(false)}
              className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Sales Summary Report
            </h1>
            <p className="text-sm text-gray-600">
              Track and analyze sales performance
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            onClick={handleExportToExcel}
            disabled={exportLoading || filteredData.length === 0}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg shadow-md transition-colors min-w-[140px]"
          >
            {exportLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <FileDown size={18} />
                <span>Export Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => {
              setSelectedTab("daily");
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "daily"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Daily Summary
          </button>
          <button
            onClick={() => {
              setSelectedTab("combine");
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "combine"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Combine Summary
          </button>
          <button
            onClick={() => {
              setSelectedTab("single");
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "single"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Single Invoices
          </button>
          <button
            onClick={() => setShowCustomFilter(true)}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2 ${
              customDateRange.startDate || customDateRange.endDate
                ? "bg-indigo-100 text-indigo-700 border border-indigo-300"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <Calendar size={16} />
            {customDateRange.startDate || customDateRange.endDate ? "Date Filter Applied" : "Date Filter"}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter size={16} />
            <span>Active Filter: </span>
            <span className="font-medium">{getActiveFilterDisplay()}</span>
            {selectedTab !== "single" && (
              <>
                <span className="mx-2">•</span>
                <span>View: </span>
                <span className="font-medium capitalize">{selectedTab}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/sales/new")}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer transition-colors"
            >
              <UserPlus size={18} /> Add New Sale
            </button>
          </div>
        </div>
      </div>

      {renderSummaryCards()}

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          {renderTableHeaders()}
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={selectedTab === "single" ? 8 : 9} className="p-8 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <span className="text-gray-600">
                      Loading sales summary data...
                    </span>
                    <span className="text-sm text-gray-500 mt-2">
                      Please wait while we fetch the latest data
                    </span>
                  </div>
                </td>
              </tr>
            ) : currentData.length > 0 ? (
              currentData.map((item, index) => renderTableRow(item, index))
            ) : (
              <tr>
                <td
                  colSpan={selectedTab === "single" ? 8 : 9}
                  className="p-8 text-center"
                >
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No data found
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    {searchTerm
                      ? `No sales data found for "${searchTerm}". Try a different search term.`
                      : "No sales data available for the selected date range."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* Custom Filter Modal */}
      {showCustomFilter && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Date Filter
              </h2>
              <button
                onClick={() => setShowCustomFilter(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <DatePicker
                  selected={customDateRange.startDate}
                  onChange={(date) => handleCustomDateChange("startDate", date)}
                  selectsStart
                  startDate={customDateRange.startDate}
                  endDate={customDateRange.endDate}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholderText="Start date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <DatePicker
                  selected={customDateRange.endDate}
                  onChange={(date) => handleCustomDateChange("endDate", date)}
                  selectsEnd
                  startDate={customDateRange.startDate}
                  endDate={customDateRange.endDate}
                  minDate={customDateRange.startDate}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholderText="End date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>
            </div>

            <div className="flex justify-between gap-3">
              <button
                onClick={handleClearFilters}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
              >
                Clear All
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCustomFilter(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustomFilter}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && renderViewModal()}
    </div>
  );
};

export default SaleSummary;