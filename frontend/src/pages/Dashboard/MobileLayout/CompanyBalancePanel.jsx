import React, { useState, useEffect } from "react";
import axios from "axios";
import { Building2, TrendingDown, TrendingUp, RefreshCw } from "lucide-react";
import { formatCurrency } from "../DashboardUtil";

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
  const [expanded, setExpanded] = useState(false);

  const isCredit = tx.direction === "credit";
  const isDebit = tx.direction === "debit";

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
      ? { label: "Exchange Loss", value: `$${formatCurrency(tx.exchangeLoss)}` }
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

  let iconBg = "bg-gray-100";
  let iconColor = "text-gray-600";
  let IconComponent = TrendingUp;
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
  }

  return (
    <div className="border border-gray-200 rounded-xl mb-3 overflow-hidden bg-white">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}
          >
            <IconComponent className={`w-3.5 h-3.5 ${iconColor}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeBadgeClass(tx.transactionType)}`}
              >
                {toTitle(tx.transactionType)}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {formatDate(tx.date)}
            </p>
          </div>
        </div>

        <div className={`font-semibold text-sm ${amountColor}`}>
          {isCredit ? "+" : isDebit ? "−" : ""}${formatCurrency(tx.amount)}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-3 py-2 text-[10px]">
          <table className="w-full">
            <tbody>
              {detailRows.map((row, idx) => (
                <tr
                  key={idx}
                  className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
                >
                  <td className="py-1.5 pr-3 font-medium text-gray-500 w-36 whitespace-nowrap border-r border-gray-100">
                    {row.label}
                  </td>
                  <td className="py-1.5 text-gray-800">{row.value}</td>
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
      const url = accountId
        ? `${backendUrl}/api/accounts/transactions?accountId=${accountId}`
        : `${backendUrl}/api/accounts/transactions`;
      const response = await axios.get(url);
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
      fetchTransactions(null);
    }
  }, [activeAccountId, accounts]);

  const activeAccount = accounts.find(
    (acc) => String(acc._id) === activeAccountId,
  );

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-teal-600" />
          <h3 className="text-xs font-semibold text-gray-800">
            Company Balance
          </h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 bg-gray-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
        <p className="text-red-500 text-xs">{error}</p>
        <button
          onClick={fetchBalanceData}
          className="mt-2 text-blue-600 text-[11px]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-teal-600" />
            <h3 className="text-xs font-semibold text-gray-800">
              Company Balance
            </h3>
          </div>
          <button
            onClick={fetchBalanceData}
            className="text-gray-400 hover:text-teal-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="mt-2">
          <span className="text-xl font-bold text-teal-600">
            ${formatCurrency(totalBalance)}
          </span>
          <span className="text-[10px] text-gray-500 ml-2">
            total across all accounts
          </span>
        </div>
      </div>

      {/* Account Tabs */}
      {accounts.length > 0 && (
        <div className="flex border-b border-gray-100 overflow-x-auto bg-gray-50">
          {accounts.map((acc) => (
            <button
              key={String(acc._id)}
              onClick={() => setActiveAccountId(String(acc._id))}
              className={`flex-shrink-0 px-1 py-2 text-[9px] font-medium whitespace-nowrap border-b-2 transition-all ${
                activeAccountId === String(acc._id)
                  ? "border-teal-500 text-teal-700 bg-white"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
            >
              {acc.name}
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeAccountId === String(acc._id)
                    ? "bg-teal-100 text-teal-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {acc.transactionCount || 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Transactions Area */}
      <div className="p-3">
        {activeAccount ? (
          <>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] uppercase tracking-widest text-gray-500">
                Recent Transactions
              </span>
              <span className="text-[11px] font-medium text-teal-600">
                Balance: ${formatCurrency(activeAccount.totalAmount || 0)}
              </span>
            </div>

            {loadingTransactions ? (
              <div className="py-6 text-center text-gray-400 text-[11px]">
                Loading transactions...
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[11px] text-gray-400">
                  No transactions found for this account
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {transactions.map((tx) => (
                  <TransactionCard key={String(tx._id)} tx={tx} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="py-10 text-center text-gray-400 text-[11px]">
            Select an account above to view transactions
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyBalancePanel;