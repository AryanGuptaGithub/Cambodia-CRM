import React, { useState } from "react";
import { Search, Plus, Upload, Edit, Trash2, X } from "lucide-react";
const initialCategories = [];

function PriceList() {
  const [categories, setCategories] = useState(initialCategories);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", image: null });
  const [file, setFile] = useState(null);

  const itemsPerPage = 5;

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedCategories = filteredCategories.slice(
    indexOfFirstItem,
    indexOfLastItem
  );
  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);

  const handleDelete = (id) => {
    const confirmed = window.confirm("Delete this category?");
    if (confirmed) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setSelectedIds((prev) => prev.filter((sid) => sid !== id));
    }
  };

  const handleBulkDelete = () => {
    const confirmed = window.confirm("Delete selected categories?");
    if (confirmed) {
      setCategories((prev) => prev.filter((c) => !selectedIds.includes(c.id)));
      setSelectedIds([]);
    }
  };

  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredCategories.map((c) => c.id);
    if (selectedIds.length === allFilteredIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allFilteredIds);
    }
  };

  return (
    <div className="max-w-8xl p-6 bg-white rounded-xl shadow">
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

          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
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
                  <span>Product Name</span>
                </div>
              </th>
              <th className="p-3">Product Type</th>
              <th className="p-3">Packing</th>
              <th className="p-3">Quantity Per Box</th>
              <th className="p-3">Supplier</th>
              <th className="p-3">Drug License</th>
              <th className="p-3">License Validity</th>
              <th className="p-3">Action</th>
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
                        onChange={() => toggleSelect(product)} // Toggle on click
                      />
                      <span> {capitalizeFirstLetter(product.productName)}</span>
                    </div>
                  </td>
                  <td className="p-3">{product.type}</td>
                  <td className="p-3">{product.packing}</td>
                  <td className="p-3">{product.qtyPerBox}</td>
                  <td className="p-3">
                    {capitalizeFirstLetter(product.supplierName) || "--"}
                  </td>
                  <td className="p-3">{product.drugLicense || "--"} </td>
                  <td className="p-3">
                    {formatDateToReadable(product.licenseValidityDate) || "--"}
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

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            <button
              onClick={() => setShowAddCategoryModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-semibold mb-4">Add New Variation</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, name: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
                <label className="block text-sm mb-1">Value</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) =>
                    setNewCategory({ ...newCategory, name: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddCategoryModal(false)}
                className="bg-white border border-gray-300 text-gray-700 px-5 py-2 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log("Creating Variation:", newCategory);
                  setShowAddCategoryModal(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
              >
                Create
              </button>
            </div>
          </div>
        </div>
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
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
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
                    Qty per Box
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
                    Qty per Carton
                  </label>
                  <input
                    type="number"
                    value={form.qtyPerCarton}
                    onChange={(e) =>
                      setForm({ ...form, qtyPerCarton: e.target.value })
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
  );
}

export default PriceList;
