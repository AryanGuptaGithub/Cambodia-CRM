import React, { useState, useEffect } from "react";
import { UserPlus, Trash2, Edit, Upload, X } from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { handleAxiosError } from "../../utils/errorHandler";
import * as XLSX from "xlsx";
import { showToast } from "../../utils/toast";

const salesData = [
  {
    id: 1,
    invoiceNo: "INV001",
    salesDate: "2025-08-01",
    customerName: "John Doe",
    salesStatus: "Ordered",
    totalAmount: 1500,
    paidAmount: 1500,
    paymentStatus: "Paid",
  },
  {
    id: 2,
    invoiceNo: "INV002",
    salesDate: "2025-08-05",
    customerName: "Jane Smith",
    salesStatus: "Pending",
    totalAmount: 2000,
    paidAmount: 1000,
    paymentStatus: "Unpaid",
  },
  {
    id: 3,
    invoiceNo: "INV003",
    salesDate: "2025-08-10",
    customerName: "Acme Corp",
    salesStatus: "Delivered",
    totalAmount: 3000,
    paidAmount: 3000,
    paymentStatus: "Paid",
  },
  {
    id: 4,
    invoiceNo: "INV004",
    salesDate: "2025-08-12",
    customerName: "XYZ Ltd.",
    salesStatus: "Shipped",
    totalAmount: 500,
    paidAmount: 0,
    paymentStatus: "Unpaid",
  },
  {
    id: 5,
    invoiceNo: "INV005",
    salesDate: "2025-08-15",
    customerName: "Global Tech",
    salesStatus: "Ordered",
    totalAmount: 1200,
    paidAmount: 1200,
    paymentStatus: "Paid",
  },
  {
    id: 6,
    invoiceNo: "INV006",
    salesDate: "2025-08-18",
    customerName: "Mega Store",
    salesStatus: "Pending",
    totalAmount: 800,
    paidAmount: 300,
    paymentStatus: "Unpaid",
  },
  // Add more if needed
];
const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const Sales = () => {
  const [sales, setSales] = useState(salesData);
  const [selectedTab, setSelectedTab] = useState("All Sales");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
   const [parsedData, setParsedData] = useState([]);
  const salesPerPage = 10;

  const filteredSales = sales.filter((s) => {
    const matchesTab =
      selectedTab === "All Sales"
        ? true
        : selectedTab === "Paid"
        ? s.paymentStatus === "Paid"
        : s.paymentStatus === "Unpaid";

    if (!matchesTab) return false;
    if (searchTerm.trim() === "") return true;

    const lowerSearch = searchTerm.toLowerCase();
    return (
      s.invoiceNo.toLowerCase().includes(lowerSearch) ||
      s.customerName.toLowerCase().includes(lowerSearch) ||
      s.salesStatus.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination calculations
  const indexOfLastSale = currentPage * salesPerPage;
  const indexOfFirstSale = indexOfLastSale - salesPerPage;
  const currentSales = filteredSales.slice(indexOfFirstSale, indexOfLastSale);
  const totalPages = Math.ceil(filteredSales.length / salesPerPage);

  // Toggle checkbox select of one row
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select/Deselect all on current page
  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentSales.map((s) => s.id));
    } else {
      setSelected([]);
    }
  };

  // Delete selected sales
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

  // Reset selection and page when search changes
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };
  const handleProductImport = async () => {
    console.log('values of parsedData', parsedData);
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
        fetchProducts();
      }
    } catch (err) {
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      const requiredHeaders = [
        "no",
        "recording date",
        "invoice #",
        "invoice date",
        "mr name",
        "customer code",
        "product name",
        "sales qty",
        "bonus qty",
        "total qty",
        "selling price (usd)",
        "amount (usd)",
        "discount (usd)",
        "net selling amount (usd)",
        "average unit price (usd)",
        "prof/los",
        "credit (days)",
        "due date",
        "delivery date",
        "payment status",
        "remark",
      ];

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
        // find which headers are missing
        const errorRow = rows
          .find((_, i) => i < 10)
          .map((cell) => (cell || "").toString().trim().toLowerCase());
        const missing = requiredHeaders.filter(
          (hdr) => !errorRow.includes(hdr)
        );
        const errorMsg = `❌ Required headers missing: ${missing.join(", ")}`;
        showToast("error", errorMsg);
        return;
      }

      const rawHeaders = rows[headerRowIndex];
      const headersMap = {};
      rawHeaders.forEach((headerText, colIndex) => {
        if (!headerText) return;
        const cleaned = headerText.toString().trim().toLowerCase();
        if (requiredHeaders.includes(cleaned)) {
          headersMap[colIndex] = cleaned;
        }
      });

      const dataRows = rows.slice(headerRowIndex + 1);

      if (dataRows.length === 0) {
        showToast("warning", "No data rows in file");
        return;
      }

      const mappedData = dataRows
        .map((row, rowIndex) => {
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
            profitLoss: item["prof/los"], // watch spelling carefully
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
  
  const fetchSaleSummaries = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sale/summaries`);
      if (!res.ok) {
        throw new Error("Failed to fetch sale summaries");
      }
      const data = await res.json();
      setSales(data);
    } catch (error) {
      console.error("Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    }
  };

  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  return (
    <div className="p-6">
      {/* Top Buttons + Search */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex gap-3 items-center">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md"
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

        <input
          type="text"
          placeholder="Search invoice, customer, status..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="border border-gray-300 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-2 focus:ring-indigo-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["All Sales", "Paid", "Unpaid"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setSelectedTab(tab);
              setCurrentPage(1);
              setSelected([]);
            }}
            className={`px-4 py-2 rounded-lg ${
              selectedTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow">
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
              <th className="p-3 text-left">Invoice No</th>
              <th className="p-3 text-left">Sales Date</th>
              <th className="p-3 text-left">Customer Name</th>
              <th className="p-3 text-left">Sales Status</th>
              <th className="p-3 text-left">Total Amount</th>
              <th className="p-3 text-left">Paid Amount</th>
              <th className="p-3 text-left">Due Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-center">Actions</th>
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
              currentSales.map((sale) => {
                const dueAmount = sale.totalAmount - sale.paidAmount;
                return (
                  <tr key={sale.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(sale.id)}
                        onChange={() => toggleSelect(sale.id)}
                      />
                    </td>
                    <td className="p-3">{sale.invoiceNo}</td>
                    <td className="p-3">{sale.salesDate}</td>
                    <td className="p-3">{sale.customerName}</td>
                    <td className="p-3">{sale.salesStatus}</td>
                    <td className="p-3">₹{sale.totalAmount}</td>
                    <td className="p-3">₹{sale.paidAmount}</td>
                    <td className="p-3">₹{dueAmount}</td>
                    <td className="p-3">{sale.paymentStatus}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() => alert(`Edit sale ${sale.invoiceNo}`)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
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

        {/* Pagination */}
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded ${
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
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sales;
