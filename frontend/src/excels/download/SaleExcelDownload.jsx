import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Download, X } from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const SaleExcelDownload = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setStartDate("");
    setEndDate("");
  };

  const generateExcel = async () => {
    try {
      setLoading(true);

      // Validate dates
      if (!startDate || !endDate) {
        showToast("error", "Please select both start date and end date");
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        showToast("error", "Start date cannot be after end date");
        return;
      }

      // Send data to backend
      const response = await fetch(`${backendUrl}/api/download-sales-excel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to download Excel file");
      }

      // Create blob from response and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `sale_summary_${startDate}_to_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast("success", "Excel file downloaded successfully!");
      closeModal();
    } catch (error) {
      console.error("Error generating Excel file:", error);
      showToast("error", error.message || "Failed to generate Excel file");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type, message) => {
    // Replace this with your actual toast notification implementation
    console.log(`${type}: ${message}`);
    alert(`${type.toUpperCase()}: ${message}`);
  };

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download size={18} />
        Download
      </button>

      {/* Modal with Portal */}
      {isModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={loading}
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold mb-4">Select Date Range</h2>
    <div className="space-y-4">
      {/* Start Date Picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Start Date
        </label>
        <DatePicker
          selected={startDate}
          onChange={(date) => setStartDate(date)}
          dateFormat="yyyy-MM-dd"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
          placeholderText="Select start date"
        />
      </div>

      {/* End Date Picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          End Date
        </label>
        <DatePicker
          selected={endDate}
          onChange={(date) => setEndDate(date)}
          dateFormat="yyyy-MM-dd"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
          placeholderText="Select end date"
        />
      </div>
    </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={closeModal}
                  disabled={loading}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    loading
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={generateExcel}
                  disabled={!startDate || !endDate || loading}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg cursor-pointer ${
                    !startDate || !endDate || loading
                      ? "bg-green-400 text-white cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 text-white"
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
