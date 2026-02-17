import React, { useState, useEffect, useRef } from "react";
import {
  UserPlus,
  Trash2,
  Edit,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import PaymentOutModal from "./PaymentOutModal"; // <-- new modal component

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Custom hook for dropdown options (bank options only, reused from original)
const useDropdownOptions = () => {
  const [sourceOptions, setSourceOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDropdownOptions = async () => {
    try {
      setError(null);
      setLoading(true);

      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`,
      );
      const destinations = destinationResponse.data?.data || [];
      if (!Array.isArray(destinations)) {
        throw new Error("Invalid destination response format");
      }
      const destOptions = destinations.map((dest) => ({
        value: dest._id,
        label: dest.name,
        totalAmount: dest.totalAmount || 0,
      }));
      setSourceOptions(destOptions);
    } catch (err) {
      console.error("Error fetching dropdown options:", err);
      setError(err.message);
      setSourceOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdownOptions();
  }, []);

  return {
    sourceOptions,
    loading,
    error,
    refetch: fetchDropdownOptions,
  };
};

const PurchaseOut = () => {
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // for edit mode
  const [modalInitialData, setModalInitialData] = useState(null); // data to edit
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [isInvoicesEmpty, setIsInvoicesEmpty] = useState(false);
  const inputRef = useRef(null);

  const {
    sourceOptions: bankOptions,
    loading: optionsLoading,
    refetch: refetchBankOptions,
  } = useDropdownOptions();

  const paymentsPerPage = 10;

  // Fetch payments, suppliers, and invoices
  useEffect(() => {
    fetchPayments();
    fetchInvoices();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/purchase-out`);
      setPayments(response.data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
      showToast("error", "Failed to fetch payments");
    }
  };

  const fetchInvoices = async () => {
    try {
      setInvoicesLoading(true);
      const response = await axios.get(`${backendUrl}/api/purchase/invoice`);
      const invoicesData = response.data?.data || response.data || [];
      setInvoices(invoicesData);
      setIsInvoicesEmpty(invoicesData.length === 0);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      showToast("error", "Failed to fetch invoices");
      setIsInvoicesEmpty(true);
    } finally {
      setInvoicesLoading(false);
    }
  };

  // Filter payments by search term
  const filteredPayments = payments.filter((p) => {
    if (searchTerm.trim() === "") return true;
    const lowerSearch = searchTerm.toLowerCase();
    return (
      p.paymentDate?.toLowerCase().includes(lowerSearch) ||
      p.invoiceNo?.toLowerCase().includes(lowerSearch) ||
      p.supplierName?.toLowerCase().includes(lowerSearch) ||
      (p.sourceBank && p.sourceBank.toLowerCase().includes(lowerSearch)) ||
      p.remarks?.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination
  const indexOfLastPayment = currentPage * paymentsPerPage;
  const indexOfFirstPayment = indexOfLastPayment - paymentsPerPage;
  const currentPayments = filteredPayments.slice(
    indexOfFirstPayment,
    indexOfLastPayment,
  );
  const totalPages = Math.ceil(filteredPayments.length / paymentsPerPage);

  // Selection handlers
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentPayments.map((p) => p._id || p.id));
    } else {
      setSelected([]);
    }
  };

  // Delete selected payments
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> payment(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const token = localStorage.getItem("token");
        await Promise.all(
          selected.map((id) =>
            axios.delete(`${backendUrl}/api/purchase-out/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ),
        );

        setPayments((prev) =>
          prev.filter((p) => !selected.includes(p._id || p.id)),
        );
        setSelected([]);
        await refetchBankOptions();
        showToast(
          "success",
          `${selected.length} payment(s) deleted successfully`,
        );
      } catch (error) {
        console.error("Error deleting payments:", error);
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete payments",
        );
      }
    }
  };

  // Modal handlers
  const handleAddNewPayment = () => {
    setEditingId(null);
    setModalInitialData(null);
    setIsModalOpen(true);
  };

  const handleEditPayment = (payment) => {
    setEditingId(payment._id || payment.id);
    setModalInitialData(payment);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (formData, id) => {
    // formData already contains parsed amounts
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };

    try {
      let response;
      if (id) {
        // update
        response = await axios.put(
          `${backendUrl}/api/purchase-out/${id}`,
          formData,
          { headers },
        );
      } else {
        // create
        response = await axios.post(
          `${backendUrl}/api/purchase-out`,
          formData,
          { headers },
        );
      }

      if (response.status === 200 || response.status === 201) {
        await fetchPayments();
        await refetchBankOptions();
        setIsModalOpen(false);
        showToast(
          "success",
          id ? "Payment updated successfully" : "Payment added successfully",
        );
      }
    } catch (error) {
      console.error("Error saving payment:", error);
      showToast(
        "error",
        error.response?.data?.message || "Failed to save payment",
      );
      throw error; // rethrow so modal knows it failed
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setModalInitialData(null);
  };

  // Search handlers
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") setCurrentPage(1);
  };

  // Format helpers (only used for display in table)
  const formatCurrency = (amount) => {
    if (amount == null) return "$0.00";
    const num = parseFloat(amount);
    return `$${isNaN(num) ? "0.00" : num.toFixed(2)}`;
  };

  const formatDisplayAmount = (amount) => {
    if (!amount && amount !== 0) return "";
    const num = parseFloat(amount);
    return isNaN(num) ? "" : num.toFixed(2);
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:bg-indigo-400 disabled:cursor-not-allowed"
              onClick={handleAddNewPayment}
              disabled={isInvoicesEmpty}
            >
              <UserPlus size={18} /> Add New Payment Out
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
          {payments.length > 0 && (
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={() => inputRef.current?.focus()}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search payment date, invoice no, supplier, source account..."
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyPress={handleSearchKeyPress}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        {/* Warning if no invoices */}
        {isInvoicesEmpty && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  No Invoices Available
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    You need to add at least one invoice before creating
                    payments. Add invoices in the purchase invoice section.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b sticky top-0 z-10">
              <tr>
                {currentPayments.length > 0 && (
                  <th className="p-3 text-center bg-gray-100 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentPayments.length &&
                        currentPayments.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      autoComplete="off"
                    />
                  </th>
                )}
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Invoice No
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Payment Date
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Invoice Date
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Supplier Name
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Invoice Amount($)
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Paid Amount($)
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Source Account
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentPayments.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentPayments.length > 0 ? 10 : 9}
                    className="p-4 text-center text-gray-500"
                  >
                    {searchTerm
                      ? "No payments match your search."
                      : "No payments found."}
                  </td>
                </tr>
              ) : (
                currentPayments.map((payment, index) => (
                  <tr
                    key={payment._id || payment.id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % paymentsPerPage === 0 ||
                      index + 1 === currentPayments.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    {currentPayments.length > 0 && (
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.includes(payment._id || payment.id)}
                          onChange={() =>
                            toggleSelect(payment._id || payment.id)
                          }
                          autoComplete="off"
                        />
                      </td>
                    )}
                    <td className="p-3">{payment.invoiceNo}</td>
                    <td className="p-3">
                      {formatDateToReadable(payment.paymentDate)}
                    </td>
                    <td className="p-3">
                      {formatDateToReadable(payment.invoiceDate)}
                    </td>
                    <td className="p-3">{payment.supplierName}</td>
                    <td className="p-3 font-medium">
                      {formatCurrency(payment.invoiceAmount)}
                    </td>
                    <td className="p-3 font-semibold">
                      {formatCurrency(payment.paidAmount || payment.amount)}
                    </td>
                    <td className="p-3">
                      {payment.sourceBank || payment.bankName || "N/A"}
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => handleEditPayment(payment)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={async () => {
                          const confirm = await confirmDialog({
                            text: `Are you sure you want to delete payment <b>${payment.invoiceNo}</b>?`,
                            icon: "warning",
                            confirmButtonText: "Yes, delete",
                            cancelButtonText: "Cancel",
                          });

                          if (confirm.isConfirmed) {
                            try {
                              const token = localStorage.getItem("token");
                              await axios.delete(
                                `${backendUrl}/api/purchase-out/${payment._id || payment.id}`,
                                {
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );

                              setPayments((prev) =>
                                prev.filter(
                                  (p) =>
                                    (p._id || p.id) !==
                                    (payment._id || payment.id),
                                ),
                              );
                              setSelected((prev) =>
                                prev.filter(
                                  (id) => id !== (payment._id || payment.id),
                                ),
                              );
                              await refetchBankOptions();
                              showToast("success", "Payment deleted successfully");
                            } catch (error) {
                              console.error("Error deleting payment:", error);
                              showToast(
                                "error",
                                error.response?.data?.message ||
                                  "Failed to delete payment",
                              );
                            }
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {currentPayments.length > 0 && (
            <div className="mt-4 p-5 flex justify-start gap-2 bg-white">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                      currentPage === page
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  >
                    {page}
                  </button>
                ),
              )}
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Modal */}
        <PaymentOutModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleModalSubmit}
          editingId={editingId}
          initialData={modalInitialData}
          invoices={invoices}
          bankOptions={bankOptions}
          isInvoicesEmpty={isInvoicesEmpty}
        />
      </div>
    </div>
  );
};

export default PurchaseOut;