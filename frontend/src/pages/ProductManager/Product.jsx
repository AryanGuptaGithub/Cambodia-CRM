import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { UserPlus, Upload, Trash2, Eye, X, Edit, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SampleExcelDownloadProduct from "../../excels/SampleExcelDownloadProduct";
import { handleAxiosError } from "../../utils/errorHandler";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import ReactDOM from "react-dom";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import {
  fetchProductTypes,
  fetchSuppliers,
  fetchProductPackingType,
} from "./common/fetchDropdown";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import { parseExcelDate } from "../../utils/excelUtility";
import LoadingOverlay from "../../components/Loading";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const Product = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [productTypes, setProductTypes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [packingOptions, setPackingOptions] = useState([]);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const productsPerPage = 9;

  const initialFormState = {
    productName: "",
    type: "",
    packing: "",
    qtyPerBoxStrip: "",
    supplierName: "",
    drugLicense: "",
    licenseValidityDate: "",
    remarks: "",
    _id: null,
  };

  const [form, setForm] = useState(initialFormState);

  // Fetch dropdown data
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [typesResult, suppliersResult, packingResult] = await Promise.all(
          [fetchProductTypes(), fetchSuppliers(), fetchProductPackingType()]
        );

        if (typesResult.success) {
          const transformedTypes = typesResult.data.map((item) => ({
            value: typeof item === "string" ? item : item.name || item.value,
            label: typeof item === "string" ? item : item.name || item.value,
          }));
          setProductTypes(transformedTypes);
        }

        if (suppliersResult.success) {
          const transformedSuppliers = suppliersResult.data.map((item) => ({
            value: typeof item === "string" ? item : item.name || item.value,
            label: typeof item === "string" ? item : item.name || item.value,
          }));
          setSuppliers(transformedSuppliers);
        }

        if (packingResult.success) {
          const transformedPacking = packingResult.data.map((item) => ({
            value: typeof item === "string" ? item : item.name || item.value,
            label: typeof item === "string" ? item : item.name || item.value,
          }));
          setPackingOptions(transformedPacking);
        }
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };

    fetchDropdownData();
  }, []);

  // Fetch products
  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${backendUrl}/api/products`);
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      const uniqueTypes = Array.from(
        new Set(data.map((item) => item.type?.toLowerCase()).filter(Boolean))
      );
      setTypes(["All", ...uniqueTypes]);
      setProducts(data);
      setSelected([]);
    } catch (err) {
      setError(err.message || "Something went wrong");
      showToast("error", err.message || "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Filter products by tab and search term
  const filteredProducts = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    return products.filter((product) => {
      const matchesType =
        selectedTab.toLowerCase() === "all" ||
        product.type?.toLowerCase() === selectedTab.toLowerCase();

      const nameMatch = product.productName
        ?.toLowerCase()
        .includes(lowerSearch);
      const supplierMatch = product.supplierName
        ?.toLowerCase()
        .includes(lowerSearch);
      const licenseMatch = product.drugLicense
        ?.toLowerCase()
        .includes(lowerSearch);
      const typeMatch = product.type?.toLowerCase().includes(lowerSearch);

      const licenseDateFormatted = product.licenseValidityDate
        ? formatDateToReadable(
            new Date(product.licenseValidityDate),
            "dd/MM/yyyy"
          ).toLowerCase()
        : "";

      const licenseDateMatch = licenseDateFormatted.includes(lowerSearch);

      return (
        matchesType &&
        (nameMatch ||
          supplierMatch ||
          licenseMatch ||
          licenseDateMatch ||
          typeMatch)
      );
    });
  }, [products, searchTerm, selectedTab]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage
  );

  const toggleSelect = useCallback((product) => {
    setSelected((prev) =>
      prev.some((c) => c.id === product._id)
        ? prev.filter((c) => c.id !== product._id)
        : [...prev, { id: product._id }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentProducts.map((product) => ({
              id: product._id,
            }))
          : []
      );
    },
    [currentProducts]
  );

  // Import click handler with supplier validation
  const handleImportClick = () => {
    if (!suppliers.length) {
      showToast(
        "error",
        "No suppliers found. Please add at least one supplier first."
      );
      return;
    }
    setShowImportModal(true);
  };

  const handleProductImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    if (!suppliers.length) {
      showToast("error", "No suppliers found – cannot import");
      return;
    }

    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/product/import`,
        parsedData
      );

      if (res.status === 200) {
        // Success - all records imported
        let message = `Imported ${res.data.importedCount} product(s) successfully`;
        if (res.data.duplicateCount > 0) {
          message += `, ${res.data.duplicateCount} duplicate record(s) found`;
        }
        showToast("success", message);
        setShowImportModal(false);
        setParsedData([]);
        fetchProducts();
      } else if (res.status === 207) {
        // Partial success
        let message = `Imported ${res.data.importedCount} product(s)`;
        if (res.data.duplicateCount > 0) {
          message += `, ${res.data.duplicateCount} duplicate record(s) found`;
        }
        if (res.data.failedCount > 0) {
          message += `, ${res.data.failedCount} error(s) encountered`;
        }
        showToast("success", message);

        // Show detailed errors if any
        if (res.data.errors && res.data.errors.length > 0) {
          if (res.data.errors.length <= 5) {
            res.data.errors.forEach((error) => {
              showToast("error", error, 5000);
            });
          } else {
            showToast(
              "error",
              `First 5 errors: ${res.data.errors.slice(0, 5).join("; ")}`,
              5000
            );
          }
        }

        setShowImportModal(false);
        setParsedData([]);
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
      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: true,
        cellNF: false,
        cellText: false,
      });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      // Required headers
      const requiredHeaders = [
        "product name",
        "type",
        "packing",
        "selling price (usd)",
        "lc (usd)",
        "quantity per box/strip",
        "supplier name",
        "drug registration license #",
        "drug registration license validity date",
      ];

      const optionalHeaders = [
        "fob (usd)",
        "tax selling price (usd)",
        "remarks",
      ];

      const allHeaders = [...requiredHeaders, ...optionalHeaders];

      // Find the header row dynamically
      let headerRowIndex = -1;
      let headerRow = [];

      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const cleanedRow = rows[i].map((cell) =>
          (cell || "").toString().trim().toLowerCase()
        );

        const matchCount = requiredHeaders.filter((hdr) =>
          cleanedRow.includes(hdr)
        ).length;

        if (matchCount >= requiredHeaders.length * 0.8) {
          headerRowIndex = i;
          headerRow = cleanedRow;
          break;
        }
      }

      if (headerRowIndex === -1) {
        showToast("error", "❌ Could not find required headers in Excel file");
        return;
      }

      // Map column index → header name
      const headersMap = {};
      rows[headerRowIndex].forEach((headerText, colIndex) => {
        const cleaned = headerText.toString().trim().toLowerCase();
        if (allHeaders.includes(cleaned)) {
          headersMap[colIndex] = cleaned;
        }
      });

      // Extract data rows below the header row
      const dataRows = rows.slice(headerRowIndex + 1);
      if (dataRows.length === 0) {
        showToast("warning", "No data rows in Excel file");
        return;
      }

      const mappedData = dataRows
        .map((row, rowIndex) => {
          const item = {};
          Object.entries(headersMap).forEach(([colIndex, key]) => {
            item[key] = row[colIndex] || "";
          });

          // Get the date value from Excel
          let licenseValidityDate = "";

          if (item["drug registration license validity date"]) {
            const dateStr = item["drug registration license validity date"]
              .toString()
              .trim();

            // Try to parse the date using parseExcelDate
            const parsedDate = parseExcelDate(dateStr);
            if (parsedDate) {
              licenseValidityDate = parsedDate.toISOString().split("T")[0];
            } else {
              // If parseExcelDate fails, keep the raw string and let backend handle it
              licenseValidityDate = dateStr;
            }
          }

          return {
            productName: item["product name"],
            type: item["type"],
            packing: item["packing"],
            sellingPriceUSD: item["selling price (usd)"],
            lcUSD: item["lc (usd)"],
            fobUSD: item["fob (usd)"] || "",
            taxSellingPriceUSD: item["tax selling price (usd)"] || "",
            qtyPerBoxStrip: item["quantity per box/strip"],
            supplierName: item["supplier name"],
            drugLicense: item["drug registration license #"],
            licenseValidityDate: licenseValidityDate,
            remarks: item["remarks"] || "",
          };
        })
        .filter((entry) => entry.productName !== "");

      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString();
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const handleView = (product) => {
    setForm({
      ...product,
      licenseValidityDate: product.licenseValidityDate || "",
    });
    setIsViewModalOpen(true);
  };

  const handleEdit = (product) => {
    setForm({
      ...product,
      licenseValidityDate: product.licenseValidityDate || "",
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setForm(initialFormState);
  };

  const closeViewModal = () => {
    setIsViewModalOpen(false);
    setForm(initialFormState);
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> product(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/products`, {
          data: { ids: selected.map((s) => s.id) },
        });

        if (res.status === 200) {
          showToast(
            "success",
            res.data.message || "Products deleted successfully"
          );
          fetchProducts();
        }
      } catch (err) {
        showToast("error", "Failed to delete products.");
      }
    } else {
      setSelected([]);
    }
  };

  // Delete one
  const deleteProduct = async (product) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${product.productName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/product/${product._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            res.data.message || "Product deleted successfully"
          );
          fetchProducts();
        }
      } catch (error) {
        showToast("error", error.message || "Failed to delete product");
      }
    }
  };

  const handleProductUpdate = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.put(
        `${backendUrl}/api/products/${form._id}`,
        form
      );

      if (res.status === 200) {
        showToast(
          "success",
          `Product <b>${res.data.productName}</b> updated successfully`
        );
        closeEditModal();
        fetchProducts();
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast("error", "Failed to update product.");
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.classList.remove("highlight");
        }
      }, 1000);
    }
  };

  // Handle numeric input for quantity
  const handleNumericInput = (e, field) => {
    const value = e.target.value;
    if (value === "" || /^\d+$/.test(value)) {
      setForm({ ...form, [field]: value });
    }
  };

  // Handle dropdown selection
  const handleTypeChange = useCallback((selectedValue) => {
    setForm((prev) => ({
      ...prev,
      type: selectedValue,
    }));
  }, []);

  const handleSupplierChange = useCallback((selectedValue) => {
    setForm((prev) => ({
      ...prev,
      supplierName: selectedValue,
    }));
  }, []);

  const handlePackingChange = useCallback((selectedValue) => {
    setForm((prev) => ({
      ...prev,
      packing: selectedValue,
    }));
  }, []);

  // Get selected values for dropdowns
  const getSelectedType = useMemo(() => {
    return form.type;
  }, [form.type]);

  const getSelectedSupplier = useMemo(() => {
    return form.supplierName;
  }, [form.supplierName]);

  const getSelectedPacking = useMemo(() => {
    return form.packing;
  }, [form.packing]);

  if (loading) return <LoadingOverlay text="Loading products..." />;

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-3">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/productmanagerlayout/addproduct")}
            >
              <UserPlus size={18} /> Add New Product
            </button>

            <button
              onClick={handleImportClick}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Product
            </button>

            {selected.length > 0 && (
              <button
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={18} /> Delete Selected ({selected.length})
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {products.length > 0 ? (
            <div className="flex gap-4 flex-wrap">
              {types.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setSelectedTab(tab);
                    setCurrentPage(1);
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
          ) : (
            <div></div>
          )}

          {products.length > 0 && (
            <div className="flex items-center gap-8">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredProducts.length}
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

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
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
                    <span className="text-sm font-medium">Product Name</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Product Type</th>
                <th className="p-3 text-sm font-medium">Packing</th>
                <th className="p-3 text-sm font-medium">
                  Quantity per Box/Strip
                </th>
                <th className="p-3 text-sm font-medium">Supplier</th>
                <th className="p-3 text-sm font-medium">Drug License</th>
                <th className="p-3 text-sm font-medium">License Validity</th>
                <th className="p-3 text-sm font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-gray-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                currentProducts.map((product, index) => (
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
                        <span>
                          {capitalizeFirstLetter(product.productName)}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">{product.type}</td>
                    <td className="p-3">{product.packing}</td>
                    <td className="p-3">{product.qtyPerBoxStrip}</td>
                    <td className="p-3">
                      {capitalizeFirstLetter(product.supplierName) || "--"}
                    </td>
                    <td className="p-3">{product.drugLicense || "--"}</td>
                    <td className="p-3">
                      {product.licenseValidityDate
                        ? formatDateToReadable(product.licenseValidityDate)
                        : "--"}
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                        onClick={() => handleView(product)}
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => handleEdit(product)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={() => deleteProduct(product)}
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
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
                ← Prev
              </button>

              {visiblePages.map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded cursor-pointer ${
                    currentPage === page
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                  Next →
              </button>
            </div>
          )}
        </div>

        {/* Import Modal */}
        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">Import Products</h2>
                {isSampleFile && <SampleExcelDownloadProduct />}
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 mb-4"
                />

                {/* Row count display */}
                <div className="flex justify-between items-center mb-4">
                  <div className="text-sm text-gray-600">
                    {parsedData.length > 0 ? (
                      <>
                        Rows to import:{" "}
                        <span className="font-semibold text-blue-600">
                          {parsedData.length}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500">No data to import</span>
                    )}
                  </div>
                  <div className="flex gap-3">
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

                {/* Optional fields note */}
                {parsedData.length > 0 && (
                  <div className="text-xs text-gray-500 mt-2">
                    Note: FOB (USD) and Tax Selling Price (USD) are optional
                    fields.
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}

        {/* View Modal */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={closeViewModal}
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
                      {capitalizeFirstLetter(form.productName)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Type
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.type}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Packing
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.packing}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Quantity per Box/Strip
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.qtyPerBoxStrip || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Supplier Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {capitalizeFirstLetter(form.supplierName) || "--"}
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
                        : "N/A"}
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-600">
                      Remarks
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.remarks || "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={closeViewModal}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Edit Modal */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={closeEditModal}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold mb-4">Edit Product</h2>

                <form onSubmit={handleProductUpdate}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Product Name <span className="text-red-500">*</span>
                      </label>
                      <div>
                        <InputField
                          type="text"
                          value={form.productName}
                          onChange={(e) =>
                            setForm({ ...form, productName: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    {/* Type Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Type
                      </label>
                      <div className="rounded-lg">
                        <SearchableDropdown
                          value={getSelectedType}
                          onChange={handleTypeChange}
                          options={productTypes}
                          placeholder="Select Type"
                        />
                      </div>
                    </div>

                    {/* Packing Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Packing
                      </label>
                      <div className="rounded-lg">
                        <SearchableDropdown
                          value={getSelectedPacking}
                          onChange={handlePackingChange}
                          options={packingOptions}
                          placeholder="Select Packing"
                        />
                      </div>
                    </div>

                    {/* Quantity per Box/Strip (Numeric only) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Quantity per Box/Strip
                      </label>
                      <div>
                        <InputField
                          type="text"
                          value={form.qtyPerBoxStrip}
                          onChange={(e) =>
                            handleNumericInput(e, "qtyPerBoxStrip")
                          }
                          placeholder="Enter numbers only"
                        />
                      </div>
                    </div>

                    {/* Supplier Name Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Supplier Name
                      </label>
                      <div className="rounded-lg">
                        <SearchableDropdown
                          value={getSelectedSupplier}
                          onChange={handleSupplierChange}
                          options={suppliers}
                          placeholder="Select Supplier"
                        />
                      </div>
                    </div>

                    {/* Drug License */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Drug License
                      </label>
                      <div>
                        <InputField
                          type="text"
                          value={form.drugLicense}
                          onChange={(e) =>
                            setForm({ ...form, drugLicense: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    {/* License Validity Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        License Validity Date
                      </label>
                      <div className="rounded-lg border border-gray-300">
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
                          className="w-full px-3 py-2 border-none rounded-lg focus:ring-0"
                        />
                      </div>
                    </div>

                    {/* Remarks */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600">
                        Remarks
                      </label>
                      <div className="border border-gray-300 rounded-lg bg-white">
                        <textarea
                          value={form.remarks}
                          onChange={(e) =>
                            setForm({ ...form, remarks: e.target.value })
                          }
                          className="w-full px-3 py-2 border-none rounded-lg focus:ring-0 resize-none"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeEditModal}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Update
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default Product;
