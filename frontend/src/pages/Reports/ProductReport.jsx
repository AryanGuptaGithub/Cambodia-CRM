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

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Get current month and year
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/products`);
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      
      // Add date filtering logic - assuming products have a createdAt or date field
      const productsWithDates = data.products?.map(product => ({
        ...product,
        // If your products don't have dates, you can add mock dates for demonstration
        createdAt: product.createdAt || new Date().toISOString(),
        // Add sales data with dates for filtering
        salesData: product.salesData || [
          { date: new Date().toISOString(), quantity: product.soldThisMonth || 0 },
          { date: new Date(currentYear, currentMonth - 2).toISOString(), quantity: product.soldLastMonth || 0 }
        ]
      })) || [];
      
      setProducts(productsWithDates);
      setFilteredProducts(productsWithDates);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    filterProducts();
  }, [searchTerm, categoryFilter, activeTab, products]);

  // Filter products based on search, category, and time period
  const filterProducts = () => {
    let filtered = [...products];

    // Apply time period filter
    if (activeTab === "month") {
      filtered = filtered.map(product => ({
        ...product,
        // Filter sales for current month
        filteredSales: product.salesData?.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getMonth() + 1 === currentMonth && 
                 saleDate.getFullYear() === currentYear;
        }) || []
      })).filter(product => product.filteredSales.length > 0);
    } else if (activeTab === "year") {
      filtered = filtered.map(product => ({
        ...product,
        // Filter sales for current year
        filteredSales: product.salesData?.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getFullYear() === currentYear;
        }) || []
      })).filter(product => product.filteredSales.length > 0);
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (product) =>
          product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter
    if (categoryFilter) {
      filtered = filtered.filter(
        (product) => product.category === categoryFilter
      );
    }

    setFilteredProducts(filtered);
  };

  const categories = [...new Set(products.map((product) => product.category))];

  // Calculate statistics based on active tab
  const calculateStats = () => {
    let totalSales = 0;
    let totalStock = 0;
    let totalProducts = filteredProducts.length;
    let totalProfitMargin = 0;

    filteredProducts.forEach(product => {
      if (activeTab === "month") {
        const monthlySales = product.filteredSales?.reduce((sum, sale) => sum + (sale.quantity * product.price), 0) || 0;
        totalSales += monthlySales;
      } else if (activeTab === "year") {
        const yearlySales = product.filteredSales?.reduce((sum, sale) => sum + (sale.quantity * product.price), 0) || 0;
        totalSales += yearlySales;
      } else {
        totalSales += product.totalSales || 0;
      }
      
      totalStock += product.currentStock || 0;
      totalProfitMargin += parseFloat(product.profitMargin) || 0;
    });

    const avgProfitMargin = totalProducts > 0 ? (totalProfitMargin / totalProducts) : 0;

    return {
      totalProducts,
      totalSales,
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

  const exportToCSV = () => {
    const periodSuffix = activeTab === "month" ? `-${currentMonth}-${currentYear}` : 
                        activeTab === "year" ? `-${currentYear}` : "";
    
    const headers = [
      "Product Name",
      "Category",
      "SKU",
      "Current Stock",
      "Price",
      "Cost",
      activeTab === "month" ? `Sold (Month ${currentMonth})` : 
      activeTab === "year" ? `Sold (Year ${currentYear})` : "Total Sales",
      "Profit Margin",
    ];
    
    const csvData = filteredProducts.map((product) => {
      let salesData;
      if (activeTab === "month") {
        salesData = product.filteredSales?.reduce((sum, sale) => sum + sale.quantity, 0) || 0;
      } else if (activeTab === "year") {
        salesData = product.filteredSales?.reduce((sum, sale) => sum + sale.quantity, 0) || 0;
      } else {
        salesData = product.totalSales || 0;
      }

      return [
        product.name,
        product.category,
        product.sku,
        product.currentStock,
        product.price,
        product.cost,
        salesData,
        product.profitMargin || "0%",
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

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Product Reports</h1>
          <p className="text-gray-600 mt-1">{getActiveTabText()}</p>
        </div>
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
            className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: "all", label: "All Data", icon: Package },
            { id: "year", label: `Year ${currentYear}`, icon: Calendar },
            { id: "month", label: `Month ${currentMonth}`, icon: TrendingUp },
          ].map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
                ${stats.totalSales.toLocaleString()}
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
                {stats.totalStock}
              </p>
              <p className="text-xs text-gray-500 mt-1">Current Inventory</p>
            </div>
            <Package className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/productmanagerlayout/addproduct")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Package size={18} /> Add New Product
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import CSV
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} /> Export CSV
          </button>

          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => handleDeleteSelected()}
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
        
        <div className="flex gap-4">
          <div className="relative">
            <Filter className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
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
                    />
                  )}
                  <span>Product Name</span>
                </div>
              </th>
              <th className="p-3 text-sm font-medium">Category</th>
              <th className="p-3 text-sm font-medium">SKU</th>
              <th className="p-3 text-sm font-medium">Current Stock</th>
              <th className="p-3 text-sm font-medium">Price</th>
              <th className="p-3 text-sm font-medium">
                {activeTab === "month" ? `Sales (Month)` : 
                 activeTab === "year" ? `Sales (Year)` : "Total Sales"}
              </th>
              <th className="p-3 text-sm font-medium">Profit Margin</th>
              <th className="p-3 text-sm font-medium">Status</th>
              <th className="p-3 text-sm font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentProducts.length > 0 ? (
              currentProducts.map((product, index) => {
                let salesData;
                if (activeTab === "month") {
                  salesData = product.filteredSales?.reduce((sum, sale) => sum + (sale.quantity * product.price), 0) || 0;
                } else if (activeTab === "year") {
                  salesData = product.filteredSales?.reduce((sum, sale) => sum + (sale.quantity * product.price), 0) || 0;
                } else {
                  salesData = product.totalSales || 0;
                }

                return (
                  <tr
                    key={product._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % productsPerPage === 0 ||
                      index + 1 === currentProducts.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === product._id)}
                          onChange={() => toggleSelect(product)}
                        />
                        <span className="capitalize">{product.name}</span>
                      </div>
                    </td>
                    <td className="p-3 capitalize">{product.category}</td>
                    <td className="p-3">{product.sku}</td>
                    <td className="p-3">{product.currentStock}</td>
                    <td className="p-3">${product.price}</td>
                    <td className="p-3">
                      ${salesData.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          (parseFloat(product.profitMargin) || 0) > 25
                            ? "bg-green-100 text-green-800"
                            : (parseFloat(product.profitMargin) || 0) > 15
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {product.profitMargin || "0%"}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleStatusToggle(product._id)}
                        className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                          product.enabled
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {product.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                        <Eye onClick={() => handleView(product)} size={18} />
                      </button>
                      <button className="text-green-600 hover:text-green-800 cursor-pointer">
                        <Edit onClick={() => editProduct(product)} size={18} />
                      </button>
                      <button
                        onClick={() => deleteProduct(product)}
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} className="p-3 text-center">
                  No product records found for {getActiveTabText().toLowerCase()}
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

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowImportModal(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setShowImportModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Products
              </h2>

              <div className="mb-6">
                <label className="block text-gray-700 mb-2">File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                />
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

      {/* View Product Modal */}
      {isViewModalOpen &&
        selectedProduct &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Product
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {selectedProduct.name}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Category
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {selectedProduct.category}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    SKU
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {selectedProduct.sku}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Current Stock
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {selectedProduct.currentStock}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Price
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    ${selectedProduct.price}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Cost
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    ${selectedProduct.cost}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Sold This Month
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {selectedProduct.soldThisMonth}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Sold Last Month
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {selectedProduct.soldLastMonth}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Sales
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    ${selectedProduct.totalSales?.toLocaleString() || 0}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Profit Margin
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {selectedProduct.profitMargin || "0%"}
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
          document.body
        )}
    </div>
  );
};

export default ProductReport;