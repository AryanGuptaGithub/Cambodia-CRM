// server.js - Fix the import and route registration
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./utils/db.js";
import bodyParser from "body-parser";

import customerRoutes from "./routers/master/customers.js";
import suppilerRoutes from "./routers/master/supplier.js";
import brand from "./routers/projectManager/brands.js";
import product from "./routers/projectManager/product.js";
import authRoutes from "./routers/authRoutes.js";
import staff from "./routers/staffMember/staff.js";
import priceList from "./routers/projectManager/pricelist.js";
import saleSummary from "./routers/sale/saleSummary.js";
import payments from "./routers/reports/payments.js";
import dailySample from "./routers/reports/dailysample.js";
import purcharse from "./routers/purcharsing/purcharsing.js";
import dailySummary from "./routers/reports/dailysummary.js";
import dailyReports from "./routers/reports/dailyReports.js";
import SalesReturn from "./routers/sale/saleReturn.js";
import stockAdjustment from "./routers/stock/stockAdjustment.js";
import stockTransfer from "./routers/stock/stockTransfer.js";
import warehouse from "./routers/stock/warehouse.js";
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
import Attendance from "./routers/hrm/Attendance.js";
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

dotenv.config();

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
const PORT = process.env.PORT || 3000;

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

app.use("/api", customerRoutes);
app.use("/api", suppilerRoutes);
app.use("/api", brand);
app.use("/api", product);
app.use("/api", authRoutes);
app.use("/api", staff);
app.use("/api", priceList);
app.use("/api", saleSummary);
app.use("/api", payments);
app.use("/api", dailySample);
app.use("/api", purcharse);
app.use("/api", dailySummary);
app.use("/api", dailyReports);
app.use("/api", SalesReturn);
app.use("/api", stockAdjustment);
app.use("/api", warehouse);
app.use("/api", orderStatus);
app.use("/api", purchaseReturn);
app.use("/api", PurchaseOut);
app.use("/api", Accounts);
app.use("/api", Transaction);
app.use("/api", addExpenseCategary);
app.use("/api", addExpense);
app.use("/api", cashSaleReports);
app.use("/api", remittance);
app.use("/api", totalExpense);
app.use("/api", mrWiseOutStanding);
app.use("/api", mrWiseSale);
app.use("/api", newCustomer);
app.use("/api", zoneWiseCustomer);
app.use("/api", customerRetention);
app.use("/api", customerExpentationRatio);
app.use("/api", provinceWiseSaleRoutes);
app.use("/api", provinceWiseCustomerRoutes);
app.use("/api", stockInHand);
app.use("/api", companyProfile);
app.use("/api", hTabsRoutes);
app.use("/api", Holiday);
app.use("/api", Attendance);
app.use("/api", Payroll);
app.use("/api/zones", zone);
app.use("/api", businessTypes);
app.use("/api", productType);
app.use("/api", productPackingType);
app.use("/api", saleAndSalary);
app.use("/api", profitAndLoss);
app.use("/api", expiryStockReport);
app.use("/api", hrmDashboard);
app.use("/api", payrollExport);
app.use("/api", leaves);
app.use("/api", stockTransferToMR);
app.use("/api", stockTransfer);
app.use("/api", StockReturn);
app.use("/api", mrCash);
app.use("/api", overdue);
app.use("/api", productReport);
app.use("/api", outstandingCollections);
app.use("/api", salaryCogsRatio);
app.use("/api", operationCostCOGSRatio);
app.use("/api", operationCostSalesRatio);
app.use("/api", tourExpenseSales);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
