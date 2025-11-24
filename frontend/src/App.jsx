import React from "react";
import { Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute";

// Layout components
import DashboardLayout from "./pages/DashboardLayout";
import MasterLayout from "./pages/MasterLayout";
import SettingsLayout from "./pages/SettingsLayout";
import ProductManagerLayout from "./pages/ProductManagerLayout";
import PurchaseLayout from "./pages/PurchaseLayout";
import SaleLayout from "./pages/SaleLayout";
import ExpenseLayout from "./pages/ExepenseLayout"; 
import ReportsLayout from "./pages/ReportsLayout";
import UtilityLayout from "./pages/UtilityLayout";
import HrmLayout from "./pages/HrmLayout";
import CashAndBankLayout from "./pages/CashAndBankLayout";
import StaffMemberLayout from "./pages/Utility/StaffMemberLayout";

// Dashboard and Main pages
import Dashboard from "./pages/Dashboard/Dashbaord";
import Login from "./pages/Login";
import OnlineOrders from "./pages/OnlineOrders";
import StaffMember from "./pages/StaffMember";
import StockAdjustment from "./pages/StockAdjustment";
import StockTransfer from "./pages/StockTransfer";
import Graph from "./pages/graph";

// Master pages
import Customer from "./pages/Master/Customer";
import Supplier from "./pages/Master/Supplier";
import AddSupplier from "./pages/Master/addsupplier";
import AddCustomer from "./pages/Master/addcustomer";

// Settings pages
import CompanyProfile from "./pages/Settings/CompanyProfile";
import HTabsManipulation from "./pages/Settings/HTabsManipulation";

// Product Manager pages
import Brands from "./pages/ProductManager/Brands";
import Categories from "./pages/ProductManager/Categories";
import PriceList from "./pages/ProductManager/PriceList";
import Product from "./pages/ProductManager/Product";
import PrintBarCode from "./pages/ProductManager/PrintBarCode";
import AddProductForm from "./pages/ProductManager/addProduct";

// Purchase pages
import Purchase from "./pages/Purchase/Purchase";
import PurchaseReturn from "./pages/Purchase/PurchaseReturn";
import PurchaseOut from "./pages/Purchase/PurchaseOut";
import AddNewPurchase from "./pages/Purchase/addNewPurchase";
import AddReturnPurchase from "./pages/Purchase/addReturnPurchase";

// Sale pages
import Sale from "./pages/Sale/Sale";
import Quotation from "./pages/Sale/Quotation";
import SaleReturn from "./pages/Sale/SaleReturn";
import PaymentSale from "./pages/Sale/PaymentSale";
import AddSale from "./pages/Sale/AddSale";
import AddReturnSale from "./pages/Sale/addSaleReturn";

// Expense pages
import Expenses from "./pages/Expense/Expenses";
import ExpenseCategory from "./pages/Expense/ExpenseCategory";
import AddExpense from "./pages/Expense/addExpense";
import AddExpenseCategory from "./pages/Expense/addExpenseCategory";

// Report pages
import ExpenseReport from "./pages/Reports/ExpenseReport";
import ProductSalesSummary from "./pages/Reports/ProductSalesSummary";
import StockAlert from "./pages/Reports/StockAlert";
import DailySample from "./pages/Reports/DailySample";
import RateList from "./pages/Reports/RateList";
import ProfitLoss from "./pages/Reports/PLReport";
import SaleSummary from "./pages/Reports/SaleSummary";
import UserReport from "./pages/Reports/UserReport";
import PaymentReports from "./pages/Reports/PaymentReports";

// New report components
import TotalCashSales from "./pages/Reports/TotalCashSales";
import OutstandingCollection from "./pages/Reports/OutstandingCollection";
import TotalExpense from "./pages/Reports/TotalExpense";
import Remittance from "./pages/Reports/Remittance";
import MRWiseOutstanding from "./pages/Reports/MRWiseOutstanding";
import MRWiseSales from "./pages/Reports/MRWiseSales";
import AveragePricePerProduct from "./pages/Reports/AveragePricePerProduct";
import NewCustomerAddition from "./pages/Reports/NewCustomerAddition";
import CustomerRetentionRate from "./pages/Reports/CustomerRetentionRate";
import CustomerProductAcceptanceRate from "./pages/Reports/CustomerProductAcceptanceRate";
import ZoneWiseCustomers from "./pages/Reports/ZoneWiseCustomers";
import MonthlyCustomerRepeatRate from "./pages/Reports/MonthlyCustomerRepeatRate";
import AnnualCustomerRepeatRate from "./pages/Reports/AnnualCustomerRepeatRate";
import SalesSalaryRatio from "./pages/Reports/SalesSalaryRatio";
import SalaryCOGSRatio from "./pages/Reports/SalaryCOGSRatio";
import OperationCostCOGSRatio from "./pages/Reports/OperationCostCOGSRatio";
import OperationCostSalesRatio from "./pages/Reports/OperationCostSalesRatio";
import TourExpenseSalesRatio from "./pages/Reports/TourExpenseSalesRatio";
import PLReport from "./pages/Reports/PLReport";
import ProvinceWiseSale from "./pages/Reports/ProvinceWiseSale";
import ProvinceWiseCustomer from "./pages/Reports/ProvinceWiseCustomer";
import ReportsInHand from "./pages/Reports/ReportsInHand";
import ProductReport from "./pages/Reports/ProductReport";
import ExpiryStockReport from "./pages/Reports/ExpiryStockReport";

// Report form pages
import AddDailReports from "./pages/Reports/AddDailyReports";
import AddDailySampleReport from "./pages/Reports/AddDailySample";
import AddDailySummaryReports from "./pages/Reports/AddNewSaleSummaryReports";

// Utility pages
import FrontSettings from "./pages/Utility/FrontSettings";
import ProductCard from "./pages/Utility/ProductCard";

import HrmDashboard from "./pages/HRM/Dashboard"; // Renamed to avoid conflict
import Holidays from "./pages/HRM/Holidays";
import Leaves from "./pages/HRM/Leaves";
import Payroll from "./pages/HRM/Payroll";
import AddPayroll from "./pages/HRM/addPayroll";

import CashAndBank from "./pages/Account/CashAndBank";

// Other components
import StockTransferForm from "./pages/StockTransferForm";
import AddStaffMember from "./pages/AddStaffMember";
import LeaveAndAttendance from "./pages/HRM/LeaveAttendance";

function App() {
  return (
    <>
      <Toaster position="bottom-right" reverseOrder={false} />
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Main Dashboard Route */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard routes */}
          <Route index element={<Dashboard />} /> {/* Main dashboard page */}
          <Route path="dashboard" element={<Dashboard />} />{" "}
          {/* Alternative dashboard route */}
          <Route path="graph" element={<Graph />} />
          <Route path="onlineorder" element={<OnlineOrders />} />
          <Route path="stockadjustment" element={<StockAdjustment />} />
          <Route path="stocktransfer" element={<StockTransfer />} />
          <Route path="stocktransferform" element={<StockTransferForm />} />
          {/* Account routes */}
          <Route path="accountlayout" element={<CashAndBankLayout />}>
            <Route index element={<CashAndBank />} />
          </Route>
          {/* Staff Member routes */}
          <Route path="staffmemberLayout" element={<StaffMemberLayout />}>
            <Route path="staffmember" element={<StaffMember />} />
            <Route path="staffmember/add" element={<AddStaffMember />} />
          </Route>
          {/* Master routes */}
          <Route path="masterlayout" element={<MasterLayout />}>
            <Route index element={<Customer />} />
            <Route path="customer" element={<Customer />} />
            <Route path="customer/new" element={<AddCustomer />} />
            <Route path="supplier" element={<Supplier />} />
            <Route path="supplier/new" element={<AddSupplier />} />
          </Route>
          {/* Settings routes */}
          <Route path="settingslayout" element={<SettingsLayout />}>
            <Route index element={<CompanyProfile />} />
            <Route path="company-profile" element={<CompanyProfile />} />
            <Route path="tab-manipulation" element={<HTabsManipulation />} />
          </Route>
          {/* Product Manager routes */}
          <Route path="productmanagerlayout" element={<ProductManagerLayout />}>
            <Route index element={<Product />} />
            <Route path="brands" element={<Brands />} />
            <Route path="categories" element={<Categories />} />
            <Route path="pricelist" element={<PriceList />} />
            <Route path="product" element={<Product />} />
            <Route path="addproduct" element={<AddProductForm />} />
            <Route path="printbarcode" element={<PrintBarCode />} />
          </Route>
          <Route path="purchaselayout" element={<PurchaseLayout />}>
            <Route index element={<Purchase />} />
            <Route path="purchase" element={<Purchase />} />
            <Route path="purchase/new" element={<AddNewPurchase />} />
            <Route path="purchasereturn" element={<PurchaseReturn />} />
            <Route path="purchasereturn/new" element={<AddReturnPurchase />} />
            <Route path="purchaseout" element={<PurchaseOut />} />
          </Route>
          {/* Sale routes */}
          <Route path="salelayout" element={<SaleLayout />}>
            <Route index element={<Sale />} />
            <Route path="sale">
              <Route index element={<Sale />} />
              <Route path="new" element={<AddSale />} />
            </Route>
            <Route path="salereturn">
              <Route index element={<SaleReturn />} />
              <Route path="new" element={<AddReturnSale />} />
            </Route>
            <Route path="payment" element={<PaymentSale />} />
            <Route path="quotation" element={<Quotation />} />
          </Route>
          {/* Expense routes */}
          <Route path="expenselayout" element={<ExpenseLayout />}>
            <Route index element={<Expenses />} />
            <Route path="expenses">
              <Route index element={<Expenses />} />
              <Route path="new" element={<AddExpense />} />
            </Route>
            <Route path="expensecategories">
              <Route index element={<ExpenseCategory />} />
              <Route path="new" element={<AddExpenseCategory />} />
            </Route>
          </Route>
          {/* Report routes */}
          <Route path="reportlayout" element={<ReportsLayout />}>
            <Route index element={<AddDailReports />} />
            <Route path="dailyreport" element={<AddDailReports />} />

            {/* New Report Routes */}
            <Route path="averageprice" element={<AveragePricePerProduct />} />
            <Route
              path="newcustomeraddition"
              element={<NewCustomerAddition />}
            />

            {/* Master Customer Report Routes */}
            <Route
              path="customerretention"
              element={<CustomerRetentionRate />}
            />
            <Route
              path="customeracceptance"
              element={<CustomerProductAcceptanceRate />}
            />
            <Route path="zonewisecustomers" element={<ZoneWiseCustomers />} />

            {/* Repeat Rate Routes */}
            <Route
              path="monthlyrepeatrate"
              element={<MonthlyCustomerRepeatRate />}
            />
            <Route
              path="annualrepeatrate"
              element={<AnnualCustomerRepeatRate />}
            />

            {/* Product Reports */}
            <Route path="product-report" element={<ProductReport />} />

            {/* MR Wise Reports */}
            <Route path="mrwiseoutstanding" element={<MRWiseOutstanding />} />
            <Route path="mrwisesales" element={<MRWiseSales />} />

            {/* Financial Reports */}
            <Route path="cashsales" element={<TotalCashSales />} />
            <Route
              path="outstandingcollection"
              element={<OutstandingCollection />}
            />
            <Route path="totalexpense" element={<TotalExpense />} />
            <Route path="remittance" element={<Remittance />} />

            {/* Province Wise Reports */}
            <Route path="province-wise-sale" element={<ProvinceWiseSale />} />
            <Route
              path="province-wise-customer"
              element={<ProvinceWiseCustomer />}
            />

            {/* Reports in Hand */}
            <Route path="reports-in-hand" element={<ReportsInHand />} />

            {/* Expiry Stock Report */}
            <Route path="expiry-stock-report" element={<ExpiryStockReport />} />

            <Route path="payment" element={<PaymentReports />} />

            {/* Financial Ratio Reports */}
            <Route path="sales-salary-ratio" element={<SalesSalaryRatio />} />
            <Route path="salary-cogs-ratio" element={<SalaryCOGSRatio />} />
            <Route
              path="operation-cost-cogs-ratio"
              element={<OperationCostCOGSRatio />}
            />
            <Route
              path="operation-cost-sales-ratio"
              element={<OperationCostSalesRatio />}
            />
            <Route
              path="tour-expense-sales-ratio"
              element={<TourExpenseSalesRatio />}
            />
            <Route path="pl-report" element={<PLReport />} />

            {/* Other Reports */}
            <Route path="expensereport" element={<ExpenseReport />} />
            <Route
              path="productsalessummary"
              element={<ProductSalesSummary />}
            />
            <Route path="stockalert" element={<StockAlert />} />

            <Route path="dailysample">
              <Route index element={<DailySample />} />
              <Route path="new" element={<AddDailySampleReport />} />
            </Route>

            <Route path="ratelist" element={<RateList />} />
            <Route path="profitloss" element={<ProfitLoss />} />

            <Route path="salesummary">
              <Route index element={<SaleSummary />} />
              <Route path="new" element={<AddDailySummaryReports />} />
            </Route>

            <Route path="userreport" element={<UserReport />} />
          </Route>
          {/* Utility routes */}
          <Route path="utilitylayout" element={<UtilityLayout />}>
            <Route index element={<ProductCard />} />
            <Route path="companyprofile" element={<CompanyProfile />} />
            <Route path="tabhideview" element={<HTabsManipulation />} />
          </Route>
          {/* HRM routes */}
          <Route path="hrmlayout" element={<HrmLayout />}>
            <Route index element={<HrmDashboard />} />
            <Route path="dashboard">
              <Route index element={<HrmDashboard />} />
              <Route path="new" element={<AddStaffMember />} />
            </Route>
            <Route path="holidays" element={<Holidays />} />
            {/* Combined leaves and attendance */}
            <Route path="leaveattendance" element={<LeaveAndAttendance />} />
            <Route path="payroll">
              <Route index element={<Payroll />} />
              <Route path="new" element={<AddPayroll />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </>
  );
}

export default App;
