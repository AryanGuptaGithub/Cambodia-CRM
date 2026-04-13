import React, { useState, useEffect, useMemo, useRef } from "react";
import { Eye, X, Edit, Search, Download, Menu } from "lucide-react";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import axios from "axios";
import { showToast } from "../../utils/toast";
import * as XLSX from "xlsx";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

function PriceList() {
  const [priceList, setPriceList] = useState([]);
  const [types, setTypes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const inputRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const priceListPerPage = 9;

  // Mobile detection
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [form, setForm] = useState({
    productName: "",
    sellingPrice: "",
    lc: "",
    taxSellingPrice: "",
    type: "",
    drugLicense: "",
    licenseValidityDate: "",
  });

  const fetchPriceList = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/price-lists`);
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      const uniqueTypes = Array.from(
        new Set(data.map((item) => item.type?.toLowerCase()).filter(Boolean)),
      );
      setTypes(["All", ...uniqueTypes]);
      setPriceList(data);
    } catch (err) {
      setError(err.message || "Something went wrong");
      showToast("error", "Failed to load price list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPriceList();
  }, []);

  const filteredPriceList = useMemo(() => {
    setCurrentPage(1);
    const lowerSearch = searchTerm.toLowerCase();
    return priceList.filter((product) => {
      const matchesType =
        selectedTab.toLowerCase() === "all" ||
        product.type?.toLowerCase() === selectedTab.toLowerCase();
      const licenseDateFormatted = product.licenseValidityDate
        ? formatDateToReadable(
            new Date(product.licenseValidityDate),
            "dd/MM/yyyy",
          ).toLowerCase()
        : "";
      const fieldsToSearch = [
        product.productName,
        product.sellingPrice,
        product.lc,
        product.taxSellingPrice,
        product.type,
        product.drugLicense,
        licenseDateFormatted,
      ];
      const matchesSearch = fieldsToSearch.some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(lowerSearch),
      );
      return matchesType && matchesSearch;
    });
  }, [priceList, searchTerm, selectedTab]);

  const totalPages = Math.ceil(filteredPriceList.length / priceListPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentPriceList = filteredPriceList.slice(
    (currentPage - 1) * priceListPerPage,
    currentPage * priceListPerPage,
  );

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString();
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const handleView = (item) => {
    setForm(item);
    setIsViewModalOpen(true);
  };

  const handleEdit = (item) => {
    setForm(item);
    setIsEditModalOpen(true);
  };

  const handleProductUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `${backendUrl}/api/price-lists/${form._id}`,
        form,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 200) {
        showToast("success", "Product updated successfully");
        setIsEditModalOpen(false);
        fetchPriceList();
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || "Failed to update price list.";
      showToast("error", errorMessage);
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        if (inputRef.current) inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  const handleNumericInput = (e, field) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm({ ...form, [field]: value });
    }
  };

  const downloadCSV = () => {
    if (filteredPriceList.length === 0) {
      showToast("info", "No data to download");
      return;
    }
    setDownloading(true);
    try {
      const dataToDownload = filteredPriceList.map((item, index) => ({
        "S.No": index + 1,
        "Product Name": item.productName || "",
        Type: item.type || "",
        "Selling Price (USD)": item.sellingPrice || "",
        LC: item.lc || "",
        "Tax Selling Price (USD)": item.taxSellingPrice || "",
        "Drug License": item.drugLicense || "",
        "License Validity Date": item.licenseValidityDate
          ? formatDateToReadable(item.licenseValidityDate, "dd/MM/yyyy")
          : "",
      }));
      const headers = Object.keys(dataToDownload[0]).join(",");
      const rows = dataToDownload.map((item) =>
        Object.values(item)
          .map((value) =>
            typeof value === "string" && value.includes(",")
              ? `"${value}"`
              : value,
          )
          .join(","),
      );
      const csvContent = [headers, ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().split("T")[0];
      link.href = url;
      link.download = `PriceList_${timestamp}_${filteredPriceList.length}_items.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(
        "success",
        `Downloaded ${filteredPriceList.length} items as CSV`,
      );
    } catch (error) {
      console.error("Download error:", error);
      showToast("error", "Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  const downloadExcel = () => {
    if (filteredPriceList.length === 0) {
      showToast("info", "No data to download");
      return;
    }
    setDownloading(true);
    try {
      const dataToDownload = filteredPriceList.map((item, index) => ({
        "S.No": index + 1,
        "Product Name": item.productName || "",
        Type: item.type || "",
        "Selling Price (USD)": item.sellingPrice || "",
        LC: item.lc || "",
        "Tax Selling Price (USD)": item.taxSellingPrice || "",
        "Drug License": item.drugLicense || "",
        "License Validity Date": item.licenseValidityDate
          ? formatDateToReadable(item.licenseValidityDate, "dd/MM/yyyy")
          : "",
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataToDownload);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 30 },
        { wch: 15 },
        { wch: 18 },
        { wch: 10 },
        { wch: 22 },
        { wch: 15 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Price List");
      const timestamp = new Date().toISOString().split("T")[0];
      XLSX.writeFile(
        wb,
        `PriceList_${timestamp}_${filteredPriceList.length}_items.xlsx`,
      );
      showToast(
        "success",
        `Downloaded ${filteredPriceList.length} items as Excel`,
      );
    } catch (error) {
      console.error("Excel download error:", error);
      showToast("error", "Failed to download Excel file");
    } finally {
      setDownloading(false);
    }
  };

  const DownloadDropdown = () => (
    <div className="relative inline-block">
      <button
        className={`flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4 py-2 rounded-lg cursor-pointer transition-colors text-xs md:text-sm ${
          downloading ? "opacity-70 cursor-not-allowed" : ""
        }`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={downloading}
      >
        <Download size={18} />
        {downloading ? "Downloading..." : "Download"}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <button
            onClick={() => {
              downloadCSV();
              setIsOpen(false);
            }}
            className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
          >
            Download as CSV
          </button>
          <button
            onClick={() => {
              downloadExcel();
              setIsOpen(false);
            }}
            className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
          >
            Download as Excel
          </button>
          <button
            onClick={() => {
              if (currentPriceList.length > 0) {
                const dataToDownload = currentPriceList.map((item, index) => ({
                  "S.No": (currentPage - 1) * priceListPerPage + index + 1,
                  "Product Name": item.productName || "",
                  Type: item.type || "",
                  "Selling Price (USD)": item.sellingPrice || "",
                  LC: item.lc || "",
                  "Tax Selling Price (USD)": item.taxSellingPrice || "",
                  "Drug License": item.drugLicense || "",
                  "License Validity Date": item.licenseValidityDate
                    ? formatDateToReadable(
                        item.licenseValidityDate,
                        "dd/MM/yyyy",
                      )
                    : "",
                }));
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(dataToDownload);
                XLSX.utils.book_append_sheet(wb, ws, `Page ${currentPage}`);
                const timestamp = new Date().toISOString().split("T")[0];
                XLSX.writeFile(
                  wb,
                  `PriceList_Page_${currentPage}_${timestamp}.xlsx`,
                );
                showToast("success", `Downloaded page ${currentPage} as Excel`);
              }
              setIsOpen(false);
            }}
            className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            Download Current Page (Excel)
          </button>
        </div>
      )}
    </div>
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event.target.closest(".relative.inline-block"))
        setIsOpen(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="p-4 md:p-6 bg-white rounded-xl relative pb-20 md:pb-6">
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}
      
      {/* Mobile Header */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <Menu size={20} className="text-gray-700" />
          </button>
          <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
            Total: {filteredPriceList.length}
          </div>
        </div>
      )}

      {/* Desktop: Tabs and Search Row */}
      {!isMobileView && priceList.length > 0 && (
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {types.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setSelectedTab(tab);
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                    selectedTab === tab
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {capitalizeFirstLetter(tab)}
                </button>
              ))}
            </div>
          </div>

          {/* Right: total count + search + download */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <p className="text-sm font-semibold text-gray-700 whitespace-nowrap">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                {filteredPriceList.length}
              </span>
            </p>
            <DownloadDropdown />
            <div className="relative w-64">
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
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Tabs */}
      {isMobileView && types.length > 0 && (
        <div className="mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
          <div className="flex gap-2 pb-2">
            {types.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setSelectedTab(tab);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition ${
                  selectedTab === tab
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {capitalizeFirstLetter(tab)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile: Search only (no download button) */}
      {isMobileView && priceList.length > 0 && (
        <div className="relative mb-3">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm text-sm"
          />
        </div>
      )}

      {/* Search Info */}
      {searchTerm && filteredPriceList.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className={`text-blue-700 ${isMobileView ? "text-xs" : "text-sm"}`}>
            Searching for: <span className="font-semibold">"{searchTerm}"</span>
            <span className="ml-4">
              Found: <span className="font-bold">{filteredPriceList.length}</span> record(s)
            </span>
          </p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      )}
      
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          <p className="font-medium">Error: {error}</p>
          <button
            onClick={fetchPriceList}
            className="mt-2 text-sm underline hover:text-red-800 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="min-w-[800px] md:min-w-full w-full border-collapse bg-white rounded-2xl text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                Product Name
              </th>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                Type
              </th>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                Selling Price (USD)
              </th>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                LC
              </th>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                Tax Selling Price (USD)
              </th>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                Drug License
              </th>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                License Validity
              </th>
              <th className={`p-2 md:p-3 text-xs md:text-sm font-medium ${isMobileView ? "text-[9px]" : ""}`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading && currentPriceList.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500">
                  No products found
                </td>
              </tr>
            ) : (
              currentPriceList.map((item, idx) => (
                <tr
                  key={item._id}
                  className={`hover:bg-gray-50 ${idx + 1 < currentPriceList.length ? "border-b" : ""}`}
                >
                  <td className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"} capitalize`}>
                    {item.productName || "--"}
                  </td>
                  <td className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"} capitalize`}>
                    {item.type || "--"}
                  </td>
                  <td className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"}`}>
                    {item.sellingPrice ?? "--"}
                  </td>
                  <td className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"}`}>
                    {item.lc ?? "--"}
                  </td>
                  <td className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"}`}>
                    {item.taxSellingPrice ?? "--"}
                  </td>
                  <td className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"}`}>
                    {item.drugLicense || "--"}
                  </td>
                  <td className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"}`}>
                    {formatDateToReadable(item.licenseValidityDate) || "--"}
                  </td>
                  <td className={`p-2 md:p-3 flex items-center justify-center gap-1 md:gap-2`}>
                    <button
                      className="text-blue-600 hover:text-blue-800 cursor-pointer p-1 rounded hover:bg-blue-50"
                      onClick={() => handleView(item)}
                      title="View"
                    >
                      <Eye size={isMobileView ? 15 : 18} />
                    </button>
                    {!isMobileView && (
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer p-1 rounded hover:bg-green-50"
                        onClick={() => handleEdit(item)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination - Fixed for mobile view like Product component */}
        {!loading && currentPriceList.length > 0 && totalPages > 1 && (
          <div className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}>
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
            >
              ← Prev
            </button>
            {!isMobileView ? (
              visiblePages.map((page, idx) => (
                <button
                  key={idx}
                  onClick={() => typeof page === "number" && setCurrentPage(page)}
                  disabled={page === "..."}
                  className={`px-4 py-2 rounded text-sm ${
                    page === "..."
                      ? "bg-gray-200 cursor-not-allowed"
                      : currentPage === page
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              ))
            ) : (
              <span className="px-3 py-1 text-sm text-gray-700 font-medium">
                Page {currentPage} of {totalPages}
              </span>
            )}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit PriceList
              </h2>
              <form
                onSubmit={handleProductUpdate}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={form.productName}
                    onChange={(e) =>
                      setForm({ ...form, productName: e.target.value })
                    }
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Type
                  </label>
                  <input
                    type="text"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Selling Price (USD)
                  </label>
                  <input
                    type="text"
                    value={form.sellingPrice}
                    onChange={(e) => handleNumericInput(e, "sellingPrice")}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                    placeholder="Enter numbers only"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    LC
                  </label>
                  <input
                    type="text"
                    value={form.lc}
                    onChange={(e) => handleNumericInput(e, "lc")}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                    placeholder="Enter numbers only"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Tax Selling Price (USD)
                  </label>
                  <input
                    type="text"
                    value={form.taxSellingPrice}
                    onChange={(e) => handleNumericInput(e, "taxSellingPrice")}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                    placeholder="Enter numbers only"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Drug License
                  </label>
                  <input
                    type="text"
                    value={form.drugLicense}
                    onChange={(e) =>
                      setForm({ ...form, drugLicense: e.target.value })
                    }
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    License Validity Date
                  </label>
                  <DatePicker
                    selected={
                      form.licenseValidityDate
                        ? new Date(form.licenseValidityDate)
                        : null
                    }
                    onChange={(date) =>
                      setForm({
                        ...form,
                        licenseValidityDate: date
                          ? date.toISOString().split("T")[0]
                          : "",
                      })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select date"
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                  />
                </div>
                <div className="mt-6 flex justify-end gap-3 col-span-1 md:col-span-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* View Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View PriceList
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.productName || "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Type
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.type || "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Selling Price (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.sellingPrice != null && form.sellingPrice !== ""
                      ? form.sellingPrice
                      : "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    LC
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.lc != null && form.lc !== "" ? form.lc : "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Tax Selling Price (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.taxSellingPrice != null && form.taxSellingPrice !== ""
                      ? form.taxSellingPrice
                      : "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Drug License
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.drugLicense || "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    License Validity Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.licenseValidityDate
                      ? formatDateToReadable(form.licenseValidityDate)
                      : "--"}
                  </p>
                </div>
              </div>
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
          document.body,
        )}
    </div>
  );
}

export default PriceList;