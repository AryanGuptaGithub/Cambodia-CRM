import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Download, X } from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./saleExcelDownload.css";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";

const SaleExcelDownload = ({ 
  type = "sales", 
  modalTitle = "Download Report",
  buttonText = "Download Excel",
  successMessage = "Excel downloaded successfully!",
  filePrefix = "summary"
}) => {
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

  // Format date to YYYY-MM-DD string
  const formatDateForBackend = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

      console.log('values of startDate', startDate);
      console.log('values of endDate', endDate);
      
      // Format dates for backend
      const formattedStartDate = formatDateForBackend(startDate);
      const formattedEndDate = formatDateForBackend(endDate);
      
      console.log('Formatted startDate for backend:', formattedStartDate);
      console.log('Formatted endDate for backend:', formattedEndDate);

      // Dynamic API endpoint based on type
      const apiEndpoint = `${backendUrl}/api/${type}/download-excel`;
      console.log('API Endpoint:', apiEndpoint);

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          startDate: formattedStartDate, 
          endDate: formattedEndDate 
        }),
      });
      
      console.log('Response status:', response.status);
      console.log('Response status text:', response.statusText);

      if (!response.ok) {
        // Try to parse error message
        let errorMessage = "Failed to download Excel file";
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Check if response is OK for Excel file
      const contentType = response.headers.get("content-type");
      console.log('Content-Type:', contentType);
      
      if (contentType && contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
        const blob = await response.blob();
        console.log('Blob size:', blob.size);
        
        if (blob.size === 0) {
          throw new Error("Received empty Excel file");
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;

        // Dynamic file name
        const fileName = `${filePrefix}_${formatDateToReadable(startDate)}_to_${formatDateToReadable(endDate)}.xlsx`;
        a.download = fileName;
        console.log('Downloading file:', fileName);

        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast("success", successMessage);
        closeModal();
      } else {
        // Handle non-Excel response (probably an error in JSON)
        const responseText = await response.text();
        console.error('Non-Excel response:', responseText);
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          errorData = { message: responseText };
        }
        throw new Error(errorData.message || "Server returned non-Excel response");
      }
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
        {buttonText}
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
                {modalTitle}
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
                    maxDate={new Date()}
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
                    minDate={startDate}
                    maxDate={new Date()}
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