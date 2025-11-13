import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  TrendingUp,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  DollarSign,
  BarChart3,
  Percent,
  FileDown,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const SalesSalaryRatio = () => {
  const [data, setData] = useState({
    summary: {
      totalSales: 0,
      totalSalary: 0,
      totalExpense: 0,
      ratio: 0,
    },
    records: [],
  });

  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

  const inputRef = useRef(null);
  const itemsPerPage = 7;

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  const getSerialNumber = useCallback((index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1,
    [pagination.currentPage, itemsPerPage]
  );

  // Memoized fetch function
  const fetchSalesSalaryData = useCallback(async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: itemsPerPage,
        ...(search && search.trim() !== "" && { search: search.trim() }),
      };

      const response = await axios.get(`${backendUrl}/api/sales-salary-ratio`, {
        params,
      });

      if (response.data.success) {
        setData(response.data.data || {
          summary: {
            totalSales: 0,
            totalSalary: 0,
            totalExpense: 0,
            ratio: 0,
          },
          records: [],
        });

        setPagination(response.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        });
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (error) {
      console.error("Error fetching sales salary ratio data:", error);
      showToast("error", error.response?.data?.message || "Failed to fetch sales salary ratio data");
      setData({
        summary: {
          totalSales: 0,
          totalSalary: 0,
          totalExpense: 0,
          ratio: 0,
        },
        records: [],
      });
    } finally {
      setLoading(false);
    }
  }, [itemsPerPage]);

  // Initial load
  useEffect(() => {
    fetchSalesSalaryData(1);
  }, [fetchSalesSalaryData]);

  const handlePageChange = useCallback((page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchSalesSalaryData(page);
    }
  }, [pagination.totalPages, fetchSalesSalaryData]);

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    fetchSalesSalaryData(1, "");
  }, [fetchSalesSalaryData]);

  // Debounced search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchTerm !== undefined) {
        fetchSalesSalaryData(1, searchTerm);
      }
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm, fetchSalesSalaryData]);

  // Excel export function
  const exportToExcel = async () => {
    setExportLoading(true);
    try {
      const params = {
        search: searchTerm.trim(),
      };

      const response = await axios.get(`${backendUrl}/api/sales-salary-ratio/export`, {
        params,
        responseType: 'blob', // Important for file download
      });

      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from response headers or use default
      const contentDisposition = response.headers['content-disposition'];
      let fileName = 'sales-salary-ratio-report.xlsx';
      
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (fileNameMatch.length === 2) {
          fileName = fileNameMatch[1];
        }
      }
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      showToast("success", "Excel report downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      showToast("error", "Failed to export Excel report");
    } finally {
      setExportLoading(false);
    }
  };

  // Memoized pagination component
  const renderPagination = useMemo(() => {
    if (pagination.totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
            pagination.hasPrev
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <ChevronLeft size={16} />
          Prev
        </button>

        <div className="flex gap-1">
          {visiblePages.map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === "number" && handlePageChange(page)}
              className={`min-w-[40px] px-3 py-2 rounded-lg transition-colors ${
                page === pagination.currentPage
                  ? "bg-indigo-600 text-white cursor-default"
                  : typeof page === "number"
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                  : "bg-transparent text-gray-500 cursor-default"
              }`}
              disabled={typeof page !== "number"}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
            pagination.hasNext
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }, [pagination, visiblePages, handlePageChange]);

  // Memoized summary cards
  const renderSummaryCards = useMemo(() => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      {[
        { key: 'totalSales', label: 'Total Sales', value: data.summary.totalSales, icon: DollarSign, color: 'green' },
        { key: 'totalSalary', label: 'Total Salary', value: data.summary.totalSalary, icon: Users, color: 'blue' },
        { key: 'totalExpense', label: 'Total Expense', value: data.summary.totalExpense, icon: BarChart3, color: 'purple' },
        { key: 'ratio', label: 'Expense/Sales Ratio', value: data.summary.ratio, icon: Percent, color: 'orange', format: (val) => val?.toFixed(2) || '0.00' },
      ].map(({ key, label, value, icon: Icon, color, format }) => (
        <div key={key} className={`bg-white p-6 rounded-xl shadow-md border-l-4 border-${color}-500`}>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">{label}</div>
              <div className="text-2xl font-bold text-gray-800">
                {loading ? (
                  <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  format ? format(value) : `$${value?.toLocaleString() || 0}`
                )}
              </div>
            </div>
            <Icon className={`w-8 h-8 text-${color}-500`} />
          </div>
        </div>
      ))}
    </div>
  ), [data.summary, loading]);

  // Formatting functions
  const formatCurrency = useCallback((amount) => {
    return `$${
      amount?.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) || "0.00"
    }`;
  }, []);

  const formatPercentage = useCallback((value) => {
    return `${value?.toFixed(2) || "0.00"}%`;
  }, []);

  // Table columns configuration
  const tableColumns = useMemo(() => [
    { key: 'sr', label: 'SR', width: 'w-16', align: 'text-center' },
    { key: 'mrName', label: 'MR Name', width: 'w-48', align: 'text-left' },
    { key: 'sale', label: 'Sale ($)', width: 'w-32', align: 'text-right', format: formatCurrency },
    { key: 'profit', label: 'Profit ($)', width: 'w-32', align: 'text-right', format: formatCurrency },
    { key: 'salary', label: 'Salary ($)', width: 'w-32', align: 'text-right', format: formatCurrency },
    { key: 'incentive', label: 'Incentive ($)', width: 'w-32', align: 'text-right', format: formatCurrency },
    { key: 'allowance', label: 'Allowance ($)', width: 'w-32', align: 'text-right', format: formatCurrency },
    { key: 'tourExpense', label: 'Tour Expense ($)', width: 'w-40', align: 'text-right', format: formatCurrency },
    { key: 'totalExpense', label: 'Total Expense ($)', width: 'w-40', align: 'text-right', format: formatCurrency },
    { key: 'salarySaleRatio', label: 'Salary/Sale', width: 'w-32', align: 'text-right', format: (val) => val?.toFixed(2) || '0.00' },
    { 
      key: 'performance', 
      label: 'Performance', 
      width: 'w-32', 
      align: 'text-right',
      format: formatPercentage,
      color: (val) => val >= 0 ? "text-green-600" : "text-red-600"
    },
  ], [formatCurrency, formatPercentage]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Sales / Salary Ratio Report
            </h1>
            <p className="text-sm text-gray-600">Analyze sales performance against salary expenses</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search MR Name..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            onClick={exportToExcel}
            disabled={exportLoading || data.records.length === 0}
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

      {/* Summary Cards */}
      {renderSummaryCards}

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <span className="text-gray-600">Loading sales salary ratio data...</span>
            <span className="text-sm text-gray-500 mt-2">Please wait while we fetch the latest data</span>
          </div>
        ) : data.records.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {tableColumns.map((column) => (
                    <th
                      key={column.key}
                      className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${column.width} ${column.align}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.records.map((record, index) => (
                  <tr 
                    key={`${record.mrId}-${record.srDate}-${index}`}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {tableColumns.map((column) => {
                      const value = record[column.key] || (column.key === 'sr' ? getSerialNumber(index) : '');
                      const formattedValue = column.format ? column.format(value) : value;
                      const textColor = column.color ? column.color(value) : 'text-gray-900';
                      
                      return (
                        <td
                          key={column.key}
                          className={`px-4 py-4 whitespace-nowrap text-sm ${column.align} ${textColor} ${
                            column.key === 'totalExpense' ? 'font-medium' : ''
                          }`}
                        >
                          {formattedValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No data found</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {searchTerm 
                ? `No sales salary ratio data found for "${searchTerm}". Try a different search term.`
                : "No sales salary ratio data available. Data will appear here once sales and payroll records are added."
              }
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {renderPagination}

      {/* Summary Stats */}
      {data.records.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          Showing {getSerialNumber(0)} to {getSerialNumber(data.records.length - 1)} of {pagination.totalRecords} entries
          {searchTerm && ` filtered by "${searchTerm}"`}
        </div>
      )}
    </div>
  );
};

export default SalesSalaryRatio;