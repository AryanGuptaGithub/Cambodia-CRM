import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Initial form state
export const initialFormState = {
  date: "",
  medicalRepName: "",
  medicalRepId: "",
  name: "",
  typeOfBusiness: "",
  customerPhoneNumber: "",
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
  if (form.customerPhoneNumber && !/^\d+$/.test(form.customerPhoneNumber)) {
    newErrors.customerPhoneNumber = "Customer Number must contain only numbers";
  }

  return newErrors;
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

export const fetchHRMSalary = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/hrm/dashboard`);
    if (response.data.success) {
      return { success: true, data: response.data.payrollSummary || [] };
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

export const fetchProvinces = async () => {
  try {
    const res = await fetch(`${backendUrl}/api/customers/provinces`);
    const json = await res.json();

    let provinces = [];

    // Case 1: already array
    if (Array.isArray(json)) {
      provinces = json;
    }

    // Case 2: { success, data: [...] }
    else if (json?.success && Array.isArray(json.data)) {
      provinces = json.data;
    }

    // Case 3: object → convert to array
    else if (typeof json === "object") {
      provinces = Object.entries(json).map(([province, zones]) => ({
        province,
        zones: Array.isArray(zones) ? zones : [],
      }));
    }

    return {
      success: true,
      data: provinces,
    };
  } catch (error) {
    console.error("fetchProvinces error:", error);
    return { success: false, data: [] };
  }
};

// In your customerUtil.js file
export const fetchZonesByProvince = async (provinceName) => {
  try {
    if (!provinceName || provinceName.trim() === "") {
      return { success: true, data: [] };
    }    
  
    const encodedProvinceName = encodeURIComponent(provinceName.trim());
    
    const res = await fetch(
      `${backendUrl}/api/zones/by-province/${encodedProvinceName}`
    );
    
    if (!res.ok) {
      console.error(`Failed to fetch zones: ${res.status} ${res.statusText}`);
      return { 
        success: false, 
        error: `Failed to fetch zones: ${res.status}`,
        data: [] 
      };
    }
    
    const json = await res.json();
    // Ensure zones is always array - handle different response formats
    let zones = [];
    
    if (Array.isArray(json)) {
      zones = json;
    } else if (json && Array.isArray(json.data)) {
      zones = json.data;
    } else if (json && json.success && Array.isArray(json.data)) {
      zones = json.data;
    } else if (json && json.success && json.data && Array.isArray(json.data.zones)) {
      zones = json.data.zones;
    } else if (json && Array.isArray(json.zones)) {
      zones = json.zones;
    }

    return {
      success: true,
      data: zones,
    };
  } catch (error) {
    console.error("fetchZonesByProvince error:", error);
    return { 
      success: false, 
      error: error.message,
      data: [] 
    };
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
    { key: "customerPhoneNumber", width: 55, header: "Customer Phone Number" },
    { key: "customerAddress", width: 55, header: "Customer Address" },
    { key: "zone", width: 25, header: "Zone" },
    { key: "province", width: 25, header: "Province" },
    { key: "remark", width: 25, header: "Remark" },
  ],
  dropdownSheetName: "DropdownValues",
  dataStartRow: 4,
  dataEndRow: 1000
};