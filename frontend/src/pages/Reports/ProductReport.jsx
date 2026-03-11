import React, { useState, useEffect, useRef } from "react";
import {
  Package,
  TrendingUp,
  BarChart3,
  Search,
  X,
  Calendar,
  FileSpreadsheet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const productsPerPage = 7;

const ProductReport = () => {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all" | "month" | "year"
  const [isExporting, setIsExporting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const inputRef = useRef(null);

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ period: activeTab });
      if (activeTab === "month") {
        params.append("month", currentMonth);
        params.append("year", currentYear);
      }
      if (activeTab === "year") {
        params.append("year", currentYear);
      }
      if (searchTerm) params.append("searchTerm", searchTerm);
      if (categoryFilter) params.append("category", categoryFilter);

      const response = await fetch(
        `${backendUrl}/api/reports/product-report/report?${params.toString()}`,
      );
      if (!response.ok) throw new Error("Failed to fetch product report");
      const data = await response.json();

      if (data.success) {
        const processed = data.products.map((product) => ({
          ...product,
          currentStock: parseFloat(product.currentStock?.toFixed(2) || 0),
          salesData: product.salesData || [],
          filteredSales: product.filteredSales || [],
          profitMarginValue:
            parseFloat(product.profitMargin?.replace("%", "")) || 0,
          enabled: product.enabled !== undefined ? product.enabled : true,
          createdAt: product.createdAt || new Date().toISOString(),
        }));

        setProducts(processed);
        setFilteredProducts(processed);
        const uniqueCategories = [
          ...new Set(processed.map((p) => p.category).filter(Boolean)),
        ];
        setCategories(uniqueCategories);
      } else {
        throw new Error(data.error || "Failed to fetch product report");
      }
    } catch (err) {
      console.error("Fetch products error:", err);
      setError(err.message || "Something went wrong");
      showToast("error", err.message || "Failed to load product report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!loading) fetchProducts();
  }, [activeTab, categoryFilter]);

  // Local search filter
  useEffect(() => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      setFilteredProducts(
        products.filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.category?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.supplierName?.toLowerCase().includes(q),
        ),
      );
      setCurrentPage(1);
    } else {
      setFilteredProducts(products);
    }
  }, [searchTerm, products]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const calculateStats = () => {
    let totalSales = 0,
      totalStock = 0,
      totalProfit = 0,
      totalProfitMarginValue = 0;
    filteredProducts.forEach((p) => {
      totalSales += p.periodSales || 0;
      totalStock += p.currentStock || 0;
      totalProfit += p.profitAmount || 0;
      totalProfitMarginValue += p.profitMarginValue || 0;
    });
    return {
      totalProducts: filteredProducts.length,
      totalSales,
      totalProfit,
      avgProfitMargin:
        filteredProducts.length > 0
          ? totalProfitMarginValue / filteredProducts.length
          : 0,
      totalStock,
    };
  };
  const stats = calculateStats();

  // ── Pagination ───────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage,
  );

  function getVisiblePages(cp, tp) {
    if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1);
    if (cp <= 3) return [1, 2, 3, "...", tp];
    if (cp >= tp - 2) return [1, "...", tp - 2, tp - 1, tp];
    return [1, "...", cp, "...", tp];
  }

  // ── Selection ────────────────────────────────────────────────────────────
  const toggleSelect = (product) => {
    setSelected((prev) =>
      prev.some((p) => p.id === product._id)
        ? prev.filter((p) => p.id !== product._id)
        : [...prev, { id: product._id, name: product.name }],
    );
  };

  const toggleSelectAll = (checked) => {
    setSelected(
      checked ? currentProducts.map((p) => ({ id: p._id, name: p.name })) : [],
    );
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> products`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/products`, {
          data: { ids: selected },
        });
        if (res.status === 200) {
          showToast("success", "Selected products deleted successfully");
          fetchProducts();
          setSelected([]);
        }
      } catch {
        showToast("error", "Failed to delete selected products.");
      }
    } else {
      setSelected([]);
    }
  };

  // ── View modal ───────────────────────────────────────────────────────────
  const handleView = (product) => {
    setSelectedProduct(product);
    setIsViewModalOpen(true);
  };

  // ── Excel export ─────────────────────────────────────────────────────────
  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      const data = [];

      const headers = [
        "Product Name",
        "Category",
        "Current Stock",
        // "Avg Price" = sum(netSellingAmount) / sum(salesQty + bonusQty)
        "Avg Price ($)",
        activeTab === "month"
          ? `Sales (Month ${currentMonth})`
          : activeTab === "year"
            ? `Sales (Year ${currentYear})`
            : "Sales (All Data)",
        "Profit Margin",
      ];
      data.push(headers);

      filteredProducts.forEach((product) => {
        data.push([
          product.name || "",
          product.category || "",
          product.currentStock?.toFixed(2) || "0.00",
          // price field now = weighted average price from backend
          `$${product.price?.toFixed(4) || "0.0000"}`,
          `$${product.periodSales?.toFixed(2) || "0.00"}`,
          product.profitMargin || "0%",
        ]);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      worksheet["!cols"] = [
        { wch: 30 },
        { wch: 20 },
        { wch: 15 },
        { wch: 18 },
        { wch: 22 },
        { wch: 15 },
      ];
      const range = XLSX.utils.decode_range(worksheet["!ref"]);
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (worksheet[addr]) {
          worksheet[addr].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "F0F0F0" } },
            alignment: { horizontal: "center" },
          };
        }
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, "Product Report");

      let fileName = "product-report";
      if (activeTab === "month")
        fileName = `product-report-month-${currentMonth}-${currentYear}`;
      else if (activeTab === "year")
        fileName = `product-report-year-${currentYear}`;
      else fileName = "product-report-all-data";
      fileName += ".xlsx";

      XLSX.writeFile(workbook, fileName);
      showToast("success", "Excel file downloaded successfully!");
    } catch (err) {
      console.error("Export error:", err);
      showToast("error", "Failed to export to Excel. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getActiveTabText = () => {
    if (activeTab === "month")
      return `Current Month (${currentMonth}/${currentYear})`;
    if (activeTab === "year") return `Current Year (${currentYear})`;
    return "All Data";
  };

  const getSalesColumnHeader = () => {
    if (activeTab === "month") return `Sales (Month ${currentMonth})`;
    if (activeTab === "year") return `Sales (Year ${currentYear})`;
    return "Sales (All Data)";
  };

  // ── Loading / Error states ───────────────────────────────────────────────
  if (loading)
    return (
      <div className="p-6 flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading product report...</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
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
                Error loading product report
              </h3>
              <p className="mt-2 text-sm text-red-700">{error}</p>
              <button
                onClick={fetchProducts}
                className="mt-3 text-sm font-medium text-red-800 hover:text-red-900 cursor-pointer"
              >
                Try again →
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Product Reports</h1>
          <p className="text-gray-600 mt-1">{getActiveTabText()}</p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
          {/* Search */}
          <div className="relative w-full md:w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
            />
          </div>

          {/* Category filter */}
          <div className="w-full md:w-48">
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Export */}
          <button
            onClick={exportToExcel}
            disabled={isExporting || filteredProducts.length === 0}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer ${
              isExporting || filteredProducts.length === 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            <FileSpreadsheet size={18} />
            {isExporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: "all", label: "All Data", icon: Package },
            { id: "year", label: `Year ${currentYear}`, icon: Calendar },
            { id: "month", label: `Month ${currentMonth}`, icon: TrendingUp },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                setCurrentPage(1);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === id
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Products
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalProducts}
              </p>
              <p className="text-xs text-gray-500 mt-1">{getActiveTabText()}</p>
            </div>
            <Package className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                {activeTab === "month"
                  ? "Monthly Sales"
                  : activeTab === "year"
                    ? "Yearly Sales"
                    : "Total Sales"}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                $
                {stats.totalSales.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-500 mt-1">{getActiveTabText()}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Avg. Profit Margin
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.avgProfitMargin.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">{getActiveTabText()}</p>
            </div>
            <BarChart3 className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Stock</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalStock.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-500 mt-1">Current Inventory</p>
            </div>
            <Package className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200 bg-white">
        <table className="w-full border-collapse rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">
                <div className="flex items-center gap-4">
                  {currentProducts.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentProducts.length &&
                        currentProducts.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer"
                    />
                  )}
                  <span>Product Name</span>
                </div>
              </th>
              <th className="p-3 text-sm font-medium">Category</th>
              <th className="p-3 text-sm font-medium">Current Stock</th>
              {/* Price column now shows weighted average price */}
              <th className="p-3 text-sm font-medium">
                Avg Price
                <span className="block text-xs font-normal text-gray-400">
                  (Amount ÷ Qty+Bonus)
                </span>
              </th>
              <th className="p-3 text-sm font-medium">
                {getSalesColumnHeader()}
              </th>
              <th className="p-3 text-sm font-medium">Profit Margin</th>
            </tr>
          </thead>
          <tbody>
            {currentProducts.length > 0 ? (
              currentProducts.map((product, index) => {
                const profitMargin = product.profitMargin || "0%";
                const profitMarginValue =
                  parseFloat(profitMargin.replace("%", "")) || 0;

                return (
                  <tr
                    key={product._id}
                    className={`hover:bg-gray-50 cursor-pointer ${
                      index < currentProducts.length - 1 ? "border-b" : ""
                    }`}
                    onClick={() => handleView(product)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === product._id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(product);
                          }}
                          className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer"
                        />
                        <span className="capitalize font-medium">
                          {product.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 capitalize">{product.category}</td>
                    <td className="p-3 font-medium">
                      {product.currentStock?.toFixed(2) || "0.00"}
                    </td>
                    {/* ── Avg Price: sum(netSellingAmount) / sum(salesQty + bonusQty) ── */}
                    <td className="p-3 font-medium">
                      ${(product.price || 0).toFixed(4)}
                    </td>
                    <td className="p-3 font-medium">
                      $
                      {(product.periodSales || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                          profitMarginValue > 25
                            ? "bg-green-100 text-green-800"
                            : profitMarginValue > 15
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {profitMargin}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Package className="w-12 h-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No products found
                    </h3>
                    <p className="text-gray-500">
                      {searchTerm || categoryFilter
                        ? "Try adjusting your search or filter criteria"
                        : `No product records found for ${getActiveTabText().toLowerCase()}`}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {currentProducts.length > 0 && (
          <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 border-t">
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                ← Prev
              </button>

              <div className="flex gap-1">
                {visiblePages.map((page, idx) =>
                  page === "..." ? (
                    <span key={`e-${idx}`} className="px-3 py-2 text-gray-500">
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                        currentPage === page
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}
              </div>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(p + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Selected actions */}
      <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          {selected.length > 0 && (
            <>
              <button
                onClick={handleDeleteSelected}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors"
              >
                Delete Selected ({selected.length})
              </button>
              <button
                onClick={() => setSelected([])}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Clear Selection
              </button>
            </>
          )}
        </div>
      </div>

      {/* View Product Modal */}
      {isViewModalOpen &&
        selectedProduct &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative z-10 overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Product Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {[
                  {
                    label: "Product Name",
                    value: selectedProduct.name,
                    capitalize: true,
                  },
                  {
                    label: "Category",
                    value: selectedProduct.category,
                    capitalize: true,
                  },
                  { label: "SKU/Packing", value: selectedProduct.sku },
                  {
                    label: "Current Stock",
                    value: selectedProduct.currentStock?.toFixed(2) || "0.00",
                  },
                  {
                    label: "Avg Price (Amount ÷ Qty+Bonus)",
                    // weighted average price = periodSales / periodSoldQuantity
                    value: `$${(selectedProduct.price || 0).toFixed(4)}`,
                  },
                  {
                    label: "Catalogue Price",
                    value: `$${(selectedProduct.sellingPrice || 0).toFixed(2)}`,
                  },
                  {
                    label: "LC Price",
                    value: `$${selectedProduct.lcPrice?.toFixed(2) || "0.00"}`,
                  },
                  {
                    label: "FOB Price",
                    value: `$${selectedProduct.fobPrice?.toFixed(2) || "0.00"}`,
                  },
                  {
                    label: "Supplier",
                    value: selectedProduct.supplierName || "N/A",
                  },
                  {
                    label: "Sold This Month",
                    value: selectedProduct.soldThisMonth || 0,
                  },
                  {
                    label: "Sold Last Month",
                    value: selectedProduct.soldLastMonth || 0,
                  },
                  {
                    label: `Period Sales (${getActiveTabText()})`,
                    value: `$${(
                      selectedProduct.periodSales || 0
                    ).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`,
                  },
                  {
                    label: "Qty Sold (Period)",
                    value: selectedProduct.periodSoldQuantity || 0,
                  },
                  {
                    label: "Profit Margin",
                    value: selectedProduct.profitMargin || "0%",
                  },
                ].map(({ label, value, capitalize }) => (
                  <div key={label}>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      {label}
                    </label>
                    <p
                      className={`px-3 py-2 rounded-lg bg-gray-50 border ${capitalize ? "capitalize" : ""}`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
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
};

export default ProductReport;
