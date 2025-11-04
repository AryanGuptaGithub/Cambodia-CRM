import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Fetch product types from backend
export const fetchProductTypes = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/product-types`);
    const types = response.data?.data || response.data;

    if (Array.isArray(types)) {
      // Transform to {value, label} format for dropdown
      return {
        success: true,
        data: types.map((type) => ({
          value: type.name || type, // Adjust based on your API response
          label: type.name || type,
        })),
      };
    } else {
      return { success: false, error: "Invalid product types data format" };
    }
  } catch (error) {
    console.error("Error fetching product types:", error);
    return { success: false, error: "Failed to load product types" };
  }
};

// Fetch suppliers for dropdown
export const fetchSuppliers = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/suppliers`);
    const suppliers = response.data?.data || response.data;

    if (Array.isArray(suppliers)) {
      return {
        success: true,
        data: suppliers.map((s) => ({
          value: s.name,
          label: s.name,
        })),
      };
    } else {
      return { success: false, error: "Invalid suppliers data format" };
    }
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return { success: false, error: "Failed to load suppliers" };
  }
};
