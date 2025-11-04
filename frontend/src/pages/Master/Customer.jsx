import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { UserPlus, Upload, Trash2, Eye, X, Edit, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { getVisiblePages } from "../../utils/useVisiblePages";

// Import reusable components
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";

// Import API functions
import {
  fetchProvinces as fetchProvincesAPI,
  fetchMRList as fetchMRListAPI,
  fetchZones as fetchZonesAPI,
  fetchBusinessTypes as fetchBusinessTypesAPI,
} from "../../utils/customerUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const customersPerPage = 9;

// Custom hook for customer form management
const useCustomerForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    customerCode: initialCustomerCode || "",
    date: "",
    medicalRepName: "",
    medicalRepId: "",
    name: "",
    typeOfBusiness: "",
    customerNumber: "",
    address: "",
    zone: "",
    province: "",
    remark: "",
    _id: null,
  });

  const [errors, setErrors] = useState({});

  const handleChange = useCallback(
    (name, value) => {
      setForm((prev) => ({ ...prev, [name]: value }));
      // Clear error when field is changed
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
    },
    [errors]
  );

  const handleDropdownChange = useCallback(
    (field, selectedOption) => {
      const value = selectedOption ? selectedOption.value : "";
      handleChange(field, value);
    },
    [handleChange]
  );

  const handleNumericInput = useCallback(
    (e, field) => {
      const value = e.target.value;
      if (value === "" || /^\d+$/.test(value)) {
        handleChange(field, value);
      }
    },
    [handleChange]
  );

  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!form.name?.trim()) newErrors.name = "Customer name is required";
    if (!form.typeOfBusiness)
      newErrors.typeOfBusiness = "Business type is required";
    if (!form.medicalRepId)
      newErrors.medicalRepId = "Medical representative is required";
    if (!form.zone) newErrors.zone = "Zone is required";
    if (!form.province) newErrors.province = "Province is required";
    if (!form.date) newErrors.date = "Date is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const resetForm = useCallback(() => {
    setForm({
      customerCode: initialCustomerCode || "",
      date: "",
      medicalRepName: "",
      medicalRepId: "",
      name: "",
      typeOfBusiness: "",
      customerNumber: "",
      address: "",
      zone: "",
      province: "",
      remark: "",
      _id: null,
    });
    setErrors({});
  }, [initialCustomerCode]);

  return {
    form,
    errors,
    handleChange,
    handleDropdownChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
  };
};
const Customer = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [nextCustomerCode, setNextCustomerCode] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);

  // State for dropdown data
  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Use custom hook for form management
  const {
    form,
    errors,
    handleChange,
    handleDropdownChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
  } = useCustomerForm();

  // Fetch initial data
  useEffect(() => {
    fetchCustomers();
    fetchDropdownData();
  }, []);

  const fetchDropdownData = async () => {
    try {
      const [provincesResult, mrResult, zonesResult, businessTypesResult] =
        await Promise.all([
          fetchProvincesAPI(),
          fetchMRListAPI(),
          fetchZonesAPI(),
          fetchBusinessTypesAPI(),
        ]);

      if (provincesResult.success) setProvinces(provincesResult.data || []);
      if (mrResult.success) setMrList(mrResult.data || []);
      if (zonesResult.success) setZones(zonesResult.data || []);
      if (businessTypesResult.success)
        setBusinessTypes(businessTypesResult.data || []);
    } catch (error) {
      console.error("Error fetching dropdown data:", error);
      showToast("error", "Failed to load dropdown data");
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/customers`);
      if (!response.ok) throw new Error("Failed to fetch customers");
      const data = await response.json();
      setCustomers(data.customers || []);
      setNextCustomerCode(data.nextCustomerCode || null);
    } catch (err) {
      showToast("error", err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Filter customers by search term
  const filteredCustomers = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    return customers.filter((customer) => {
      const nameMatch = customer.name?.toLowerCase().includes(lowerSearch);
      const businessMatch = customer.typeOfBusiness
        ?.toLowerCase()
        .includes(lowerSearch);
      const mrMatch = customer.medicalRepName
        ?.toLowerCase()
        .includes(lowerSearch);
      const addressMatch = customer.address
        ?.toLowerCase()
        .includes(lowerSearch);
      const zoneMatch = customer.zone?.toLowerCase().includes(lowerSearch);
      const provinceMatch = customer.province
        ?.toLowerCase()
        .includes(lowerSearch);
      const dateMatch = customer.date?.toLowerCase().includes(lowerSearch);

      return (
        nameMatch ||
        businessMatch ||
        mrMatch ||
        addressMatch ||
        zoneMatch ||
        provinceMatch ||
        dateMatch
      );
    });
  }, [customers, searchTerm]);

  // Pagination logic
  const totalPages = Math.ceil(filteredCustomers.length / customersPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentCustomers = filteredCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
  );

  // Selection handlers
  const toggleSelect = useCallback((customer) => {
    setSelected((prev) =>
      prev.some((c) => c.id === customer._id)
        ? prev.filter((c) => c.id !== customer._id)
        : [...prev, { id: customer._id, name: customer.name }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentCustomers.map((customer) => ({
              id: customer._id,
              name: customer.name,
            }))
          : []
      );
    },
    [currentCustomers]
  );

  // Delete handlers
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> customer(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/customers`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected customers deleted successfully");
          fetchCustomers();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    }
  };

  const deleteCustomer = async (customer) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${customer.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/customers/${customer._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Customer ${customer.name} deleted successfully`
          );
          fetchCustomers();
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };

  // View and Edit handlers
  const handleView = useCallback(
    (customer) => {
      setForm(customer);
      setIsViewModalOpen(true);
    },
    [setForm]
  );

  const handleEdit = useCallback(
    (customer) => {
      // Find the actual MR ID from the MR list
      let actualMrId = customer.medicalRepId || "";
      if (!actualMrId && customer.medicalRepName && mrList.length > 0) {
        const foundMr = mrList.find(
          (mr) =>
            (mr.medicalRepName || mr.name || "").toLowerCase() ===
            customer.medicalRepName.toLowerCase()
        );
        actualMrId = foundMr?._id || foundMr?.id || "";
      }

      setForm({
        customerCode: customer.customerCode || "",
        date: customer.date || "",
        medicalRepName: customer.medicalRepName || "",
        medicalRepId: actualMrId,
        name: customer.name || "",
        typeOfBusiness: customer.typeOfBusiness || "",
        customerNumber: customer.customerNumber || "",
        address: customer.address || "",
        zone: customer.zone || "",
        province: customer.province || "",
        remark: customer.remark || "",
        _id: customer._id || null,
      });
      setIsEditModalOpen(true);
    },
    [mrList, setForm]
  );

  // Status handler
  const handleStatusToggle = async (id) => {
    try {
      const customer = customers.find((c) => c._id === id);
      if (!customer) return;

      const updatedCustomer = { ...customer, enabled: !customer.enabled };
      const response = await fetch(`${backendUrl}/api/customers/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: updatedCustomer.enabled }),
      });

      if (!response.ok) throw new Error("Failed to update customer");

      const data = await response.json();
      setCustomers((prev) =>
        prev.map((c) => (c._id === id ? { ...c, enabled: data.enabled } : c))
      );
      showToast(
        "success",
        `Customer ${
          updatedCustomer.enabled ? "enabled" : "disabled"
        } successfully`
      );
    } catch (err) {
      console.error("Error updating customer:", err);
      showToast("error", "Failed to update customer status");
    }
  };

  // MR change handler
  const handleMRChange = useCallback(
    (selectedOption) => {
      const mrId = selectedOption ? selectedOption.value : "";
      const selectedMR = mrList.find((mr) => (mr._id || mr.id) === mrId);

      setForm((prev) => ({
        ...prev,
        medicalRepId: mrId,
        medicalRepName: selectedMR
          ? selectedMR.medicalRepName ||
            selectedMR.name ||
            selectedMR.staffName ||
            ""
          : "",
      }));
    },
    [mrList, setForm]
  );

  // Update customer
  const handleCustomerUpdate = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast("error", "Please fill all required fields");
      return;
    }

    try {
      const updatePayload = {
        customerCode: form.customerCode,
        date: form.date,
        medicalRepName: form.medicalRepName,
        medicalRepId: form.medicalRepId,
        name: form.name,
        typeOfBusiness: form.typeOfBusiness,
        customerNumber: form.customerNumber,
        address: form.address,
        zone: form.zone,
        province: form.province,
        remark: form.remark,
      };

      const res = await axios.put(
        `${backendUrl}/api/customers/${form._id}`,
        updatePayload
      );

      if (res.status === 200) {
        showToast("success", `Customer ${form.name} updated successfully`);
        setIsEditModalOpen(false);
        resetForm();
        fetchCustomers();
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast("error", "Failed to update customer.");
    }
  };

  // Import functionality
  const handleImportClick = () => {
    if (mrList.length === 0) {
      showToast(
        "error",
        "No Medical Representatives found. Please add at least one MR first."
      );
      return;
    }
    setShowImportModal(true);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          showToast("warning", "Excel file is empty");
          return;
        }

        setParsedData(jsonData);
        showToast("success", "File parsed successfully");
      } catch (error) {
        console.error("Error parsing file:", error);
        showToast("error", "Failed to parse file");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCustomerImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    if (mrList.length === 0) {
      showToast(
        "error",
        "Cannot import customers: No Medical Representatives found."
      );
      return;
    }

    setIsUploading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/api/customers/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Customers imported successfully!"
        );
        setShowImportModal(false);
        setParsedData([]);
        fetchCustomers();
      }
    } catch (err) {
      console.error("Import error:", err);
      showToast("error", "Failed to import customers.");
    } finally {
      setIsUploading(false);
    }
  };

  // Search input focus handler
  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  // Memoized dropdown options
  const provinceOptions = useMemo(() => {
    return provinces.map((province) => ({
      value: province.name || province,
      label: province.name || province,
    }));
  }, [provinces]);

  const mrOptions = useMemo(() => {
    return mrList.map((mr) => {
      const mrId = mr._id || mr.id || "";
      const mrName = mr.medicalRepName || mr.name || mr.staffName || "Unknown";
      return {
        value: mrId,
        label: mrName,
      };
    });
  }, [mrList]);

  const zoneOptions = useMemo(() => {
    return zones.map((zone, index) => ({
      value: typeof zone === "string" ? zone : zone.name || `Zone ${index}`,
      label: typeof zone === "string" ? zone : zone.name || `Zone ${index}`,
    }));
  }, [zones]);

  const businessTypeOptions = useMemo(() => {
    return businessTypes.map((type) => {
      const name =
        typeof type === "string" ? type : type.name || type.label || "Unknown";
      return {
        value: name,
        label: name,
      };
    });
  }, [businessTypes]);

  // Helper function
  const capitalizeFirstLetter = (str) => {
    if (!str) return "";
    return str.toString().charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="p-6">
      <div className="container">
        {/* Header Section */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-3">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() =>
                navigate("/masterlayout/customer/new", {
                  state: { customerCode: nextCustomerCode },
                })
              }
            >
              <UserPlus size={18} /> Add New Customer
            </button>

            <button
              onClick={handleImportClick}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Customer
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
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {filteredCustomers.length}
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

        {/* Customers Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-4">
                    {currentCustomers.length > 0 && (
                      <input
                        type="checkbox"
                        checked={
                          selected.length === currentCustomers.length &&
                          currentCustomers.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span className="text-sm font-medium">Name</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Business Type</th>
                <th className="p-3 text-sm font-medium">MR Name</th>
                <th className="p-3 text-sm font-medium">Address</th>
                <th className="p-3 text-sm font-medium">Zone</th>
                <th className="p-3 text-sm font-medium">Province</th>
                <th className="p-3 text-sm font-medium">Joining Date</th>
                <th className="p-3 text-sm font-medium">Status</th>
                <th className="p-3 text-sm font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-500">
                    No customers found.
                  </td>
                </tr>
              ) : (
                currentCustomers.map((customer, index) => (
                  <tr
                    key={customer._id}
                    className={`hover:bg-gray-50 ${
                      index < currentCustomers.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === customer._id)}
                          onChange={() => toggleSelect(customer)}
                        />
                        <span className="capitalize">{customer.name}</span>
                      </div>
                    </td>
                    <td className="p-3 capitalize">
                      {customer.typeOfBusiness}
                    </td>
                    <td className="p-3 capitalize">
                      {customer.medicalRepName}
                    </td>
                    <td className="p-3 capitalize">{customer.address}</td>
                    <td className="p-3 capitalize">{customer.zone}</td>
                    <td className="p-3 capitalize">{customer.province}</td>
                    <td className="p-3">
                      {formatDateToReadable(customer.date) || "--"}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleStatusToggle(customer._id)}
                        className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                          customer.enabled
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {customer.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                        onClick={() => handleView(customer)}
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => handleEdit(customer)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={() => deleteCustomer(customer)}
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
          {currentCustomers.length > 0 && (
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

        {/* Import Modal */}
        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowImportModal(false)}
              />
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">Import Customers</h2>

                {mrList.length === 0 && (
                  <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                    <p className="text-red-700 text-sm">
                      <strong>Warning:</strong> No Medical Representatives
                      found.
                    </p>
                  </div>
                )}

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
                    onClick={handleCustomerImport}
                    disabled={isUploading || mrList.length === 0}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading || mrList.length === 0
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

        {/* View Modal */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  View Customer
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Customer Code
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.customerCode}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.name}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Customer Number
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.customerNumber || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Type of Business
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.typeOfBusiness}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Medical Rep Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.medicalRepName || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Address
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.address || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Zone
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.zone || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Province
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.province || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Joining Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.date ? formatDateToReadable(form.date) : "N/A"}
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-600">
                      Remarks
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 min-h-[80px]">
                      {form.remark || "—"}
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

        {/* Edit Modal - Structured like Product Edit Modal */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => {
                  setIsOpen(false);
                }}
              />
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    resetForm();
                  }}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold mb-4">Edit Customer</h2>

                <form onSubmit={handleCustomerUpdate}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer Code */}
                    <div>
                      <InputField
                        label="Customer Code"
                        name="customerCode"
                        value={form.customerCode}
                        disabled={true}
                        className="bg-gray-100 text-gray-700 border rounded px-3 py-2 border-gray-300"
                      />
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Name
                      </label>
                      <InputField
                        type="text"
                        value={form.name}
                        onChange={(e) => handleChange("name", e.target.value)}
                        error={errors.name}
                        className="capitalize px-2 py-2 border-gray-300 border rounded-lg"
                      />
                    </div>

                    {/* Customer Number */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Customer Number
                      </label>
                      <InputField
                        type="text"
                        value={form.customerNumber}
                        onChange={(e) =>
                          handleNumericInput(e, "customerNumber")
                        }
                        placeholder="Enter numbers only"
                      />
                    </div>

                    {/* Type of Business */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Type of Business
                      </label>
                      <div className="rounded-lg">
                        <SearchableDropdown
                          options={businessTypeOptions}
                          value={
                            businessTypeOptions.find(
                              (option) => option.value === form.typeOfBusiness
                            ) || null
                          }
                          onChange={(selectedOption) =>
                            handleDropdownChange(
                              "typeOfBusiness",
                              selectedOption
                            )
                          }
                          placeholder="Select Business Type"
                        />
                      </div>
                      {errors.typeOfBusiness && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.typeOfBusiness}
                        </p>
                      )}
                    </div>

                    {/* Medical Representative */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Medical Representative
                      </label>
                      <div className="rounded-lg">
                        <SearchableDropdown
                          options={mrOptions}
                          value={
                            mrOptions.find(
                              (option) => option.value === form.medicalRepId
                            ) || null
                          }
                          onChange={handleMRChange}
                          placeholder="Select MR"
                        />
                      </div>
                      {errors.medicalRepId && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.medicalRepId}
                        </p>
                      )}
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Address
                      </label>
                      <InputField
                        type="text"
                        value={form.address}
                        onChange={(e) =>
                          handleChange("address", e.target.value)
                        }
                        className="capitalize px-2 py-2 border-gray-300 border rounded-lg"
                      />
                    </div>

                    {/* Zone */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Zone
                      </label>
                      <div className="rounded-lg">
                        <SearchableDropdown
                          options={zoneOptions}
                          value={
                            zoneOptions.find(
                              (option) => option.value === form.zone
                            ) || null
                          }
                          onChange={(selectedOption) =>
                            handleDropdownChange("zone", selectedOption)
                          }
                          placeholder="Select Zone"
                        />
                      </div>
                      {errors.zone && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.zone}
                        </p>
                      )}
                    </div>

                    {/* Province */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Province
                      </label>
                      <div className="rounded-lg">
                        <SearchableDropdown
                          options={provinceOptions}
                          value={
                            provinceOptions.find(
                              (option) => option.value === form.province
                            ) || null
                          }
                          onChange={(selectedOption) =>
                            handleDropdownChange("province", selectedOption)
                          }
                          placeholder="Select Province"
                        />
                      </div>
                      {errors.province && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.province}
                        </p>
                      )}
                    </div>

                    {/* Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Joining Date
                      </label>
                      <div className="rounded-lg border-gray-300 border">
                        <DatePicker
                          selected={form.date ? new Date(form.date) : null}
                          onChange={(date) =>
                            handleChange("date", date ? date.toISOString() : "")
                          }
                          dateFormat="yyyy-MM-dd"
                          placeholderText="Select date"
                          className="w-full px-3 py-2 border-none rounded-lg focus:ring-0"
                        />
                      </div>
                      {errors.date && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.date}
                        </p>
                      )}
                    </div>

                    {/* Remarks */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600">
                        Remarks
                      </label>
                      <div className="rounded-lg border-gray-300 border">
                        <textarea
                          value={form.remark}
                          onChange={(e) =>
                            handleChange("remark", e.target.value)
                          }
                          className="w-full rounded-lg border-gray-300 p-3"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        resetForm();
                      }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Update
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default Customer;
