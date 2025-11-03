import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AddProduct = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    productName: "",
    type: "",
    packing: "",
    qtyPerBoxStrip: "",
    supplierName: "",
    drugLicense: "",
    licenseValidityDate: "",
    remarks: "",
    sellingPrice: "",
    lc: "",
    fob: "",
    taxSellingPrice: "",
  });

  const [errors, setErrors] = useState({});
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [isSupplierListEmpty, setIsSupplierListEmpty] = useState(false);
  const isMrListEmptyRef = useRef(false);

  // 🔹 Product types
  const typeOptions = useMemo(
    () => [
      { value: "Tablet", label: "Tablet" },
      { value: "Capsule", label: "Capsule" },
      { value: "Syrup", label: "Syrup" },
      { value: "Injection", label: "Injection" },
      { value: "Cream", label: "Cream" },
      { value: "Ointment", label: "Ointment" },
      { value: "Drops", label: "Drops" },
    ],
    []
  );

  // 🔹 Fetch supplier list for dropdown
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoadingSuppliers(true);
      const res = await axios.get(`${backendUrl}/api/suppliers`);
      const suppliers = res.data?.data || res.data;

      if (Array.isArray(suppliers)) {
        setSupplierOptions(
          suppliers.map((s) => ({ value: s.name, label: s.name }))
        );

        // Only update state, don't show toast here
        if (suppliers.length === 0) {
          setIsSupplierListEmpty(true);
        } else {
          setIsSupplierListEmpty(false);
        }
      } else {
        setIsSupplierListEmpty(true);
      }
    } catch (error) {
      console.error(error);
      setIsSupplierListEmpty(true);
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  // Add this useEffect to handle the toast
  useEffect(() => {
    if (isSupplierListEmpty && !loadingSuppliers) {
      showToast(
        "error",
        "No suppliers found. Please add at least one supplier first."
      );
    }
  }, [isSupplierListEmpty, loadingSuppliers]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // 🔹 Validation
  const validate = () => {
    const newErrors = {};
    if (!form.productName.trim())
      newErrors.productName = "Product name is required";
    if (!form.type) newErrors.type = "Type is required";
    if (!form.packing.trim()) newErrors.packing = "Packing is required";
    if (!form.supplierName)
      newErrors.supplierName = "Supplier name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 🔹 Handle text input (allow only numbers where needed)
  const handleChange = (name, value) => {
    // Prevent changes if supplier list is empty
    if (isSupplierListEmpty) {
      showToast("error", "Please add at least one supplier first.");
      return;
    }

    const numericFields = [
      "sellingPrice",
      "lc",
      "fob",
      "taxSellingPrice",
      "qtyPerBoxStrip",
    ];

    if (numericFields.includes(name)) {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setForm((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }

    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  // 🔹 Handle dropdown changes
  const handleDropdownChange = (name, value) => {
    if (!isSupplierListEmpty) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // 🔹 Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent submission if supplier list is empty
    if (isSupplierListEmpty) {
      showToast("error", "Cannot add product. No suppliers available.");
      return;
    }

    if (!validate()) return;

    try {
      const response = await fetch(`${backendUrl}/api/product/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sellingPrice: Number(form.sellingPrice) || 0,
          lc: Number(form.lc) || 0,
          fob: Number(form.fob) || 0,
          taxSellingPrice: Number(form.taxSellingPrice) || 0,
          qtyPerBoxStrip: Number(form.qtyPerBoxStrip) || 0,
        }),
      });

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Failed to add product");

      showToast("success", data.message || "Product added successfully");
      navigate("/productmanagerlayout/product");
    } catch (error) {
      showToast("error", error.message || "Network error");
    }
  };

  // Check if form is valid for submission - also check if supplier list is not empty
  const isFormValid = useMemo(() => {
    return (
      !isSupplierListEmpty &&
      form.productName.trim() &&
      form.type &&
      form.packing.trim() &&
      form.supplierName
    );
  }, [form, isSupplierListEmpty]);

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Product</h2>

      {/* Warning message if supplier list is empty */}
      {isSupplierListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                No Suppliers Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You need to add at least one supplier before creating
                  products. Please add suppliers in the supplier management
                  section first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Product Name */}
          <InputField
            label="Product Name"
            name="productName"
            value={form.productName}
            onChange={handleChange}
            placeholder=""
            required={true}
            error={errors.productName}
            disabled={isSupplierListEmpty}
          />

          {/* Type Dropdown */}
          <SearchableDropdown
            label="Type"
            value={form.type}
            onChange={(value) => handleDropdownChange("type", value)}
            options={typeOptions}
            placeholder={
              isSupplierListEmpty ? "No Suppliers Available" : "Select Type"
            }
            required={true}
            error={errors.type}
            disabled={isSupplierListEmpty}
          />

          {/* Packing */}
          <InputField
            label="Packing"
            name="packing"
            value={form.packing}
            onChange={handleChange}
            placeholder=""
            required={true}
            error={errors.packing}
            disabled={isSupplierListEmpty}
          />

          {/* Quantity per Box/Strip */}
          <InputField
            label="Quantity per Box/Strip"
            name="qtyPerBoxStrip"
            value={form.qtyPerBoxStrip}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.qtyPerBoxStrip}
            disabled={isSupplierListEmpty}
          />

          {/* Supplier Dropdown */}
          <SearchableDropdown
            label="Supplier Name"
            value={form.supplierName}
            onChange={(value) => handleDropdownChange("supplierName", value)}
            options={
              isSupplierListEmpty
                ? [
                    {
                      value: "",
                      label: "No Suppliers Available",
                      disabled: true,
                    },
                  ]
                : supplierOptions
            }
            loading={loadingSuppliers}
            placeholder={
              isSupplierListEmpty ? "No Suppliers Available" : "Select Supplier"
            }
            required={true}
            error={errors.supplierName}
            disabled={isSupplierListEmpty}
          />

          {/* Drug License */}
          <InputField
            label="Drug License"
            name="drugLicense"
            value={form.drugLicense}
            onChange={handleChange}
            placeholder=""
            error={errors.drugLicense}
            disabled={isSupplierListEmpty}
          />

          {/* License Validity Date */}
          <InputField
            label="License Validity Date"
            name="licenseValidityDate"
            value={form.licenseValidityDate}
            onChange={handleChange}
            type="date"
            error={errors.licenseValidityDate}
            disabled={isSupplierListEmpty}
          />

          {/* Selling Price */}
          <InputField
            label="Selling Price (USD)"
            name="sellingPrice"
            value={form.sellingPrice}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.sellingPrice}
            disabled={isSupplierListEmpty}
          />

          {/* LC */}
          <InputField
            label="LC (USD)"
            name="lc"
            value={form.lc}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.lc}
            disabled={isSupplierListEmpty}
          />

          {/* FOB */}
          <InputField
            label="FOB (USD)"
            name="fob"
            value={form.fob}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.fob}
            disabled={isSupplierListEmpty}
          />

          {/* Tax Selling Price */}
          <InputField
            label="Tax Selling Price (USD)"
            name="taxSellingPrice"
            value={form.taxSellingPrice}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.taxSellingPrice}
            disabled={isSupplierListEmpty}
          />

          {/* Remarks */}
          <InputField
            label="Remarks"
            name="remarks"
            value={form.remarks}
            onChange={handleChange}
            placeholder=""
            error={errors.remarks}
            disabled={isSupplierListEmpty}
          />
        </div>

        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            disabled={!isFormValid || isSupplierListEmpty}
            className={`px-6 py-2 rounded-lg shadow transition duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              !isFormValid || isSupplierListEmpty
                ? "bg-gray-400 text-gray-200 cursor-not-allowed focus:ring-gray-300"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer focus:ring-green-500"
            }`}
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => navigate("/productmanagerlayout/product")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddProduct;