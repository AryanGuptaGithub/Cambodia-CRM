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

// ✅ Custom hook to fetch initial sale data
export const useInitialSaleData = () => {
  const { fetchData } = useApi();
  const [statuses, setStatuses] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [statusesData, productsData] = await Promise.all([
          fetchData("/api/sales/payment-status"),
          fetchData("/api/sales/unique-names"),
        ]);

        setStatuses(statusesData);
        const uniqueNames = Array.from(
          new Map(
            (productsData?.productNames || []).map((name) => [
              name.trim().toLowerCase(),
              name.trim(),
            ])
          ).values()
        );

        setProductNames(uniqueNames);
      } catch (error) {
        showToast("error", "Failed to load initial data");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [fetchData]);

  return { statuses, productNames, loading };
};
