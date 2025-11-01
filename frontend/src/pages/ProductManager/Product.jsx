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
  const [isOpen, setIsOpen] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const inputRef = useRef(null);

  const productsPerPage = 9;

  const [form, setForm] = useState({
    productName: "",
    type: "",
    packing: "",
    qtyPerBox: "",
    qtyPerCarton: "",
    supplierName: "",
    drugLicense: "",
    licenseValidityDate: "",
    remarks: "",
  });

  // Filter products by tab and search term
  const filteredProducts = useMemo(() => {
    setCurrentPage(1);
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

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${backendUrl}/api/products`);
        if (!response.ok) throw new Error("Failed to fetch products");
        const data = await response.json();
        const uniqueTypes = Array.from(
          new Set(data.map((item) => item.type.toLowerCase()))
        );
        setTypes(["All", ...uniqueTypes]);
        setProducts(data);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleSelect = useCallback((product) => {
    setSelected((prev) =>
      prev.some((c) => c.id === product._id)
        ? prev.filter((c) => c.id !== product._id)
        : [...prev, { id: product._id }]
    );
  }, []);

  // Select / Deselect all visible staff
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

  // Handle delete selected products
  const fetchProducts = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/products`);
      const data = await response.json();
      const uniqueTypes = Array.from(
        new Set(data.map((item) => item.type.toLowerCase()))
      );
      setTypes(["All", ...uniqueTypes]);
      setProducts(data);
      setSelected([]);
    } catch (err) {
      handleError(err);
    }
  };

  const handleProductImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/product/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Product imported successfully!"
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
        "product name",
        "type",
        "packing",
        "selling price (usd)",
        "lc",
        "tax selling price (usd)",
        "qty per box",
        "qty per carton",
        "supplier name",
        "drug registration license #",
        "drug registration license validity date",
        "remarks",
      ];

      let headerRowIndex = -1;
      let foundHeaders = [];

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          (cell || "").toString().trim().toLowerCase()
        );
        const matched = requiredHeaders.filter((hdr) => row.includes(hdr));
        if (matched.length === requiredHeaders.length) {
          headerRowIndex = i;
          foundHeaders = matched;
          break;
        }
      }

      if (headerRowIndex === -1) {
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
            productName: item["product name"],
            type: item["type"],
            packing: item["packing"],
            sellingPrice: item["selling price (usd)"],
            lc: item["lc"],
            taxSellingPrice: item["tax selling price (usd)"],
            qtyPerBox: item["qty per box"],
            qtyPerCarton: item["qty per carton"],
            supplierName: item["supplier name"],
            drugLicense: item["drug registration license #"],
            licenseValidityDate:
              item["drug registration license validity date"],
            remarks: item["remarks"],
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
  const handleView = (product) => {
    setForm(product);
    setIsViewModalOpen(true);
  };

  const handleEdit = (product) => {
    setForm(product);
    setIsEditModalOpen(true);
  };
  // Delete selected
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> product?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/products`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", res.data.message);
          fetchProducts();
        }
      } catch (err) {
        showToast("error", "Failed to delete products.");
      }
    } else {
      setSelected([]); // uncheck all if user cancels
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
          showToast("success", res.data.message);
          fetchProducts();
        }
      } catch (error) {
        showToast("error", error.message);
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
        showToast("success", "Product updated successfully");
        setIsEditModalOpen(false);
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
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

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
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Product
            </button>

            {selected.length > 0 && (
              <button
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {products.length > 0 ? (
            <div className="flex gap-4">
              {types.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
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
                <th className="p-3  text-sm font-medium">Packing</th>
                <th className="p-3  text-sm font-medium">Quantity Per Box</th>
                <th className="p-3  text-sm font-medium">Supplier</th>
                <th className="p-3  text-sm font-medium">Drug License</th>
                <th className="p-3  text-sm font-medium">License Validity</th>
                <th className="p-3  text-sm font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-500">
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
                          {" "}
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
                    <td className="p-3">{product.drugLicense || "--"} </td>
                    <td className="p-3">
                      {formatDateToReadable(product.licenseValidityDate) ||
                        "--"}
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
                Prev
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
                Next
              </button>
            </div>
          )}
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
                {isSampleFile && <SampleExcelDownloadProduct />}
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

        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              {/* Modal Content */}
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                {/* Close Button */}
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
                      Qty per Box
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.qtyPerBox || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Qty per Carton
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.qtyPerCarton || "--"}
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
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              {/* Modal Box */}
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
                {/* Close Button */}
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Product
                </h2>

                {/* Form */}
                <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Fields */}
                  <div>
                    <label className="block text-sm font-medium">
                      Product Name
                    </label>
                    <input
                      type="text"
                      value={capitalizeFirstLetter(form.productName)}
                      onChange={(e) =>
                        setForm({ ...form, productName: e.target.value })
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Type</label>
                    <input
                      type="text"
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value })
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Packing</label>
                    <input
                      type="text"
                      value={form.packing}
                      onChange={(e) =>
                        setForm({ ...form, packing: e.target.value })
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Quantity per Box/Strip
                    </label>
                    <input
                      type="number"
                      value={form.qtyPerBox}
                      onChange={(e) =>
                        setForm({ ...form, qtyPerBox: e.target.value })
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      value={capitalizeFirstLetter(form.supplierName)}
                      onChange={(e) =>
                        setForm({ ...form, supplierName: e.target.value })
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Drug License
                    </label>
                    <input
                      type="text"
                      value={form.drugLicense}
                      onChange={(e) =>
                        setForm({ ...form, drugLicense: e.target.value })
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      License Validity Date
                    </label>
                    <DatePicker
                      selected={
                        form.licenseValidityDate
                          ? new Date(form.licenseValidityDate)
                          : null
                      }
                      onChange={(date) =>
                        date
                          ? setForm({
                              ...form,
                              licenseValidityDate: date.toISOString(),
                            })
                          : null
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium">Remarks</label>
                    <textarea
                      value={form.remarks}
                      onChange={(e) =>
                        setForm({ ...form, remarks: e.target.value })
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>
                </form>

                {/* Buttons */}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProductUpdate}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default Product;
