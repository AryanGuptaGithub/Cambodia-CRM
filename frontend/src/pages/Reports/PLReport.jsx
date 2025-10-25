import React, { useState, useEffect } from "react";
import {
  Download,
  FileBarChart,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const PLReport = () => {
  const [data, setData] = useState({
    summary: {
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      expenses: 0,
      netProfit: 0,
      profitMargin: 0,
    },
  });

  const [loading, setLoading] = useState(false);

  const fetchPLData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/pl-report`
      );
      
      setData(
        response.data.data || {
          summary: {
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            expenses: 0,
            netProfit: 0,
            profitMargin: 0,
          },
        }
      );
    } catch (error) {
      console.error("Error fetching P&L data:", error);
      showToast("error", "Failed to fetch P&L report data");
      setData({
        summary: {
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          expenses: 0,
          netProfit: 0,
          profitMargin: 0,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPLData();
  }, []);

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Revenue</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.revenue?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <TrendingUp className="w-8 h-8 text-green-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
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
          <TrendingDown className="w-8 h-8 text-red-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Gross Profit</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.grossProfit?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <DollarSign className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Expenses</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.expenses?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <TrendingDown className="w-8 h-8 text-orange-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Net Profit</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.netProfit?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <DollarSign className="w-8 h-8 text-purple-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-indigo-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Profit Margin</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `${data.summary.profitMargin?.toFixed(2) || 0}%`
              )}
            </div>
          </div>
          <FileBarChart className="w-8 h-8 text-indigo-500" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Profit & Loss Report
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
      
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="text-center text-gray-500">
          {loading ? (
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <span className="ml-2">Loading P&L report data...</span>
            </div>
          ) : (
            <p>Detailed profit and loss analysis will be displayed here</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PLReport;