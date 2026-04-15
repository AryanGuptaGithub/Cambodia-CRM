import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import {
  Search,
  Eye,
  X,
  DollarSign,
  TrendingUp,
  History,
  Edit,
  Trash2,
  HandCoins,
  Menu,
} from "lucide-react";
import axios from "axios";
import { format } from "date-fns";
import { showToast } from "../../utils/toast.jsx";
import { confirmDialog } from "../../utils/confirmationDialog.js";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import Sidebar from "../../components/Sidebar";

const ITEMS_PER_PAGE = 10;
const backendUrl = import.meta.env.VITE_BACKEND_URL;

function MRCash() {
  const [mrCashes, setMrCashes] = useState([]);
  const [allMRCashes, setAllMRCashes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState("carry");

  const [combinedCashMap, setCombinedCashMap] = useState({});

  const [totals, setTotals] = useState({
    totalCurrentCash: 0,
    totalTransferred: 0,
    totalAll: 0,
  });

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEditTransferModalOpen, setIsEditTransferModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedMRCash, setSelectedMRCash] = useState(null);
  const [editingTransfer, setEditingTransfer] = useState(null);

  const [transferHistory, setTransferHistory] = useState([]);
  const [transferHistoryLoading, setTransferHistoryLoading] = useState(false);

  const [formData, setFormData] = useState({
    mrCashId: "",
    transferAmount: "",
    notes: "",
    destinationAccount: "",
    transferDate: new Date().toISOString().split("T")[0],
  });
  const [transferForm, setTransferForm] = useState({
    amount: "",
    notes: "",
    destinationAccount: "",
  });
  const [editTransferForm, setEditTransferForm] = useState({
    amount: "",
    notes: "",
  });

  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [destinationsLoading, setDestinationsLoading] = useState(false);

  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditInvoices, setCreditInvoices] = useState([]);
  const [creditInvoicesLoading, setCreditInvoicesLoading] = useState(false);
  const [selectedMrForCredit, setSelectedMrForCredit] = useState(null);
  const [collectingInvoiceId, setCollectingInvoiceId] = useState(null);

  const [creditModalTab, setCreditModalTab] = useState("collection");
  const [saleSummaries, setSaleSummaries] = useState([]);
  const [saleSummariesLoading, setSaleSummariesLoading] = useState(false);

  const [isEditCreditModalOpen, setIsEditCreditModalOpen] = useState(false);
  const [editingCreditInvoice, setEditingCreditInvoice] = useState(null);
  const [editCreditForm, setEditCreditForm] = useState({
    amount: "",
    customerName: "",
    remarks: "",
  });
  const [editCreditLoading, setEditCreditLoading] = useState(false);

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const inputRef = useRef(null);

  // ─── helpers ────────────────────────────────────────────────────────────────
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "dd MMM yyyy");
    } catch {
      return "Invalid Date";
    }
  };

  const formatDateShort = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "dd MMM yyyy");
    } catch {
      return "Invalid Date";
    }
  };

  const getSafeAmount = (inv) => {
    if (typeof inv.finalAmount === "number" && !isNaN(inv.finalAmount))
      return inv.finalAmount;
    if (typeof inv.amount === "number" && !isNaN(inv.amount)) return inv.amount;
    const parsed = parseFloat(inv.finalAmount ?? inv.amount);
    return isNaN(parsed) ? 0 : parsed;
  };

  const validateNumericInput = (value) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) return value;
    return null;
  };

  const getCombinedCash = (record) => {
    const key = (record.mrName || "").toLowerCase().trim();
    return combinedCashMap[key] ?? record.currentCash;
  };

  // ─── data fetching ──────────────────────────────────────────────────────────
  const fetchDestinations = useCallback(async () => {
    try {
      setDestinationsLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/accounts/destinations`,
      );
      let destinations = [];
      if (response.data && Array.isArray(response.data))
        destinations = response.data;
      else if (response.data?.data && Array.isArray(response.data.data))
        destinations = response.data.data;
      else if (
        response.data?.destinations &&
        Array.isArray(response.data.destinations)
      )
        destinations = response.data.destinations;
      setDestinationOptions(
        destinations.map((dest) => ({
          value: dest._id,
          label: dest.name,
          code: dest.code,
          totalAmount: dest.totalAmount || 0,
        })),
      );
    } catch (error) {
      console.error("Error fetching destinations:", error);
      showToast("error", "Failed to load destination accounts");
    } finally {
      setDestinationsLoading(false);
    }
  }, []);

  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/mr-cash/mr-list-with-cash`,
      );
      if (response.data.success) setMrList(response.data.data || []);
    } catch (error) {
      console.error("Error fetching MR list:", error);
      showToast("error", "Failed to load MR list");
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const fetchTransferHistory = useCallback(async (mrCashId) => {
    try {
      setTransferHistoryLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/mr-cash/${mrCashId}/transfers`,
        { params: { limit: 30, page: 1 } },
      );
      if (response.data.success) setTransferHistory(response.data.data || []);
    } catch (error) {
      console.error("Error fetching transfer history:", error);
      showToast("error", "Failed to load transfer history");
      setTransferHistory([]);
    } finally {
      setTransferHistoryLoading(false);
    }
  }, []);

  const fetchCombinedCashSummary = useCallback(async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/mr-cash/combined-cash-summary`,
      );
      if (response.data.success) {
        const map = {};
        (response.data.data || []).forEach((item) => {
          map[item.mrNameKey] = item.combinedTotal;
        });
        setCombinedCashMap(map);
      }
    } catch (error) {
      console.error("Error fetching combined cash summary:", error);
    }
  }, []);

  const fetchAllMRCashes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${backendUrl}/api/mr-cash`, {
        params: { limit: 1000, page: 1 },
      });
      if (response.data.success) {
        const allData = response.data.data || [];
        setAllMRCashes(allData);
        setTotals(
          response.data.totals || {
            totalCurrentCash: 0,
            totalTransferred: 0,
            totalAll: 0,
          },
        );
        filterAndPaginateData(allData, currentPage, activeTab, searchTerm);
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (error) {
      setError(
        error.response?.data?.message ||
          error.message ||
          "Failed to load MR Cash data",
      );
      showToast("error", "Failed to load MR Cash data");
    } finally {
      setLoading(false);
    }
  }, []);

  const filterAndPaginateData = (data, page, tab, search = "") => {
    let filtered = data;
    if (search) {
      filtered = data.filter(
        (r) =>
          r.mrName?.toLowerCase().includes(search.toLowerCase()) ||
          r.notes?.toLowerCase().includes(search.toLowerCase()),
      );
    }
    if (tab === "carry") filtered = filtered.filter((r) => r.currentCash > 0);
    else filtered = filtered.filter((r) => r.cashTransferredToAdmin > 0);
    const total = filtered.length;
    const pages = Math.ceil(total / ITEMS_PER_PAGE);
    const start = (page - 1) * ITEMS_PER_PAGE;
    setMrCashes(filtered.slice(start, start + ITEMS_PER_PAGE));
    setTotalCount(total);
    setTotalPages(pages);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    filterAndPaginateData(allMRCashes, 1, tab, searchTerm);
  };

  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    filterAndPaginateData(allMRCashes, 1, activeTab, searchTerm);
  }, [allMRCashes, activeTab, searchTerm]);

  useEffect(() => {
    fetchAllMRCashes();
    fetchMRList();
    fetchDestinations();
    fetchCombinedCashSummary();
  }, [
    fetchAllMRCashes,
    fetchMRList,
    fetchDestinations,
    fetchCombinedCashSummary,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => handleSearch(), 500);
    return () => clearTimeout(timer);
  }, [searchTerm, handleSearch]);

  // ─── action handlers ────────────────────────────────────────────────────────
  const handleAdd = () => {
    setFormData({
      mrCashId: "",
      transferAmount: "",
      notes: "",
      destinationAccount: destinationOptions[0]?.value || "",
      transferDate: new Date().toISOString().split("T")[0],
    });
    setSelectedMRCash(null);
    setIsAddModalOpen(true);
    fetchMRList();
  };

  const handleView = async (record) => {
    setSelectedRecord(record);
    setIsViewModalOpen(true);
    await fetchTransferHistory(record._id);
  };

  const handleDelete = async (record) => {
    const confirm = await confirmDialog({
      title: "Delete MR Cash Record",
      text: `Are you sure you want to delete the cash record for <b>${record.mrName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        await axios.delete(`${backendUrl}/api/mr-cash/${record._id}`);
        showToast("success", "MR Cash record deleted successfully");
        fetchAllMRCashes();
        fetchMRList();
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete record",
        );
      }
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    if (name === "transferAmount") {
      const validated = validateNumericInput(value);
      if (validated === null) return;
      setFormData((prev) => ({ ...prev, transferAmount: validated }));
      if (selectedMRCash && parseFloat(validated) > selectedMRCash.currentCash)
        showToast(
          "error",
          `Cannot transfer more than available cash (${formatCurrency(selectedMRCash.currentCash)})`,
        );
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleTransferFormChange = (e) => {
    const { name, value } = e.target;
    if (name === "amount") {
      const validated = validateNumericInput(value);
      if (validated === null) return;
      setTransferForm((prev) => ({ ...prev, amount: validated }));
      if (selectedRecord && parseFloat(validated) > selectedRecord.currentCash)
        showToast(
          "error",
          `Cannot transfer more than available cash (${formatCurrency(selectedRecord.currentCash)})`,
        );
    } else {
      setTransferForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleEditTransferFormChange = (e) => {
    const { name, value } = e.target;
    if (name === "amount") {
      const validated = validateNumericInput(value);
      if (validated === null) return;
      setEditTransferForm((prev) => ({ ...prev, amount: validated }));
    } else {
      setEditTransferForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleMRSelect = (value) => {
    const selectedMR = mrList.find((mr) => mr.value === value);
    if (selectedMR) {
      setSelectedMRCash(selectedMR);
      setFormData((prev) => ({
        ...prev,
        mrCashId: value,
        transferAmount:
          selectedMR.currentCash > 0 ? selectedMR.currentCash.toString() : "0",
        notes: "",
        destinationAccount:
          prev.destinationAccount || destinationOptions[0]?.value || "",
      }));
    }
  };

  const handleSubmitTransferToAdmin = async (e) => {
    e.preventDefault();
    if (
      !formData.mrCashId ||
      !formData.transferAmount ||
      parseFloat(formData.transferAmount) <= 0
    ) {
      showToast(
        "error",
        "Please select an MR and enter a valid transfer amount",
      );
      return;
    }
    if (!formData.destinationAccount) {
      showToast("error", "Please select a destination account");
      return;
    }
    if (!formData.transferDate) {
      showToast("error", "Please select a transfer date");
      return;
    }
    const selectedMR = mrList.find((mr) => mr.value === formData.mrCashId);
    const transferAmount = parseFloat(formData.transferAmount);
    if (selectedMR && transferAmount > selectedMR.currentCash) {
      showToast(
        "error",
        `Insufficient cash. Available: ${formatCurrency(selectedMR.currentCash)}`,
      );
      return;
    }
    try {
      const response = await axios.post(
        `${backendUrl}/api/mr-cash/${formData.mrCashId}/transfer`,
        {
          amount: transferAmount,
          notes: formData.notes,
          destinationAccount: formData.destinationAccount,
          transferDate: formData.transferDate,
        },
      );
      if (response.data.success) {
        showToast("success", "Cash transferred to admin successfully");
        setIsAddModalOpen(false);
        setFormData({
          mrCashId: "",
          transferAmount: "",
          notes: "",
          destinationAccount: "",
          transferDate: new Date().toISOString().split("T")[0],
        });
        setSelectedMRCash(null);
        fetchAllMRCashes();
        fetchMRList();
        fetchDestinations();
        fetchCombinedCashSummary();
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message ||
          error.message ||
          "Failed to transfer cash",
      );
    }
  };

  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    const transferAmount = parseFloat(transferForm.amount);
    if (transferAmount > selectedRecord.currentCash) {
      showToast(
        "error",
        `Insufficient cash. Available: ${formatCurrency(selectedRecord.currentCash)}`,
      );
      return;
    }
    if (!transferForm.destinationAccount) {
      showToast("error", "Please select a destination account");
      return;
    }
    try {
      const response = await axios.post(
        `${backendUrl}/api/mr-cash/${selectedRecord._id}/transfer`,
        {
          amount: transferAmount,
          notes: transferForm.notes,
          destinationAccount: transferForm.destinationAccount,
        },
      );
      if (response.data.success) {
        showToast("success", "Cash transferred to admin successfully");
        setIsTransferModalOpen(false);
        setTransferForm({ amount: "", notes: "", destinationAccount: "" });
        fetchAllMRCashes();
        fetchMRList();
        fetchDestinations();
        fetchCombinedCashSummary();
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message ||
          error.message ||
          "Failed to transfer cash",
      );
    }
  };

  const handleEditTransfer = (transfer) => {
    setEditingTransfer(transfer);
    setEditTransferForm({
      amount: transfer.amount.toString(),
      notes: transfer.notes || "",
    });
    setIsEditTransferModalOpen(true);
  };

  const handleSubmitEditTransfer = async (e) => {
    e.preventDefault();
    const newAmount = parseFloat(editTransferForm.amount);
    if (newAmount <= 0) {
      showToast("error", "Amount must be positive");
      return;
    }
    try {
      const response = await axios.put(
        `${backendUrl}/api/mr-cash/transfers/${editingTransfer._id}`,
        { amount: newAmount, notes: editTransferForm.notes },
      );
      if (response.data.success) {
        showToast("success", "Transfer updated successfully");
        setIsEditTransferModalOpen(false);
        setEditingTransfer(null);
        fetchAllMRCashes();
        fetchMRList();
        fetchDestinations();
        fetchCombinedCashSummary();
        if (selectedRecord) fetchTransferHistory(selectedRecord._id);
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message || "Failed to update transfer",
      );
    }
  };

  const handleDeleteTransfer = async (transfer) => {
    const confirm = await confirmDialog({
      title: "Delete Transfer",
      text: `Are you sure you want to delete this transfer of ${formatCurrency(transfer.amount)}? The amount will be returned to the MR's cash.`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const response = await axios.delete(
          `${backendUrl}/api/mr-cash/${transfer.fromAccount}/transfers/${transfer._id}`,
        );
        if (response.data.success) {
          showToast("success", "Transfer deleted successfully");
          fetchAllMRCashes();
          fetchMRList();
          fetchDestinations();
          fetchCombinedCashSummary();
          if (selectedRecord) fetchTransferHistory(selectedRecord._id);
        }
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete transfer",
        );
      }
    }
  };

  const handleOpenTransferModal = (record) => {
    setSelectedRecord(record);
    setTransferForm({
      amount: record.currentCash > 0 ? record.currentCash.toString() : "0",
      notes: "",
      destinationAccount: destinationOptions[0]?.value || "",
    });
    setIsTransferModalOpen(true);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    filterAndPaginateData(allMRCashes, newPage, activeTab, searchTerm);
  };

  // ─── Credit Collection helpers ──────────────────────────────────────────────
  const fetchCreditCollectionInvoices = async (mrName) => {
    try {
      setCreditInvoicesLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/mr-cash/credit-collection-invoices/${encodeURIComponent(mrName)}`,
      );
      if (response.data.success) {
        setCreditInvoices(response.data.data || []);
      } else {
        showToast("error", "Failed to load credit collection invoices");
      }
    } catch (error) {
      console.error("Error fetching credit collection invoices:", error);
      showToast(
        "error",
        error.response?.data?.message || "Error loading invoices",
      );
    } finally {
      setCreditInvoicesLoading(false);
    }
  };

  const fetchSaleSummaries = async (mrName) => {
    try {
      setSaleSummariesLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/mr-cash/sales-by-mr/${encodeURIComponent(mrName)}`,
      );
      if (response.data.success) {
        setSaleSummaries(response.data.data || []);
      } else {
        showToast("error", "Failed to load sale summaries");
      }
    } catch (error) {
      console.error("Error fetching sale summaries:", error);
      showToast(
        "error",
        error.response?.data?.message || "Error loading sales",
      );
    } finally {
      setSaleSummariesLoading(false);
    }
  };

  const openCreditModal = (record) => {
    setSelectedMrForCredit(record);
    setCreditModalTab("collection");
    fetchCreditCollectionInvoices(record.mrName);
    fetchSaleSummaries(record.mrName);
    setIsCreditModalOpen(true);
  };

  const closeCreditModal = () => {
    setIsCreditModalOpen(false);
    setCreditInvoices([]);
    setSaleSummaries([]);
    setSelectedMrForCredit(null);
    setCollectingInvoiceId(null);
    setCreditModalTab("collection");
  };

  const handleEditCreditInvoice = (inv) => {
    setEditingCreditInvoice(inv);
    setEditCreditForm({
      amount: getSafeAmount(inv).toString(),
      customerName: inv.customerName || inv.customer_name || inv.customer || "",
      remarks: inv.remarks || "",
    });
    setIsEditCreditModalOpen(true);
  };

  const handleEditCreditFormChange = (e) => {
    const { name, value } = e.target;
    if (name === "amount") {
      const validated = validateNumericInput(value);
      if (validated === null) return;
      setEditCreditForm((prev) => ({ ...prev, amount: validated }));
    } else {
      setEditCreditForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmitEditCreditInvoice = async (e) => {
    e.preventDefault();
    const newAmount = parseFloat(editCreditForm.amount);
    if (!newAmount || newAmount <= 0) {
      showToast("error", "Amount must be a positive number");
      return;
    }
    try {
      setEditCreditLoading(true);
      const response = await axios.put(
        `${backendUrl}/api/mr-cash/credit-collection-invoices/${editingCreditInvoice._id}`,
        {
          amount: newAmount,
          finalAmount: newAmount,
          customerName: editCreditForm.customerName,
          remarks: editCreditForm.remarks,
        },
      );
      if (response.data.success) {
        const saleInfo = response.data.data?.sale;
        const msg = saleInfo
          ? `Invoice updated. MR cash adjusted. Sale: paid ${formatCurrency(saleInfo.paidAmount)}, due ${formatCurrency(saleInfo.dueAmount)} (${saleInfo.paymentStatus})`
          : "Credit invoice updated. MR cash adjusted accordingly.";
        showToast("success", msg);
        setIsEditCreditModalOpen(false);
        setEditingCreditInvoice(null);
        if (selectedMrForCredit)
          fetchCreditCollectionInvoices(selectedMrForCredit.mrName);
        fetchAllMRCashes();
        fetchMRList();
        fetchCombinedCashSummary();
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message || "Failed to update credit invoice",
      );
    } finally {
      setEditCreditLoading(false);
    }
  };

  const handleDeleteCreditInvoice = async (inv) => {
    const invoiceNo = inv.invoiceNumber || inv.invoiceNo || "this invoice";
    const amount = getSafeAmount(inv);
    const confirm = await confirmDialog({
      title: "Delete Credit Invoice",
      text: `Are you sure you want to delete invoice <b>${invoiceNo}</b>?<br/>
             <span style="color:#dc2626">${formatCurrency(amount)} will be subtracted from the MR's current cash and the sale will be restored to outstanding.</span>`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const response = await axios.delete(
          `${backendUrl}/api/mr-cash/credit-collection-invoices/${inv._id}`,
        );
        if (response.data.success) {
          const saleInfo = response.data.data?.sale;
          const msg = saleInfo
            ? `Deleted. ${formatCurrency(amount)} reversed. Sale restored: due ${formatCurrency(saleInfo.dueAmount)} (${saleInfo.paymentStatus})`
            : response.data.message || "Credit invoice deleted. Cash reversed.";
          showToast("success", msg);
          if (selectedMrForCredit)
            fetchCreditCollectionInvoices(selectedMrForCredit.mrName);
          fetchAllMRCashes();
          fetchMRList();
          fetchCombinedCashSummary();
        }
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete credit invoice",
        );
      }
    }
  };

  // ─── Pagination Component ──────────────────────────────────────────────────
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div
        className={`mt-4 p-4 flex gap-2 ${isMobileView ? "justify-center items-center flex-wrap" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`px-3 py-1.5 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${isMobileView ? "text-[10px]" : "text-sm"}`}
        >
          ← Prev
        </button>

        {!isMobileView ? (
          (() => {
            const maxVisible = 5;
            let startPage = Math.max(
              1,
              currentPage - Math.floor(maxVisible / 2),
            );
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            if (endPage - startPage + 1 < maxVisible) {
              startPage = Math.max(1, endPage - maxVisible + 1);
            }
            const pages = [];
            for (let i = startPage; i <= endPage; i++) pages.push(i);

            return pages.map((page) => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer ${
                  currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {page}
              </button>
            ));
          })()
        ) : (
          <span className="px-3 py-1.5 text-[10px] text-gray-700 font-medium bg-gray-100 rounded-lg">
            Page {currentPage} of {totalPages}
          </span>
        )}

        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`px-3 py-1.5 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${isMobileView ? "text-[10px]" : "text-sm"}`}
        >
          Next →
        </button>
      </div>
    );
  };

  if (loading && mrCashes.length === 0) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-gray-600">Loading MR Cash data...</div>
      </div>
    );
  }

  const colSpan =
    activeTab === "carry" ? (isMobileView ? 4 : 5) : isMobileView ? 3 : 4;

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {/* ── Sidebar (mobile only) ── */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-1 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={18} className="text-gray-700" />
            </button>
            <DollarSign className="w-4 h-4 text-blue-600" />
            <h1 className="text-[10px] font-bold text-gray-800">MR Cash</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[8px] font-medium">
            Total Records: {totalCount}
          </div>
        </div>
      )}

      {/* ── DESKTOP Breadcrumb & Header (unchanged) ── */}
      {!isMobileView && (
        <>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
            <div>
              <button
                onClick={handleAdd}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer"
              >
                <TrendingUp size={18} /> Transfer Cash to Admin
              </button>
            </div>
            <div className="flex gap-3">
              <div className="relative w-full lg:w-80">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={18}
                  onClick={() => inputRef.current?.focus()}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search by MR name or notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-2">
          <input
            type="text"
            placeholder="Search MR..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 pr-7 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-[10px]"
          />
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
            size={12}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className={`${isMobileView ? "mb-4 p-2" : "mb-6 p-4"} bg-red-50 border border-red-200 rounded-lg`}
        >
          <div
            className={`flex items-center gap-2 text-red-700 ${isMobileView ? "text-xs" : ""}`}
          >
            <X size={isMobileView ? 14 : 20} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Totals - Responsive */}
      <div
        className={`grid ${isMobileView ? "grid-cols-1 gap-2" : "grid-cols-1 md:grid-cols-2 gap-4"} mb-6`}
      >
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center gap-3">
            <div
              className={`${isMobileView ? "p-1.5" : "p-2"} bg-blue-100 rounded-lg`}
            >
              <DollarSign
                className={`${isMobileView ? "w-4 h-4" : "w-6 h-6"} text-blue-600`}
              />
            </div>
            <div>
              <p
                className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
              >
                All MR Carry Current Cash
              </p>
              <p
                className={`${isMobileView ? "text-lg" : "text-2xl"} font-bold text-blue-700`}
              >
                {formatCurrency(totals.totalCurrentCash)}
              </p>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  Sum of all MRs' current cash
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center gap-3">
            <div
              className={`${isMobileView ? "p-1.5" : "p-2"} bg-green-100 rounded-lg`}
            >
              <TrendingUp
                className={`${isMobileView ? "w-4 h-4" : "w-6 h-6"} text-green-600`}
              />
            </div>
            <div>
              <p
                className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
              >
                Total Transferred to Admin
              </p>
              <p
                className={`${isMobileView ? "text-lg" : "text-2xl"} font-bold text-green-700`}
              >
                {formatCurrency(totals.totalTransferred)}
              </p>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  Sum of all transfers to admin
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div
        className={`${isMobileView ? "mb-3" : "mb-4"} border-b border-gray-200 overflow-x-auto`}
      >
        <div className={`flex ${isMobileView ? "space-x-2" : "space-x-4"}`}>
          <button
            onClick={() => handleTabChange("carry")}
            className={`py-2 ${isMobileView ? "px-2 text-xs" : "px-4 text-sm"} font-medium transition-colors whitespace-nowrap ${
              activeTab === "carry"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            MR Carry Cash
            <span
              className={`ml-2 ${isMobileView ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"} bg-blue-100 text-blue-800 rounded-full`}
            >
              {allMRCashes.filter((r) => r.currentCash > 0).length}
            </span>
          </button>
          <button
            onClick={() => handleTabChange("transferred")}
            className={`py-2 ${isMobileView ? "px-2 text-xs" : "px-4 text-sm"} font-medium transition-colors whitespace-nowrap ${
              activeTab === "transferred"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            MR Transfer Cash
            <span
              className={`ml-2 ${isMobileView ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"} bg-green-100 text-green-800 rounded-full`}
            >
              {allMRCashes.filter((r) => r.cashTransferredToAdmin > 0).length}
            </span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full ${isMobileView ? "min-w-[500px]" : "min-w-max"}`}
          >
            <thead className="bg-gray-50 border-b">
              <tr>
                <th
                  className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                >
                  MR Name
                </th>
                {activeTab === "carry" ? (
                  <>
                    <th
                      className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                    >
                      {isMobileView ? "Cash" : "Current Cash"}
                    </th>
                    {!isMobileView && (
                      <th className="py-3 px-4 text-center">
                        Collection + Sale Paid
                      </th>
                    )}
                    <th
                      className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                    >
                      {isMobileView ? "Last" : "Last Transfer"}
                    </th>
                    <th
                      className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                    >
                      Actions
                    </th>
                  </>
                ) : (
                  <>
                    <th
                      className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                    >
                      {isMobileView ? "Transferred" : "Transferred to Admin"}
                    </th>
                    <th
                      className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                    >
                      {isMobileView ? "Date" : "Last Transfer"}
                    </th>
                    <th
                      className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                    >
                      Actions
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {mrCashes.length === 0 ? (
                <tr key="empty-row">
                  <td
                    colSpan={colSpan}
                    className={`${isMobileView ? "p-4" : "p-8"} text-gray-500 text-center`}
                  >
                    {searchTerm
                      ? "No matching records found"
                      : activeTab === "carry"
                        ? "No MRs with current cash available"
                        : "No MRs with transferred cash to admin"}
                  </td>
                </tr>
              ) : (
                mrCashes.map((record, index) => (
                  <tr
                    key={record._id}
                    className={`hover:bg-gray-50 ${index < mrCashes.length - 1 ? "border-b" : ""}`}
                  >
                    <td
                      className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                    >
                      <div
                        className={`font-medium text-gray-900 ${isMobileView ? "text-xs" : ""}`}
                      >
                        {record.mrName}
                      </div>
                    </td>
                    {activeTab === "carry" ? (
                      <>
                        <td
                          className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                        >
                          <div
                            className={`text-blue-700 font-semibold ${isMobileView ? "text-xs" : ""}`}
                          >
                            {formatCurrency(record.currentCash)}
                          </div>
                        </td>
                        {!isMobileView && (
                          <td className="py-3 px-4 text-center">
                            <div className="text-green-700 font-semibold">
                              {formatCurrency(getCombinedCash(record))}
                            </div>
                          </td>
                        )}
                        <td
                          className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                        >
                          <div
                            className={`text-gray-700 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                          >
                            {record.lastTransferDate
                              ? formatDateShort(record.lastTransferDate)
                              : "N/A"}
                          </div>
                        </td>
                        <td
                          className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleView(record)}
                              className="text-blue-600 hover:text-blue-800 cursor-pointer"
                              title="View Details"
                            >
                              <Eye size={isMobileView ? 14 : 18} />
                            </button>
                            {!isMobileView && (
                              <button
                                onClick={() => handleOpenTransferModal(record)}
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                title="Transfer to Admin"
                                disabled={record.currentCash <= 0}
                              >
                                <TrendingUp size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => openCreditModal(record)}
                              className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
                              title="View Credit Collection Invoices"
                            >
                              <HandCoins size={isMobileView ? 14 : 18} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                        >
                          <div
                            className={`text-green-700 font-semibold ${isMobileView ? "text-xs" : ""}`}
                          >
                            {formatCurrency(record.cashTransferredToAdmin)}
                          </div>
                        </td>
                        <td
                          className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                        >
                          <div
                            className={`text-gray-700 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                          >
                            {record.lastTransferDate
                              ? formatDate(record.lastTransferDate)
                              : "N/A"}
                          </div>
                        </td>
                        <td
                          className={`${isMobileView ? "py-2 px-2 text-xs" : "py-3 px-4 text-center"}`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleView(record)}
                              className="text-blue-600 hover:text-blue-800 cursor-pointer"
                              title="View Transfer History"
                            >
                              <History size={isMobileView ? 14 : 18} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {renderPagination()}

      {/* ══ View Modal - Mobile only font changes ══ */}
      {isViewModalOpen &&
        selectedRecord &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setIsViewModalOpen(false);
                setTransferHistory([]);
              }}
            />
            <div
              className={`bg-white w-full ${isMobileView ? "max-w-full m-2 p-4" : "max-w-6xl p-6"} rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]`}
            >
              <button
                onClick={() => {
                  setIsViewModalOpen(false);
                  setTransferHistory([]);
                }}
                className={`absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer`}
              >
                <X size={20} />
              </button>
              {activeTab === "carry" ? (
                <>
                  <h2
                    className={`${isMobileView ? "text-sm" : "text-xl"} font-semibold text-gray-800 ${isMobileView ? "mb-3" : "mb-4"}`}
                  >
                    MR Cash Details
                  </h2>

                  {/* Mobile View - Single Row Layout */}
                  {isMobileView ? (
                    <div className="mb-6 space-y-3">
                      {/* Row 1: MR Name and Current Cash */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-medium text-gray-600 mb-1">
                            MR Name
                          </label>
                          <p className="border px-2 py-1 text-[10px] rounded-lg bg-gray-100 capitalize">
                            {selectedRecord.mrName}
                          </p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-gray-600 mb-1">
                            Current Cash
                          </label>
                          <p className="border px-2 py-1 text-[10px] rounded-lg bg-gray-100 font-bold text-blue-700">
                            {formatCurrency(getCombinedCash(selectedRecord))}
                          </p>
                        </div>
                      </div>

                      {/* Row 2: Last Transfer Date */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-600 mb-1">
                          Last Transfer Date
                        </label>
                        <p className="border px-2 py-1 text-[10px] rounded-lg bg-gray-100">
                          {selectedRecord.lastTransferDate
                            ? formatDateShort(selectedRecord.lastTransferDate)
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Desktop View - Original Layout */
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">
                            MR Name
                          </label>
                          <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                            {selectedRecord.mrName}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">
                            Current Cash
                          </label>
                          <p className="border px-3 py-2 rounded-lg bg-gray-100 font-bold text-blue-700">
                            {formatCurrency(getCombinedCash(selectedRecord))}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">
                            Last Transfer Date
                          </label>
                          <p className="border px-3 py-2 rounded-lg bg-gray-100">
                            {selectedRecord.lastTransferDate
                              ? formatDateShort(selectedRecord.lastTransferDate)
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <h2
                    className={`${isMobileView ? "text-sm" : "text-xl"} font-semibold text-gray-800 ${isMobileView ? "mb-3" : "mb-4"}`}
                  >
                    MR Transfer History - {selectedRecord.mrName}
                  </h2>

                  {/* Mobile View - Single Row Layout */}
                  {isMobileView ? (
                    <div className="mb-6 space-y-3">
                      {/* Row 1: MR Name and Total Transferred */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-medium text-gray-600 mb-1">
                            MR Name
                          </label>
                          <p className="border px-2 py-1 text-[10px] rounded-lg bg-gray-100 capitalize">
                            {selectedRecord.mrName}
                          </p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-gray-600 mb-1">
                            Total Transferred
                          </label>
                          <p className="border px-2 py-1 text-[10px] rounded-lg bg-gray-100 font-bold text-green-700">
                            {formatCurrency(
                              selectedRecord.cashTransferredToAdmin,
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Row 2: Last Transfer Date */}
                      <div>
                        <label className="block text-[10px] font-medium text-gray-600 mb-1">
                          Last Transfer Date
                        </label>
                        <p className="border px-2 py-1 text-[10px] rounded-lg bg-gray-100">
                          {selectedRecord.lastTransferDate
                            ? formatDateShort(selectedRecord.lastTransferDate)
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Desktop View - Original Layout */
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          MR Name
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                          {selectedRecord.mrName}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Total Transferred to Admin
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100 font-bold text-green-700">
                          {formatCurrency(
                            selectedRecord.cashTransferredToAdmin,
                          )}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Last Transfer Date
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100">
                          {selectedRecord.lastTransferDate
                            ? formatDateShort(selectedRecord.lastTransferDate)
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3
                      className={`${isMobileView ? "text-xs" : "text-lg"} font-medium text-gray-700 ${isMobileView ? "mb-2" : "mb-3"}`}
                    >
                      Transfer Records
                    </h3>
                    {transferHistoryLoading ? (
                      <div className="text-center py-4">
                        <div className="text-gray-600">
                          Loading transfer history...
                        </div>
                      </div>
                    ) : transferHistory.length === 0 ? (
                      <div className="text-center py-4 border rounded-lg bg-gray-50">
                        <div className="text-gray-500">
                          No transfer records found
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full min-w-max text-center">
                          <thead className="bg-gray-50">
                            <tr>
                              <th
                                className={`py-3 px-4 font-medium text-gray-700 text-center ${isMobileView ? "text-[8px]" : "text-sm"}`}
                              >
                                Date
                              </th>
                              <th
                                className={`py-3 px-4 font-medium text-gray-700 text-center ${isMobileView ? "text-[8px]" : "text-sm"}`}
                              >
                                Amount
                              </th>
                              <th
                                className={`py-3 px-4 font-medium text-gray-700 text-center ${isMobileView ? "text-[8px]" : "text-sm"}`}
                              >
                                Destination
                              </th>
                              {!isMobileView && (
                                <th className="py-3 px-4 font-medium text-gray-700 text-center text-sm">
                                  Notes
                                </th>
                              )}
                              <th
                                className={`py-3 px-4 font-medium text-gray-700 text-center ${isMobileView ? "text-[8px]" : "text-sm"}`}
                              >
                                By
                              </th>
                              {!isMobileView && (
                                <th className="py-3 px-4 font-medium text-gray-700 text-center text-sm">
                                  Actions
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {transferHistory.map((transfer, index) => (
                              <tr
                                key={transfer._id}
                                className={`hover:bg-gray-50 ${index < transferHistory.length - 1 ? "border-b" : ""}`}
                              >
                                <td
                                  className={`py-3 px-4 text-center ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  {formatDateShort(transfer.transferredAt)}
                                </td>
                                <td
                                  className={`py-3 px-4 text-center font-medium text-green-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  {formatCurrency(transfer.amount)}
                                </td>
                                <td
                                  className={`py-3 px-4 text-center text-gray-600 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  {transfer.toAccountName || "N/A"}
                                </td>
                                {!isMobileView && (
                                  <td className="py-3 px-4 text-center text-gray-600 text-sm">
                                    {transfer.notes || "N/A"}
                                  </td>
                                )}
                                <td
                                  className={`py-3 px-4 text-center text-gray-600 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  {transfer.transferredBy?.name || "System"}
                                </td>
                                {!isMobileView && (
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() =>
                                          handleEditTransfer(transfer)
                                        }
                                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                                        title="Edit Transfer"
                                      >
                                        <Edit size={16} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleDeleteTransfer(transfer)
                                        }
                                        className="text-red-600 hover:text-red-800 cursor-pointer"
                                        title="Delete Transfer"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div
                className={`mt-6 flex justify-end border-t border-gray-300 ${isMobileView ? "pt-3" : "pt-4"}`}
              >
                <button
                  onClick={() => {
                    setIsViewModalOpen(false);
                    setTransferHistory([]);
                  }}
                  className={`bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer ${isMobileView ? "px-3 py-1 text-[10px]" : "px-5 py-2"}`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ══ Add / Transfer to Admin Modal - Mobile only font changes ══ */}
      {isAddModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
              className={`bg-white rounded-xl shadow-lg ${isMobileView ? "max-w-sm w-full" : "max-w-md w-full"}`}
            >
              <div className="flex justify-between items-center p-6 border-b">
                <h2
                  className={`${isMobileView ? "text-sm" : "text-xl"} font-bold text-gray-800`}
                >
                  MR Cash Transfer
                </h2>
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setSelectedMRCash(null);
                    setFormData({
                      mrCashId: "",
                      transferAmount: "",
                      notes: "",
                      destinationAccount: "",
                      transferDate: new Date().toISOString().split("T")[0],
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
              <form
                onSubmit={handleSubmitTransferToAdmin}
                className={`${isMobileView ? "p-4 space-y-3" : "p-6 space-y-4"}`}
              >
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Select MR <span className="text-red-500">*</span>
                  </label>
                  <SearchableDropdown
                    value={formData.mrCashId}
                    onChange={handleMRSelect}
                    options={mrList}
                    placeholder={mrListLoading ? "Loading..." : "Select MR"}
                    required
                    disabled={mrListLoading || mrList.length === 0}
                  />
                </div>
                {selectedMRCash && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center">
                      <span
                        className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700`}
                      >
                        Available Cash:
                      </span>
                      <span
                        className={`${isMobileView ? "text-sm" : "text-lg"} font-bold text-blue-700`}
                      >
                        {formatCurrency(selectedMRCash.currentCash)}
                      </span>
                    </div>
                  </div>
                )}
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Destination Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="destinationAccount"
                    value={formData.destinationAccount}
                    onChange={handleFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    required
                    disabled={destinationsLoading}
                  >
                    <option value="">Select Destination</option>
                    {destinationOptions.map((acc) => (
                      <option key={acc.value} value={acc.value}>
                        {acc.label} ({formatCurrency(acc.totalAmount)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Transfer Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="transferDate"
                    value={formData.transferDate}
                    onChange={handleFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    required
                  />
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Transfer Amount ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="transferAmount"
                    value={formData.transferAmount}
                    onChange={handleFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Enter amount"
                    required
                    disabled={!selectedMRCash}
                  />
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleFormChange}
                    rows="3"
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Reason for transfer..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className={`bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !formData.mrCashId ||
                      !formData.transferAmount ||
                      parseFloat(formData.transferAmount) <= 0 ||
                      (selectedMRCash &&
                        parseFloat(formData.transferAmount) >
                          selectedMRCash.currentCash) ||
                      !formData.destinationAccount ||
                      !formData.transferDate
                    }
                    className={`bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    Transfer
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ══ Transfer Modal (from table row) - Mobile only font changes ══ */}
      {isTransferModalOpen &&
        selectedRecord &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
              className={`bg-white rounded-xl shadow-lg ${isMobileView ? "max-w-sm w-full" : "max-w-md w-full"}`}
            >
              <div className="flex justify-between items-center p-6 border-b">
                <h2
                  className={`${isMobileView ? "text-sm" : "text-xl"} font-bold text-gray-800`}
                >
                  Transfer Cash
                </h2>
                <button
                  onClick={() => setIsTransferModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
              <form
                onSubmit={handleSubmitTransfer}
                className={`${isMobileView ? "p-4 space-y-3" : "p-6 space-y-4"}`}
              >
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    MR Name
                  </label>
                  <div
                    className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} bg-gray-50 rounded-lg font-medium`}
                  >
                    {selectedRecord.mrName}
                  </div>
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Available Cash
                  </label>
                  <div
                    className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} bg-blue-50 rounded-lg font-bold text-blue-700`}
                  >
                    {formatCurrency(selectedRecord.currentCash)}
                  </div>
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Destination Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="destinationAccount"
                    value={transferForm.destinationAccount}
                    onChange={handleTransferFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    required
                    disabled={destinationsLoading}
                  >
                    <option value="">Select Destination</option>
                    {destinationOptions.map((acc) => (
                      <option key={acc.value} value={acc.value}>
                        {acc.label} ({formatCurrency(acc.totalAmount)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Transfer Amount ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="amount"
                    value={transferForm.amount}
                    onChange={handleTransferFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={transferForm.notes}
                    onChange={handleTransferFormChange}
                    rows="3"
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Reason for transfer..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className={`bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !transferForm.amount ||
                      parseFloat(transferForm.amount) <= 0 ||
                      parseFloat(transferForm.amount) >
                        selectedRecord.currentCash ||
                      !transferForm.destinationAccount
                    }
                    className={`bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    Transfer
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ══ Edit Transfer Modal - Mobile only font changes ══ */}
      {isEditTransferModalOpen &&
        editingTransfer &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
              className={`bg-white rounded-xl shadow-lg ${isMobileView ? "max-w-sm w-full" : "max-w-md w-full"}`}
            >
              <div className="flex justify-between items-center p-6 border-b">
                <h2
                  className={`${isMobileView ? "text-sm" : "text-xl"} font-bold text-gray-800`}
                >
                  Edit Transfer
                </h2>
                <button
                  onClick={() => {
                    setIsEditTransferModalOpen(false);
                    setEditingTransfer(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
              <form
                onSubmit={handleSubmitEditTransfer}
                className={`${isMobileView ? "p-4 space-y-3" : "p-6 space-y-4"}`}
              >
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    MR Name
                  </label>
                  <div
                    className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} bg-gray-50 rounded-lg font-medium`}
                  >
                    {editingTransfer.fromAccountName}
                  </div>
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Destination Account
                  </label>
                  <div
                    className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} bg-gray-50 rounded-lg`}
                  >
                    {editingTransfer.toAccountName}
                  </div>
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Transfer Amount ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="amount"
                    value={editTransferForm.amount}
                    onChange={handleEditTransferFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={editTransferForm.notes}
                    onChange={handleEditTransferFormChange}
                    rows="3"
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Reason for transfer..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditTransferModalOpen(false);
                      setEditingTransfer(null);
                    }}
                    className={`bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ══ Credit Collection Invoices Modal - Mobile only font changes ══ */}
      {isCreditModalOpen &&
        selectedMrForCredit &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
              className={`bg-white rounded-xl shadow-lg ${isMobileView ? "max-w-full m-2" : "max-w-5xl"} w-full max-h-[90vh] overflow-y-auto`}
            >
              <div className="flex justify-between items-center p-6 border-b">
                <div>
                  <h2
                    className={`${isMobileView ? "text-sm" : "text-xl"} font-bold text-gray-800`}
                  >
                    Credit Collection Invoices
                  </h2>
                  <p
                    className={`${isMobileView ? "text-[10px]" : "text-sm"} text-gray-500 mt-0.5`}
                  >
                    MR:{" "}
                    <span className="font-semibold text-indigo-700">
                      {selectedMrForCredit.mrName}
                    </span>
                  </p>
                </div>
                <button
                  onClick={closeCreditModal}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Inner Tabs */}
              <div className="px-6 pt-4 border-b border-gray-200">
                <div className="flex space-x-1">
                  <button
                    onClick={() => setCreditModalTab("collection")}
                    className={`py-2 px-6 font-medium text-sm transition-all border-b-2 -mb-px ${creditModalTab === "collection" ? "text-indigo-600 border-indigo-600 bg-indigo-50 rounded-t-lg" : "text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50 rounded-t-lg"}`}
                  >
                    Collection
                    <span
                      className={`ml-2 text-xs px-2 py-0.5 rounded-full ${creditModalTab === "collection" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}
                    >
                      {creditInvoices.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setCreditModalTab("sale")}
                    className={`py-2 px-6 font-medium text-sm transition-all border-b-2 -mb-px ${creditModalTab === "sale" ? "text-orange-600 border-orange-500 bg-orange-50 rounded-t-lg" : "text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50 rounded-t-lg"}`}
                  >
                    Sale
                    <span
                      className={`ml-2 text-xs px-2 py-0.5 rounded-full ${creditModalTab === "sale" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}
                    >
                      {saleSummaries.length}
                    </span>
                  </button>
                </div>
              </div>

              <div className={`${isMobileView ? "p-4" : "p-6"}`}>
                {/* COLLECTION TAB */}
                {creditModalTab === "collection" && (
                  <>
                    {creditInvoicesLoading ? (
                      <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
                        <p className="text-gray-500">Loading invoices...</p>
                      </div>
                    ) : creditInvoices.length === 0 ? (
                      <div className="text-center py-12">
                        <HandCoins
                          className="mx-auto text-gray-300 mb-3"
                          size={48}
                        />
                        <p className="text-gray-500 font-medium">
                          No credit collection invoices found
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100 flex items-center justify-between">
                          <span
                            className={`${isMobileView ? "text-[10px]" : "text-sm"} text-indigo-700 font-medium`}
                          >
                            {creditInvoices.length} invoice
                            {creditInvoices.length !== 1 ? "s" : ""} collected
                          </span>
                          <span
                            className={`${isMobileView ? "text-[10px]" : "text-sm"} text-indigo-700 font-bold`}
                          >
                            Total:{" "}
                            {formatCurrency(
                              creditInvoices.reduce(
                                (sum, inv) => sum + getSafeAmount(inv),
                                0,
                              ),
                            )}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table
                            className={`w-full ${isMobileView ? "min-w-[500px]" : ""} ${isMobileView ? "text-[10px]" : "text-sm"}`}
                          >
                            <thead className="bg-gray-50">
                              <tr>
                                <th
                                  className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  Invoice #
                                </th>
                                <th
                                  className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  Customer
                                </th>
                                {!isMobileView && (
                                  <th className="py-3 px-4 text-center font-medium text-gray-700 text-sm">
                                    Date
                                  </th>
                                )}
                                <th
                                  className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  Amount
                                </th>
                                <th
                                  className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                >
                                  Account
                                </th>
                                {!isMobileView && (
                                  <th className="py-3 px-4 text-center font-medium text-gray-700 text-sm">
                                    Actions
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {creditInvoices.map((inv, index) => {
                                const invoiceNo =
                                  inv.invoiceNumber || inv.invoiceNo || "—";
                                const customer =
                                  inv.customerName ||
                                  inv.customer_name ||
                                  inv.customer ||
                                  "—";
                                const amount = getSafeAmount(inv);
                                const account = (() => {
                                  const dest =
                                    inv.destination ||
                                    inv.destinationAccount ||
                                    "";
                                  const type = inv.accountType || "";
                                  if (
                                    dest &&
                                    dest.toLowerCase() !== type.toLowerCase()
                                  )
                                    return dest;
                                  if (type) return type;
                                  if (dest) return dest;
                                  return "—";
                                })();
                                return (
                                  <tr
                                    key={inv._id || index}
                                    className="border-t hover:bg-gray-50"
                                  >
                                    <td className="py-3 px-4 text-center">
                                      <span
                                        className={`font-medium text-indigo-700 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                                      >
                                        {invoiceNo}
                                      </span>
                                    </td>
                                    <td
                                      className={`py-3 px-4 text-center text-gray-600 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                                    >
                                      {customer}
                                    </td>
                                    {!isMobileView && (
                                      <td className="py-3 px-4 text-center text-gray-600 text-sm">
                                        {inv.date
                                          ? formatDateShort(inv.date)
                                          : "—"}
                                      </td>
                                    )}
                                    <td
                                      className={`py-3 px-4 text-center font-semibold text-green-700 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                                    >
                                      {formatCurrency(amount)}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      <span
                                        className={`px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full ${isMobileView ? "text-[8px]" : "text-xs"} font-medium`}
                                      >
                                        {account}
                                      </span>
                                    </td>
                                    {!isMobileView && (
                                      <td className="py-3 px-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            onClick={() =>
                                              handleEditCreditInvoice(inv)
                                            }
                                            className="text-blue-600 hover:text-blue-800 cursor-pointer"
                                            title="Edit"
                                          >
                                            <Edit size={16} />
                                          </button>
                                          <button
                                            onClick={() =>
                                              handleDeleteCreditInvoice(inv)
                                            }
                                            className="text-red-600 hover:text-red-800 cursor-pointer"
                                            title="Delete"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* SALE TAB */}
                {creditModalTab === "sale" && (
                  <>
                    {saleSummariesLoading ? (
                      <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3" />
                        <p className="text-gray-500">Loading sales...</p>
                      </div>
                    ) : saleSummaries.length === 0 ? (
                      <div className="text-center py-12">
                        <DollarSign
                          className="mx-auto text-gray-300 mb-3"
                          size={48}
                        />
                        <p className="text-gray-500 font-medium">
                          No Cash / Paid sales this month
                        </p>
                      </div>
                    ) : (
                      (() => {
                        const totalPaid = saleSummaries.reduce(
                          (sum, s) => sum + (s.paidAmount || 0),
                          0,
                        );
                        return (
                          <>
                            <div className="mb-4 p-3 bg-orange-50 rounded-lg border border-orange-100 flex items-center justify-between">
                              <span
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} text-orange-700 font-medium`}
                              >
                                {saleSummaries.length} sale
                                {saleSummaries.length !== 1 ? "s" : ""} in{" "}
                                {new Date().toLocaleString("default", {
                                  month: "long",
                                  year: "numeric",
                                })}
                                &nbsp;·&nbsp;
                                <span className="text-green-700">
                                  Paid: {formatCurrency(totalPaid)}
                                </span>
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table
                                className={`w-full ${isMobileView ? "min-w-[500px]" : ""} ${isMobileView ? "text-[10px]" : "text-sm"}`}
                              >
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th
                                      className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                    >
                                      Invoice #
                                    </th>
                                    <th
                                      className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                    >
                                      Customer
                                    </th>
                                    {!isMobileView && (
                                      <th className="py-3 px-4 text-center font-medium text-gray-700 text-sm">
                                        Date
                                      </th>
                                    )}
                                    <th
                                      className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                    >
                                      Total
                                    </th>
                                    <th
                                      className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                    >
                                      Paid
                                    </th>
                                    <th
                                      className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                                    >
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {saleSummaries.map((sale, index) => {
                                    const collectedSet = new Set(
                                      creditInvoices.map((inv) =>
                                        String(
                                          inv.invoiceNumber ||
                                            inv.invoiceNo ||
                                            "",
                                        ),
                                      ),
                                    );
                                    const isCollected = collectedSet.has(
                                      String(sale.invoiceNumber),
                                    );
                                    return (
                                      <tr
                                        key={sale._id || index}
                                        className={`border-t hover:bg-gray-50 ${isCollected ? "bg-green-50" : ""}`}
                                      >
                                        <td className="py-3 px-4 text-center">
                                          <span
                                            className={`font-medium text-orange-700 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                                          >
                                            {sale.invoiceNumber || "—"}
                                          </span>
                                          {isCollected && (
                                            <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">
                                              collected
                                            </span>
                                          )}
                                        </td>
                                        <td
                                          className={`py-3 px-4 text-center text-gray-600 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                                        >
                                          {sale.customerName || "—"}
                                        </td>
                                        {!isMobileView && (
                                          <td className="py-3 px-4 text-center text-gray-600 text-sm">
                                            {formatDateShort(
                                              sale.invoiceDate ||
                                                sale.recordingDate,
                                            )}
                                          </td>
                                        )}
                                        <td
                                          className={`py-3 px-4 text-center font-medium text-gray-700 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                                        >
                                          {formatCurrency(sale.totalAmount)}
                                        </td>
                                        <td
                                          className={`py-3 px-4 text-center font-medium text-green-700 ${isMobileView ? "text-[10px]" : "text-sm"}`}
                                        >
                                          {formatCurrency(sale.paidAmount)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <span
                                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${sale.paymentStatus === "Paid" || sale.paymentStatus === "Cash" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
                                          >
                                            {sale.paymentStatus || "—"}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end p-6 border-t">
                <button
                  onClick={closeCreditModal}
                  className={`bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg cursor-pointer ${isMobileView ? "px-3 py-1 text-[10px]" : "px-5 py-2"}`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ══ Edit Credit Invoice Modal - Mobile only font changes ══ */}
      {isEditCreditModalOpen &&
        editingCreditInvoice &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div
              className={`bg-white rounded-xl shadow-lg ${isMobileView ? "max-w-sm w-full" : "max-w-md w-full"}`}
            >
              <div className="flex justify-between items-center p-6 border-b">
                <div>
                  <h2
                    className={`${isMobileView ? "text-sm" : "text-xl"} font-bold text-gray-800`}
                  >
                    Edit Credit Invoice
                  </h2>
                  <p
                    className={`${isMobileView ? "text-[10px]" : "text-sm"} text-gray-500 mt-0.5`}
                  >
                    Invoice:{" "}
                    <span className="font-semibold text-indigo-700">
                      {editingCreditInvoice.invoiceNumber ||
                        editingCreditInvoice.invoiceNo ||
                        "—"}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsEditCreditModalOpen(false);
                    setEditingCreditInvoice(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
              <div
                className={`mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg ${isMobileView ? "text-[8px]" : "text-xs"} text-amber-800`}
              >
                ⚠️ Changing the amount adjusts this MR's current cash and
                updates the sale's paid/due amounts.
              </div>
              <form
                onSubmit={handleSubmitEditCreditInvoice}
                className={`${isMobileView ? "p-4 space-y-3" : "p-6 space-y-4"}`}
              >
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Current Amount
                  </label>
                  <div
                    className={`p-3 bg-gray-50 rounded-lg text-green-700 font-bold ${isMobileView ? "text-[10px]" : "text-sm"}`}
                  >
                    {formatCurrency(getSafeAmount(editingCreditInvoice))}
                  </div>
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    New Amount ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="amount"
                    value={editCreditForm.amount}
                    onChange={handleEditCreditFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Enter new amount"
                    required
                  />
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Customer Name
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={editCreditForm.customerName}
                    onChange={handleEditCreditFormChange}
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label
                    className={`block ${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-700 mb-2`}
                  >
                    Remarks
                  </label>
                  <textarea
                    name="remarks"
                    value={editCreditForm.remarks}
                    onChange={handleEditCreditFormChange}
                    rows="3"
                    className={`w-full border rounded-lg ${isMobileView ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}
                    placeholder="Add remarks..."
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditCreditModalOpen(false);
                      setEditingCreditInvoice(null);
                    }}
                    className={`bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      editCreditLoading ||
                      !editCreditForm.amount ||
                      parseFloat(editCreditForm.amount) <= 0
                    }
                    className={`bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${isMobileView ? "px-3 py-1 text-[10px]" : "px-4 py-2 text-sm"}`}
                  >
                    {editCreditLoading && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    )}
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default MRCash;
