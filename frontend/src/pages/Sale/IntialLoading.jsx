import { useEffect, useState, useCallback } from "react";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ✅ Custom hook for API calls
export const useApi = () => {
  const fetchData = useCallback(async (endpoint, options = {}) => {
    try {
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
          fetchData("/api/products"), // Changed endpoint to get full product data
        ]);

        setStatuses(statusesData);

        // Get unique products by productName with LC
        const uniqueProducts = Array.from(
          new Map(
            (productsData || []).map((product) => [
              product.productName?.trim().toLowerCase(),
              {
                productName: product.productName?.trim(),
                lc: product.lc,
              },
            ])
          ).values()
        ).filter((product) => product.productName);

        setProducts(uniqueProducts);
        const names = uniqueProducts.map((product) => product.productName);
        setProductNames(names);
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
