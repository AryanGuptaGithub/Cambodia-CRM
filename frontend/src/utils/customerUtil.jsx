import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Initial form state
export const initialFormState = {
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
};


// Validation function
export const validateCustomerForm = (form) => {
  const newErrors = {};

  if (!form.date) newErrors.date = "Date is required";
  else {
    const selectedDate = new Date(form.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate > today) {
      newErrors.date = "Future dates are not allowed";
    }
  }

  if (!form.medicalRepId)
    newErrors.medicalRepName = "Medical Representative is required";
  if (!form.name.trim()) newErrors.name = "Customer Name is required";
  if (!form.typeOfBusiness.trim())
    newErrors.typeOfBusiness = "Type of Business is required";
  if (!form.zone) newErrors.zone = "Zone is required";
  if (!form.province) newErrors.province = "Province is required";

  // Customer Number validation - only numbers allowed
  if (form.customerNumber && !/^\d+$/.test(form.customerNumber)) {
    newErrors.customerNumber = "Customer Number must contain only numbers";
  }

  return newErrors;
};

// API functions
export const fetchProvinces = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/customers/provinces`);
    if (response.data.success) {
      return { success: true, data: response.data.data || [] };
    } else {
      return { 
        success: false, 
        error: response.data.message || "Failed to fetch provinces" 
      };
    }
  } catch (error) {
    console.error("Error fetching provinces:", error);
    return { success: false, error: "Failed to load provinces" };
  }
};

export const fetchMRList = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/staffs`);
    const mrData = response.data || [];
    return { success: true, data: mrData };
  } catch (error) {
    console.error("Error fetching MR list:", error);
    return { success: false, error: "Failed to load Medical Representatives" };
  }
};

export const fetchZones = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/zones`);
    const zonesData = response.data || [];
    return { success: true, data: zonesData };
  } catch (error) {
    console.error("Error fetching zones:", error);
    return { success: false, error: "Failed to load zones" };
  }
};

export const fetchBusinessTypes = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/business-types`);
    let businessTypesData = [];

    if (response.data && Array.isArray(response.data)) {
      businessTypesData = response.data;
    } else if (
      response.data &&
      response.data.data &&
      Array.isArray(response.data.data)
    ) {
      businessTypesData = response.data.data;
    } else if (
      response.data &&
      response.data.success &&
      Array.isArray(response.data.data)
    ) {
      businessTypesData = response.data.data;
    }

    return { success: true, data: businessTypesData };
  } catch (error) {
    console.error("Error fetching business types:", error);
    return { success: false, error: "Failed to load business types" };
  }
};

// Excel generation constants and helpers
export const EXCEL_CONFIG = {
  title: "HEALTHCARE SOUTH EAST ASIA",
  subtitle: "Customer List",
  fileName: "customer_list_sample.xlsx",
  columns: [
    { key: "date", width: 15, header: "Date" },
    { key: "medicalRep", width: 40, header: "Medical Representative Name" },
    { key: "customerName", width: 55, header: "Customer Name in English" },
    { key: "businessType", width: 25, header: "Types of Business" },
    { key: "customerNumber", width: 55, header: "Customer Number" },
    { key: "customerAddress", width: 55, header: "Customer Address" },
    { key: "zone", width: 25, header: "Zone" },
    { key: "province", width: 25, header: "Province" },
    { key: "remark", width: 25, header: "Remark" },
  ],
  dropdownSheetName: "DropdownValues",
  dataStartRow: 4,
  dataEndRow: 1000
};