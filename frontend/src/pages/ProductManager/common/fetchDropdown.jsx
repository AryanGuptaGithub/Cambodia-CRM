import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

/* -------------------------------------------------------------------------- */
/*                            🔹 Fetch Product Types                          */
/* -------------------------------------------------------------------------- */
export const fetchProductTypes = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/product-types`);
    const types = response.data?.data || response.data;

    if (Array.isArray(types)) {
      return {
        success: true,
        data: types.map((type) => ({
          value: type.name || type,
          label: type.name || type,
        })),
      };
    } else {
      return { success: false, error: "Invalid product types data format" };
    }
  } catch (error) {
    console.error("❌ Error fetching product types:", error);
    return { success: false, error: "Failed to load product types" };
  }
};

/* -------------------------------------------------------------------------- */
/*                            🔹 Fetch Suppliers                              */
/* -------------------------------------------------------------------------- */
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
    console.error("❌ Error fetching suppliers:", error);
    return { success: false, error: "Failed to load suppliers" };
  }
};

/* -------------------------------------------------------------------------- */
/*                             🔹 Fetch Products                              */
/* -------------------------------------------------------------------------- */
export const fetchProducts = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/products`);
    const products = response.data?.data || response.data;

    if (!Array.isArray(products)) {
      return { success: false, error: "Invalid products data format" };
    }

    // ✅ Remove duplicate product names (case-insensitive)
    const uniqueProductsMap = new Map();

    products.forEach((product) => {
      const name = product.productName?.trim().toLowerCase();
      if (name && !uniqueProductsMap.has(name)) {
        uniqueProductsMap.set(name, product);
      }
    });

    const uniqueProducts = Array.from(uniqueProductsMap.values());

    return {
      success: true,
      data: uniqueProducts.map((product) => ({
        value: product._id,
        label: product.productName,
        ...product,
      })),
    };
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    return { success: false, error: "Failed to load products" };
  }
};
