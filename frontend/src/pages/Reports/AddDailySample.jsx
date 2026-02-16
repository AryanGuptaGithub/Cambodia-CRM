import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import SearchableDropdown from "../../components/common/SearchableDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  date: "",
  mrName: "",
  mrId: "",
  productName: "",
  productId: "",
  totalQty: "",
  remark: "",
};

const AddDailySampleReport = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  const [mrList, setMrList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [productsListLoading, setProductsListLoading] = useState(true);

  // Fetch MR List
  useEffect(() => {
    const fetchMRList = async () => {
      try {
        setMrListLoading(true);
        const response = await fetch(`${backendUrl}/api/staff`);
        const data = await response.json();
        if (data) {
          setMrList(data);
        }
      } catch (error) {
        console.error("Error fetching MR list:", error);
        showToast("error", "Failed to load Medical Representatives");
      } finally {
        setMrListLoading(false);
      }
    };
    fetchMRList();
  }, []);

  // Fetch Products List
  useEffect(() => {
    const fetchProductsList = async () => {
      try {
        setProductsListLoading(true);
        const response = await fetch(`${backendUrl}/api/products`);
        const data = await response.json();
        if (data) {
          setProductsList(data || []);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
        showToast("error", "Failed to load Products");
      } finally {
        setProductsListLoading(false);
      }
    };
    fetchProductsList();
  }, []);

  const validate = () => {
    const newErrors = {};

    if (!form.date) newErrors.date = "Date is required";
    if (!form.mrName) newErrors.mrName = "MR Name is required";
    if (!form.productName) newErrors.productName = "Product Name is required";

    if (form.totalQty && form.totalQty.trim() !== "" && (isNaN(Number(form.totalQty)) || Number(form.totalQty) < 0)) {
      newErrors.totalQty = "Total Quantity must be 0 or more";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNumericChange = (e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm((prevForm) => ({
        ...prevForm,
        [name]: value,
      }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleMRChange = (mrId) => {
    const selectedMR = mrList.find((mr) => mr._id === mrId);
    if (selectedMR) {
      setForm((prevForm) => ({
        ...prevForm,
        mrId: mrId,
        mrName: selectedMR.medicalRepName,
      }));
      setErrors((prev) => ({ ...prev, mrName: "" }));
    }
  };

  const handleProductChange = (productId) => {
    const selectedProduct = productsList.find((product) => product._id === productId);
    if (selectedProduct) {
      setForm((prevForm) => ({
        ...prevForm,
        productId: productId,
        productName: selectedProduct.productName,
      }));
      setErrors((prev) => ({ ...prev, productName: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const submitData = {
        date: form.date,
        mrName: form.mrName,
        mrId: form.mrId,
        productName: form.productName,
        totalQty: form.totalQty && form.totalQty.trim() !== "" ? Number(form.totalQty) : 0,
        remark: form.remark,
      };

      const response = await fetch(`${backendUrl}/api/reports/daily-sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Something went wrong");
        return;
      }

      showToast(
        "success",
        data.message || `Daily sample report for <b>${form.productName} - ${form.mrName}</b> added successfully`
      );
      navigate("/reportlayout/dailysample");
    } catch (error) {
      showToast("error", error.message || "Network error");
    }
  };

  const mrOptions = useMemo(() => {
    if (mrList.length === 0 && !mrListLoading) {
      return [{ value: "", label: "No Medical Representatives Available", disabled: true }];
    }
    return [
      { value: "", label: "Select Medical Representative" },
      ...mrList.map((mr) => ({ value: mr._id, label: mr.medicalRepName })),
    ];
  }, [mrList, mrListLoading]);

  const productOptions = useMemo(() => {
    if (productsList.length === 0 && !productsListLoading) {
      return [{ value: "", label: "No Products Available", disabled: true }];
    }
    return [
      { value: "", label: "Select Product" },
      ...productsList.map((product) => ({ value: product._id, label: product.productName })),
    ];
  }, [productsList, productsListLoading]);

  const renderInput = (
    label,
    name,
    type = "text",
    placeholder = "",
    required = false,
    disabled = false,
    isNumeric = false
  ) => (
    <div>
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="text"
        name={name}
        value={form[name]}
        onChange={isNumeric ? handleNumericChange : handleChange}
        placeholder={placeholder}
        className={`w-full border rounded-md px-3 py-2 ${
          errors[name] ? "border-red-500" : "border-gray-300"
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
        disabled={disabled}
      />
      {errors[name] && <p className="text-red-500 text-sm mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add Daily Sample Report</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Date */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              Date
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className={`w-full border rounded-md px-3 py-2 ${
                errors.date ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date}</p>}
          </div>

          {/* MR Name Dropdown */}
          <div>
            <SearchableDropdown
              value={form.mrId}
              onChange={handleMRChange}
              options={mrOptions}
              placeholder="Select Medical Representative"
              required={true}
              loading={mrListLoading}
              error={errors.mrName}
              label="MR Name"
            />
          </div>

          {/* Product Name Dropdown */}
          <div>
            <SearchableDropdown
              value={form.productId}
              onChange={handleProductChange}
              options={productOptions}
              placeholder="Select Product"
              required={true}
              loading={productsListLoading}
              error={errors.productName}
              label="Product Name"
            />
          </div>

          {/* Total Quantity */}
          {renderInput("Total Quantity", "totalQty", "text", "Enter total quantity", false, false, true)}

          {/* Remark */}
          <div className="md:col-span-2">
            {renderInput("Remark", "remark", "text", "Enter remark")}
          </div>
        </div>

        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow cursor-pointer transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => navigate("/reportlayout/dailysample")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddDailySampleReport;