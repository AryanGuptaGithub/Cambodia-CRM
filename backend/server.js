// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./utils/db.js";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import fs from "fs";

// ── Observability ────────────────────────────────────────────────────────────
import { traceMiddleware } from "./middleware/traceMiddleware.js";
import { scheduleReconciliation } from "./observability/reconciliation.js";
import logViewerRoutes from "./routers/observability/logViewerRoutes.js";
// ────────────────────────────────────────────────────────────────────────────

// ==================== IMPORT ALL ROUTES ====================
import customerRoutes from "./routers/master/customers.js";
import suppilerRoutes from "./routers/master/supplier.js";
import product from "./routers/projectManager/product.js";
import authRoutes from "./routers/authRoutes.js";
import staff from "./routers/staffMember/staff.js";
import priceList from "./routers/projectManager/pricelist.js";
import sales from "./routers/sale/saleSummary.js";
import payments from "./routers/reports/payments.js";
import dailySample from "./routers/reports/dailysample.js";
import purcharse from "./routers/purchasing/purchasing.js";
import dailySummary from "./routers/reports/dailysummary.js";
import dailyReports from "./routers/reports/dailyReports.js";
import SalesReturn from "./routers/sale/saleReturn.js";
import stockAdjustment from "./routers/stock/stockAdjustment.js";
import stockTransfer from "./routers/stock/stockTransfer.js";
import orderStatus from "./routers/stock/orderStatus.js";
import purchaseReturn from "./routers/purchasing/purchaseReturn.js";
import PurchaseOut from "./routers/purchasing/paymentOut.js";
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
import mrAdvanceRoutes from "./routers/hrm/mrAdvance.js";
import customerRepeateRate from "./routers/reports/customerRepeatRate.js";
import stockInHandRoutes from "./routers/reports/stockInHand.js";
import activityLogRoutes from "./routers/activity/activityLog.js";
import observabilityRoutes from "./routers/observability/observabilityRoutes.js";
import { protect } from "./middleware/auth.js";

// ── Bootstrap ────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Helpers ──────────────────────────────────────────────────────────────────
function findFrontendBuild() {
  const candidates = [
    path.join(__dirname, "../../frontend/dist"),
    path.join(__dirname, "../frontend/dist"),
    path.join(process.cwd(), "frontend/dist"),
    path.join(__dirname, "../dist"),
    path.join(process.cwd(), "dist"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "index.html"))) {
      console.log(`✅ Found frontend build at: ${p}`);
      return p;
    }
  }
  console.warn("⚠️  Frontend build not found!");
  return null;
}

// ============================================================
//  MIDDLEWARE STACK  (order matters — do not rearrange)
// ============================================================

app.use(express.json());

// 1. Security headers
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// 2. Compression + HTTP logging
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "combined"));

// 3. Trace ID — must be before CORS so the header is exposed correctly
app.use(traceMiddleware);

// 4. CORS — must be before ALL route handlers so preflight + headers are set
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:3001",
  "https://fcrmcambodia.healthcarese.asia",
  "https://www.fcrmcambodia.healthcarese.asia",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"));
      }
    },
    credentials:    true,
    methods:        ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Trace-ID"],
    exposedHeaders: ["X-Trace-ID"],
  }),
);

// 5. Rate limiting
app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      1000,
  message:  "Too many requests from this IP, please try again later.",
}));

// 6. Body parsing
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// 7. Extra security headers + cache-control for PWA assets
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (["/manifest.json", "/service-worker.js", "/sw.js"].includes(req.url)) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  next();
});

// 8. Dev request logger
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ============================================================
//  DATABASE + BACKGROUND JOBS
// ============================================================
connectDB(process.env.MONGODB_URI)
  .then(() => {
    setTimeout(() => {
      scheduleReconciliation();
      console.log("✅ Reconciliation job scheduled");
    }, 5000);
  })
  .catch((err) => {
    console.error("❌ DB connection failed:", err.message);
  });

// ============================================================
//  ROUTES
// ============================================================

// ── Health check ─────────────────────────────────────────────
app.get("/health",  (req, res) => {
  res.json({
    status:      "healthy",
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    port:        PORT,
    traceId:     req.traceId,
  });
});

app.get("/api/test", (req, res) => {
  res.json({ success: true, message: "API is working", port: PORT });
});

// ── Observability (log viewer + system events) ────────────────
app.use("/api/logs",         logViewerRoutes);      // ✅ now after CORS
app.use("/api/observability", observabilityRoutes);

// ── Auth ──────────────────────────────────────────────────────
app.use("/api", authRoutes);

// ── Master data ───────────────────────────────────────────────
app.use("/api/customers",        customerRoutes);
app.use("/api/suppliers",        suppilerRoutes);
app.use("/api/zones",            zone);
app.use("/api/business-types",   businessTypes);
app.use("/api/staff",            staff);

// ── Product manager ───────────────────────────────────────────
app.use("/api/products",              product);
app.use("/api/price-lists",           priceList);
app.use("/api/product-types",         productType);
app.use("/api/product-packing-types", productPackingType);

// ── Sales ─────────────────────────────────────────────────────
app.use("/api/sales",         sales);
app.use("/api/sales-return",  SalesReturn);
app.use("/api/sales-summary", SaleSummaryReport);
app.use("/api/outstanding",   outstanding);

// ── Purchasing ────────────────────────────────────────────────
app.use("/api/purchase",        purcharse);
app.use("/api/purchase-return", purchaseReturn);
app.use("/api/purchase-out",    PurchaseOut);

// ── Stock ─────────────────────────────────────────────────────
app.use("/api/stock-adjustment",    stockAdjustment);
app.use("/api/stock-transfer",      stockTransfer);
app.use("/api/stock-transfer-to-mr", stockTransferToMR);
app.use("/api/stock-return",        StockReturn);
app.use("/api/order-status",        orderStatus);
app.use("/api/stock-in-hand",       stockInHandRoutes);

// ── Accounts ──────────────────────────────────────────────────
app.use("/api/accounts",     Accounts);
app.use("/api/transactions", Transaction);
app.use("/api/mr-cash",      mrCash);

// ── Expenses ──────────────────────────────────────────────────
app.use("/api/expense-categories", addExpenseCategary);
app.use("/api/expenses",           addExpense);

// ── HRM ───────────────────────────────────────────────────────
app.use("/api/hrm/mr-advance",      mrAdvanceRoutes);
app.use("/api/hrm/holidays",        Holiday);
app.use("/api/hrm/payroll-export",  payrollExport);
app.use("/api/hrm/payroll",         Payroll);
app.use("/api/hrm/dashboard",       hrmDashboard);
app.use("/api/hrm/leaves",          leaves);
app.use("/api/hrm/mr-basic-payrolls", mrBasicPayrollRoutes);

// ── Reports ───────────────────────────────────────────────────
app.use("/api/reports/payments",                  payments);
app.use("/api/reports/daily-sample",              dailySample);
app.use("/api/reports/daily-summary",             dailySummary);
app.use("/api/reports/daily-reports",             dailyReports);
app.use("/api/reports/cash-sales",                cashSaleReports);
app.use("/api/reports/remittance",                remittance);
app.use("/api/reports/total-expense",             totalExpense);
app.use("/api/reports/mr-wise-outstanding",       mrWiseOutStanding);
app.use("/api/reports/mr-wise-sales",             mrWiseSale);
app.use("/api/reports/new-customers",             newCustomer);
app.use("/api/reports/customer-retention",        customerRetention);
app.use("/api/reports/customer-repeate",          customerRepeateRate);
app.use("/api/reports/zone-wise-customers",       zoneWiseCustomer);
app.use("/api/reports/province-wise-customers",   provinceWiseCustomerRoutes);
app.use("/api/reports/customer-expectation-ratio", customerExpentationRatio);
app.use("/api/reports/province-wise-sales",       provinceWiseSaleRoutes);
app.use("/api/reports/stock-in-hand",             stockInHand);
app.use("/api/reports/expiry-stock",              expiryStockReport);
app.use("/api/reports/product-report",            productReport);
app.use("/api/reports/sales-and-salary",          saleAndSalary);
app.use("/api/reports/profit-and-loss",           profitAndLoss);
app.use("/api/reports/outstanding-collections",   outstandingCollections);
app.use("/api/reports/salary-cogs-ratio",         salaryCogsRatio);
app.use("/api/reports/operation-cost-sales-ratio", operationCostSalesRatio);
app.use("/api/reports/operation-cost-cogs-ratio", operationCostCOGSRatio);
app.use("/api/reports/tour-expense-sales",        tourExpenseSales);
app.use("/api/reports/average-price",             averagePrice);

// ── Settings + misc ───────────────────────────────────────────
app.use("/api/company-profile", companyProfile);
app.use("/api/h-tabs",          hTabsRoutes);
app.use("/api/overdue",         overdue);
app.use("/api/activity-logs",   activityLogRoutes);

// ============================================================
//  FRONTEND STATIC FILES  (production only)
// ============================================================
const frontendBuildPath = findFrontendBuild();

if (frontendBuildPath && process.env.NODE_ENV === "production") {
  app.use(
    express.static(frontendBuildPath, {
      maxAge: "1y",
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  app.get("/manifest.json", (req, res) => {
    const p = path.join(frontendBuildPath, "manifest.json");
    if (fs.existsSync(p)) {
      res.setHeader("Content-Type", "application/manifest+json");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(p);
    } else {
      res.status(404).json({ error: "Manifest not found" });
    }
  });

  app.get("/service-worker.js", (req, res) => {
    const p = path.join(frontendBuildPath, "service-worker.js");
    if (fs.existsSync(p)) {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(p);
    } else {
      res.status(404).json({ error: "Service worker not found" });
    }
  });

  app.get("*splat", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ success: false, message: `Not found: ${req.path}` });
    }
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|json)$/)) {
      return res.status(404).send("File not found");
    }
    const indexPath = path.join(frontendBuildPath, "index.html");
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("Frontend build not found.");
  });
}

// ============================================================
//  ERROR HANDLERS
// ============================================================

// 404 for unknown API paths
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ success: false, message: `API not found: ${req.originalUrl}` });
  }
  next();
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    traceId: req.traceId || null,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ============================================================
//  START
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Login API:    http://localhost:${PORT}/api/login`);
  console.log(`📋 Log viewer:  http://localhost:${PORT}/api/logs/dates`);
  console.log(`🔍 Trace IDs:   active on all requests (X-Trace-ID header)`);
  if (frontendBuildPath) console.log(`📁 Frontend:    ${frontendBuildPath}`);
});