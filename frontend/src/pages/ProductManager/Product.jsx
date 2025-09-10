import React, { useState, useEffect } from "react";
import { UserPlus, Upload, Trash2, Eye, X, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";
const productData = [
  {
    id: 1,
    product: "Laptop Pro 15",
    productType: "Single Type Product",
    category: "Electronics",
    brand: "TechBrand",
    salePrice: 1200,
    purchasePrice: 1000,
    currentStock: 15,
  },
  {
    id: 2,
    product: "Smartphone X",
    productType: "Variant Type Product",
    category: "Mobile",
    brand: "PhoneMaker",
    salePrice: 800,
    purchasePrice: 650,
    currentStock: 30,
  },
  {
    id: 3,
    product: "Cloud Storage Service",
    productType: "Service Type Product",
    category: "Services",
    brand: "CloudCorp",
    salePrice: 50,
    purchasePrice: 0,
    currentStock: 0,
  },
  {
    id: 4,
    product: "Wireless Mouse",
    productType: "Single Type Product",
    category: "Accessories",
    brand: "TechBrand",
    salePrice: 25,
    purchasePrice: 15,
    currentStock: 120,
  },
  {
    id: 5,
    product: "Office Suite License",
    productType: "Service Type Product",
    category: "Software",
    brand: "SoftWareInc",
    salePrice: 150,
    purchasePrice: 0,
    currentStock: 0,
  },
  {
    id: 6,
    product: "Gaming Keyboard",
    productType: "Single Type Product",
    category: "Accessories",
    brand: "GameTech",
    salePrice: 80,
    purchasePrice: 50,
    currentStock: 50,
  },
  // Add more if needed...
];

const Product = () => {
    const navigate = useNavigate();
  const [products, setProducts] = useState(productData);
  const [selectedTab, setSelectedTab] = useState("Single Type Product");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
   const [showImportModal, setShowImportModal] = useState(false);
  const productsPerPage = 5;

  // Filter products by tab and search term
  const filteredProducts = products.filter((p) => {
    const matchesTab = selectedTab === "All" || p.productType === selectedTab;
    const matchesSearch =
      p.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Pagination logic
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);

  // Handle checkbox toggle
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Handle select all checkbox
  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentProducts.map((p) => p.id));
    } else {
      setSelected([]);
    }
  };

  // Handle delete selected products
  const handleDeleteSelected = () => {
    setProducts((prev) => prev.filter((p) => !selected.includes(p.id)));
    setSelected([]);
  };

  return (
    <div className="p-6">
      {/* Top Buttons and Search */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md"
                onClick={() => navigate("/productmanagerlayout/addproduct")}
          >
            <UserPlus size={18} /> Add New Product
          </button>

           <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-2 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300"
                  >
                    <Upload size={18} /> Import Product
                  </button>

          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
              onClick={handleDeleteSelected}
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border px-3 py-2 rounded-lg shadow-sm"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["Single Type Product", "Variant Type Product", "Service Type Product"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setSelectedTab(tab);
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg ${
              selectedTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3 text-center">
                <input
                  type="checkbox"
                  checked={selected.length === currentProducts.length && currentProducts.length > 0}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Product Type</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Brand</th>
              <th className="p-3 text-left">Sale Price</th>
              <th className="p-3 text-left">Purchase Price</th>
              <th className="p-3 text-left">Current Stock</th>
              <th className="p-3 text-center">Action</th>
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
              currentProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selected.includes(product.id)}
                      onChange={() => toggleSelect(product.id)}
                    />
                  </td>
                  <td className="p-3">{product.product}</td>
                  <td className="p-3">{product.productType}</td>
                  <td className="p-3">{product.category}</td>
                  <td className="p-3">{product.brand}</td>
                  <td className="p-3">₹{product.salePrice}</td>
                  <td className="p-3">₹{product.purchasePrice}</td>
                  <td className="p-3">{product.currentStock}</td>
                  <td className="p-3 flex items-center justify-center gap-3">
                    <button
                      className="text-blue-600 hover:text-blue-800"
                      onClick={() => alert(`View product ${product.id}`)}
                      title="View"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      className="text-green-600 hover:text-green-800"
                      onClick={() => alert(`Edit product ${product.id}`)}
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      className="text-red-600 hover:text-red-800"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Are you sure you want to delete ${product.product}?`
                          )
                        ) {
                          setProducts((prev) =>
                            prev.filter((p) => p.id !== product.id)
                          );
                          setSelected((prev) =>
                            prev.filter((id) => id !== product.id)
                          );
                        }
                      }}
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

        {/* Pagination */}
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 rounded ${
                currentPage === page
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
          {showImportModal && (
        <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-semibold mb-4">Import Products</h2>
            <a
              href="/sample.csv"
              download
              className="text-blue-600 hover:underline text-sm mb-4 block"
            >
              Download Sample CSV
            </a>
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
                  console.log("Uploaded File:", file);
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
    </div>
  );
};

export default Product;
