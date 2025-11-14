import React, { useState, useEffect } from "react";
import {
  Download,
  Calendar,
  AlertTriangle,
  Package,DollarSign
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const ExpiryStockReport = () => {
  const [data, setData] = useState({
    summary: {
      totalExpiringSoon: 0,
      totalNearExpiryValue: 0,
      criticalItems: 0,
    },
    items: []
  });

  const [loading, setLoading] = useState(false);

  const fetchExpiryStockData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/expiry-stock-report`
      );
      
      setData(
        response.data.data || {
          summary: {
            totalExpiringSoon: 0,
            totalNearExpiryValue: 0,
            criticalItems: 0,
          },
          items: []
        }
      );
    } catch (error) {
      console.error("Error fetching expiry stock data:", error);
      showToast("error", "Failed to fetch expiry stock data");
      setData({
        summary: {
          totalExpiringSoon: 0,
          totalNearExpiryValue: 0,
          criticalItems: 0,
        },
        items: []
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiryStockData();
  }, []);

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

  const getDaysRemainingColor = (days) => {
    if (days <= 3) return "text-red-600 bg-red-50";
    if (days <= 7) return "text-orange-600 bg-orange-50";
    return "text-yellow-600 bg-yellow-50";
  };

  const getDaysRemainingText = (days) => {
    if (days === 0) return "Expires today";
    if (days === 1) return "1 day left";
    return `${days} days left`;
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-yellow-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Expiring Soon (15 days)</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.totalExpiringSoon?.toLocaleString() || 0
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">Stock items</div>
          </div>
          <Calendar className="w-8 h-8 text-yellow-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Near Expiry Value</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.totalNearExpiryValue?.toLocaleString() || 0}`
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">Total value at risk</div>
          </div>
          <DollarSign className="w-8 h-8 text-orange-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Critical Items</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.criticalItems?.toLocaleString() || 0
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">Expiring in 3 days</div>
          </div>
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
      </div>
    </div>
  );

  const renderExpiryTable = () => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Batch No.
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expiry Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Days Left
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unit Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}>
                  {Array.from({ length: 7 }).map((_, cellIndex) => (
                    <td key={cellIndex} className="px-6 py-4 whitespace-nowrap">
                      <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    </td>
                  ))}
                </tr>
              ))
            ) : data.items && data.items.length > 0 ? (
              data.items.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Package className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {item.productName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {item.sku || "N/A"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.batchNumber || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(item.expiryDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDaysRemainingColor(item.daysRemaining)}`}>
                      {getDaysRemainingText(item.daysRemaining)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.quantity?.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${item.unitPrice?.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${item.totalValue?.toFixed(2)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <div>No stock items expiring in the next 15 days</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold text-gray-800">
            Expiry Stock Report
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchExpiryStockData}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            Refresh
          </button>
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
      
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Stock Items Expiring in Next 15 Days
        </h2>
        {renderExpiryTable()}
      </div>
    </div>
  );
};

export default ExpiryStockReport;