import React, { useState } from "react";
import { Search, Plus, Upload, Edit, X, Trash2 } from "lucide-react";
import JSZip from "jszip";
const backendUrl = import.meta.env.VITE_BACKEND_URL;

const Brands = () => {
  const [showAddBrandModal, setShowAddBrandModal] = useState(false);
  const [newBrand, setNewBrand] = useState({
    name: "",
    slug: "",
    image: null,
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [file, setFile] = useState(null);
  const [brands, setBrands] = useState();
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");

  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  // const filteredBrands = brands.filter((brand) =>
  //   brand.name.toLowerCase().includes(searchTerm.toLowerCase())
  // );

  // const indexOfLastItem = currentPage * itemsPerPage;
  // const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  // const paginatedBrands = filteredBrands.slice(
  //   indexOfFirstItem,
  //   indexOfLastItem
  // );
  // const totalPages = Math.ceil(filteredBrands.length / itemsPerPage);

  const handleDelete = (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this brand?"
    );
    if (confirmed) {
      setBrands((prev) => prev.filter((b) => b.id !== id));
      setSelectedIds((prev) => prev.filter((sid) => sid !== id));
    }
  };

  const handleBulkDelete = () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete selected brands?"
    );
    if (confirmed) {
      setBrands((prev) => prev.filter((b) => !selectedIds.includes(b.id)));
      setSelectedIds([]);
    }
  };

  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

const selectedAllBrands = (checked)=>{
  console.log('values of check', checked);
}
// const handleZipAndUpload = async (event) => {
//   const files = event.target.files;
//   if (!files.length) return;

//   setUploading(true);

//   try {
//     const zip = new JSZip();

//     const zipBlob = await zip.generateAsync({ type: "blob" });

//     const formData = new FormData();
//     formData.append("photosZip", zipBlob); // 👈 give name

//     const response = await fetch(`${backendUrl}/api/upload-brands`, {
//       method: "POST",
//       body: formData,
//     });

//     const data = await response.json();

//     if (response.ok) {
//       alert("Upload successful!");
//       console.log("Uploaded URLs:", data.uploadedUrls); // optional: list of image URLs
//     } else {
//       console.error("Upload error:", data);
//       alert("Upload failed.");
//     }
//   } catch (err) {
//     console.error("Error zipping or uploading:", err);
//     alert("An error occurred.");
//   } finally {
//     setUploading(false);
//   }
// };

const handleZipAndUpload = async (event) => {
  const files = event.target.files;
  if (!files.length) {
    console.error("No files selected");
    return;
  }

  console.log("Files selected:", files.length);

  const zip = new JSZip();
  const folder = zip.folder("images");

  Array.from(files).forEach((file, index) => {
    console.log("Adding file to zip:", file.name, file.size);
    folder.file(file.name || `image-${index + 1}.jpg`, file);
  });

  const zipBlob = await zip.generateAsync({ type: "blob" });
  console.log("Zip blob generated, size:", zipBlob.size);

  const formData = new FormData();
  formData.append("photosZip", zipBlob, "brand-images.zip");

  const response = await fetch(`${backendUrl}/api/upload-brands`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  console.log("Response:", data);
};


  return (
    <div className="max-w-8xl p-6 bg-white rounded-xl shadow">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        {/* Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowAddBrandModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            <Plus size={18} /> Add New Brand
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            <Upload size={18} /> Import Brands
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

        {/* Search Bar */}
        <div className="relative w-full md:w-1/3">
          <input
            type="text"
            placeholder="Search brand..."
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
                  // checked={
                  //   paginatedBrands.length > 0 &&
                  //   selectedIds.length === filteredBrands.length
                  // }
                  onChange={selectedAllBrands}
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Brand Logo</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* {filteredBrands.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-6 text-gray-500">
                  No brands found.
                </td>
              </tr>
            ) : (
              filteredBrands.map((brand) => (
                <tr key={brand.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(brand.id)}
                      onChange={() => handleSelect(brand.id)}
                    />
                  </td>
                  <td className="px-4 py-3">{brand.name}</td>
                  <td className="px-4 py-3">
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      className="h-8 w-auto"
                    />
                  </td>
                  <td className="px-4 py-3 flex gap-3">
                    <button className="text-indigo-600 hover:text-indigo-800">
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(brand.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )} */}
          </tbody>
        </table>
        {/* Pagination Controls */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Previous
          </button>

          <div className="space-x-2">
            {/* {Array.from({ length: totalPages }, (_, index) => (
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
            ))} */}
          </div>

          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            // disabled={currentPage === totalPages}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            {/* Close */}
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Import Brands
            </h2>

            {/* Sample CSV link */}
            <a
              href="/sample.csv"
              download
              className="text-blue-600 hover:underline text-sm mb-4 block"
            >
              Click here to download Sample CSV file
            </a>

            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-gray-700 mb-2">File</label>
              <input
                type="file"
                accept=".zip"
                onChange={handleZipAndUpload}
                className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                name="photosZip"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowImportModal(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowImportModal(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddBrandModal && (
        <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            {/* Close */}
            <button
              onClick={() => setShowAddBrandModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Add New Brand
            </h2>

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newBrand.name}
                  onChange={(e) =>
                    setNewBrand({ ...newBrand, name: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="Enter brand name"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={newBrand.slug}
                  onChange={(e) =>
                    setNewBrand({ ...newBrand, slug: e.target.value })
                  }
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="Enter brand slug"
                />
              </div>

              {/* Brand Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand Images
                </label>
                <div className="w-20 h-20 border border-dashed rounded-lg flex items-center justify-center cursor-pointer bg-gray-50">
                  <label
                    htmlFor="brandImageUpload"
                    className="cursor-pointer text-3xl text-gray-400"
                  >
                    {newBrand.image ? (
                      <img
                        src={URL.createObjectURL(newBrand.image)}
                        alt="Preview"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <span className="text-3xl text-gray-400">+</span>
                    )}
                  </label>
                  <input
                    id="brandImageUpload"
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setNewBrand({ ...newBrand, image: e.target.files[0] })
                    }
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddBrandModal(false)}
                className="bg-white border border-gray-300 text-gray-700 px-5 py-2 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log("Creating brand:", newBrand);
                  // Optional: add validation before continuing
                  setShowAddBrandModal(false);
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

export default Brands;
