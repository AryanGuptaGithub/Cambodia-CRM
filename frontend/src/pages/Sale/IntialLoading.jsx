import { useEffect, useState, useCallback } from "react";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ✅ Custom hook for API calls
export const useApi = () => {
  const fetchData = useCallback(async (endpoint, options = {}) => {
    try {
      console.log('values of ${backendUrl}${endpoint}', `${backendUrl}${endpoint}`);
      const response = await fetch(`${backendUrl}${endpoint}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }, []);

  return { fetchData };
};

export const useInitialSaleData = () => {
  const { fetchData } = useApi();
  const [statuses, setStatuses] = useState([]);
  const [products, setProducts] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [statusesData, productsData] = await Promise.all([
          fetchData("/api/sales/payment-status"),
          fetchData("/api/products/in-stock"),
        ]);

        setStatuses(statusesData);

        const uniqueProducts = Array.from(
          new Map(
            (productsData || []).map((product) => [
              product.productName?.trim().toLowerCase(),
              {
                ...product,
                productName: product.productName?.trim(),
                lc: product.lc,
                boxes: product.inStock?.boxes || 0, // Extract boxes from inStock
                status: product.inStock?.status || "Out of Stock",
              },
            ])
          ).values()
        ).filter((product) => product.productName);

        setProducts(uniqueProducts);

        // Create product names with stock information for display
        const namesWithStock = uniqueProducts.map((product) => ({
          name: product.productName,
          displayName: `${product.productName} (total available stock: ${product.boxes})`,
          boxes: product.boxes,
          lc: product.lc,
          sellingPrice: product.sellingPrice,
        }));

        setProductNames(namesWithStock);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        showToast("error", "Failed to load initial data");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [fetchData]);

  return { statuses, products, productNames, loading };
};
