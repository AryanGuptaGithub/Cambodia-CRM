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
                `$${data.summary.totalSalary?.toLocaleString() || 0}`
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
                `$${data.summary.totalCOGS?.toLocaleString() || 0}`
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
                `${data.summary.ratio?.toFixed(2) || 0}`
              )}
            </div>
          </div>
          <Scale className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Salary / COGS Ratio Report
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
              <span className="ml-2">Loading salary COGS ratio data...</span>
            </div>
          ) : (
            <p>Salary to COGS ratio analysis will be displayed here</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalaryCOGSRatio;