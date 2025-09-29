import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  productName: "",
  type: "",
  packing: "",
  qtyPerBox: "",
  qtyPerCarton: "",
  supplierName: "",
  drugLicense: "",
  licenseValidityDate: "",
  remarks: "",
  sellingPrice: "",
  lc: "",
  taxSellingPrice: "",
};

const AddProduct = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!form.productName) newErrors.productName = "Product name is required";
    if (!form.type) newErrors.type = "Type is required";
    if (!form.packing) newErrors.packing = "Packing is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      ...form,
      sellingPrice: Number(form.sellingPrice),
      taxSellingPrice: Number(form.taxSellingPrice),
    };

    try {
      const response = await fetch(`${backendUrl}/api/product/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Something went wrong");
        return;
      }

      showToast("success", data.message || "Product added successfully");
      navigate("/productmanagerlayout/product");
    } catch (error) {
      showToast("error", error.message || "Network error");
    }
  };

  const renderInput = (
    label,
    name,
    type = "text",
    placeholder = "",
    required = false
  ) => (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full border rounded-md px-3 py-2"
      />
      {errors[name] && <p className="text-red-500 text-sm">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Product</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderInput("Product Name", "productName")}
          {renderInput("Type", "type")}
          {renderInput("Packing", "packing")}
          {renderInput("Quantity per Box", "qtyPerBox")}
          {renderInput("Quantity per Carton", "qtyPerCarton")}
          {renderInput("Supplier Name", "supplierName")}
          {renderInput("Drug License", "drugLicense")}
          {renderInput("License Validity Date", "licenseValidityDate", "date")}
          {renderInput("Selling Price (USD)", "sellingPrice")}
          {renderInput("LC", "lc")}
          {renderInput("Pob", "pob")}
          {renderInput("Tax Selling Price (USD)",)}
          {renderInput("Remarks", "remarks")}
        </div>

        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow cursor-pointer"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => navigate("/productmanagerlayout/product")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddProduct;
