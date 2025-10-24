import React, { useState, useEffect, useRef } from "react";
import {
  UserPlus,
  Trash2,
  Edit,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const PurchaseOut = () => {
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showInvoiceSuggestions, setShowInvoiceSuggestions] = useState(false);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [paymentDate, setPaymentDate] = useState(null);
  const inputRef = useRef(null);

  const [newPayment, setNewPayment] = useState({
    paymentDate: "",
    invoiceNo: "",
    invoiceDate: "",
    supplierName: "",
    amount: "",
    invoiceAmount: "",
    bank: "",
    remarks: "",
  });

  const paymentsPerPage = 10;

  // Fetch payments, suppliers and invoices data
  useEffect(() => {
    fetchPayments();
    fetchSuppliers();
    fetchInvoices();
  }, []);

  // Update filtered invoices when invoices data changes
  useEffect(() => {
    setFilteredInvoices(invoices);
  }, [invoices]);

  const fetchPayments = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/payments-out`);
      setPayments(response.data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
      showToast("error", "Failed to fetch payments");
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/suppliers`);
      setSuppliers(response.data || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      showToast("error", "Failed to fetch suppliers");
    }
  };

  const fetchInvoices = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/purchase-invoice`);
      setInvoices(response.data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      showToast("error", "Failed to fetch invoices");
    }
  };

  // Filter invoices based on search input
  const filterInvoices = (searchValue) => {
    if (!searchValue.trim()) {
      setFilteredInvoices(invoices);
      return;
    }

    const filtered = invoices.filter(
      (invoice) =>
        invoice.invoiceNumber
          ?.toLowerCase()
          .includes(searchValue.toLowerCase()) ||
        invoice.supplierName?.toLowerCase().includes(searchValue.toLowerCase())
    );
    setFilteredInvoices(filtered);
  };

  // Format number to 2 decimal places
  const formatToTwoDecimals = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toFixed(2);
  };

  // Handle input change in modal form
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // For amount fields, only allow numbers and decimal point
    if (name === "amount" || name === "invoiceAmount") {
      if (value === "" || /^\d*\.?\d*$/.test(value)) {
        setNewPayment((prev) => ({
          ...prev,
          [name]: value,
        }));
      }
    } else {
      setNewPayment((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    // When invoice number changes, show suggestions and filter
    if (name === "invoiceNo") {
      setShowInvoiceSuggestions(true);
      filterInvoices(value);

      // Auto-fill invoice date, supplier name, and invoice amount if exact match found
      if (value) {
        const selectedInvoice = invoices.find(
          (inv) => inv.invoiceNumber?.toLowerCase() === value.toLowerCase()
        );
        if (selectedInvoice) {
          setNewPayment((prev) => ({
            ...prev,
            invoiceDate: selectedInvoice.invoiceDate || "",
            supplierName: selectedInvoice.supplierName || "",
            invoiceAmount: formatToTwoDecimals(
              selectedInvoice.invoiceAmount || selectedInvoice.amount || ""
            ),
          }));
        } else {
          // Clear auto-filled fields if invoice not found
          setNewPayment((prev) => ({
            ...prev,
            invoiceDate: "",
            supplierName: "",
            invoiceAmount: "",
          }));
        }
      }
    }
  };

  // Handle invoice selection from suggestions
  const handleInvoiceSelect = (invoice) => {
    setNewPayment({
      ...newPayment,
      invoiceNo: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate || "",
      supplierName: invoice.supplierName || "",
      invoiceAmount: formatToTwoDecimals(
        invoice.invoiceAmount || invoice.amount || ""
      ),
    });
    setShowInvoiceSuggestions(false);
  };

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".invoice-suggestions-container")) {
        setShowInvoiceSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter payments by search term
  const filteredPayments = payments.filter((p) => {
    if (searchTerm.trim() === "") return true;

    const lowerSearch = searchTerm.toLowerCase();
    return (
      p.paymentDate?.toLowerCase().includes(lowerSearch) ||
      p.invoiceNo?.toLowerCase().includes(lowerSearch) ||
      p.supplierName?.toLowerCase().includes(lowerSearch) ||
      p.bank?.toLowerCase().includes(lowerSearch) ||
      p.remarks?.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination calculations
  const indexOfLastPayment = currentPage * paymentsPerPage;
  const indexOfFirstPayment = indexOfLastPayment - paymentsPerPage;
  const currentPayments = filteredPayments.slice(
    indexOfFirstPayment,
    indexOfLastPayment
  );
  const totalPages = Math.ceil(filteredPayments.length / paymentsPerPage);

  // Toggle checkbox select of one row
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select/Deselect all on current page
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
        // Delete from backend
        await Promise.all(
          selected.map((id) =>
            axios.delete(`${backendUrl}/api/payments-out/${id}`)
          )
        );
        // Update local state
        setPayments((prev) =>
          prev.filter((p) => !selected.includes(p._id || p.id))
        );
        setSelected([]);
        showToast(
          "success",
          `${selected.length} payment(s) deleted successfully`
        );
      } catch (error) {
        console.error("Error deleting payments:", error);
        showToast("error", "Failed to delete payments");
      }
    }
  };

  // Reset selection and page when search changes
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  // Handle Enter key press for search
  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") {
      setCurrentPage(1);
    }
  };

  // Open modal for new payment
  const handleAddNewPayment = () => {
    setNewPayment({
      paymentDate: "",
      invoiceNo: "",
      invoiceDate: "",
      supplierName: "",
      amount: "",
      invoiceAmount: "",
      bank: "",
      remarks: "",
    });
    setPaymentDate(null); // Reset date picker
    setFilteredInvoices(invoices);
    setIsModalOpen(true);
  };

  // Handle payment date change - CORRECTED for DatePicker
  const handlePaymentDateChange = (date) => {
    setPaymentDate(date);
    const formattedDate = date ? date.toISOString().split("T")[0] : "";
    setNewPayment((prev) => ({
      ...prev,
      paymentDate: formattedDate,
    }));
  };

  // Submit new payment
  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (
      !newPayment.paymentDate ||
      !newPayment.invoiceNo ||
      !newPayment.supplierName ||
      !newPayment.amount ||
      !newPayment.invoiceAmount
    ) {
      showToast("warning", "Please fill in all required fields");
      return;
    }

    setLoading(true);

    try {
      const paymentToAdd = {
        paymentDate: newPayment.paymentDate,
        invoiceNo: newPayment.invoiceNo,
        invoiceDate: newPayment.invoiceDate,
        supplierName: newPayment.supplierName,
        amount: parseFloat(newPayment.amount),
        invoiceAmount: parseFloat(newPayment.invoiceAmount),
        bank: newPayment.bank,
        remarks: newPayment.remarks,
      };

      const response = await axios.post(
        `${backendUrl}/api/payments-out`,
        paymentToAdd
      );

      if (response.status === 200 || response.status === 201) {
        // Refresh payments from server to get the actual data with _id
        await fetchPayments();
        setIsModalOpen(false);
        setNewPayment({
          paymentDate: "",
          invoiceNo: "",
          invoiceDate: "",
          supplierName: "",
          amount: "",
          invoiceAmount: "",
          bank: "",
          remarks: "",
        });
        setPaymentDate(null); // Reset date picker
        setShowInvoiceSuggestions(false);
        showToast("success", "Payment added successfully");
      }
    } catch (error) {
      console.error("Error adding payment:", error);

      // Show specific error message from backend if available
      const errorMessage =
        error.response?.data?.message || "Failed to add payment";
      showToast("error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setNewPayment({
      paymentDate: "",
      invoiceNo: "",
      invoiceDate: "",
      supplierName: "",
      amount: "",
      invoiceAmount: "",
      bank: "",
      remarks: "",
    });
    setPaymentDate(null); // Reset date picker
    setShowInvoiceSuggestions(false);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
    } catch (error) {
      return dateString;
    }
  };

  // Format currency with 2 decimal places
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return "$0.00";
    const num = parseFloat(amount);
    return `$${
      isNaN(num)
        ? "0.00"
        : num.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
    }`;
  };

  // Format display amount for input fields (shows 2 decimal places)
  const formatDisplayAmount = (amount) => {
    if (amount === "" || amount === null || amount === undefined) return "";
    const num = parseFloat(amount);
    return isNaN(num) ? "" : num.toFixed(2);
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={handleAddNewPayment}
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

          <div className="relative w-full md:w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search payment date, invoice no, supplier, bank..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyPress={handleSearchKeyPress}
              className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b sticky top-0 z-10">
              <tr>
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
                <th className="p-3 bg-gray-100 text-sm font-medium">Invoice No</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Payment Date</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Invoice Date</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Supplier Name</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Invoice Amount($)</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Paid Amount($)</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Bank</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Remarks</th>
                <th className="p-3 bg-gray-100 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentPayments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-gray-500">
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
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(payment._id || payment.id)}
                        onChange={() => toggleSelect(payment._id || payment.id)}
                        autoComplete="off"
                      />
                    </td>
                    <td className="p-3">{payment.invoiceNo}</td>
                    <td className="p-3">{formatDate(payment.paymentDate)}</td>
                    <td className="p-3">{formatDate(payment.invoiceDate)}</td>
                    <td className="p-3">{payment.supplierName}</td>
                    <td className="p-3 font-medium">
                      {payment.invoiceAmount}
                    </td>
                    <td className="p-3 font-semibold">
                      {payment.paidAmount || payment.amount}
                    </td>
                    <td className="p-3">{payment.bank}</td>
                    <td className="p-3">{payment.remarks}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => {
                          setNewPayment({
                            paymentDate: payment.paymentDate,
                            invoiceNo: payment.invoiceNo,
                            invoiceDate: payment.invoiceDate,
                            supplierName: payment.supplierName,
                            amount: formatDisplayAmount(
                              payment.paidAmount || payment.amount
                            ),
                            invoiceAmount: formatDisplayAmount(
                              payment.invoiceAmount
                            ),
                            bank: payment.bank,
                            remarks: payment.remarks,
                          });
                          // Set the date picker value when editing
                          setPaymentDate(
                            payment.paymentDate
                              ? new Date(payment.paymentDate)
                              : null
                          );
                          setIsModalOpen(true);
                        }}
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
                              await axios.delete(
                                `${backendUrl}/api/payments-out/${
                                  payment._id || payment.id
                                }`
                              );
                              setPayments((prev) =>
                                prev.filter(
                                  (p) =>
                                    (p._id || p.id) !==
                                    (payment._id || payment.id)
                                )
                              );
                              setSelected((prev) =>
                                prev.filter(
                                  (id) => id !== (payment._id || payment.id)
                                )
                              );
                              showToast(
                                "success",
                                "Payment deleted successfully"
                              );
                            } catch (error) {
                              console.error("Error deleting payment:", error);
                              showToast("error", "Failed to delete payment");
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

              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
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
                )
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

        {/* Add New Payment Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-800">
                  Add New Payment Out
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={loading}
                >
                  <X size={24} />
                </button>
              </div>

              <form
                onSubmit={handleSubmitPayment}
                className="p-6"
                autoComplete="off"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Invoice No - Text Input with Suggestions */}
                  <div className="invoice-suggestions-container relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice No <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        name="invoiceNo"
                        value={newPayment.invoiceNo}
                        onChange={handleInputChange}
                        onFocus={() => setShowInvoiceSuggestions(true)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                        placeholder="Enter invoice number"
                        required
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() =>
                          setShowInvoiceSuggestions(!showInvoiceSuggestions)
                        }
                      >
                        {showInvoiceSuggestions ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>

                    {/* Invoice Suggestions Dropdown */}
                    {showInvoiceSuggestions && filteredInvoices.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredInvoices.map((invoice) => (
                          <div
                            key={invoice._id || invoice.id}
                            className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            onClick={() => handleInvoiceSelect(invoice)}
                          >
                            <div className="font-medium text-gray-800">
                              {invoice.invoiceNumber}
                            </div>
                            <div className="text-sm text-gray-600">
                              {invoice.supplierName} •{" "}
                              {formatDate(invoice.invoiceDate)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Payment Date with DatePicker */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={paymentDate}
                        onChange={handlePaymentDateChange}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select payment date"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 pr-10"
                        required
                        autoComplete="off"
                        showPopperArrow={false}
                      />
                      <Calendar
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                        size={16}
                      />
                    </div>
                  </div>

                  {/* Invoice Date - Auto-filled and disabled */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Date
                    </label>
                    <input
                      type="text"
                      name="invoiceDate"
                      value={formatDate(newPayment.invoiceDate)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                      disabled
                      autoComplete="off"
                    />
                  </div>

                  {/* Supplier Name - Auto-filled and disabled */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      name="supplierName"
                      value={newPayment.supplierName}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                      disabled
                      autoComplete="off"
                    />
                  </div>

                  {/* Invoice Amount - Auto-filled and disabled */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Amount
                    </label>
                    <input
                      type="text"
                      name="invoiceAmount"
                      value={formatDisplayAmount(newPayment.invoiceAmount)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                      disabled
                      autoComplete="off"
                    />
                  </div>

                  {/* Paid Amount - Text input but only numbers allowed */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paid Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="amount"
                      value={newPayment.amount}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      placeholder="0.00"
                      required
                      autoComplete="off"
                    />
                  </div>

                  {/* Bank */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bank
                    </label>
                    <input
                      type="text"
                      name="bank"
                      value={newPayment.bank}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      placeholder="Enter bank name"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks
                  </label>
                  <textarea
                    name="remarks"
                    value={newPayment.remarks}
                    onChange={handleInputChange}
                    rows="3"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    placeholder="Additional notes..."
                    autoComplete="off"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer
                     disabled:bg-indigo-400 disabled:cursor-not-allowed"
                    disabled={loading}
                  >
                    {loading ? "Adding..." : "Add Payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseOut;
