import axios from "axios";
const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Medical Representatives
export const fetchMRList = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/staffs`);
    const mrList = response.data || [];

    return {
      success: true,
      data: mrList,
    };
  } catch (error) {
    console.error("❌ Error fetching MR list:", error);
    return { success: false, error: "Failed to load Medical Representatives" };
  }
};

// Customers
export const fetchCustomerList = async () => {
  try {
    
    const response = await axios.get(`${backendUrl}/api/customers/dropdown`);
    
    // Handle different response formats
    const customers = response.data.customers || response.data.data || [];
    
    console.log('✅ Customers loaded:', customers.length);
    
    return {
      success: true,
      data: customers,
    };
  } catch (error) {
    console.error("❌ Error fetching customer list:", error);
    
    // Log more details for debugging
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    
    return { success: false, error: "Failed to load Customers" };
  }
};
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

export const fetchSuppliers = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/suppliers`);
    
    // CORRECTED: Get suppliers from the correct property
    // First try suppliers array, then data array, then just the response
    const suppliers = response.data?.suppliers || response.data?.data || response.data || [];

    if (Array.isArray(suppliers)) {
      return {
        success: true,
        data: suppliers.map((s) => {
          // Get the supplier name in correct format
          const supplierName = s.name || "";
          return {
            value: supplierName.toLowerCase(), // Lowercase for matching
            label: supplierName ? 
              supplierName
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ') : "", // Title case for display
            id: s._id,
            name: supplierName,
          };
        }),
      };
    } else {
      console.error("Invalid suppliers data format:", response.data);
      return { 
        success: false, 
        error: "Invalid suppliers data format",
        data: [] 
      };
    }
  } catch (error) {
    console.error("❌ Error fetching suppliers:", error);
    return { 
      success: false, 
      error: "Failed to load suppliers",
      data: [] 
    };
  }
};

export const fetchProducts = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/dropdown-products`);

    // Get data from API
    const products = response.data?.data || [];

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

    // Map final structure for frontend usage - ensure all required fields are included
    const formattedProducts = uniqueProducts.map((product) => ({
      id: product._id, // Ensure id field exists
      _id: product._id,
      label: product.productName,
      type: product.type,
      productName: product.productName,
      supplierName: product.supplierName,
      batches: product.batches || [],
      totalBoxes: product.totalBoxes || 0,
      totalAmount: product.totalAmount || 0,
      status: product.status || "Out of Stock",
      minStockLevel: product.minStockLevel || 0,

      lc: product.lc || 0,
      fob: product.fob || 0,
      cif: product.cif || 0,
      sellingPrice: product.sellingPrice, // ADDED: Default to 5 if not provided
      stockLastUpdated: product.stockLastUpdated || null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    }));
    return { success: true, data: formattedProducts };
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    return { success: false, error: "Failed to load products" };
  }
};

export const fetchProductDropdownPurchase = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/products`);
    const products = response.data || [];

    if (!Array.isArray(products)) {
      return { success: false, error: "Invalid products data format" };
    }

    // Format products for purchase dropdown - simplified structure for purchase
    const formattedProducts = products.map((product) => ({
      value: product._id,
      label: product.productName,
      id: product._id,
      productName: product.productName,
      type: product.type,
      supplierName: product.supplierName,
      currentStock: product.totalBoxes || 0,
      minStockLevel: product.minStockLevel || 0,
      sellingPrice: product.sellingPrice || 0,
      lc: product.lc,
      fob: product.fob,
      cif: product.cif,
      status: product.status || "Out of Stock",
    }));

    return { success: true, data: formattedProducts };
  } catch (error) {
    console.error("❌ Error fetching products for purchase dropdown:", error);
    return {
      success: false,
      error: "Failed to load products for purchase",
    };
  }
};

export const fetchProductPackingType = async () => {
  try {
    const response = await axios.get(`${backendUrl}/api/product-packing-types`);
    const packingTypes = response.data?.data || response.data;

    if (!Array.isArray(packingTypes)) {
      return {
        success: false,
        error: "Invalid product packing types data format",
      };
    }

    return {
      success: true,
      data: packingTypes.map((type) => ({
        value: type.name,
        label: type.name,
        ...type,
      })),
    };
  } catch (error) {
    console.error("❌ Error fetching product packing types:", error);
    return { success: false, error: "Failed to load product packing types" };
  }
};