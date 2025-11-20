import React, { useState, useEffect, useRef } from "react";
import { Search, Download, X } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { formatDateToReadable } from "../../utils/dateUtil";
import BatchDetailsModal from "../Dashboard/BatchDetailsModal";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const productsPerPage = 7;

const ReportsInHand = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const inputRef = useRef(null);

  const fetchReportsInHand = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${backendUrl}/api/reports-in-hand`);
      if (!response.ok) throw new Error("Failed to fetch data");
      const data = await response.json();

      if (!data.success) throw new Error(data.message || "Failed to fetch data");

      const transformedProducts = data.reports.map((product, index) => {
        const totalPieces = product.batches?.reduce((sum, b) => sum + (b.amount || 0), 0) || 0;
        const totalBoxes = product.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) || 0;
        const totalFOB = product.batches?.reduce((sum, b) => sum + (b.fob || 0) * (b.amount || 0), 0);

        return {
          id: product._id || index + 1,
          name: product.productName,
          category: product.category || "Uncategorized",
          currentStock: totalPieces,
          boxes: totalBoxes,
          minStock: product.minStockLevel || 10,
          status: product.status || "In Stock",
          batches: product.batches || [],
          lc: product.batches?.[0]?.lc || 0,
          fob: product.batches?.[0]?.fob || 0,
          totalPrice: totalFOB,
          supplierName: product.supplierName,
          lastUpdated: product.updatedAt || product.createdAt,
        };
      });

      setProducts(transformedProducts);
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

  const handleClearSearch = () => setSearchTerm("");
  const handleRefresh = () => fetchReportsInHand();

  // Open batch modal
  const handleViewBatches = (product) => {
    setSelectedProduct(product);
    setShowBatchModal(true);
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const currentProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage
  );

  const getVisiblePages = (currentPage, totalPages) => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
    if (currentPage >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", currentPage, "...", totalPages];
  };

  const getStatusBadge = (status) => {
    const styles = {
      "In Stock": "bg-green-100 text-green-600 px-3 py-1 rounded-full text-sm",
      "Low Stock": "bg-yellow-100 text-yellow-600 px-3 py-1 rounded-full text-sm",
      Critical: "bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm",
      "Out of Stock": "bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm",
    };
    return <span className={styles[status] || styles["Out of Stock"]}>{status}</span>;
  };

  const exportToExcel = () => {
    try {
      const excelData = products.map((item, index) => ({
        "Sr No.": index + 1,
        Product: item.name,
        Supplier: item.supplierName,
        Boxes: item.boxes,
        "Min Stock": item.minStock,
        Status: item.status,
        "Price/Piece ($)": item.lc.toFixed(2),
        "FOB Price ($)": item.fob.toFixed(2),
        "Total Price ($)": item.totalPrice.toFixed(2),
        "Last Updated": formatDateToReadable(item.lastUpdated),
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Report");
      saveAs(
        new Blob([XLSX.write(workbook, { bookType: "xlsx", type: "array" })], {
          type: "application/octet-stream",
        }),
        `Stock_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      console.error("Error exporting Excel:", error);
    }
  };

  if (loading) return <div className="p-6 text-center">Loading product data...</div>;
  if (error)
    return (
      <div className="p-6 text-center text-red-600">
        Error: {error} <button onClick={handleRefresh}>Retry</button>
      </div>
    );

  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <div className="p-6">
      {/* Search & Export */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Stock In Hands Reports</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by product..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={18}
              onClick={() => inputRef.current?.focus()}
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white text-center shadow">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">Sr No.</th>
              <th className="p-3">Date</th>
              <th className="p-3">Product</th>
              <th className="p-3">Boxes</th>
              <th className="p-3">Min Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3">Price/Piece ($)</th>
              <th className="p-3">FOB Price ($)</th>
              <th className="p-3">Total Price ($)</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentProducts.length === 0 && (
              <tr>
                <td colSpan={10} className="p-3">
                  No products found.
                </td>
              </tr>
            )}
            {currentProducts.map((product, idx) => (
              <tr key={product.id} className="hover:bg-gray-50 border-t">
                <td className="p-3">{(currentPage - 1) * productsPerPage + idx + 1}</td>
                <td className="p-3">{formatDateToReadable(product.lastUpdated)}</td>
                <td className="p-3">{product.name}</td>
                <td className="p-3">{product.boxes}</td>
                <td className="p-3">{product.minStock}</td>
                <td className="p-3">{getStatusBadge(product.status)}</td>
                <td className="p-3">{product.lc.toFixed(2)}</td>
                <td className="p-3">{product.fob.toFixed(2)}</td>
                <td className="p-3">{product.totalPrice.toFixed(2)}</td>
                <td className="p-3">
                  <button
                    className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    onClick={() => handleViewBatches(product)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {currentProducts.length > 0 && (
          <div className="mt-4 flex gap-2 ms-5 p-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Prev
            </button>
            {visiblePages.map((p, i) =>
              p === "..." ? (
                <span key={i} className="px-3 py-1 text-gray-500 select-none">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`px-3 py-1 rounded w-10 ${
                    currentPage === p ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Batch Modal */}
      {selectedProduct && (
        <BatchDetailsModal
          showModal={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          productName={selectedProduct.name}
          batches={selectedProduct.batches}
        />
      )}
    </div>
  );
};

export default ReportsInHand;
