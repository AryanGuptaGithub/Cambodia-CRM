import React, { useState, useEffect } from "react";
import {
  Download,
  TrendingDown,
  DollarSign,
  Calculator,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const OperationCostCOGSRatio = () => {
  const [data, setData] = useState({
    summary: {
      operationCost: 0,
      cogs: 0,
      ratio: 0,
    },
    tableData: []
  });

  const [loading, setLoading] = useState(false);

  const fetchOperationCostCOGSData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/operation-cost-cogs-ratio`
      );
      
      setData(
        response.data.data || {
          summary: {
            operationCost: 0,
            cogs: 0,
            ratio: 0,
          },
          tableData: []
        }
      );
    } catch (error) {
      console.error("Error fetching operation cost COGS ratio data:", error);
      showToast("error", "Failed to fetch operation cost COGS ratio data");
      setData({
        summary: {
          operationCost: 0,
          cogs: 0,
          ratio: 0,
        },
        tableData: []
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperationCostCOGSData();
  }, []);

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

  // Mock data for demonstration - replace with actual data from your API
  const mockTableData = [
    { id: 1, date: "2024-01-15", sale: 50000, cog: 30000, expense: 7500, percentage: 15 },
    { id: 2, date: "2024-01-16", sale: 45000, cog: 27000, expense: 6750, percentage: 15 },
    { id: 3, date: "2024-01-17", sale: 60000, cog: 36000, expense: 9000, percentage: 15 },
    { id: 4, date: "2024-01-18", sale: 55000, cog: 33000, expense: 8250, percentage: 15 },
    { id: 5, date: "2024-01-19", sale: 52000, cog: 31200, expense: 7800, percentage: 15 },
  ];

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Operation Cost</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.operationCost?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <TrendingDown className="w-8 h-8 text-red-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">COGS</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.cogs?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <DollarSign className="w-8 h-8 text-orange-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Operation Cost/COGS</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `${data.summary.ratio?.toFixed(2) || 0}`
              )}
            </div>
          </div>
          <Calculator className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    </div>
  );

  const renderTable = () => {
    const tableData = data.tableData.length > 0 ? data.tableData : mockTableData;

    return (
      <div className="bg-white p-6 rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sr
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sale ($)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  COG ($)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expense ($)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Percentage (%)
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    {Array.from({ length: 6 }).map((_, cellIndex) => (
                      <td key={cellIndex} className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : tableData.length > 0 ? (
                tableData.map((item, index) => (
                  <tr key={item.id || index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(item.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${item.sale?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${item.cog?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${item.expense?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {item.percentage}%
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Operation Cost / COGS Ratio
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {renderSummaryCards()}
      {renderTable()}
    </div>
  );
};

export default OperationCostCOGSRatio;