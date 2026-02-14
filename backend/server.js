import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./utils/db.js";
import bodyParser from "body-parser";

import customerRoutes from "./routers/master/customers.js";
import suppilerRoutes from "./routers/master/supplier.js";
import product from "./routers/projectManager/product.js";
import authRoutes from "./routers/authRoutes.js";
import staff from "./routers/staffMember/staff.js";
import priceList from "./routers/projectManager/pricelist.js";
import sales from "./routers/sale/saleSummary.js";
import payments from "./routers/reports/payments.js";
import dailySample from "./routers/reports/dailysample.js";
import purcharse from "./routers/purcharsing/purcharsing.js";
import dailySummary from "./routers/reports/dailysummary.js";
import dailyReports from "./routers/reports/dailyReports.js";
import SalesReturn from "./routers/sale/saleReturn.js";
import stockAdjustment from "./routers/stock/stockAdjustment.js";
import stockTransfer from "./routers/stock/stockTransfer.js";
import orderStatus from "./routers/stock/orderStatus.js";
import purchaseReturn from "./routers/purcharsing/purchaseReturn.js";
import PurchaseOut from "./routers/purcharsing/paymentOut.js";
import Accounts from "./routers/accounts/accounts.js";
import Transaction from "./routers/accounts/transaction.js";
import addExpenseCategary from "./routers/expenses/addExpenseCategary.js";
import addExpense from "./routers/expenses/addExpense.js";
import cashSaleReports from "./routers/reports/cashSaleReports.js";
import remittance from "./routers/reports/remittance.js";
import totalExpense from "./routers/reports/totalExpense.js";
import mrWiseOutStanding from "./routers/reports/mrWiseOutStanding.js";
import mrWiseSale from "./routers/reports/mrWiseSale.js";
import newCustomer from "./routers/reports/newCustomer.js";
import zoneWiseCustomer from "./routers/reports/zoneWiseCustomer.js";
import customerRetention from "./routers/reports/customerRetentions.js";
import customerExpentationRatio from "./routers/reports/customerExpentationRatio.js";
import provinceWiseSaleRoutes from "./routers/reports/provinceWiseSale.js";
import provinceWiseCustomerRoutes from "./routers/reports/provinceWiseCustomer.js";
import stockInHand from "./routers/reports/stockInHand.js";
import companyProfile from "./routers/settings/companyProfile.js";
import hTabsRoutes from "./routers/settings/tabSetting.js";
import Holiday from "./routers/hrm/Holiday.js";
import Payroll from "./routers/hrm/payroll.js";
import zone from "./routers/master/zone.js";
import businessTypes from "./routers/master/businessType.js";
import productType from "./routers/projectManager/productType.js";
import productPackingType from "./routers/projectManager/productPackingType.js";
import saleAndSalary from "./routers/reports/saleAndSalary.js";
import profitAndLoss from "./routers/reports/ProfitAndLoss.js";
import expiryStockReport from "./routers/reports/expiryStockReport.js";
import hrmDashboard from "./routers/hrm/dashboard.js";
import payrollExport from "./routers/hrm/payrollExport.js";
import leaves from "./routers/hrm/Leave.js";
import stockTransferToMR from "./routers/stock/stockTransferToMRRoutes.js";
import StockReturn from "./routers/stock/stockReturn.js";
import mrCash from "./routers/accounts/mrCashRoutes.js";
import overdue from "./routers/overdue.js";
import productReport from "./routers/reports/productReport.js";
import outstandingCollections from "./routers/reports/outstandingCollections.js";
import salaryCogsRatio from "./routers/reports/salaryCOGSRatio.js";
import operationCostCOGSRatio from "./routers/reports/operationCostCOGSRatio.js";
import operationCostSalesRatio from "./routers/reports/operationCostSalesRatio.js";
import tourExpenseSales from "./routers/reports/tourExpenseSales.js";
import SaleSummaryReport from "./routers/reports/SaleSummary.js";
import mrBasicPayrollRoutes from "./routers/hrm/mrBasicPayrollRoutes.js";
import outstanding from "./routers/sale/outstanding.js";
import averagePrice from "./routers/reports/averagePrice.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://fcrmcambodia.healthcarese.asia",
  "http://fcrmcambodia.healthcarese.asia",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

connectDB(process.env.MONGODB_URI);
app.use(express.json());

// Debugging middleware (optional - remove in production)
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROUTES REGISTRATION
// ============================================
// NOTE: Order matters! More specific routes should come BEFORE generic ones

// Auth Routes (no prefix needed, already has /auth in router)
app.use("/api", authRoutes);

// Master Data Routes
app.use("/api/customers", customerRoutes);
app.use("/api/suppliers", suppilerRoutes);
app.use("/api/zones", zone);
app.use("/api/business-types", businessTypes);

// Staff Routes
app.use("/api/staff", staff);

// Product Management Routes
app.use("/api/products", product);
app.use("/api/price-lists", priceList);
app.use("/api/product-types", productType);
app.use("/api/product-packing-types", productPackingType);

// Sales Routes
app.use("/api/sales", sales);
app.use("/api/sales-return", SalesReturn);
app.use("/api/sales-summary", SaleSummaryReport);
app.use("/api/outstanding", outstanding);

// Purchase Routes
app.use("/api/purchase", purcharse);
app.use("/api/purchase-return", purchaseReturn);
app.use("/api/purchase-out", PurchaseOut);

// Stock Management Routes
app.use("/api/stock-adjustment", stockAdjustment);
app.use("/api/stock-transfer", stockTransfer);
app.use("/api/stock-transfer-to-mr", stockTransferToMR);
app.use("/api/stock-return", StockReturn);
app.use("/api/order-status", orderStatus);

// Accounts Routes
app.use("/api/accounts", Accounts);
app.use("/api/transactions", Transaction);
app.use("/api/mr-cash", mrCash);

// Expense Routes
app.use("/api/expense-categories", addExpenseCategary);
app.use("/api/expenses", addExpense);

// Reports Routes
app.use("/api/reports/payments", payments);
app.use("/api/reports/daily-sample", dailySample);
app.use("/api/reports/daily-summary", dailySummary);
app.use("/api/reports/daily-reports", dailyReports);
app.use("/api/reports/cash-sales", cashSaleReports);
app.use("/api/reports/remittance", remittance);
app.use("/api/reports/total-expense", totalExpense);
app.use("/api/reports/mr-wise-outstanding", mrWiseOutStanding);
app.use("/api/reports/mr-wise-sales", mrWiseSale);
app.use("/api/reports/new-customers", newCustomer);
app.use("/api/reports/customer-retention", customerRetention);
app.use("/api/reports/zone-wise-customers", zoneWiseCustomer);
app.use("/api/reports/province-wise-sales", provinceWiseSaleRoutes);
app.use("/api/reports/customer-expectation-ratio", customerExpentationRatio);
app.use("/api/reports/stock-in-hand", stockInHand);
app.use("/api/reports/province-wise-customers", provinceWiseCustomerRoutes);
app.use("/api/reports/sales-and-salary", saleAndSalary);
app.use("/api/reports/profit-and-loss", profitAndLoss);
app.use("/api/reports/expiry-stock", expiryStockReport);
app.use("/api/reports/product-report", productReport);
app.use("/api/reports/outstanding-collections", outstandingCollections);
app.use("/api/reports/salary-cogs-ratio", salaryCogsRatio);
app.use("/api/reports/operation-cost-sales-ratio", operationCostSalesRatio);
app.use("/api/reports/operation-cost-cogs-ratio", operationCostCOGSRatio);
app.use("/api/reports/tour-expense-sales", tourExpenseSales);
app.use("/api/reports/average-price", averagePrice);

// Settings Routes
app.use("/api/company-profile", companyProfile);
app.use("/api/h-tabs", hTabsRoutes);

// HRM Routes
app.use("/api/hrm/holidays", Holiday);
app.use("/api/hrm/payroll-export", payrollExport);
app.use("/api/hrm/payroll", Payroll);
app.use("/api/hrm/dashboard", hrmDashboard);

app.use("/api/hrm/leaves", leaves);
app.use("/api/hrm/mr-basic-payrolls", mrBasicPayrollRoutes);

// Other Routes
app.use("/api/overdue", overdue);

// 404 Handler - This should be LAST
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});