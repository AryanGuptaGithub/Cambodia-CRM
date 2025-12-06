import React, { useState, useEffect, useRef } from "react";
import { Search, Download, X } from "lucide-react";
import { formatDateToReadable } from "../../utils/dateUtil";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const productsPerPage = 7;

const ReportsInHand = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const inputRef = useRef(null);

  // Fetch data from API
  const fetchReportsInHand = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${backendUrl}/api/reports-in-hand`);
      if (!response.ok) {
        throw new Error("Failed to fetch data");
      }

      const data = await response.json();

      if (data.success) {
        const transformedProducts = data.reports.map((product, index) => {
          const latestBatch =
            product.batches && product.batches.length > 0
              ? product.batches[product.batches.length - 1]
              : null;

          return {
            id: product._id || index + 1,
            name: product.productName,
            currentStock: product.totalBoxes || 0, // Use totalBoxes from API
            boxes: product.totalBoxes || 0, // Use totalBoxes from API
            piecesPerBox: 0, // Not available in API
            minStock: product.minStockLevel || 10,
            status: product.status || "Out of Stock",
            pricePerPiece: latestBatch?.lc || 0, // Use LC from latest batch
            lc: latestBatch?.lc || 0, // Use LC from latest batch
            fob: latestBatch?.fob || 0, // Use FOB from latest batch
            cif: latestBatch?.cif || 0, // Use CIF from latest batch
            totalPrice: product.totalAmount || 0, // Use totalAmount from API
            supplierName: product.supplierName,
            lastUpdated: new Date(product.updatedAt || product.createdAt)
              .toISOString()
              .split("T")[0],
          };
        });

        setProducts(transformedProducts);
      } else {
        throw new Error(data.message || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching reports:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsInHand();
  }, []);

  // Refresh data
  const handleRefresh = () => {
    fetchReportsInHand();
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.supplierName &&
        product.supplierName
          .toLowerCase()
          .includes(searchTerm.toLowerCase())) ||
      (product.category &&
        product.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      product.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage
  );

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage, "...", totalPages];
  }

  const getStatusBadge = (status) => {
    const statusStyles = {
      "In Stock": "bg-green-100 text-green-600 px-3 py-1 rounded-full text-sm",
      "Low Stock":
        "bg-yellow-100 text-yellow-600 px-3 py-1 rounded-full text-sm",
      Critical: "bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm",
      "Out of Stock":
        "bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm",
    };

    return (
      <span
        className={
          statusStyles[status] ||
          "bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm"
        }
      >
        {status}
      </span>
    );
  };

  // Calculate summary statistics
  const inStockCount = products.filter((p) => p.status === "In Stock").length;
  const lowStockCount = products.filter((p) => p.status === "Low Stock").length;
  const criticalCount = products.filter((p) => p.status === "Critical").length;
  const outOfStockCount = products.filter(
    (p) => p.status === "Out of Stock"
  ).length;

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-lg">Loading product data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error loading data
              </h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              <button
                onClick={handleRefresh}
                className="mt-2 bg-red-100 text-red-700 px-3 py-1 rounded text-sm hover:bg-red-200 cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const exportToExcel = () => {
    try {
      // Convert your data
      const excelData = products.map((item, index) => ({
        "Sr No.": index + 1,
        Product: item.name,
        Supplier: item.supplierName,
        Boxes: item.boxes,
        "Min Stock": item.minStock,
        Status: item.status,
        "LC Price ($)": item.lc?.toFixed(2) || "0.00",
        "FOB Price ($)": item.fob?.toFixed(2) || "0.00",
        "Total Amount ($)": item.totalPrice?.toFixed(2) || "0.00",
        "Last Updated": item.lastUpdated,
      }));

      // Create sheet & book
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Report");

      // Column widths
      const colWidths = [
        { wch: 7 }, // Sr No
        { wch: 20 }, // Product
        { wch: 20 }, // Supplier
        { wch: 10 }, // Boxes
        { wch: 10 }, // Min Stock
        { wch: 12 }, // Status
        { wch: 15 }, // LC Price ($)
        { wch: 12 }, // FOB Price ($)
        { wch: 14 }, // Total Amount ($)
        { wch: 15 }, // Last Updated
      ];
      worksheet["!cols"] = colWidths;

      // Center header cells (row 1)
      const headerRange = XLSX.utils.decode_range(worksheet["!ref"]);
      for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        const cell = worksheet[cellAddress];
        if (cell) {
          cell.s = {
            alignment: { horizontal: "center", vertical: "center" },
            font: { bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "D9E1F2" } }, // light gray-blue background
          };
        }
      }

      // Center all other cells
      for (let R = 1; R <= headerRange.e.r; R++) {
        for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          if (cell) {
            cell.s = {
              alignment: { horizontal: "center", vertical: "center" },
            };
          }
        }
      }

      // Export file
      const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
        cellStyles: true, // ✅ important for styles
      });

      const fileData = new Blob([excelBuffer], {
        type: "application/octet-stream",
      });

      saveAs(
        fileData,
        `Stock_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      console.error("❌ Error exporting Excel:", error);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        {/* 🔹 Left Section — Title */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Stock In Hands Reports
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by product or supplier..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg 
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 
                   focus:border-transparent w-64"
            />

            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
              size={18}
              onClick={() => inputRef.current?.focus()}
            />

            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 
                     text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Export Button */}
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 
                 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-lg">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">In Stock</p>
              <p className="text-2xl font-bold text-gray-900">{inStockCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <svg
                className="w-6 h-6 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Low Stock</p>
              <p className="text-2xl font-bold text-gray-900">
                {lowStockCount}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="bg-red-100 p-3 rounded-lg">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Critical</p>
              <p className="text-2xl font-bold text-gray-900">
                {criticalCount}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="bg-gray-100 p-3 rounded-lg">
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m8-8V4a1 1 0 00-1-1h-2a1 1 0 00-1 1v1M9 7h6"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Out of Stock</p>
              <p className="text-2xl font-bold text-gray-900">
                {outOfStockCount}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-lg">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m8-8V4a1 1 0 00-1-1h-2a1 1 0 00-1 1v1M9 7h6"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Total Products
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {products.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium w-16">Sr No.</th>
              <th className="p-3 text-sm font-medium">Date</th>
              <th className="p-3 text-sm font-medium">Product</th>
              <th className="p-3 text-sm font-medium">Supplier</th>
              <th className="p-3 text-sm font-medium">Boxes</th>
              <th className="p-3 text-sm font-medium">Min Stock</th>
              <th className="p-3 text-sm font-medium">Status</th>
              <th className="p-3 text-sm font-medium">LC Price ($)</th>
              <th className="p-3 text-sm font-medium">FOB Price ($)</th>
              <th className="p-3 text-sm font-medium">Total Amount ($)</th>
            </tr>
          </thead>

          <tbody>
            {currentProducts.length > 0 ? (
              currentProducts.map((product, index) => (
                <tr
                  key={product.id}
                  className={`hover:bg-gray-50 ${
                    (index + 1) % productsPerPage === 0 ||
                    index + 1 === currentProducts.length
                      ? ""
                      : "border-b"
                  }`}
                >
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900">
                      {(currentPage - 1) * productsPerPage + index + 1}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-gray-500">
                    {formatDateToReadable(product.lastUpdated)}
                  </td>
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900 capitalize">
                      {product.name}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900 capitalize">
                      {product.supplierName}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900">
                      {product.boxes}
                    </div>
                  </td>

                  <td className="p-3">
                    <div className="text-sm text-gray-900">
                      {product.minStock}
                    </div>
                  </td>
                  <td className="p-3">{getStatusBadge(product.status)}</td>
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900">
                      {product.lc.toFixed(2)}
                    </div>
                  </td>

                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900">
                      {product.fob.toFixed(2)}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900">
                      {product.totalPrice.toFixed(2)}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="p-3 text-center">
                  No products found in inventory
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {currentProducts.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>
            {visiblePages.map((page, idx) =>
              page === "..." ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-3 py-1 text-gray-500 select-none cursor-pointer"
                >
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
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
                setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsInHand;
