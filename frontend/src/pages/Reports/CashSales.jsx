import React, { useState, useEffect } from "react";
import {
  DollarSign,
  Download,
  Filter,
  Calendar,
  X,
  Package,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const CashSales = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("currentMonth");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedSaleInfo, setSelectedSaleInfo] = useState(null);

  const getCurrentMonthName = () => {
    return new Date().toLocaleString("default", { month: "long" });
  };

  const getCurrentYear = () => {
    return new Date().getFullYear();
  };

  const getPreviousMonthName = () => {
    const previousMonth = new Date();
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    return previousMonth.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthRange = () => {
    const currentYear = getCurrentYear();
    const currentMonth = new Date().getMonth();

    if (currentMonth === 0) {
      const previousYear = currentYear - 1;
      return {
        startDate: `${previousYear}-01-01`,
        endDate: `${previousYear}-12-31`,
        label: `Jan - Dec ${previousYear}`,
      };
    }

    const endDate = new Date(currentYear, currentMonth, 0);
    return {
      startDate: `${currentYear}-01-01`,
      endDate: endDate.toISOString().split("T")[0],
      label: `Jan - ${getPreviousMonthName()} ${currentYear}`,
    };
  };

  const getDateRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    switch (selectedTab) {
      case "currentMonth":
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        return {
          startDate: firstDay.toISOString().split("T")[0],
          endDate: lastDay.toISOString().split("T")[0],
        };

      case "janToPreviousMonth":
        return getJanToPreviousMonthRange();

      case "custom":
        return {
          startDate: customDateRange.startDate
            ? customDateRange.startDate.toISOString().split("T")[0]
            : "",
          endDate: customDateRange.endDate
            ? customDateRange.endDate.toISOString().split("T")[0]
            : "",
        };

      default:
        return {};
    }
  };
  
  const fetchCashSales = async () => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        setLoading(false);
        setData([]);
        return;
      }

      const response = await axios.get(`${backendUrl}/api/reports/cash-sales`, {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      });
      setData(response.data.data || []);
    } catch (error) {
      console.error("Error fetching cash sales:", error);
      showToast("error", "Failed to fetch cash sales data");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    ) {
      setData([]);
      return;
    }
    fetchCashSales();
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchCashSales();
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

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

    setSelectedTab("custom");
    setShowCustomFilter(false);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    }
  };

  const exportToExcel = async () => {
    try {
      setExportLoading(true);
      const dateRange = getDateRange();

      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        showToast(
          "warning",
          "Please select both start and end dates for export"
        );
        setExportLoading(false);
        return;
      }

      if (data.length === 0) {
        showToast("warning", "No data available to export");
        setExportLoading(false);
        return;
      }
      const params = new URLSearchParams();

      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);

      const downloadUrl = `${backendUrl}/api/reports/cash-sales/export/excel?${params.toString()}`;

      const response = await axios.get(downloadUrl, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      let fileName = "cash-sales-report";
      if (dateRange.startDate && dateRange.endDate) {
        fileName = `cash-sales-${dateRange.startDate.replace(
          /-/g,
          ""
        )}-to-${dateRange.endDate.replace(/-/g, "")}`;
      } else {
        const today = new Date().toISOString().split("T")[0];
        fileName = `cash-sales-${today.replace(/-/g, "")}`;
      }
      fileName += ".xlsx";

      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      if (error.response?.status === 400) {
        showToast("error", "Invalid date format for export");
      } else if (error.response?.status === 404) {
        showToast("error", "Export service not available");
      } else {
        showToast("error", "Failed to export to Excel");
      }
    } finally {
      setExportLoading(false);
    }
  };

  const showProductDetails = (products, sale) => {
    setSelectedProducts(products);
    setSelectedSaleInfo({
      invoiceNumber: sale.invoiceNumber,
      customerName: sale.customerName,
      date: sale.deliveryDate,
      totalAmount: sale.totalAmount || sale.amount || 0,
    });
    setShowProductModal(true);
  };

  const totalAmount = data.reduce(
    (sum, item) => sum + (item.totalAmount || item.amount || 0),
    0
  );

  const formatDateForDisplay = (date) => {
    return date ? formatDateToReadable(date) : "";
  };

  const getActiveFilterDisplay = () => {
    switch (selectedTab) {
      case "currentMonth":
        return `${getCurrentMonthName()} ${getCurrentYear()}`;

      case "janToPreviousMonth":
        return getJanToPreviousMonthRange().label;

      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          return `${formatDateForDisplay(
            customDateRange.startDate
          )} to ${formatDateForDisplay(customDateRange.endDate)}`;
        }
        return "Select custom dates";

      default:
        return "";
    }
  };

  const isExportDisabled = loading || exportLoading || data.length === 0;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-800">Total Cash Sales</h1>
        </div>
        <button
          onClick={exportToExcel}
          disabled={isExportDisabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
            isExportDisabled
              ? "bg-gray-400 text-gray-700 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 text-white"
          }`}
          title={
            data.length === 0
              ? "No data available to export"
              : "Export to Excel"
          }
        >
          <Download size={18} />
          {exportLoading ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleTabChange("currentMonth")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "currentMonth"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Current Month ({getCurrentMonthName()} {getCurrentYear()})
          </button>
          <button
            onClick={() => handleTabChange("janToPreviousMonth")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "janToPreviousMonth"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {getJanToPreviousMonthRange().label}
          </button>
          <button
            onClick={() => handleTabChange("custom")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Custom Filter
          </button>
        </div>

        {/* Active Filter Display */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
          <span className="text-gray-500 ml-2">
            ({data.length} records found)
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Cash Sales</p>
              <p className="text-2xl font-bold text-gray-800">
                ${totalAmount.toLocaleString()}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Transactions</p>
              <p className="text-2xl font-bold text-gray-800">{data.length}</p>
            </div>
            <Calendar className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr.No</th>
              <th className="p-3 text-sm font-medium">Date</th>
              <th className="p-3 text-sm font-medium">Invoice Number</th>
              <th className="p-3 text-sm font-medium">Customer</th>
              <th className="p-3 text-sm font-medium">Product</th>
              <th className="p-3 text-sm font-medium">Amount ($)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="p-3 text-center">
                  Loading...
                </td>
              </tr>
            ) : data.length > 0 ? (
              data.map((sale, index) => {
                const hasMultipleProducts =
                  sale.displayProducts && sale.displayProducts.length > 1;
                const productCount = sale.displayProducts
                  ? sale.displayProducts.length
                  : 1;

                return (
                  <tr
                    key={index}
                    className={`hover:bg-gray-50 ${
                      index === data.length - 1 ? "" : "border-b"
                    }`}
                  >
                    <td className="p-3 text-sm text-gray-900">{index + 1}</td>
                    <td className="p-3 text-sm text-gray-900">
                      {formatDateToReadable(sale.deliveryDate)}
                    </td>
                    <td className="p-3 text-sm text-gray-900">
                      {sale.invoiceNumber}
                    </td>
                    <td className="p-3 text-sm text-gray-900 capitalize">
                      {sale.customerName}
                    </td>
                    <td className="p-3 text-sm text-gray-900 capitalize">
                      <div className="flex items-center justify-center gap-2">
                        {hasMultipleProducts ? (
                          <button
                            onClick={() =>
                              showProductDetails(sale.displayProducts, sale)
                            }
                            className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 cursor-pointer"
                            title="Click to view products"
                          >
                            <Package size={14} />
                            <span> {productCount}</span>
                          </button>
                        ) : (
                          <span className="capitalize">
                            {sale.displayProducts && sale.displayProducts[0]
                              ? sale.displayProducts[0].productName || sale.displayProducts[0].name
                              : sale.productName || "N/A"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm font-semibold text-green-600">
                      ${(sale.totalAmount || sale.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="p-3 text-center text-gray-500">
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No cash sales data found for the selected period"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {showProductModal && (
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowProductModal(false)}
            />
            <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative z-10">
              <button
                onClick={() => setShowProductModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Product Details
              </h2>
              
              {/* Sale Information */}
              {selectedSaleInfo && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Invoice Number</p>
                    <p className="text-sm font-medium">{selectedSaleInfo.invoiceNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Customer</p>
                    <p className="text-sm font-medium">{selectedSaleInfo.customerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="text-sm font-medium">{formatDateToReadable(selectedSaleInfo.date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-sm font-medium text-green-600">
                      ${selectedSaleInfo.totalAmount.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm text-center">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="p-3 text-sm font-medium">S.r.No</th>
                      <th className="p-3 text-sm font-medium">Product Name</th>
                      <th className="p-3 text-sm font-medium">Sales Qty</th>
                      <th className="p-3 text-sm font-medium">Bonus Qty</th>
                      <th className="p-3 text-sm font-medium">Total Qty</th>
                      <th className="p-3 text-sm font-medium">Selling Price ($)</th>
                      <th className="p-3 text-sm font-medium">Amount ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProducts.map((product, index) => {
                      const totalQty = product.totalQty || (product.salesQty || 0) + (product.bonusQty || 0);
                      
                      return (
                        <tr 
                          key={index} 
                          className={`hover:bg-gray-50 ${index === selectedProducts.length - 1 ? '' : 'border-b'}`}
                        >
                          <td className="p-3 text-sm text-gray-900">{index + 1}</td>
                          <td className="p-3 text-sm text-gray-900 capitalize">{product.productName}</td>
                          <td className="p-3 text-sm text-gray-900">{product.salesQty || 0}</td>
                          <td className="p-3 text-sm text-gray-900">{product.bonusQty || 0}</td>
                          <td className="p-3 text-sm text-gray-900 font-medium">{totalQty}</td>
                          <td className="p-3 text-sm text-gray-900">
                            ${product.sellingPrice ? product.sellingPrice.toFixed(2) : '0.00'}
                          </td>
                          <td className="p-3 text-sm text-gray-900">
                            ${product.amount ? product.amount.toLocaleString() : '0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan="2" className="p-3 text-right text-sm font-medium text-gray-700">
                        Total:
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-900">
                        {selectedProducts.reduce((sum, product) => sum + (product.salesQty || 0), 0)}
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-900">
                        {selectedProducts.reduce((sum, product) => sum + (product.bonusQty || 0), 0)}
                      </td>
                      <td className="p-3 text-sm font-bold text-blue-700">
                        {selectedProducts.reduce((sum, product) => {
                          const totalQty = product.totalQty || (product.salesQty || 0) + (product.bonusQty || 0);
                          return sum + totalQty;
                        }, 0)}
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-700"></td>
                      <td className="p-3 text-sm font-bold text-green-700">
                        ${selectedProducts.reduce((sum, product) => {
                          return sum + (product.amount || 0);
                        }, 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowProductModal(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      )}

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Total Cash Sales Filter
              </h2>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(date) =>
                      handleCustomDateChange("startDate", date)
                    }
                    selectsStart
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="Select start date"
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
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="Select end date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCustomFilter(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustomFilter}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default CashSales;