import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import {
  fetchProductTypes,
  fetchSuppliers,
  fetchProductPackingType,
} from "./common/fetchDropdown";

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
  const [typeOptions, setTypeOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [packingOptions, setPackingOptions] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingPacking, setLoadingPacking] = useState(false);
  const [isSupplierListEmpty, setIsSupplierListEmpty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔹 Load product types
  const loadProductTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const result = await fetchProductTypes();
      if (result.success) setTypeOptions(result.data);
      else setTypeOptions([]);
    } catch (error) {
      console.error(error);
      setTypeOptions([]);
    } finally {
      setLoadingTypes(false);
    }
  }, []);

  // 🔹 Load suppliers
  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const result = await fetchSuppliers();
      if (result.success) {
        setSupplierOptions(result.data);
        setIsSupplierListEmpty(result.data.length === 0);
      } else {
        setSupplierOptions([]);
        setIsSupplierListEmpty(true);
      }
    } catch (error) {
      console.error(error);
      setSupplierOptions([]);
      setIsSupplierListEmpty(true);
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  // 🔹 Load packing types
  const loadPackingTypes = useCallback(async () => {
    setLoadingPacking(true);
    try {
      const result = await fetchProductPackingType();
      if (result.success) setPackingOptions(result.data);
      else setPackingOptions([]);
    } catch (error) {
      console.error(error);
      setPackingOptions([]);
    } finally {
      setLoadingPacking(false);
    }
  }, []);

  useEffect(() => {
    loadProductTypes();
    loadSuppliers();
    loadPackingTypes();
  }, [loadProductTypes, loadSuppliers, loadPackingTypes]);

  useEffect(() => {
    if (isSupplierListEmpty && !loadingSuppliers) {
      showToast(
        "error",
        "No suppliers found. Please add at least one supplier first."
      );
    }
  }, [isSupplierListEmpty, loadingSuppliers]);

  const validate = () => {
    const newErrors = {};
    if (!form.productName.trim())
      newErrors.productName = "Product name is required";
    if (!form.type) newErrors.type = "Type is required";
    if (!form.packing) newErrors.packing = "Packing is required";
    if (!form.supplierName)
      newErrors.supplierName = "Supplier name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (name, value) => {
    const numericFields = [
      "sellingPrice",
      "lc",
      "fob",
      "taxSellingPrice",
      "qtyPerBoxStrip",
    ];
    if (numericFields.includes(name)) {
      if (value === "" || /^\d*\.?\d*$/.test(value))
        setForm((prev) => ({ ...prev, [name]: value }));
    } else setForm((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleDropdownChange = (name, value) => {
    if (!isSupplierListEmpty) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSupplierListEmpty) {
      showToast("error", "Cannot add product. No suppliers available.");
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/product/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sellingPrice: Number(form.sellingPrice || 0),
          lc: Number(form.lc || 0),
          fob: Number(form.fob || 0),
          taxSellingPrice: Number(form.taxSellingPrice || 0),
          qtyPerBoxStrip: Number(form.qtyPerBoxStrip || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Failed to add product");
      showToast("success", data.message || "Product added successfully");

      setForm({
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

      navigate("/productmanagerlayout/product");
    } catch (error) {
      showToast("error", error.message || "Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    !isSupplierListEmpty &&
    form.productName.trim() &&
    form.type &&
    form.packing &&
    form.supplierName;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Product</h2>

      {isSupplierListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">
            You need to add at least one supplier before creating products.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <InputField
            label="Product Name"
            name="productName"
            value={form.productName}
            onChange={handleChange}
            placeholder="Enter product name"
            required
            error={errors.productName}
            disabled={isSupplierListEmpty}
          />

          <SearchableDropdown
            label="Type"
            value={form.type}
            onChange={(value) => handleDropdownChange("type", value)}
            options={typeOptions}
            loading={loadingTypes}
            placeholder={loadingTypes ? "Loading types..." : "Select Type"}
            required
            error={errors.type}
            disabled={isSupplierListEmpty || loadingTypes}
          />

          <SearchableDropdown
            label="Packing"
            value={form.packing}
            onChange={(value) => handleDropdownChange("packing", value)}
            options={packingOptions}
            loading={loadingPacking}
            placeholder={
              loadingPacking ? "Loading packing..." : "Select Packing"
            }
            required
            error={errors.packing}
            disabled={isSupplierListEmpty || loadingPacking}
          />

          <InputField
            label="Quantity per Box/Strip"
            name="qtyPerBoxStrip"
            value={form.qtyPerBoxStrip}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.qtyPerBoxStrip}
            disabled={isSupplierListEmpty}
          />

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
              loadingSuppliers ? "Loading suppliers..." : "Select Supplier"
            }
            required
            error={errors.supplierName}
            disabled={isSupplierListEmpty || loadingSuppliers}
          />

          <InputField
            label="Drug License"
            name="drugLicense"
            value={form.drugLicense}
            onChange={handleChange}
            placeholder="Enter drug license number"
            error={errors.drugLicense}
            disabled={isSupplierListEmpty}
          />

          <InputField
            label="License Validity Date"
            name="licenseValidityDate"
            value={form.licenseValidityDate}
            onChange={handleChange}
            type="date"
            error={errors.licenseValidityDate}
            disabled={isSupplierListEmpty}
          />

          <InputField
            label="Selling Price (USD)"
            name="sellingPrice"
            value={form.sellingPrice}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.sellingPrice}
            disabled={isSupplierListEmpty}
          />

          <InputField
            label="LC (USD)"
            name="lc"
            value={form.lc}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.lc}
            disabled={isSupplierListEmpty}
          />

          <InputField
            label="FOB (USD)"
            name="fob"
            value={form.fob}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.fob}
            disabled={isSupplierListEmpty}
          />

          <InputField
            label="Tax Selling Price (USD)"
            name="taxSellingPrice"
            value={form.taxSellingPrice}
            onChange={handleChange}
            placeholder="Enter number"
            error={errors.taxSellingPrice}
            disabled={isSupplierListEmpty}
          />

          <div className="md:col-span-3">
            <InputField
              label="Remarks"
              name="remarks"
              value={form.remarks}
              onChange={handleChange}
              placeholder="Enter any additional remarks..."
              error={errors.remarks}
              disabled={isSupplierListEmpty}
              isTextArea
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className={`px-6 py-2 rounded-lg shadow transition duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              !isFormValid || isSubmitting
                ? "bg-gray-400 text-gray-200 cursor-not-allowed focus:ring-gray-300"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer focus:ring-green-500"
            }`}
          >
            {isSubmitting ? "Adding Product..." : "Add Product"}
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
