import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Download, X } from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./saleExcelDownload.css";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";

const SaleExcelDownload = ({ type = "sales" }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [loading, setLoading] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // === Modal Controls ===
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => {
    setIsModalOpen(false);
    setStartDate(null);
    setEndDate(null);
  };

  // === Generate Excel File ===
  const generateExcel = async () => {
    try {
      setLoading(true);

      if (!startDate || !endDate) {
        showToast("error", "Please select both start and end dates");
        return;
      }

      if (startDate > endDate) {
        showToast("error", "Start date cannot be after end date");
        return;
      }

      const apiEndpoint =
        type === "salesreturn"
          ? `${backendUrl}/api/salesreturn/download-excel`
          : `${backendUrl}/api/sales/download-excel`;

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to download Excel file");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;

      const filePrefix =
        type === "salesreturn" ? "sales_return_summary" : "sale_summary";

      a.download = `${filePrefix}_${formatDateToReadable(
        startDate
      )}_to_${formatDateToReadable(endDate)}.xlsx`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast(
        "success",
        `${type === "salesreturn" ? "Sales Return" : "Sales"} Excel downloaded successfully!`
      );
      closeModal();
    } catch (error) {
      console.error("Error generating Excel:", error);
      showToast("error", error.message || "Failed to generate Excel file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors disabled:opacity-50"
      >
        <Download size={18} />
        {type === "salesreturn" ? "Download Return Excel" : "Download Sales Excel"}
      </button>

      {isModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                disabled={loading}
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold mb-4">
                {type === "salesreturn"
                  ? "Download Sales Return Report"
                  : "Download Sales Report"}
              </h2>

              <div className="space-y-4">
                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={startDate}
                    onChange={(date) => setStartDate(date)}
                    dateFormat="yyyy-MM-dd"
                    maxDate={new Date()} // ✅ Prevent future dates
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    disabled={loading}
                    placeholderText="Select start date"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={endDate}
                    onChange={(date) => setEndDate(date)}
                    dateFormat="yyyy-MM-dd"
                    minDate={startDate} // ✅ Ensures end date is not before start date
                    maxDate={new Date()} // ✅ Prevent future dates
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    disabled={loading}
                    placeholderText="Select end date"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={closeModal}
                  disabled={loading}
                  className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={generateExcel}
                  disabled={!startDate || !endDate || loading}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-white ${
                    !startDate || !endDate || loading
                      ? "bg-green-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Download Excel
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default SaleExcelDownload;
