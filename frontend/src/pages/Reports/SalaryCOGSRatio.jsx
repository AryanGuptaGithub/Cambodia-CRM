import React, { useState, useEffect } from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  DollarSign,
  Scale,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const SalaryCOGSRatio = () => {
  const [data, setData] = useState({
    summary: {
      totalSalary: 0,
      totalCOGS: 0,
      ratio: 0,
    },
    records: [],
  });

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage] = useState(10);

  const fetchSalaryCOGSData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/salary-cogs-ratio`
      );
      
      setData(
        response.data.data || {
          summary: {
            totalSalary: 0,
            totalCOGS: 0,
            ratio: 0,
          },
          records: [],
        }
      );
    } catch (error) {
      console.error("Error fetching salary COGS ratio data:", error);
      showToast("error", "Failed to fetch salary COGS ratio data");
      setData({
        summary: {
          totalSalary: 0,
          totalCOGS: 0,
          ratio: 0,
        },
        records: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaryCOGSData();
  }, []);

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

  // Filter records based on search term
  const filteredRecords = data.records.filter(record =>
    record.mrName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.srDate?.includes(searchTerm)
  );

  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);
  const visiblePages = useVisiblePages(currentPage, totalPages);
  const currentRecords = filteredRecords.slice(
    (currentPage - 1) * recordsPerPage,
    currentPage * recordsPerPage
  );

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatRatio = (ratio) => {
    return typeof ratio === 'number' ? ratio.toFixed(4) : '0.0000';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Salary</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                formatCurrency(data.summary.totalSalary)
              )}
            </div>
          </div>
          <Users className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total COGS</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                formatCurrency(data.summary.totalCOGS)
              )}
            </div>
          </div>
          <DollarSign className="w-8 h-8 text-orange-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Salary/COGS Ratio</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.ratio?.toFixed(4) || '0.0000'
              )}
            </div>
          </div>
          <Scale className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    </div>
  );

  const renderTable = () => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-4 text-left text-sm font-semibold text-gray-700">SR Date</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-700">MR Name</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-700">COGS</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-700">Salary</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-700">Incentive</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-700">Allowance</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-700">Tour Expense</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-700">Total Expense</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-700">Salary/Sale Ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentRecords.map((record, index) => (
              <tr key={index} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 text-sm text-gray-600">
                  {formatDate(record.srDate)}
                </td>
                <td className="p-4 text-sm font-medium text-gray-900 capitalize">
                  {record.mrName || 'N/A'}
                </td>
                <td className="p-4 text-sm text-right font-semibold text-red-600">
                  {formatCurrency(record.cogs)}
                </td>
                <td className="p-4 text-sm text-right text-blue-600">
                  {formatCurrency(record.salary)}
                </td>
                <td className="p-4 text-sm text-right text-green-600">
                  {formatCurrency(record.incentive)}
                </td>
                <td className="p-4 text-sm text-right text-purple-600">
                  {formatCurrency(record.allowance)}
                </td>
                <td className="p-4 text-sm text-right text-orange-600">
                  {formatCurrency(record.tourExpense)}
                </td>
                <td className="p-4 text-sm text-right font-semibold text-gray-900">
                  {formatCurrency(record.totalExpense)}
                </td>
                <td className="p-4 text-sm text-right font-semibold text-indigo-600">
                  {formatRatio(record.salarySaleRatio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {currentRecords.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No records found
          </div>
        )}
      </div>

      {/* Pagination */}
      {filteredRecords.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-700">
              Showing {((currentPage - 1) * recordsPerPage) + 1} to {Math.min(currentPage * recordsPerPage, filteredRecords.length)} of {filteredRecords.length} entries
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              {visiblePages.map((page, index) => (
                <button
                  key={index}
                  onClick={() => typeof page === 'number' && setCurrentPage(page)}
                  disabled={page === '...'}
                  className={`min-w-10 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    page === '...' 
                      ? 'text-gray-500 cursor-default' 
                      : currentPage === page
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100 border border-gray-300'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Salary / COGS Ratio Report
          </h1>
          <p className="text-gray-600 mt-1">
            Analyze salary expenses against cost of goods sold
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by MR name or date..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors whitespace-nowrap"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {renderSummaryCards()}
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Detailed Records
          </h2>
          <div className="text-sm text-gray-600">
            {filteredRecords.length} records found
          </div>
        </div>

        {loading ? (
          <div className="bg-white p-8 rounded-xl shadow-md text-center">
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-gray-600">Loading salary COGS ratio data...</span>
            </div>
          </div>
        ) : (
          renderTable()
        )}
      </div>
    </div>
  );
};

export default SalaryCOGSRatio;