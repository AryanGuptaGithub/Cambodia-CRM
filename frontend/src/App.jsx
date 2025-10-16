import React from "react";
import { Route, Routes } from "react-router-dom";
import OnlineOrders from "./pages/OnlineOrders";
import StaffMember from "./pages/StaffMember";
import StockAdjustment from "./pages/StockAdjustment";
import StockTransfer from "./pages/StockTransfer";
import Login from "./pages/Login";
import Graph from "./pages/graph";
import MasterLayout from "./pages/MasterLayout";
import Customer from "./pages/Master/Customer";
import Supplier from "./pages/Master/Supplier";
import ProductManagerLayout from "./pages/ProductManagerLayout";
import Brands from "./pages/ProductManager/Brands";
import Categories from "./pages/ProductManager/Categories";
import PriceList from "./pages/ProductManager/PriceList";
import Product from "./pages/ProductManager/Product";
import PrintBarCode from "./pages/ProductManager/PrintBarCode";
import PurchaseLayout from "./pages/PurchaseLayout";
import Purchase from "./pages/Purchase/Purchase";
import PurchaseReturn from "./pages/Purchase/PurchaseReturn";
import PurchaseOut from "./pages/Purchase/PurchaseOut";
import Sale from "./pages/Sale/Sale";
import Quotation from "./pages/Sale/Quotation";
import SaleReturn from "./pages/Sale/SaleReturn";
import ExepenseLayout from "./pages/ExepenseLayout";
import Expenses from "./pages/Expense/Expenses";
import ExpenseCategory from "./pages/Expense/ExpenseCategory";
import ReportsLayout from "./pages/ReportsLayout";
import ExpenseReport from "./pages/Reports/ExpenseReport";
import ProductSalesSummary from "./pages/Reports/ProductSalesSummary";
import StockAlert from "./pages/Reports/StockAlert";
import DailySample from "./pages/Reports/DailySample";
import RateList from "./pages/Reports/RateList";
import ProfitLoss from "./pages/Reports/ProfitLoss";
import SaleSummary from "./pages/Reports/SaleSummary";
import UserReport from "./pages/Reports/UserReport";
import UtilityLayout from "./pages/UtilityLayout";
import FrontSettings from "./pages/Utility/FrontSettings";
import ProductCard from "./pages/Utility/ProductCard";
import HrmLayout from "./pages/HrmLayout";
import Attendance from "./pages/HRM/Attendance";
import Dashboard from "./pages/HRM/Dashboard";
import Holidays from "./pages/HRM/Holidays";
import Leaves from "./pages/HRM/Leaves";
import Payroll from "./pages/HRM/Payroll";
import HRMSetting from "./pages/HRM/HRMSetting";
import SettingsLayout from "./pages/SettingsLayout";
import CompanySetting from "./pages/Settings/CompanySetting";
import Currencies from "./pages/Settings/Currencies";
import CustomFields from "./pages/Settings/CustomFields";
import EmailSetting from "./pages/Settings/EmailSetting";
import Modules from "./pages/Settings/Modules";
import Profile from "./pages/Settings/Profile";
import DatabaseBackup from "./pages/Settings/DatabaseBackup";
import PaymentSetting from "./pages/Settings/PaymentSetting";
import RolesPermission from "./pages/Settings/RolesPermission";
import StorageSeting from "./pages/Settings/StorageSeting";
import Settings from "./pages/Settings/Settings";
import Taxes from "./pages/Settings/Taxes";
import Translation from "./pages/Settings/Translation";
import Units from "./pages/Settings/Units";
import Warehouse from "./pages/Settings/Warehouse";
import PaymentSale from "./pages/Sale/PaymentSale";
import PaymentReports from "./pages/Reports/PaymentReports";
import SaleLayout from "./pages/SaleLayout";
import DashboardLayout from "./pages/DashboardLayout";
import AddSupplier from "./pages/Master/addsupplier";
import AddCustomer from "./pages/Master/addcustomer";
import StockTransferForm from "./pages/StockTransferForm";
import AddProductForm from "./pages/ProductManager/addProduct";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute";
import AddStaffMember from "./pages/AddStaffMember";
import StaffMemberLayout from "./pages/Utility/StaffMemberLayout";
import AddSale from "./pages/Sale/AddSale";
import AddDailySampleReport from "./pages/Reports/AddDailySample";
import AddNewPurchase from "./pages/Purchase/addNewPurchase";
import AddDailySummaryReports from "./pages/Reports/AddNewSaleSummaryReports";
import AddDailReports from "./pages/Reports/AddDailyReports";
import AddReturnSale from "./pages/Sale/addSaleReturn";
import AddReturnPurchase from "./pages/Purchase/addReturnPurchase";
import AddExpenseCategory from "./pages/Expense/addExpenseCategory";
import AddExpense from "./pages/Expense/addExpense";

// Import new Cash and Bank components
import CashAndBankLayout from "./pages/CashAndBankLayout";
import CashAndBank from "./pages/Account/CashAndBank";

// Import new report components
import TotalCashSales from "./pages/Reports/TotalCashSales";
import OutstandingCollection from "./pages/Reports/OutstandingCollection";
import TotalExpense from "./pages/Reports/TotalExpense";
import Remittance from "./pages/Reports/Remittance";

function App() {
  return (
    <>
      <Toaster position="bottom-right" reverseOrder={false} />
      <Routes>
        <Route path="/login" index element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/graph" element={<Graph />} />
          <Route path="/onlineorder" element={<OnlineOrders />} />
          <Route path="/stockadjustment" element={<StockAdjustment />} />
          <Route path="/stocktransfer" element={<StockTransfer />} />
          <Route path="/stocktransferform" element={<StockTransferForm />} />

          {/* Updated Cash and Bank Route with Layout */}
          <Route path="/accountlayout" element={<CashAndBankLayout />}>
            <Route index element={<CashAndBank />} />
          </Route>

          <Route path="/staffmemberLayout" element={<StaffMemberLayout />}>
            <Route path="staffmember" element={<StaffMember />} />{" "}
            <Route path="staffmember/add" element={<AddStaffMember />} />
          </Route>

          <Route path="masterlayout" element={<MasterLayout />}>
            <Route path="customer" element={<Customer />} />
            <Route path="supplier" element={<Supplier />} />
            <Route path="supplier/new" element={<AddSupplier />} />
            <Route path="customer/new" element={<AddCustomer />} />
          </Route>
          <Route path="productmanagerlayout" element={<ProductManagerLayout />}>
            <Route path="brands" element={<Brands />} />
            <Route
              path="/productmanagerlayout/categories"
              element={<Categories />}
            />
            <Route
              path="/productmanagerlayout/pricelist"
              element={<PriceList />}
            />
            <Route path="/productmanagerlayout/product" element={<Product />} />
            <Route
              path="/productmanagerlayout/addproduct"
              element={<AddProductForm />}
            />
            <Route
              path="/productmanagerlayout/printbarcode"
              element={<PrintBarCode />}
            />
          </Route>
          <Route path="/purchaselayout" element={<PurchaseLayout />}>
            <Route index element={<Purchase />} />
            <Route path="purchase">
              <Route index element={<Purchase />} />
              <Route path="new" element={<AddNewPurchase />} />
            </Route>
            <Route path="purchasereturn">
              <Route index element={<PurchaseReturn />} />
              <Route path="new" element={<AddReturnPurchase />} />
            </Route>
            <Route path="purchaseout" element={<PurchaseOut />} />
          </Route>
          <Route path="/salelayout" element={<SaleLayout />}>
            <Route path="sale" element={<Sale />} />
            <Route path="sale/new" element={<AddSale />} />
            <Route path="salereturn" element={<SaleReturn />} />
            <Route path="salereturn/new" element={<AddReturnSale />} />
            <Route path="payment" element={<PaymentSale />} />
            <Route path="quotation" element={<Quotation />} />
          </Route>

          <Route path="/expenselayout" element={<ExepenseLayout />}>
            <Route path="expenses" element={<Expenses />} />
            <Route path="expenses/new" element={<AddExpense />} />

            <Route path="expensecategories" element={<ExpenseCategory />} />
            <Route
              path="expensecategories/new"
              element={<AddExpenseCategory />}
            />
          </Route>

          <Route path="reportlayout" element={<ReportsLayout />}>
            <Route path="dailyreport" element={<AddDailReports />} />
            <Route path="payment" element={<PaymentReports />} />
            <Route path="expensereport" element={<ExpenseReport />} />
            <Route
              path="productsalessummary"
              element={<ProductSalesSummary />}
            />
            <Route path="stockalert" element={<StockAlert />} />

            <Route path="dailysample" element={<DailySample />} />
            <Route path="dailysample/new" element={<AddDailySampleReport />} />

            <Route path="ratelist" element={<RateList />} />
            <Route path="profitloss" element={<ProfitLoss />} />
            <Route path="salesummary" element={<SaleSummary />} />
            <Route
              path="salesummary/new"
              element={<AddDailySummaryReports />}
            />

            <Route path="userreport" element={<UserReport />} />
            
            {/* New Report Routes */}
            <Route path="cashsales" element={<TotalCashSales />} />
            <Route path="outstandingcollection" element={<OutstandingCollection />} />
            <Route path="totalexpense" element={<TotalExpense />} />
            <Route path="remittance" element={<Remittance />} />
          </Route>

          <Route path="/utilitylayout" element={<UtilityLayout />}>
            <Route path="frontsettings" element={<FrontSettings />} />
            <Route path="productcard" element={<ProductCard />} />
          </Route>
          <Route path="/hrmlayout" element={<HrmLayout />}>
            <Route path="/hrmlayout/attendance" element={<Attendance />} />
            <Route path="/hrmlayout/dashboard" element={<Dashboard />} />
            <Route path="/hrmlayout/holidays" element={<Holidays />} />
            <Route path="/hrmlayout/leaves" element={<Leaves />} />
            <Route path="/hrmlayout/payroll" element={<Payroll />} />
            <Route path="/hrmlayout/hrmsetting" element={<HRMSetting />} />
          </Route>
          <Route path="/settinglayout" element={<SettingsLayout />}>
            <Route
              path="/settinglayout/companysetting"
              element={<CompanySetting />}
            />
            <Route path="/settinglayout/currencies" element={<Currencies />} />
            <Route
              path="/settinglayout/customfields"
              element={<CustomFields />}
            />
            <Route
              path="/settinglayout/emailsetting"
              element={<EmailSetting />}
            />
            <Route path="/settinglayout/modules" element={<Modules />} />
            <Route path="/settinglayout/profile" element={<Profile />} />
            <Route
              path="/settinglayout/databasebackup"
              element={<DatabaseBackup />}
            />
            <Route path="/settinglayout/payment" element={<PaymentSetting />} />
            <Route
              path="/settinglayout/rolepermission"
              element={<RolesPermission />}
            />
            <Route
              path="/settinglayout/storageseting"
              element={<StorageSeting />}
            />
            <Route path="/settinglayout/settings" element={<Settings />} />
            <Route path="/settinglayout/taxes" element={<Taxes />} />
            <Route
              path="/settinglayout/translation"
              element={<Translation />}
            />
            <Route path="/settinglayout/units" element={<Units />} />
            <Route path="/settinglayout/warehouse" element={<Warehouse />} />
          </Route>
        </Route>

        {/* <Route path="*" element={<NotFound />}>
            '404 Not Found
          </Route> */}
      </Routes>
    </>
  );
}

export default App;