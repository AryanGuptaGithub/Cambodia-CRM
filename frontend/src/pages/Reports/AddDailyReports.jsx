import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { UserPlus, Trash2, Edit, Upload, X, Eye, Search } from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import DailyPiChartDatePicker from "../../utils/dailyReportsDatePicker";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const AddDailReports = () => {
  const [dailyReports, setDailyReports] = useState([]);
  const [dailyReportsDate, setDailyReportsDate] = useState([]);
  const [selectedReportTypeTab, setSelectedReportTypeTab] =
    useState("Multiple");
  const [selectedTab, setSelectedTab] = useState("Total Sales");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [isSelectingStart, setIsSelectingStart] = useState(true);

  const inputRef = useRef(null);

  const dailyReportsPerPage = 9;

  const [form, setForm] = useState({
    mrName: "",
    salesQty: 0,
    bonusQty: 0,
    totalQty: 0,
    amount: 0,
    paidAmount: 0,
    dueAmount: 0,
    paymentStatus: "",
  });

  // Reset page when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  // Fetch data on mount
  useEffect(() => {
    fetchDailyReports(selectedReportTypeTab);
  }, []);
  useEffect(() => {
    fetchSaleType();
  }, []);

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString();
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // Fetch function
  const fetchDailyReports = async (tab, saleType, startDate, endDate) => {
    try {
      setLoading(true);

      const url = new URL(`${backendUrl}/api/dailyReports`);
      const params = url.searchParams;

      if (tab) params.append("tab", tab);
      if (saleType) params.append("saleType", saleType);
      if (startDate instanceof Date && !isNaN(startDate))
        params.append("startDate", startDate.toISOString());
      if (endDate instanceof Date && !isNaN(endDate))
        params.append("endDate", endDate.toISOString());

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch sale summaries");

      const data = await res.json();

      const { minRecordingDate, maxRecordingDate } = data.dateRange || {};

      const dateRangeSetter =
        minRecordingDate && maxRecordingDate
          ? formatDateToReadable(minRecordingDate) ===
            formatDateToReadable(maxRecordingDate)
            ? formatDateToReadable(minRecordingDate)
            : `${formatDateToReadable(
                minRecordingDate
              )} - ${formatDateToReadable(maxRecordingDate)}`
          : "";
      setDailyReports(data.reports || []);
      setDailyReportsDate(dateRangeSetter);

      if (
        data?.dateRange?.minRecordingDate &&
        data?.dateRange?.maxRecordingDate
      ) {
        const minDate = new Date(data.dateRange.minRecordingDate);
        const maxDate = new Date(data.dateRange.maxRecordingDate);

        setStartDate(minDate);
        setEndDate(maxDate);
      }
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    } finally {
      setLoading(false);
    }
  };

  const fetchSaleType = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/dailyReports/types`);

      if (!res.ok) {
        throw new Error(`Failed to fetch sale types: ${res.statusText}`);
      }

      const data = await res.json();
      setTypes(data);
    } catch (error) {
      console.error("Error fetching sale types:", error);
      showToast("error", error.message || "Error while fetching sale types");
    }
  };

  const filteredDailyReports = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    return dailyReports.filter((sale) => {
      if (selectedTab !== "Total Sales" && sale.saleType !== selectedTab) {
        return false;
      }

      if (!lowerSearch) return true;

      const fields = [
        sale.mrName ?? "",
        sale.totalSalesQty?.toString() ?? "",
        sale.totalBonusQty?.toString() ?? "",
        sale.totalPaidAmount?.toString() ?? "",
        sale.totalQty?.toString() ?? "",
      ];

      return fields.some((field) =>
        String(field).toLowerCase().includes(lowerSearch)
      );
    });
  }, [dailyReports, searchTerm, selectedTab]);

  // Memoized current page slice
  const currentDailyReports = useMemo(() => {
    const start = (currentPage - 1) * dailyReportsPerPage;
    return filteredDailyReports.slice(start, start + dailyReportsPerPage);
  }, [filteredDailyReports, currentPage, dailyReportsPerPage]);

  const totalPages = useMemo(
    () => Math.ceil(filteredDailyReports.length / dailyReportsPerPage),
    [filteredDailyReports, dailyReportsPerPage]
  );
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages]
  );

  // Render loading
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="text-xl font-medium text-gray-600 flex gap-1">
          Loading
          <span className="animate-bounce [animation-delay:0s]">.</span>
          <span className="animate-bounce [animation-delay:0.2s]">.</span>
          <span className="animate-bounce [animation-delay:0.4s]">.</span>
        </div>
      </div>
    );
  }

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  const handlerTab = (type) => {
    setSelectedTab(type);
    setCurrentPage(1);
    setSearchTerm("");
    setSelected([]);

    if (
      startDate &&
      endDate &&
      selectedReportTypeTab.toLowerCase() == "single"
    ) {
      fetchDailyReports(selectedReportTypeTab, type, startDate, endDate);
    } else {
      fetchDailyReports(selectedReportTypeTab, type);
    }
  };

  const saleTypeChange = (tab) => {
    setSelectedReportTypeTab(tab);
    setCurrentPage(1);
    setSelectedTab("Total Sales");

    if (tab.toLowerCase() === "single") {
      if (startDate && endDate) {
        fetchDailyReports(tab, startDate, endDate);
      } else {
        fetchDailyReports(tab);
      }
    } else {
      fetchDailyReports(tab);
    }
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <div className="flex gap-4">
            {["Multiple", "Single"].map((tab) => (
              <button
                key={tab}
                onClick={() => saleTypeChange(tab)}
                className={`px-4 py-2 rounded-lg cursor-pointer ${
                  selectedReportTypeTab === tab
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {capitalizeFirstLetter(tab)}
              </button>
            ))}
          </div>
          {selectedReportTypeTab.toLowerCase() === "single" && (
            <div className="flex items-center gap-8">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {dailyReports.length}
                </span>
              </p>

              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={handleIconClick}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-6">
            <div className="flex gap-4">
              {types.map(({ type }) => (
                <button
                  key={type}
                  onClick={() => handlerTab(type)}
                  className={`px-4 py-2 rounded-lg cursor-pointer ${
                    selectedTab === type
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {capitalizeFirstLetter(type)}
                </button>
              ))}
            </div>
          </div>

          {selectedReportTypeTab.toLowerCase() == "multiple" && (
            <div className="flex items-center gap-8">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredDailyReports.length}
                </span>
              </p>
              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={handleIconClick}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search invoice, customer, status..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
          {selectedReportTypeTab.toLowerCase() === "single" && (
            <div className="w-full md:w-auto">
              <DailyPiChartDatePicker
                startDate={startDate}
                endDate={endDate}
                setStartDate={setStartDate}
                setEndDate={setEndDate}
              />
            </div>
          )}
        </div>

        <div className="overflow-x-hidden md:overflow-x-auto whitespace-nowrap shadow">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">MR Name</th>
                <th className="p-3">Sales Qty</th>
                <th className="p-3">Bonus Qty</th>
                <th className="p-3">Total Qty</th>
                <th className="p-3">Total Paid</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {currentDailyReports.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-gray-500">
                    No Sales found.
                  </td>
                </tr>
              ) : (
                currentDailyReports.map((sale, index) => (
                  <tr
                    key={`${sale.mrName}-${index}`}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % dailyReportsPerPage === 0 ||
                      index + 1 === currentDailyReports.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
                      {capitalizeFirstLetter(sale.mrName)}
                    </td>

                    <td className="p-3">{Math.ceil(sale.totalSalesQty)}</td>
                    <td className="p-3">{Math.ceil(sale.totalBonusQty)}</td>
                    <td className="p-3">{Math.ceil(sale.totalQty)}</td>
                    <td className="p-3">
                      {Number(sale.totalPaidAmount).toFixed(2)}
                    </td>
                    <td className="p-3">{dailyReportsDate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">Import Products</h2>
                {isSampleFile && <SampleExcelDownloadSale />}
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowImportModal(false)}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProductImport}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-blue-400 text-white cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isUploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {currentDailyReports.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => {
                setCurrentPage((prev) => {
                  const prevPage = Math.max(prev - 1, 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return prevPage;
                });
              }}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>

            {visiblePages.map((page, idx) =>
              page === "..." ? (
                <span
                  key={`sales-ellipsis-${idx}`}
                  className="px-3 py-1 text-gray-500 select-none cursor-pointer"
                >
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => {
                    setCurrentPage(page);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                    currentPage === page
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              onClick={() => {
                setCurrentPage((prev) => {
                  const nextPage = Math.min(prev + 1, totalPages);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return nextPage;
                });
              }}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}

        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              {/* Background Overlay */}
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsViewModalOpen(false)}
              />

              {/* Modal Content */}
              <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  View Sales Record
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                  {/* Fixed fields */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Selected Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.recordingDate
                        ? new Date(form.recordingDate).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      MR Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.mrName || "-"}
                    </p>
                  </div>

                  {/* Numeric Fields */}
                  {[
                    ["Sales Quantity", "salesQty"],
                    ["Bonus Quantity", "bonusQty"],
                    ["Total Quantity", "totalQty"],
                    ["Paid Amount", "paidAmount"],
                    ["Due Amount", "dueAmount"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-600">
                        {label}
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form[key] ?? 0}
                      </p>
                    </div>
                  ))}

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Payment Status
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.paymentStatus || "-"}
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-600">
                      Remark
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.remark || "-"}
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default AddDailReports;
