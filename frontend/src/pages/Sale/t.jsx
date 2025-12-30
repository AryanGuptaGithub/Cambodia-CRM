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
      
      // Add date filtering logic
      const productsWithDates = data.products?.map(product => ({
        ...product,
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

  // Export to Excel function
  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      // Call backend API to export filtered data based on active tab
      const response = await axios.get(`${backendUrl}/api/products/export/excel`, {
        params: {
          period: activeTab, // "all", "month", or "year"
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
      
      // Set filename based on active tab
      let fileName = 'products-report';
      if (activeTab === 'month') {
        fileName = `products-month-${currentMonth}-${currentYear}`;
      } else if (activeTab === 'year') {
        fileName = `products-year-${currentYear}`;
      }
      fileName += '.xlsx';
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      showToast('success', 'Excel file downloaded successfully!');
    } catch (error) {
      console.error('Export error:', error);
      showToast('error', 'Failed to export to Excel. Please try again.');
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
      "SKU",
      "Current Stock",
      "Price",
      "Cost",
      activeTab === "month" ? `Sold (Month ${currentMonth})` : 
      activeTab === "year" ? `Sold (Year ${currentYear})` : "Total Sales",
      "Profit Margin",
      "Status"
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
        product.enabled ? "Enabled" : "Disabled"
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
        
        <div className="flex items-center gap-4">
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
          
          {/* Export Excel Button */}
          <button
            onClick={exportToExcel}
            disabled={isExporting || filteredProducts.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer ${
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

      {/* Rest of your component remains the same... */}
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

      {/* Rest of your component... */}
      
    </div>
  );
};

export default ProductReport;