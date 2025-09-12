import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";

const backendUrl = "http://localhost:3001";
const customersPerPage = 5;

export const useCustomer = () => {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [parsedData, setParsedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    warehouse: "",
    name: "",
    phone: "",
    email: "",
    status: "enabled",
    password: "",
    taxNumber: "",
    openingBalance: "",
    type: "",
    creditPeriod: "",
    creditLimit: "",
    profileImage: null,
    _id: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${backendUrl}/api/customers`);
        setCustomers(res.data);
      } catch (err) {
        setError("Failed to fetch customers");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesTab =
        selectedTab === "All" ||
        (selectedTab === "To Pay" && c.type === "pay") ||
        (selectedTab === "To Collect" && c.type === "receive");

      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [customers, selectedTab, searchTerm]);

  const totalPages = Math.ceil(filteredCustomers.length / customersPerPage);
  const currentCustomers = filteredCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
  );

  const toggleSelect = (customer) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c === customer._id);
      return exists ? prev.filter((id) => id !== customer._id) : [...prev, customer._id];
    });
  };

  const toggleSelectAll = (checked) => {
    setSelected(checked ? currentCustomers.map((s) => s._id) : []);
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> customers`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        await axios.delete(`${backendUrl}/api/customers`, {
          data: { ids: selected },
        });

        showToast("success", "Selected customers deleted successfully");
        const res = await axios.get(`${backendUrl}/api/customers`);
        setCustomers(res.data);
        setSelected([]);
      } catch (err) {
        showToast("error", "Failed to delete selected customers");
      }
    }
  };

  return {
    customers,
    currentCustomers,
    selected,
    setSelected,
    toggleSelect,
    toggleSelectAll,
    handleDeleteSelected,
    searchTerm,
    setSearchTerm,
    selectedTab,
    setSelectedTab,
    currentPage,
    setCurrentPage,
    totalPages,
    loading,
    error,
    form,
    setForm,
    parsedData,
    setParsedData,
    setCustomers,
  };
};
