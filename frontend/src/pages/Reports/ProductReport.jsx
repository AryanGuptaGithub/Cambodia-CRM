import React, { useState, useEffect, useRef } from "react";
import {
  Package,
  TrendingUp,
  BarChart3,
  Download,
  Filter,
  Search,
  Eye,
  Edit,
  Trash2,
  Upload,
  X,
  Calendar,
  FileSpreadsheet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
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
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // "all", "month", "year"
  const inputRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [categories, setCategories] = useState([]);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Get current month and year
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      // Use the new product report API endpoint
      const params = new URLSearchParams();
      params.append('period', activeTab);
      
      if (activeTab === 'month') {
        params.append('month', currentMonth);
        params.append('year', currentYear);
      } else if (activeTab === 'year') {
        params.append('year', currentYear);
      }
      
      if (searchTerm) {
        params.append('searchTerm', searchTerm);
      }
      
      if (categoryFilter) {
        params.append('category', categoryFilter);
      }

      const response = await fetch(`${backendUrl}/api/product-report/report?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch product report");
      const data = await response.json();
      
      if (data.success) {
        // Process the products from the new API
        const processedProducts = data.products.map(product => ({
          ...product,
          // Format current stock to 2 decimal places
          currentStock: parseFloat(product.currentStock?.toFixed(2) || 0),
          // Ensure salesData exists for filtering
          salesData: product.salesData || [],
          filteredSales: product.filteredSales || [],
          // Parse profit margin value for calculations
          profitMarginValue: parseFloat(product.profitMargin?.replace('%', '')) || 0,
          // Add fallback values
          enabled: product.enabled !== undefined ? product.enabled : true,
          createdAt: product.createdAt || new Date().toISOString()
        }));
        
        setProducts(processedProducts);
        setFilteredProducts(processedProducts);
        
        // Extract unique categories
        const uniqueCategories = [...new Set(processedProducts.map(p => p.category).filter(Boolean))];
        setCategories(uniqueCategories);
      } else {
        throw new Error(data.error || "Failed to fetch product report");
      }
    } catch (err) {
      console.error('Fetch products error:', err);
      setError(err.message || "Something went wrong");
      showToast("error", err.message || "Failed to load product report");
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch products when filters change
  useEffect(() => {
    if (!loading) {
      fetchProducts();
    }
  }, [activeTab, categoryFilter]);

  // Apply local search filter
  useEffect(() => {
    if (searchTerm) {
      const filtered = products.filter(
        (product) =>
          product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
      setCurrentPage(1);
    } else {
      setFilteredProducts(products);
    }
  }, [searchTerm, products]);

  // Calculate statistics based on active tab
  const calculateStats = () => {
    let totalSales = 0;
    let totalStock = 0;
    let totalProducts = filteredProducts.length;
    let totalProfit = 0;
    let totalProfitMarginValue = 0;

    filteredProducts.forEach(product => {
      // Use periodSales for current tab
      totalSales += product.periodSales || 0;
      totalStock += product.currentStock || 0;
      totalProfit += product.profitAmount || 0;
      totalProfitMarginValue += product.profitMarginValue || 0;
    });

    const avgProfitMargin = totalProducts > 0 ? (totalProfitMarginValue / totalProducts) : 0;

    return {
      totalProducts,
      totalSales,
      totalProfit,
      avgProfitMargin,
      totalStock
    };
  };

  const stats = calculateStats();

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

  // Select/unselect a product by id
  const toggleSelect = (product) => {
    setSelected((prev) => {
      const exists = prev.some((p) => p.id === product._id);

      if (exists) {
        return prev.filter((p) => p.id !== product._id);
      } else {
        return [...prev, { id: product._id, name: product.name }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentProducts.map((p) => ({
        id: p._id,
        name: p.name,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
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
      } catch (error) {
        showToast("error", "Failed to delete selected products.");
      }
    } else {
      setSelected([]);
    }
  };

  // View product details
  const handleView = (product) => {
    setSelectedProduct(product);
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  // Edit product
  const editProduct = (product) => {
    setSelectedProduct(product);
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const deleteProduct = async (product) => {
    if (!product._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${product.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/products/${product._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Product <b>${product.name}</b> deleted successfully`
          );
          fetchProducts();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete product.");
      }
    }
  };

  // File upload and parsing logic for import
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

      // Process the data based on your product structure
      const mappedData = rows
        .slice(1)
        .map((row, index) => ({
          name: row[0] || "",
          category: row[1] || "",
          sku: row[2] || "",
          currentStock: row[3] || 0,
          price: row[4] || 0,
          cost: row[5] || 0,
          soldThisMonth: row[6] || 0,
          soldLastMonth: row[7] || 0,
          totalSales: row[8] || 0,
          profitMargin: row[9] || "0%",
        }))
        .filter((product) => product.name);

      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  // Import parsed products to backend
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/products/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Products imported successfully!"
        );
        setShowImportModal(false);
        fetchProducts();
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");
        showToast("error", cleanMessage || "Failed to import products.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Export to Excel function
  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      console.log("Exporting to Excel with params:", {
        period: activeTab,
        month: activeTab === "month" ? currentMonth : null,
        year: activeTab === "month" || activeTab === "year" ? currentYear : null,
        searchTerm: searchTerm || null,
        category: categoryFilter || null
      });

      // Call the new export endpoint
      const response = await axios.get(`${backendUrl}/api/product-report/export/excel`, {
        params: {
          period: activeTab,
          month: activeTab === "month" ? currentMonth : null,
          year: activeTab === "month" || activeTab === "year" ? currentYear : null,
          searchTerm: searchTerm || null,
          category: categoryFilter || null
        },
        responseType: 'blob'
      });

      // Create a download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from Content-Disposition header or use default
      let fileName = 'product-report';
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (fileNameMatch && fileNameMatch.length > 1) {
          fileName = fileNameMatch[1];
        }
      } else {
        // Fallback filename based on period
        if (activeTab === 'month') {
          fileName = `product-report-month-${currentMonth}-${currentYear}`;
        } else if (activeTab === 'year') {
          fileName = `product-report-year-${currentYear}`;
        }
        fileName += '.xlsx';
      }
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      showToast('success', 'Excel file downloaded successfully!');
    } catch (error) {
      console.error('Export error:', error);
      if (error.response) {
        console.error('Response error:', error.response.data);
      }
      showToast('error', error.response?.data?.message || 'Failed to export to Excel. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Alternative: Export to CSV (frontend only)
  const exportToCSV = () => {
    const periodSuffix = activeTab === "month" ? `-${currentMonth}-${currentYear}` : 
                        activeTab === "year" ? `-${currentYear}` : "";
    
    const headers = [
      "Product Name",
      "Category",
      "SKU/Packing",
      "Current Stock",
      "Selling Price",
      "LC Price",
      "FOB Price",
      activeTab === "month" ? `Sales (Month ${currentMonth})` : 
      activeTab === "year" ? `Sales (Year ${currentYear})` : "Total Sales",
      "Quantity Sold",
      "Profit Amount",
      "Profit Margin",
      "Supplier",
      "Status"
    ];
    
    const csvData = filteredProducts.map((product) => {
      return [
        product.name,
        product.category,
        product.sku,
        product.currentStock?.toFixed(2) || "0.00",
        product.price?.toFixed(2) || "0.00",
        product.lcPrice?.toFixed(2) || product.cost?.toFixed(2) || "0.00",
        product.fobPrice?.toFixed(2) || "0.00",
        product.periodSales?.toFixed(2) || "0.00",
        product.periodSoldQuantity || 0,
        product.profitAmount?.toFixed(2) || "0.00",
        product.profitMargin || "0%",
        product.supplierName,
        product.status
      ];
    });

    const csvContent = [
      headers.join(","),
      ...csvData.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `product-report${periodSuffix}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
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

  const handleStatusToggle = async (productId) => {
    try {
      const product = products.find((p) => p._id === productId);
      if (!product) return;

      const updatedProduct = { ...product, enabled: !product.enabled };
      const response = await fetch(`${backendUrl}/api/products/${productId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: updatedProduct.enabled }),
      });

      if (!response.ok) throw new Error("Failed to update product");

      const data = await response.json();
      setProducts((prev) =>
        prev.map((p) =>
          p._id === productId ? { ...p, enabled: data.enabled } : p
        )
      );
      setFilteredProducts((prev) =>
        prev.map((p) =>
          p._id === productId ? { ...p, enabled: data.enabled } : p
        )
      );
    } catch (err) {
      console.error("Error updating product:", err);
      showToast("error", "Failed to update product status");
    }
  };

  // Get display text for active tab
  const getActiveTabText = () => {
    switch (activeTab) {
      case "month":
        return `Current Month (${currentMonth}/${currentYear})`;
      case "year":
        return `Current Year (${currentYear})`;
      default:
        return "All Data";
    }
  };

  if (loading) return (
    <div className="p-6 flex justify-center items-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading product report...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading product report</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
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

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Product Reports</h1>
          <p className="text-gray-600 mt-1">{getActiveTabText()}</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
          <div className="relative w-full md:w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={handleIconClick}
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
          
          {/* Category Filter */}
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
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          
          {/* Export Excel Button */}
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
          ].map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <IconComponent size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
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
                {activeTab === "month" ? "Monthly Sales" : 
                 activeTab === "year" ? "Yearly Sales" : "Total Sales"}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                ${stats.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                {stats.totalStock.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">Current Inventory</p>
            </div>
            <Package className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

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
              <th className="p-3 text-sm font-medium">Price</th>
              <th className="p-3 text-sm font-medium">
                {activeTab === "month" ? `Sales (Month)` : 
                 activeTab === "year" ? `Sales (Year)` : "Total Sales"}
              </th>
              <th className="p-3 text-sm font-medium">Profit Margin</th>
              <th className="p-3 text-sm font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {currentProducts.length > 0 ? (
              currentProducts.map((product, index) => {
                const salesData = product.periodSales || 0;
                const profitMargin = product.profitMargin || "0%";
                const profitMarginValue = parseFloat(profitMargin.replace('%', '')) || 0;

                return (
                  <tr
                    key={product._id}
                    className={`hover:bg-gray-50 ${
                      index < currentProducts.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === product._id)}
                          onChange={() => toggleSelect(product)}
                          className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer"
                        />
                        <span className="capitalize font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="p-3 capitalize">{product.category}</td>
                    <td className="p-3 font-medium">
                      {product.currentStock?.toFixed(2) || "0.00"}
                    </td>
                    <td className="p-3 font-medium">
                      ${product.price?.toFixed(2) || "0.00"}
                    </td>
                    <td className="p-3 font-medium">
                      ${salesData.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    <td className="p-3">
                      <span
                        className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                          product.status === 'In Stock'
                            ? "bg-green-100 text-green-800"
                            : product.status === 'Low Stock'
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {product.status || "Unknown"}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="p-8 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Package className="w-12 h-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
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
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                ← Prev
              </button>
              
              <div className="flex gap-1">
                {visiblePages.map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-3 py-2 text-gray-500"
                    >
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
                  )
                )}
              </div>
              
              <button
                onClick={() => {
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                }}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                 Next →
              </button>
            </div>
          </div>
        )}
      </div>

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

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isUploading && setShowImportModal(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10">
              <button
                onClick={() => !isUploading && setShowImportModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Products
              </h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Excel or CSV File
                </label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  disabled={isUploading}
                />
                <p className="mt-2 text-xs text-gray-500">
                  Supported formats: .csv, .xlsx, .xls
                </p>
              </div>

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
                  onClick={handleImport}
                  disabled={isUploading || parsedData.length === 0}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    isUploading || parsedData.length === 0
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
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Product Name
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border capitalize">
                    {selectedProduct.name}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Category
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border capitalize">
                    {selectedProduct.category}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    SKU/Packing
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    {selectedProduct.sku}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Current Stock
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    {selectedProduct.currentStock?.toFixed(2) || "0.00"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Selling Price
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    ${selectedProduct.price?.toFixed(2) || "0.00"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    LC Price
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    ${selectedProduct.lcPrice?.toFixed(2) || selectedProduct.cost?.toFixed(2) || "0.00"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    FOB Price
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    ${selectedProduct.fobPrice?.toFixed(2) || "0.00"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Supplier
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    {selectedProduct.supplierName || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Sold This Month
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    {selectedProduct.soldThisMonth || 0}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Sold Last Month
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    {selectedProduct.soldLastMonth || 0}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Total Sales
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    ${selectedProduct.totalSales?.toLocaleString() || 0}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Period Sales ({getActiveTabText()})
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    ${selectedProduct.periodSales?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Profit Margin
                  </label>
                  <p className="px-3 py-2 rounded-lg bg-gray-50 border">
                    {selectedProduct.profitMargin || "0%"}
                  </p>
                </div>
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
          document.body
        )}
    </div>
  );
};

export default ProductReport;