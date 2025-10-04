import React, { useState } from "react";
import { Search, Plus, Upload, Edit, Trash2, X } from "lucide-react";
import parenteralLogo from "../../../public/categories/parenteral.jpg";
import liquidLogo from "../../../public/categories/liquid.jpg";
import solidLogo from "../../../public/categories/solid.jpg";
import("../ProductManager/categories.css");
import SampleExcelDownloadProduct from "../../excels/SampleExcelDownloadProduct";

const initialCategories = [
  {
    id: 1,
    name: "Parenteral",
    logo: parenteralLogo,
  },
  {
    id: 2,
    name: "Liquid",
    logo: liquidLogo,
  },
  {
    id: 3,
    name: "Solid",
    logo: solidLogo,
  },
];

const Categories = () => {
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowAddCategoryModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            <Plus size={18} /> Add New Category
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            <Upload size={18} /> Import Categories
          </button>
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              <Trash2 size={18} /> Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>

        <div className="relative w-full md:w-1/3">
          <input
            type="text"
            placeholder="Search category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border border-gray-300 rounded-md pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 font-semibold">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={
                    selectedIds.length === filteredCategories.length &&
                    filteredCategories.length > 0
                  }
                  onChange={handleSelectAll}
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category Logo</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredCategories.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-6 text-gray-500">
                  No categories found.
                </td>
              </tr>
            ) : (
              paginatedCategories.map((category) => (
                <tr key={category.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(category.id)}
                      onChange={() => handleSelect(category.id)}
                    />
                  </td>
                  <td className="px-4 py-3">{category.name}</td>
                  <td className="px-4 py-3">
                    <img
                      className="h-8 category-width"
                      src={category.logo}
                      alt={category.name}
                    />
                  </td>
                  <td className="px-4 py-3 flex gap-3">
                    <button className="text-indigo-600 hover:text-indigo-800">
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Previous
          </button>

          <div className="space-x-2">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index + 1}
                onClick={() => setCurrentPage(index + 1)}
                className={`px-3 py-1 rounded ${
                  currentPage === index + 1
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-semibold mb-4">Import Categories</h2>

            <input
              type="file"
              accept=".csv, .xlsx"
              onChange={(e) => setFile(e.target.files[0])}
              className="block w-full border rounded-lg px-3 py-2 mb-6"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowImportModal(false)}
                className="bg-gray-300 px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowImportModal(false);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

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
            <h2 className="text-lg font-semibold mb-4">Add New Category</h2>

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
              </div>

              <div>
                <label className="block text-sm mb-1">Category Logo</label>
                <div className="w-20 h-20 border border-dashed rounded-lg flex items-center justify-center cursor-pointer bg-gray-50">
                  <label
                    htmlFor="categoryLogoUpload"
                    className="cursor-pointer text-3xl text-gray-400"
                  >
                    {newCategory.image ? (
                      <img
                        src={URL.createObjectURL(newCategory.image)}
                        alt="Preview"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <span className="text-3xl text-gray-400">+</span>
                    )}
                  </label>
                  <input
                    id="categoryLogoUpload"
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setNewCategory({
                        ...newCategory,
                        image: e.target.files[0],
                      })
                    }
                    className="hidden"
                  />
                </div>
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
    </div>
  );
};

export default Categories;
