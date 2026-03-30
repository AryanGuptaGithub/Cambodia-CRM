import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  UserPlus,
  Upload,
  Trash2,
  Eye,
  X,
  Edit,
  Search,
  Download,
  Menu,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { getVisiblePages } from "../../utils/useVisiblePages";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";
import {
  fetchProvinces as fetchProvincesAPI,
  fetchMRList as fetchMRListAPI,
  fetchZones as fetchZonesAPI,
  fetchBusinessTypes as fetchBusinessTypesAPI,
} from "../../utils/customerUtil";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const isSampleDownloadFile =
  import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";
const isWithCustomerCode =
  import.meta.env.VITE_IS_WITH_CUSTOMER_CODE === "true";

const customersPerPage = 10;

axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

function capitalizeFirstLetter(str) {
  if (!str) return "";
  str = str.toString();
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const formatDateToYYYYMMDD = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateForDisplay = (dateString) => {
  if (!dateString) return "--";
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match.map(Number);
    if (month >= 1 && month <= 12) return `${day} ${MONTHS[month - 1]} ${year}`;
  }
  return "--";
};

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

  const toTitleCase = (str) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };
  const toLowerCase = (str) => (str ? str.toLowerCase() : "");

  const handleChange = useCallback(
    (name, value) => {
      if (name === "name") value = capitalizeFirstLetter(value);
      setForm((prev) => ({ ...prev, [name]: value }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    },
    [errors],
  );

  const handleNumericInput = useCallback(
    (e, field) => {
      const value = e.target.value;
      if (value === "" || /^\d+$/.test(value)) handleChange(field, value);
    },
    [handleChange],
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
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
    toTitleCase,
    toLowerCase,
  };
};

// Import Modal (unchanged)
const ImportModal = ({ isOpen, onClose, isSampleFile, mrList }) => {
  // ... (same as before)
};

// Main Customer Component
const Customer = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);
  const [nextCustomerCode, setNextCustomerCode] = useState(null);
  const inputRef = useRef(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [isDropdownsLoading, setIsDropdownsLoading] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [errors, setErrors] = useState({});

  const [isDuplicateNumber, setIsDuplicateNumber] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const duplicateCheckTimeoutRef = useRef(null);

  const {
    form,
    handleChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
    toTitleCase,
    toLowerCase,
  } = useCustomerForm();

  const displayValue = (value) => (value ? toTitleCase(value) : "--");

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isEditModalOpen) {
      setIsDuplicateNumber(false);
      setCheckingDuplicate(false);
      if (duplicateCheckTimeoutRef.current)
        clearTimeout(duplicateCheckTimeoutRef.current);
    }
  }, [isEditModalOpen]);

  useEffect(() => {
    if (!searchTerm) return;
    const timer = setTimeout(() => setCurrentPage(1), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchDropdownData();
  }, []);

  const fetchDropdownData = async () => {
    try {
      setIsDropdownsLoading(true);
      const [pRes, mrRes, zRes, btRes] = await Promise.all([
        fetchProvincesAPI(),
        fetchMRListAPI(),
        fetchZonesAPI(),
        fetchBusinessTypesAPI(),
      ]);
      if (pRes.success) setProvinces(pRes.data || []);
      if (mrRes.success) setMrList(mrRes.data || []);
      if (zRes.success) setZones(zRes.data || []);
      if (btRes.success) setBusinessTypes(btRes.data || []);
    } catch (err) {
      console.error("Dropdown fetch error:", err);
      showToast("error", "Failed to load dropdown data");
    } finally {
      setIsDropdownsLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/customers`, {
        params: {
          page: currentPage,
          limit: customersPerPage,
          search: searchTerm,
        },
      });
      if (response.data.ok) {
        setCustomers(response.data.customers || []);
        setTotalCustomers(response.data.total || 0);
        setTotalPages(response.data.totalPages || 1);
        setNextCustomerCode(response.data.nextCustomerCode || null);
      }
    } catch (err) {
      showToast("error", err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = useCallback((customer) => {
    setSelected((prev) =>
      prev.some((c) => c.id === customer._id)
        ? prev.filter((c) => c.id !== customer._id)
        : [...prev, { id: customer._id, name: customer.name }],
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked ? customers.map((c) => ({ id: c._id, name: c.name })) : [],
      );
    },
    [customers],
  );

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
          data: { ids: selected.map((s) => s.id) },
        });
        if (res.status === 200) {
          showToast("success", "Selected customers deleted successfully");
          fetchCustomers();
          setSelected([]);
        }
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message ||
            "Failed to delete selected customers.",
        );
      }
    }
  };

  const deleteCustomer = async (customer) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${customer.name}</b> (Code: ${customer.customerCode})?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/customers/${customer._id}`,
        );
        if (res.status === 200) {
          showToast("success", `${customer.name} deleted successfully`);
          fetchCustomers();
        }
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete customer.",
        );
      }
    }
  };

  const handleView = useCallback(
    (customer) => {
      setForm(customer);
      setIsViewModalOpen(true);
    },
    [setForm],
  );

  const handleEdit = useCallback(
    (customer) => {
      let actualMrId = customer.medicalRepId || "";
      if (!actualMrId && customer.medicalRepName && mrList.length) {
        const found = mrList.find(
          (mr) =>
            (mr.medicalRepName || mr.staffName || "").toLowerCase() ===
            customer.medicalRepName.toLowerCase(),
        );
        actualMrId = found?._id || found?.id || "";
      }
      setForm({
        customerCode: customer.customerCode || "",
        date: customer.date || "",
        medicalRepName: customer.medicalRepName || "",
        medicalRepId: actualMrId,
        name: capitalizeFirstLetter(customer.name || ""),
        typeOfBusiness: customer.typeOfBusiness || "",
        customerNumber: customer.customerNumber || "",
        address: customer.address || "",
        zone: customer.zone || "",
        province: customer.province || "",
        remark: customer.remark || "",
        _id: customer._id || null,
      });
      setIsDuplicateNumber(false);
      setIsEditModalOpen(true);
    },
    [mrList, setForm],
  );

  const handleStatusToggle = async (id) => {
    try {
      const customerToToggle = customers.find((c) => c._id === id);
      if (!customerToToggle) {
        showToast("error", "Customer not found");
        return;
      }
      const newStatus = !customerToToggle.enabled;
      setCustomers((prev) =>
        prev.map((c) => (c._id === id ? { ...c, enabled: newStatus } : c)),
      );
      await axios.put(`${backendUrl}/api/customers/${id}`, {
        enabled: newStatus,
      });
      showToast(
        "success",
        `Customer <b>${customerToToggle.name}</b> ${newStatus ? "enabled" : "disabled"} successfully`,
      );
    } catch (error) {
      fetchCustomers();
      showToast(
        "error",
        error.response?.data?.message || "Failed to update status.",
      );
    }
  };

  const handleMRChange = useCallback(
    (option) => {
      const mrId = option || "";
      const selectedMR = mrList.find((mr) => mr._id === mrId);
      setForm((prev) => ({
        ...prev,
        medicalRepId: mrId,
        medicalRepName: selectedMR?.medicalRepName || "",
      }));
      if (errors.medicalRepId)
        setErrors((prev) => ({ ...prev, medicalRepId: "" }));
    },
    [mrList, errors],
  );

  const handleBusinessTypeChange = useCallback(
    (option) => {
      setForm((prev) => ({ ...prev, typeOfBusiness: option || "" }));
      if (errors.typeOfBusiness)
        setErrors((prev) => ({ ...prev, typeOfBusiness: "" }));
    },
    [errors],
  );

  const handleZoneChange = useCallback(
    (option) => {
      setForm((prev) => ({ ...prev, zone: option || "" }));
      if (errors.zone) setErrors((prev) => ({ ...prev, zone: "" }));
    },
    [errors],
  );

  const handleProvinceChange = useCallback(
    (option) => {
      setForm((prev) => ({ ...prev, province: option || "" }));
      if (errors.province) setErrors((prev) => ({ ...prev, province: "" }));
    },
    [errors],
  );

  const performDuplicateCheck = useCallback(
    async (number) => {
      if (!number) {
        setIsDuplicateNumber(false);
        return;
      }
      setCheckingDuplicate(true);
      try {
        const res = await axios.get(`${backendUrl}/api/customers`, {
          params: { search: number, limit: 100 },
        });
        if (res.data.ok) {
          const found = res.data.customers.find(
            (c) => c.customerNumber === number && c._id !== form._id,
          );
          setIsDuplicateNumber(!!found);
        }
      } catch (err) {
        setIsDuplicateNumber(false);
      } finally {
        setCheckingDuplicate(false);
      }
    },
    [form._id],
  );

  const handleCustomerUpdate = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast("error", "Please fill all required fields");
      return;
    }
    if (isDuplicateNumber) {
      showToast(
        "error",
        "Customer number already exists. Please use a unique number.",
      );
      return;
    }
    try {
      const payload = {
        date: form.date,
        medicalRepName: toLowerCase(form.medicalRepName),
        medicalRepId: form.medicalRepId,
        name: form.name,
        typeOfBusiness: toLowerCase(form.typeOfBusiness),
        customerNumber: form.customerNumber,
        address: toLowerCase(form.address),
        zone: toLowerCase(form.zone),
        province: toLowerCase(form.province),
        remark: toLowerCase(form.remark),
      };
      const res = await axios.put(
        `${backendUrl}/api/customers/${form._id}`,
        payload,
      );
      if (res.status === 200) {
        showToast("success", `${form.name} updated successfully`);
        setIsEditModalOpen(false);
        resetForm();
        fetchCustomers();
      }
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update customer.",
      );
    }
  };

  const handleImportClose = (shouldRefresh) => {
    setShowImportModal(false);
    if (shouldRefresh) fetchCustomers();
  };

  const handleIconClick = () => {
    inputRef.current?.focus();
  };

  const handleDownloadAll = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/customers/export`, {
        params: { withCode: isWithCustomerCode },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "customer_list.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast("error", "Failed to download customer list");
      console.error(err);
    }
  };

  const provinceOptions = useMemo(
    () =>
      provinces.map((p) => ({
        value: p.name.toLowerCase(),
        label: toTitleCase(p.name),
      })),
    [provinces],
  );
  const mrOptions = useMemo(
    () =>
      mrList.map((mr) => ({
        value: mr._id,
        label: toTitleCase(mr.medicalRepName),
      })),
    [mrList],
  );
  const zoneOptions = useMemo(
    () =>
      zones.map((z, i) => {
        const val = typeof z === "string" ? z : z.name || `Zone ${i + 1}`;
        return { value: val.toLowerCase(), label: toTitleCase(val) };
      }),
    [zones],
  );
  const businessTypeOptions = useMemo(
    () =>
      businessTypes.map((t) => {
        const name = typeof t === "string" ? t : t.name || t.label || "Unknown";
        return { value: name.toLowerCase(), label: toTitleCase(name) };
      }),
    [businessTypes],
  );
  const visiblePages = getVisiblePages(currentPage, totalPages);

  if (loading && customers.length === 0)
    return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-4 md:p-6 relative">
      {/* Sidebar component */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      <ImportModal
        isOpen={showImportModal}
        onClose={handleImportClose}
        isSampleFile={isSampleFile}
        mrList={mrList}
      />

      <div className="container mx-auto">
        {/* Header with menu button and total count */}
        {isMobileView && (
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <Menu size={20} className="text-gray-700" />
            </button>

            <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
              Total Customer: {totalCustomers}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <div className="flex flex-wrap gap-3">
            {!isMobileView && (
              <>
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
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                >
                  <Upload size={18} /> Import Customer
                </button>
              </>
            )}
            {!isMobileView && isSampleDownloadFile && (
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Download size={18} /> Download All Customers
              </button>
            )}
            {selected.length > 0 && !isMobileView && (
              <button
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>

          {!isMobileView && (
            <div className="flex items-center gap-8">
              <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
                Total Customer: {totalCustomers}
              </div>
              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={handleIconClick}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search by name, business type, MR, address, zone, province, code, or number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>

        {/* Mobile search button and input */}
        {isMobileView && (
          <div className="relative mt-2">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              autoFocus
            />
          </div>
        )}
        {searchTerm && (
          <p className="text-xs text-gray-500 mt-2">
            Showing results for "{searchTerm}" – {totalCustomers} customer(s)
            found.
            {totalCustomers === 0 && " Try different keywords."}
          </p>
        )}

        {/* Search results info (desktop) */}
        {!isMobileView && searchTerm && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              Showing results for:{" "}
              <span className="font-semibold">"{searchTerm}"</span>
              <span className="ml-4">
                Found: <span className="font-bold">{totalCustomers}</span>{" "}
                customer(s)
              </span>
            </p>
            {totalCustomers === 0 && (
              <p className="text-sm text-gray-600 mt-1">
                No customers found. Try different keywords.
              </p>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {!isMobileView && customers.length > 0 && (
                  <th className="p-3">
                    <input
                      type="checkbox"
                      checked={
                        selected.length === customers.length &&
                        customers.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  </th>
                )}
                <th
                  className={`p-3 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
                >
                  Customer Code
                </th>
                {[
                  "Name",
                  "Business Type",
                  "MR Name",
                  "Address",
                  "Zone",
                  "Province",
                  "Joining Date",
                ].map((h) => (
                  <th
                    key={h}
                    className={`p-3 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
                  >
                    {h}
                  </th>
                ))}
                {!isMobileView && (
                  <>
                    <th className="p-3 text-sm font-medium whitespace-nowrap">
                      Status
                    </th>
                    <th className="p-3 text-sm font-medium whitespace-nowrap">
                      Action
                    </th>
                  </>
                )}
                {isMobileView && (
                  <th
                    className={`p-3 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
                  >
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      !isMobileView ? (customers.length > 0 ? 10 : 9) : 9
                    }
                    className="p-4 text-center text-gray-500"
                  >
                    {loading ? (
                      "Loading..."
                    ) : searchTerm ? (
                      <>
                        <span>No customers found matching your search.</span>
                        <br />
                        <button
                          onClick={() => setSearchTerm("")}
                          className="text-blue-600 hover:text-blue-800 underline mt-2"
                        >
                          Clear search to see all customers
                        </button>
                      </>
                    ) : (
                      "No customers found. Add your first customer using the 'Add New Customer' button above."
                    )}
                  </td>
                </tr>
              ) : (
                customers.map((customer, idx) => (
                  <tr
                    key={customer._id}
                    className={`hover:bg-gray-50 ${idx < customers.length - 1 ? "border-b" : ""}`}
                  >
                    {!isMobileView && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === customer._id)}
                          onChange={() => toggleSelect(customer)}
                        />
                      </td>
                    )}
                    <td
                      className={`p-3 ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      <span className="font-mono font-semibold text-blue-600">
                        {customer.customerCode}
                      </span>
                    </td>
                    <td
                      className={`p-3 ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {capitalizeFirstLetter(customer.name)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.typeOfBusiness)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.medicalRepName)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.address)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.zone)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.province)}
                    </td>
                    <td
                      className={`p-3 whitespace-nowrap ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {customer.date
                        ? formatDateForDisplay(customer.date)
                        : "--"}
                    </td>
                    {!isMobileView && (
                      <>
                        <td className="p-3">
                          <button
                            onClick={() => handleStatusToggle(customer._id)}
                            className={`px-3 py-1 rounded-full text-sm cursor-pointer ${customer.enabled ? "bg-green-100 text-green-600" : "bg-gray-200 text-gray-600"}`}
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
                      </>
                    )}
                    {isMobileView && (
                      <td className="p-3">
                        <button
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          onClick={() => handleView(customer)}
                          title="View"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {customers.length > 0 && totalPages > 1 && (
            <div
              className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center" : "justify-start"}`}
            >
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className={`px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer ${isMobileView ? "text-[7px]" : ""}`}
              >
                ← Prev
              </button>
              {visiblePages.map((p, index) => (
                <button
                  key={index}
                  onClick={() => typeof p === "number" && setCurrentPage(p)}
                  disabled={p === "..."}
                  className={`px-4 py-2 rounded ${p === "..." ? "bg-gray-200 cursor-not-allowed" : currentPage === p ? "bg-indigo-600 text-white cursor-pointer" : "bg-gray-200 hover:bg-gray-300 cursor-pointer"} ${isMobileView ? "text-[7px]" : ""}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(p + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className={`px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer ${isMobileView ? "text-[7px]" : ""}`}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* VIEW MODAL - full width on mobile */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
              <div className="bg-white w-full max-w-full md:max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-semibold mb-4">View Customer</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    [
                      "Customer Code",
                      <span className="font-mono font-semibold text-blue-600">
                        {form.customerCode}
                      </span>,
                    ],
                    ["Name", capitalizeFirstLetter(form.name)],
                    ["Customer Number", displayValue(form.customerNumber)],
                    ["Type of Business", displayValue(form.typeOfBusiness)],
                    [
                      "Medical Representative",
                      displayValue(form.medicalRepName),
                    ],
                    ["Zone", displayValue(form.zone)],
                    ["Province", displayValue(form.province)],
                    [
                      "Joining Date",
                      form.date ? formatDateForDisplay(form.date) : "--",
                    ],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-gray-700 font-medium">{label}</p>
                      <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                        {val}
                      </p>
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <p className="text-gray-700 font-medium">Address</p>
                    <textarea
                      value={displayValue(form.address)}
                      className="w-full rounded-lg border border-gray-300 p-3 bg-gray-50 resize-none"
                      rows={2}
                      disabled
                    />
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-gray-700 font-medium">Remarks</p>
                    <textarea
                      value={displayValue(form.remark)}
                      className="w-full rounded-lg border border-gray-300 p-3 bg-gray-50 resize-none"
                      rows={3}
                      disabled
                    />
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
            document.body,
          )}

        {/* EDIT MODAL - also full width on mobile */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
              <div className="bg-white w-full max-w-full md:max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
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
                    {/* same form fields as before */}
                    {/* ... */}
                  </div>
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
                      disabled={isDuplicateNumber || checkingDuplicate}
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      Update Customer
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
};

export default Customer;
