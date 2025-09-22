import React, { useState, useEffect, useMemo } from "react";
import { Eye, X, Edit } from "lucide-react";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

function PriceList() {
  const [priceList, setPriceList] = useState([]);
  const [types, setTypes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const priceListPerPage = 9;

  const [form, setForm] = useState({
    productName: "",
    sellingPrice: "",
    lc: "",
    taxSellingPrice: "",
    type: "",
    drugLicense: "",
    licenseValidityDate: "",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`${backendUrl}/api/pricelist`);
        if (!response.ok) throw new Error("Failed to fetch products");
        const data = await response.json();
        const uniqueTypes = Array.from(
          new Set(data.map((item) => item.type.toLowerCase()))
        );
        setTypes(["All", ...uniqueTypes]);
        setPriceList(data);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredPriceList = useMemo(() => {
    setCurrentPage(1);
    const lowerSearch = searchTerm.toLowerCase();
    return priceList.filter((product) => {
      const matchesType =
        selectedTab.toLowerCase() === "all" ||
        product.type?.toLowerCase() === selectedTab.toLowerCase();

      const licenseDateFormatted = product.licenseValidityDate
        ? formatDateToReadable(
            new Date(product.licenseValidityDate),
            "dd/MM/yyyy"
          ).toLowerCase()
        : "";

      const fieldsToSearch = [
        product.productName,
        product.sellingPrice,
        product.lc,
        product.taxSellingPrice,
        product.type,
        product.drugLicense,
        licenseDateFormatted,
      ];

      const matchesSearch = fieldsToSearch.some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(lowerSearch)
      );

      return matchesType && matchesSearch;
    });
  }, [priceList, searchTerm, selectedTab]);

  const totalPages = Math.ceil(filteredPriceList.length / priceListPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentPriceList = filteredPriceList.slice(
    (currentPage - 1) * priceListPerPage,
    currentPage * priceListPerPage
  );

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString(); // ensure it's a string
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const handleView = (priceList) => {
    setForm(priceList);
    setIsViewModalOpen(true);
  };

  const handleEdit = (priceList) => {
    setForm(priceList);
    setIsEditModalOpen(true);
  };

  const handleProductUpdate = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.put(
        `${backendUrl}/api/pricelist/${form._id}`,
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

  return (
    <div className="max-w-8xl p-6 bg-white rounded-xl shadow">
      {/* Tabs + Search + Count */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        {priceList.length > 0 && (
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
        )}

        <div className="flex items-center gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredPriceList.length}
            </span>
          </p>

          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3">Product Name</th>
              <th className="p-3">Type</th>
              <th className="p-3">Selling Price (USD)</th>
              <th className="p-3">LC</th>
              <th className="p-3">Tax Selling Price (USD)</th>
              <th className="p-3">Drug License</th>
              <th className="p-3">License Validity</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentPriceList.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  No priceList found.
                </td>
              </tr>
            ) : (
              currentPriceList.map((priceList, index) => (
                <tr
                  key={priceList._id}
                  className={`hover:bg-gray-50 ${
                    (index + 1) % priceListPerPage === 0 ||
                    index + 1 === currentPriceList.length
                      ? ""
                      : "border-b"
                  }`}
                > <td className="p-3">{capitalizeFirstLetter(priceList.productName) || "--"}</td>
                  <td className="p-3">{priceList.type || "--"}</td>
                  <td className="p-3">{priceList.sellingPrice ?? "--"}</td>
                  <td className="p-3">{priceList.lc ?? "--"}</td>
                  <td className="p-3">{priceList.taxSellingPrice ?? "--"}</td>
                  <td className="p-3">{priceList.drugLicense || "--"}</td>
                  <td className="p-3">
                    {formatDateToReadable(priceList.licenseValidityDate) || "--"}
                  </td>

                  <td className="p-3 flex items-center justify-center gap-3">
                    <button
                      className="text-blue-600 hover:text-blue-800 cursor-pointer"
                      onClick={() => handleView(priceList)}
                      title="View"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      className="text-green-600 hover:text-green-800 cursor-pointer"
                      onClick={() => handleEdit(priceList)}
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {currentPriceList.length > 0 && (
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
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
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
                Edit PriceList
              </h2>

              {/* Form Fields */}
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={form.productName}
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
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Selling Price (USD)
                  </label>
                  <input
                    type="number"
                    value={form.sellingPrice}
                    onChange={(e) =>
                      setForm({ ...form, sellingPrice: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">LC</label>
                  <input
                    type="number"
                    value={form.lc}
                    onChange={(e) => setForm({ ...form, lc: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Tax Selling Price (USD)
                  </label>
                  <input
                    type="number"
                    value={form.taxSellingPrice}
                    onChange={(e) =>
                      setForm({ ...form, taxSellingPrice: e.target.value })
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
                View PriceList
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Product Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {capitalizeFirstLetter(form.productName) || "--"}
                  </p>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Type
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.type || "--"}
                  </p>
                </div>

                {/* Selling Price (USD) */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Selling Price (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.sellingPrice != null && form.sellingPrice !== ""
                      ? form.sellingPrice
                      : "--"}
                  </p>
                </div>

                {/* LC */}
                <div>
                  <label className="block text-sm font.medium text-gray-600">
                    LC
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.lc != null && form.lc !== "" ? form.lc : "--"}
                  </p>
                </div>

                {/* Tax Selling Price (USD) */}
                <div>
                  <label className="block text.sm font-medium text-gray-600">
                    Tax Selling Price (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.taxSellingPrice != null && form.taxSellingPrice !== ""
                      ? form.taxSellingPrice
                      : "--"}
                  </p>
                </div>

                {/* Drug License */}
                <div>
                  <label className="block text-sm font.medium text-gray-600">
                    Drug License
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.drugLicense || "--"}
                  </p>
                </div>

                {/* License Validity Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    License Validity Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.licenseValidityDate
                      ? formatDateToReadable(form.licenseValidityDate)
                      : "--"}
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
}

export default PriceList;
