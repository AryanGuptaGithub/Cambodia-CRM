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
      
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="text-center text-gray-500">
          {loading ? (
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <span className="ml-2">Loading operation cost COGS ratio data...</span>
            </div>
          ) : (
            <p>Operation cost to COGS ratio analysis will be displayed here</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OperationCostCOGSRatio;