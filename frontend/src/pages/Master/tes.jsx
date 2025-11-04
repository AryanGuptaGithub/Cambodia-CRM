import React, { useState, useEffect, useMemo, useRef } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import SampleExcelDownloadCustomer from "../../excels/SampleExcelDownloadCustomer";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";

// Import the reusable components and functions
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import {
  fetchProvinces as fetchProvincesAPI,
  fetchMRList as fetchMRListAPI,
  fetchZones as fetchZonesAPI,
  fetchBusinessTypes as fetchBusinessTypesAPI,
  validateCustomerForm,
  initialFormState,
  getTodayDate,
} from "../../utils/customerUtil"; // Adjust the path as needed

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const customersPerPage = 7;

const Customer = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [nextCustomerCode, setNextCustomerCode] = useState(null);
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  // State for dropdown data
  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [provincesLoading, setProvincesLoading] = useState(false);
  const [mrListLoading, setMrListLoading] = useState(false);
  const [zonesLoading, setZonesLoading] = useState(false);

  const [form, setForm] = useState({
    customerCode: "",
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

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  // State for business types
  const [businessTypes, setBusinessTypes] = useState([]);
  const [businessTypesLoading, setBusinessTypesLoading] = useState(false);

  // Check if MR list is empty
  const isMRListEmpty = mrList.length === 0;

  // Fetch business types from backend
  const fetchBusinessTypes = async () => {
    try {
      setBusinessTypesLoading(true);
      const result = await fetchBusinessTypesAPI();
      if (result.success) {
        setBusinessTypes(Array.isArray(result.data) ? result.data : []);
      } else {
        showToast("error", result.error || "Failed to load business types");
        setBusinessTypes([]);
      }
    } catch (error) {
      console.error("Error fetching business types:", error);
      showToast("error", "Failed to load business types");
      setBusinessTypes([]);
    } finally {
      setBusinessTypesLoading(false);
    }
  };

  // Call it in useEffect
  useEffect(() => {
    fetchCustomers();
    fetchProvinces();
    fetchMRList();
    fetchZones();
    fetchBusinessTypes();
  }, []);

  // Business type options
  const businessTypeOptions = useMemo(() => {
    const options = [{ value: "", label: "Select Business Type" }];

    if (Array.isArray(businessTypes)) {
      businessTypes.forEach((type) => {
        const name =
          typeof type === "string"
            ? type
            : type.name || type.label || "Unknown";
        options.push({
          value: name,
          label: name,
        });
      });
    }

    return options;
  }, [businessTypes]);

  // Fetch dropdown data using reusable functions
  const fetchProvinces = async () => {
    try {
      setProvincesLoading(true);
      const result = await fetchProvincesAPI();
      if (result.success) {
        setProvinces(result.data || []);
      }
    } catch (error) {
      console.error("Error fetching provinces:", error);
    } finally {
      setProvincesLoading(false);
    }
  };

  const fetchMRList = async () => {
    try {
      setMrListLoading(true);
      const result = await fetchMRListAPI();
      if (result.success) {
        const mrData = Array.isArray(result.data) ? result.data : [];
        setMrList(mrData);

        // REMOVED: Don't show toast here to avoid duplicates
      } else {
        setMrList([]);
      }
    } catch (error) {
      console.error("Error fetching MR list:", error);
      setMrList([]);
    } finally {
      setMrListLoading(false);
    }
  };

  const fetchZones = async () => {
    try {
      setZonesLoading(true);
      const result = await fetchZonesAPI();
      if (result.success) {
        setZones(Array.isArray(result.data) ? result.data : []);
      }
    } catch (error) {
      console.error("Error fetching zones:", error);
      setZones([]);
    } finally {
      setZonesLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/customers`);
      if (!response.ok) throw new Error("Failed to fetch customers");
      const data = await response.json();
      setCustomers(data.customers || []);
      if (data.nextCustomerCode) {
        setNextCustomerCode(data.nextCustomerCode);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredCustomers = customers.filter(
    (r) =>
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.typeOfBusiness?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.medicalRepName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.zone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.province?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.date?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination calculations
  const totalPages = Math.ceil(filteredCustomers.length / customersPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentCustomers = filteredCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
  );

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage, "...", totalPages];
  }

  // Memoized dropdown options
  const provinceOptions = useMemo(() => {
    return [
      { value: "", label: "Select Province" },
      ...provinces.map((province) => ({
        value: province.name || province,
        label: province.name || province,
      })),
    ];
  }, [provinces]);

  const mrOptions = useMemo(() => {
    return [
      { value: "", label: "Select MR" },
      ...mrList.map((mr) => {
        // Handle different possible formats of MR data
        const mrId = mr._id || mr.id || "";
        const mrName =
          mr.medicalRepName || mr.name || mr.staffName || "Unknown";

        return {
          value: mrId,
          label: mrName,
        };
      }),
    ];
  }, [mrList]);

  const zoneOptions = useMemo(() => {
    return [
      { value: "", label: "Select Zone" },
      ...zones.map((zone, index) => ({
        value: typeof zone === "string" ? zone : zone.name || `Zone ${index}`,
        label: typeof zone === "string" ? zone : zone.name || `Zone ${index}`,
      })),
    ];
  }, [zones]);

  // Select/unselect a customer by id
  const toggleSelect = (customer) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === customer._id);

      if (exists) {
        return prev.filter((c) => c.id !== customer._id);
      } else {
        return [...prev, { id: customer._id, name: customer.name }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentCustomers.map((s) => ({
        id: s._id,
        name: s.name,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> customers`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/customers`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected customers deleted successfully");
          const updated = await fetch(`${backendUrl}/api/customers`);
          const data = await updated.json();
          setCustomers(data.customers || []);
          setNextCustomerCode(data.nextCustomerCode);
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    } else {
      setSelected([]);
    }
  };

  // Open edit modal with selected customer data - FIXED
  const editCustomer = async (customer) => {
    // Find the actual MR ID from the MR list based on the medicalRepName
    let actualMrId = customer.medicalRepId || "";

    // If medicalRepId is not available, try to find it by medicalRepName
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
      medicalRepId: actualMrId, // Use the found ID
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
  };

  // Open view modal with selected customer data
  const handleView = (customer) => {
    setForm({ ...customer });
    setIsViewModalOpen(true);
  };

  const deleteCustomer = async (customer) => {
    if (!customer._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${customer.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/customers/${customer._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Customer <b>${customer.name}</b> deleted successfully`
          );
          const updated = await axios.get(`${backendUrl}/api/customers`);
          const customers = updated.data.customers || [];
          setCustomers(customers);
          setNextCustomerCode(updated.data.nextCustomerCode);
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };

  // Handle Import CSV button click with MR list validation
  const handleImportClick = () => {
    if (isMRListEmpty) {
      // Show the message ONLY HERE - not in fetchMRList
      showToast(
        "error",
        "No Medical Representatives found. Please add at least one MR first."
      );
      return;
    }
    setShowImportModal(true);
  };

  // File upload and parsing logic for import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      const requiredHeaders = [
        "customer code",
        "date",
        "medical representative name",
        "customer name in english",
        "types of business",
        "customer number",
        "customer address",
        "zone",
        "province",
        "remark",
      ];

      let headerRowIndex = -1;
      let matchedHeaders = [];

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          cell?.toString().trim().toLowerCase()
        );
        const matched = requiredHeaders.filter((header) =>
          row.includes(header)
        );
        if (matched.length >= 5) {
          headerRowIndex = i;
          matchedHeaders = matched;
          break;
        }
      }

      if (
        headerRowIndex === -1 ||
        matchedHeaders.length < requiredHeaders.length
      ) {
        const missingHeaders = requiredHeaders.filter(
          (header) => !matchedHeaders.includes(header)
        );
        const errorMsg = `❌ Required headers not found in Excel file:\n\n${missingHeaders.join(
          ", "
        )}`;
        showToast("error", errorMsg);
        return;
      }

      const rawHeaders = rows[headerRowIndex];
      const headersMap = {};
      rawHeaders.forEach((header, index) => {
        if (!header) return;
        const cleaned = header.toString().trim().toLowerCase();
        headersMap[index] = cleaned;
      });

      const dataRows = rows.slice(headerRowIndex + 1);
      if (dataRows.length == 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      const mappedData = dataRows
        .map((row, rowIndex) => {
          const item = {};
          Object.entries(headersMap).forEach(([index, key]) => {
            item[key] = row[index] || "";
          });

          return {
            customerCode: item["customer code"],
            date: parseExcelDate(item["date"]),
            medicalRepName: item["medical representative name"],
            name: item["customer name in english"],
            typeOfBusiness: item["types of business"],
            customerNumber: item["customer number"],
            address: item["customer address"],
            zone: item["zone"],
            province: item["province"],
            remark: item["remark"],
          };
        })
        .filter((entry, index) => {
          const keep = !!entry.customerCode;
          return keep;
        });
      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  const parseExcelDate = (value) => {
    if (!value) return null;

    if (typeof value === "number") {
      const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return jsDate.toISOString();
    }

    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  // Import parsed customers to backend
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    // Additional validation before import
    if (isMRListEmpty) {
      showToast(
        "error",
        "Cannot import customers: No Medical Representatives found. Please add at least one MR first."
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
        const response = await fetch(`${backendUrl}/api/customers`);
        const data = await response.json();
        setCustomers(data.customers || []);
        setNextCustomerCode(data.nextCustomerCode);
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");

        showToast("error", cleanMessage || "Failed to import customers.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handlerEnabledCustomer = async (id) => {
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
    } catch (err) {
      console.error("Error updating customer:", err);
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  // ✅ Safe, unified handler for all inputs
  const handleInputChange = (nameOrEvent, maybeValue) => {
    if (nameOrEvent?.target) {
      const { name, value } = nameOrEvent.target;
      setForm((prev) => ({ ...prev, [name]: value }));
    } else {
      const name = nameOrEvent;
      const value = maybeValue;
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  // ✅ Handle Medical Representative selection - FIXED
  const handleMRChange = (mrId) => {
    const selectedMR = mrList.find((mr) => (mr._id || mr.id) === mrId);
    if (selectedMR) {
      setForm((prev) => ({
        ...prev,
        medicalRepId: mrId,
        medicalRepName:
          selectedMR.medicalRepName ||
          selectedMR.name ||
          selectedMR.staffName ||
          "",
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        medicalRepId: "",
        medicalRepName: "",
      }));
    }
  };

  // ✅ Validate and update customer
  const handleUpdateCustomer = async (e) => {
    e.preventDefault();

    // Validation for required fields
    if (!form.zone) {
      showToast("error", "Zone is required.");
      return;
    }
    if (!form.province) {
      showToast("error", "Province is required.");
      return;
    }
    if (!form.typeOfBusiness) {
      showToast("error", "Type of Business is required.");
      return;
    }
    if (!form.medicalRepId) {
      showToast("error", "Medical Representative is required.");
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
        showToast(
          "success",
          `Customer <b>${form.name}</b> updated successfully`
        );
        setIsEditModalOpen(false);

        const updated = await fetch(`${backendUrl}/api/customers`);
        const data = await updated.json();
        setCustomers(data.customers || []);
        setNextCustomerCode(data.nextCustomerCode);
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast("error", "Failed to update customer.");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() =>
              navigate("/masterlayout/customer/new", {
                state: { customerCode: nextCustomerCode },
              })
            }
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Customer
          </button>

          <button
            onClick={handleImportClick}
            disabled={isMRListEmpty}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
              isMRListEmpty
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            <Upload size={18} /> Import CSV
          </button>
          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => handleDeleteSelected()}
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
        <div className="flex justify-between items-center mb-4 gap-8">
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

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">
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
                  <span>Name</span>
                </div>
              </th>
              <th className="p-3 text-sm font-medium">Business</th>
              <th className="p-3 text-sm font-medium">medicalRepName</th>
              <th className="p-3 text-sm font-medium">Address</th>
              <th className="p-3 text-sm font-medium">Zone</th>
              <th className="p-3 text-sm font-medium">Province</th>
              <th className="p-3 text-sm font-medium">Joining Date</th>
              <th className="p-3 text-sm font-medium">Status</th>
              <th className="p-3 text-sm font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentCustomers.length > 0 ? (
              currentCustomers.map((customer, index) => (
                <tr
                  key={customer._id || index}
                  className={`hover:bg-gray-50 ${
                    (index + 1) % customersPerPage === 0 ||
                    index + 1 === currentCustomers.length
                      ? ""
                      : "border-b"
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
                  <td className="p-3">{customer.typeOfBusiness}</td>
                  <td className="p-3 capitalize">{customer.medicalRepName}</td>
                  <td className="p-3 capitalize">{customer.address}</td>
                  <td className="p-3 capitalize">{customer.zone}</td>
                  <td className="p-3 capitalize">{customer.province}</td>
                  <td className="p-3">{formatDateToReadable(customer.date)}</td>
                  <td>
                    <button
                      onClick={() => handlerEnabledCustomer(customer._id)}
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
                      onClick={() => handleView(customer)}
                      className="text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => editCustomer(customer)}
                      className="text-green-600 hover:text-green-800 cursor-pointer"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => deleteCustomer(customer)}
                      className="text-red-600 hover:text-red-800 cursor-pointer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="p-3 text-center">
                  No customer records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {currentCustomers.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>
            {visiblePages.map((page, idx) =>
              page === "..." ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-3 py-1 text-gray-500 select-none cursor-pointer"
                >
                  ...
                </span>
              ) : (
                <button
                  key={`page-${page}`}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                    currentPage === page
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              )
            )}
            <button
              onClick={() => {
                setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>

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
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Customer
              </h2>

              {/* Show Sample Excel Download only if MR list is not empty */}
              {isSampleFile && !isMRListEmpty && (
                <SampleExcelDownloadCustomer />
              )}

              {/* Show warning message if MR list is empty - ONLY IN MODAL */}
              {isMRListEmpty && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-red-700 text-sm">
                    <strong>Warning:</strong> No Medical Representatives found.
                    Please add at least one MR first.
                  </p>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-gray-700 mb-2">File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  disabled={isMRListEmpty}
                  className={`block w-full border rounded-lg px-3 py-2 ${
                    isMRListEmpty
                      ? "bg-gray-100 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                />
              </div>
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
                  onClick={handleImport}
                  disabled={isUploading || isMRListEmpty}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    isUploading || isMRListEmpty
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

      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />

            {/* Modal content */}
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              {/* Close Button */}
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Customer
              </h2>

              {/* Edit Form */}
              <form
                onSubmit={handleUpdateCustomer}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {/* Customer Code (Read-only) */}
                <InputField
                  label="Customer Code"
                  name="customerCode"
                  value={form.customerCode}
                  disabled={true}
                  className="bg-gray-100 text-gray-500 cursor-not-allowed"
                />

                {/* Name */}
                <InputField
                  label="Name"
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  className="capitalize"
                />

                {/* Customer Number (numeric only) */}
                <InputField
                  label="Customer Number"
                  name="customerNumber"
                  type="text"
                  value={form.customerNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, ""); // only digits
                    handleInputChange("customerNumber", value);
                  }}
                  placeholder="Enter numbers only"
                  className="capitalize"
                />

                {/* Type of Business */}
                <SearchableDropdown
                  label="Type of Business"
                  value={form.typeOfBusiness}
                  onChange={(value) =>
                    handleInputChange("typeOfBusiness", value)
                  }
                  options={businessTypeOptions}
                  placeholder="Select Business Type"
                  required
                  loading={businessTypesLoading}
                />

                {/* Medical Representative - FIXED */}
                <SearchableDropdown
                  label="Medical Representative"
                  value={form.medicalRepId} // Use ID as value
                  onChange={handleMRChange} // Use the fixed handler
                  options={mrOptions}
                  placeholder="Select MR"
                  required
                  loading={mrListLoading}
                />

                {/* Address */}
                <InputField
                  label="Address"
                  name="address"
                  value={form.address}
                  onChange={handleInputChange}
                  className="capitalize"
                />

                {/* Zone */}
                <SearchableDropdown
                  label="Zone"
                  value={form.zone}
                  onChange={(value) => handleInputChange("zone", value)}
                  options={zoneOptions}
                  placeholder="Select Zone"
                  required
                  loading={zonesLoading}
                />

                {/* Province */}
                <SearchableDropdown
                  label="Province"
                  value={form.province}
                  onChange={(value) => handleInputChange("province", value)}
                  options={provinceOptions}
                  placeholder="Select Province"
                  required
                  loading={provincesLoading}
                />

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <DatePicker
                    selected={form.date ? new Date(form.date) : null}
                    onChange={(date) => handleInputChange("date", date)}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Remarks */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Remark
                  </label>
                  <textarea
                    name="remark"
                    value={form.remark}
                    onChange={handleInputChange}
                    placeholder="Enter remarks"
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent capitalize resize-vertical"
                  />
                </div>
              </form>

              {/* Action Buttons */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateCustomer}
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
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
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
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.customerNumber}
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
                    {form.medicalRepName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Address
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.address}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Zone
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.zone}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Province
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.province}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.date)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Customer Remark
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize min-h-[80px]">
                    {form.remark?.trim() ? form.remark : "No Remarks"}
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
};

export default Customer;
