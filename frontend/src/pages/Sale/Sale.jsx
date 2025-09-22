import React, { useState, useEffect, useMemo } from "react";
import { UserPlus, Trash2, Edit, Upload, X } from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { handleAxiosError } from "../../utils/errorHandler";
import * as XLSX from "xlsx";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const Sales = () => {
  const [sales, setSales] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hideRowChecked, setHideRowChecked] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const salesPerPage = 9;

  const requiredHeaders = [
    "recording date",
    "invoice #",
    "invoice date",
    "mr name",
    "customer code",
    "product name",
    "sales qty",
    "total qty",
    "selling price (usd)",
    "amount (usd)",
    "net selling amount (usd)",
    "credit (days)",
    "due date",
    "delivery date",
    "payment status",
  ];

  const hideRowList = [
    { id: 1, name: "Recording Date", dbName: "recordingDate" },
    { id: 2, name: "Bonus Qty", dbName: "bonusQty" },
    { id: 3, name: "Selling Price (USD)", dbName: "sellingPrice" },
    { id: 4, name: "Discount (USD)", dbName: "discount" },
    { id: 5, name: "Net Selling Amount (USD)", dbName: "netSellingAmount" },
    { id: 6, name: "Average Unit Price (USD)", dbName: "averageUnitPrice" },
    { id: 7, name: "Prof/Loss", dbName: "profitLoss" },
    { id: 8, name: "Credit (Days)", dbName: "creditDays" },
    { id: 9, name: "Due Date", dbName: "dueDate" },
    { id: 10, name: "Delivery Date", dbName: "deliveryDate" },
    { id: 11, name: "Remark", dbName: "remark" },
  ];

  // ✅ Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  // ✅ Fetch sales data once on mount
  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  // ✅ Filter sales based on tab and search
  const filteredSales = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    return sales.filter((s) => {
      setCurrentPage(1);
      const paymentStatus = s.paymentStatus?.toLowerCase();
      const matchesType =
        selectedTab.toLowerCase() === "all" ||
        s.paymentStatus?.toLowerCase() === selectedTab.toLowerCase();

      const normalizedPayment = paymentStatus?.toLowerCase() || "pending";
      const matchesTab =
        selectedTab.toLowerCase() === "all"
          ? true
          : selectedTab.toLowerCase() === "paid"
          ? normalizedPayment === "paid"
          : normalizedPayment === "pending";

      // Final check
      if (!matchesType || !matchesTab) return false;

      if (searchTerm.trim() === "") return true;
      return (
        s.invoiceNumber.includes(lowerSearch) ||
        s.customerInfo?.name?.toLowerCase().includes(lowerSearch) ||
        s.salesStatus?.toLowerCase().includes(lowerSearch) ||
        s.paymentMode?.toLowerCase().includes(lowerSearch) ||
        s.remarks?.toLowerCase().includes(lowerSearch) ||
        formatDateToReadable(new Date(s.deliveryDate), "dd/MM/yyyy")
          .toLowerCase()
          .includes(lowerSearch)
      );
    });
  }, [sales, searchTerm, selectedTab]);

  const toggleItem = (id) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const chunkedItems = [];
  for (let i = 0; i < hideRowList.length; i += 2) {
    chunkedItems.push(hideRowList.slice(i, i + 2));
  }
  const handleSave = () => {
    setIsModalOpen(false);
  };

  const handleReset = () => {
    setSelectedItems([]); // Reset selected checkboxes
    setIsModalOpen(false); // Close modal
  };

  const totalPages = Math.ceil(filteredSales.length / salesPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);

  const currentSales = filteredSales.slice(
    (currentPage - 1) * salesPerPage,
    currentPage * salesPerPage
  );

  // ✅ Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          (cell || "").toString().trim().toLowerCase()
        );
        const matched = requiredHeaders.filter((hdr) => row.includes(hdr));
        if (matched.length === requiredHeaders.length) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        const sampleRow = rows.find((_, i) => i < 10) || [];
        const lowerSampleRow = sampleRow.map((cell) =>
          (cell || "").toString().trim().toLowerCase()
        );
        const missing = requiredHeaders.filter(
          (hdr) => !lowerSampleRow.includes(hdr)
        );
        showToast(
          "error",
          `❌ Required headers missing: ${missing.join(", ")}`
        );
        return;
      }

      const rawHeaders = rows[headerRowIndex];
      const headersMap = {};
      rawHeaders.forEach((headerText, colIndex) => {
        const cleaned = headerText?.toString().trim().toLowerCase();
        if (requiredHeaders.includes(cleaned)) {
          headersMap[colIndex] = cleaned;
        }
      });

      const dataRows = rows.slice(headerRowIndex + 1);

      const mappedData = dataRows
        .map((row) => {
          const item = {};
          Object.entries(headersMap).forEach(([colIndex, key]) => {
            item[key] = row[colIndex] || "";
          });

          return {
            recordingDate: item["recording date"],
            invoiceNumber: item["invoice #"],
            invoiceDate: item["invoice date"],
            mrName: item["mr name"],
            customerCode: item["customer code"],
            productName: item["product name"],
            salesQty: item["sales qty"],
            bonusQty: item["bonus qty"],
            totalQty: item["total qty"],
            sellingPrice: item["selling price (usd)"],
            amount: item["amount (usd)"],
            discount: item["discount (usd)"],
            netSellingAmount: item["net selling amount (usd)"],
            averageUnitPrice: item["average unit price (usd)"],
            profitLoss: item["prof/los"],
            creditDays: item["credit (days)"],
            dueDate: item["due date"],
            deliveryDate: item["delivery date"],
            paymentStatus: item["payment status"],
            remark: item["remark"],
          };
        })
        .filter((entry) => entry.productName !== "");

      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString(); // ensure it's a string
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  const fetchSaleSummaries = async () => {
    try {
      // setLoading(false);
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sale summaries");

      const data = await res.json();
      const uniqueTypes = Array.from(
        new Set(data.map((item) => item.paymentStatus?.toLowerCase()))
      );

      setTypes(["All", ...uniqueTypes]);
      setSales(data);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    } finally {
      setLoading(false);
    }
  };
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

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked) => {
    setSelected(checked ? currentSales.map((s) => s.id) : []);
  };

  const handleDeleteSelected = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected sale(s)?`
      )
    ) {
      setSales((prev) => prev.filter((s) => !selected.includes(s.id)));
      setSelected([]);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
  };

  const handleProductImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    setIsUploading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/sale/import`, parsedData);

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Sale Summary imported successfully!"
        );
        setShowImportModal(false);
        fetchSaleSummaries();
      }
    } catch (err) {
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Top Buttons + Search */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex gap-3 items-center">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            onClick={() => alert("Add new sales clicked")}
          >
            <UserPlus size={18} /> Add New Sales
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 cursor-pointer"
          >
            <Upload size={18} /> Import Product
          </button>

          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        {sales.length > 0 ? (
          <div className="flex items-center gap-6">
            {/* Tabs */}
            <div className="flex gap-4">
              {types.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setSelectedTab(tab);
                    setCurrentPage(1);
                    setSelected([]);
                  }}
                  className={`px-4 py-2 rounded-lg cursor-pointer ${
                    selectedTab === tab
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {capitalizeFirstLetter(tab)}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setIsModalOpen(true);
                setHideRowChecked(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer"
            >
              Add More Column
            </button>
          </div>
        ) : (
          <div></div>
        )}

        {/* Total count and search */}
        <div className="flex items-center gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredSales.length}
            </span>
          </p>

          <input
            type="text"
            placeholder="Search invoice, customer, status..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="border px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
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

      {/* Table */}
      <div className="container">
        <div className="overflow-x-hidden md:overflow-x-auto whitespace-nowrap">
          <table className="w-full border-collapse bg-white rounded-2xl shadow text-center">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selected.length === currentSales.length &&
                      currentSales.length > 0
                    }
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="p-3">Invoice No</th>
                <th className="p-3">Invoice Date</th>
                <th className="p-3">Product Name</th>
                <th className="p-3">MR Name</th>
                <th className="p-3">Customer Name</th>
                <th className="p-3">Sales Qty</th>
                <th className="p-3">Selling Price/$</th>
                {hideRowList
                  .filter((item) => selectedItems.includes(item.id))
                  .map((item) => (
                    <th key={item.id} className="p-3">
                      {item.name}
                    </th>
                  ))}
                <th className="p-3">Total Amount ($)</th>
                <th className="p-3">Payment Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-gray-500">
                    No sales found.
                  </td>
                </tr>
              ) : (
                currentSales.map((sale, index) => {
                  return (
                    <tr
                      key={sale._id}
                      className={`hover:bg-gray-50 ${
                        (index + 1) % salesPerPage === 0 ||
                        index + 1 === currentSales.length
                          ? ""
                          : "border-b"
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.includes(sale.id)}
                          onChange={() => toggleSelect(sale.id)}
                        />
                      </td>
                      <td className="p-3">{sale.invoiceNumber}</td>
                      <td className="p-3">
                        {formatDateToReadable(sale.invoiceDate)}
                      </td>
                      <td className="p-3">
                        {capitalizeFirstLetter(sale.productName)}
                      </td>
                      <td className="p-3">
                        {capitalizeFirstLetter(sale.mrName)}
                      </td>
                      <td className="p-3">
                        {capitalizeFirstLetter(sale.customerInfo.name) || "--"}
                      </td>
                      <td className="p-3">{Math.ceil(sale.salesQty)}</td>
                      <td className="p-3">{Math.ceil(sale.sellingPrice)}</td>
                      {hideRowList
                        .filter((item) => selectedItems.includes(item.id))
                        .map((item) => (
                          <td key={item.id} className="p-3">
                            {item.dbName === "recordingDate" ||
                            item.dbName === "deliveryDate" ||  item.dbName === "dueDate"
                              ? formatDateToReadable(sale[item.dbName])|| "--"
                              : sale[item.dbName] || "--"}
                          </td>
                        ))}

                      <td className="p-3">{Math.ceil(sale.amount)}</td>
                      <td className="p-3">
                        {capitalizeFirstLetter(sale.paymentStatus)}
                      </td>
                      <td className="p-3 flex items-center justify-center gap-3">
                        <button
                          className="text-green-600 hover:text-green-800 cursor-pointer"
                          onClick={() => alert(`Edit sale ${sale.invoiceNo}`)}
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Are you sure you want to delete sale ${sale.invoiceNo}?`
                              )
                            ) {
                              setSales((prev) =>
                                prev.filter((s) => s.id !== sale.id)
                              );
                              setSelected((prev) =>
                                prev.filter((id) => id !== sale.id)
                              );
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {currentSales.length > 0 && (
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

      {isModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50">
            <div className="absolute inset-0" />
            <div
              className="relative bg-white p-6 rounded shadow-lg max-w-xl w-full z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-4">Select Columns</h2>
              <div className="grid grid-cols-1 gap-3">
                {chunkedItems.map((pair, index) => (
                  <div key={index} className="flex gap-4">
                    {pair.map(({ id, name }) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 flex-1 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(id)}
                          onChange={() => toggleItem(id)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-between items-center">
                {/* Left side - Reset button */}
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  Reset
                </button>

                {/* Right side - Cancel and Save */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Sales;
