import React, { useState, useEffect } from "react";
import axios from "axios";
import { Building2, TrendingDown, TrendingUp, RefreshCw } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "";

const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  const d = new Date(dateString);
  if (isNaN(d)) return "N/A";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const toTitle = (str = "") =>
  str
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const typeBadgeClass = (type = "") => {
  const t = type.toLowerCase();
  if (t.includes("sale")) return "bg-blue-100 text-blue-700";
  if (t.includes("deposit")) return "bg-green-100 text-green-700";
  if (t.includes("transfer")) return "bg-purple-100 text-purple-700";
  if (t.includes("expense")) return "bg-red-100 text-red-700";
  if (t.includes("withdraw")) return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-600";
};

const TransactionCard = ({ tx }) => {
  // If direction is not provided, treat as neutral (no green/red)
  const isCredit = tx.direction === "credit";
  const isDebit = tx.direction === "debit";
  const [expanded, setExpanded] = useState(false);

  const detailRows = [
    { label: "Transaction Type", value: toTitle(tx.transactionType) },
    { label: "Category Type", value: tx.categoryTypeName },
    { label: "Destination Account", value: tx.destinationName },
    { label: "Source Account", value: tx.sourceName },
    { label: "Invoice Number", value: tx.invoiceNumber },
    {
      label: "Invoice Date",
      value: tx.invoiceDate ? formatDate(tx.invoiceDate) : null,
    },
    { label: "Date", value: formatDate(tx.date) },
    { label: "Amount", value: `$${formatCurrency(tx.amount)}` },
    tx.exchangeLoss > 0
      ? { label: "Bank Charges", value: `$${formatCurrency(tx.exchangeLoss)}` }
      : null,
    { label: "Customer Name", value: tx.customerName },
    tx.customerAddress
      ? { label: "Customer Address", value: tx.customerAddress }
      : null,
    { label: "Remarks", value: tx.remarks },
    { label: "Description", value: tx.description },
    { label: "Import Status", value: tx.importStatus },
  ].filter(
    (row) => row && row.value && row.value !== "N/A" && row.value !== "",
  );

  // Determine icon and color based on direction
  let iconBg = "bg-gray-100";
  let iconColor = "text-gray-600";
  let IconComponent = TrendingUp; // fallback
  let amountColor = "text-gray-700";

  if (isCredit) {
    iconBg = "bg-green-100";
    iconColor = "text-green-600";
    IconComponent = TrendingUp;
    amountColor = "text-green-600";
  } else if (isDebit) {
    iconBg = "bg-red-100";
    iconColor = "text-red-600";
    IconComponent = TrendingDown;
    amountColor = "text-red-600";
  } else {
    // neutral
    iconBg = "bg-gray-100";
    iconColor = "text-gray-600";
    IconComponent = TrendingUp;
    amountColor = "text-gray-700";
  }

  return (
    <div className="border border-gray-200 rounded-lg mb-2 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}
          >
            <IconComponent className={`w-3.5 h-3.5 ${iconColor}`} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeBadgeClass(tx.transactionType)}`}
              >
                {toTitle(tx.transactionType)}
              </span>
              {tx.invoiceNumber && (
                <span className="text-xs text-600">
                  {tx.categoryTypeName}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatDate(tx.date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <span className={`text-sm font-bold ${amountColor}`}>
            {isCredit ? "+" : isDebit ? "−" : ""}${formatCurrency(tx.amount)}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <table className="w-full text-xs">
            <tbody>
              {detailRows.map((row, idx) => (
                <tr
                  key={idx}
                  className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                >
                  <td className="px-4 py-2 font-medium text-gray-500 w-40 whitespace-nowrap border-r border-gray-100">
                    {row.label}
                  </td>
                  <td className="px-4 py-2 text-gray-800 font-medium">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const CompanyBalancePanel = () => {
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const fetchBalanceData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${backendUrl}/api/accounts/balance`);
      if (response.data.success) {
        setTotalBalance(response.data.totalBalance || 0);
        const accs = response.data.accounts || [];
        setAccounts(accs);
        if (accs.length > 0) {
          const newActiveId = String(accs[0]._id);
          setActiveAccountId(newActiveId);
          fetchTransactions(newActiveId);
        } else {
          // No accounts, still fetch all transactions
          fetchTransactions(null);
        }
      }
    } catch (err) {
      console.error("Error fetching company balance:", err);
      setError("Failed to load balance data");
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (accountId) => {
    setLoadingTransactions(true);
    try {
      // If accountId provided, add as query parameter; otherwise fetch all
      const url = accountId
        ? `${backendUrl}/api/accounts/transactions?accountId=${accountId}`
        : `${backendUrl}/api/accounts/transactions`;
      const response = await axios.get(url);
      console.log('values of response', response);
      if (response.data.success) {
        setTransactions(response.data.data || []);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchBalanceData();
  }, []);

  useEffect(() => {
    if (activeAccountId) {
      fetchTransactions(activeAccountId);
    } else if (accounts.length === 0) {
      // If no accounts, fetch all transactions
      fetchTransactions(null);
    }
  }, [activeAccountId, accounts]);

  const activeAccount = accounts.find(
    (acc) => String(acc._id) === activeAccountId,
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-semibold text-gray-800">
            Company Balance
          </h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-semibold text-gray-800">
              Company Balance
            </h3>
          </div>
          <button
            onClick={fetchBalanceData}
            className="text-gray-400 hover:text-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-semibold text-gray-800">
              Company Balance
            </h3>
          </div>
          <button
            onClick={fetchBalanceData}
            className="text-gray-400 hover:text-teal-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-2xl font-bold text-teal-600">
            ${formatCurrency(totalBalance)}
          </span>
          <span className="text-xs text-gray-500">
            total across all accounts
          </span>
        </div>
      </div>

      {accounts.length > 0 && (
        <>
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {accounts.map((acc) => (
              <button
                key={String(acc._id)}
                onClick={() => setActiveAccountId(String(acc._id))}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
                  activeAccountId === String(acc._id)
                    ? "border-teal-500 text-teal-600 bg-teal-50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {acc.name}
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    activeAccountId === String(acc._id)
                      ? "bg-teal-100 text-teal-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {acc.transactionCount}
                </span>
              </button>
            ))}
          </div>

          <div className="px-4 py-4">
            {activeAccount ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Transactions
                    <span className="ml-1 normal-case text-gray-400">
                      (click to expand)
                    </span>
                  </span>
                  <span className="text-sm font-bold text-teal-600">
                    Balance: ${formatCurrency(activeAccount.totalAmount)}
                  </span>
                </div>

                {loadingTransactions ? (
                  <div className="py-4 text-center text-gray-400">
                    Loading transactions...
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400">
                      No transactions found for this account.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto pr-1">
                    {transactions.map((tx) => (
                      <TransactionCard key={String(tx._id)} tx={tx} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">
                Select an account tab to view transactions.
              </p>
            )}
          </div>
        </>
      )}

      {accounts.length === 0 && (
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              All Transactions
            </span>
          </div>
          {loadingTransactions ? (
            <div className="py-4 text-center text-gray-400">
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-400">No transactions found.</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto pr-1">
              {transactions.map((tx) => (
                <TransactionCard key={String(tx._id)} tx={tx} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CompanyBalancePanel;
