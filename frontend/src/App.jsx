import React from 'react'
import { Route, Router, Routes } from 'react-router-dom'
import OnlineOrders from './pages/OnlineOrders';
import StaffMember from './pages/StaffMember';
import StocjAdjustment from './pages/StocjAdjustment';
import StockTransfer from './pages/StockTransfer';
import CashandBank from './pages/CashandBank';
import Login from './pages/Login';
import Graph from './pages/graph';
import MasterLayout from './pages/MasterLayout';
import Customer from './pages/Master/Customer';
import Supplier from './pages/Master/Supplier';
import ProductManagerLayout from './pages/ProductManagerLayout';
import Brands from './pages/ProductManager/Brands';
import Categories from './pages/ProductManager/Categories';
import Variation from './pages/ProductManager/Variation';
import Product from './pages/ProductManager/Product';
import PrintBarCode from './pages/ProductManager/PrintBarCode';
import PurchaseLayout from './pages/PurchaseLayout';
import Purchase from './pages/Purchase/Purchase';
import CrNote from './pages/Purchase/CrNote';
import PurchaseOut from './pages/Purchase/PurchaseOut';
import Sale from './pages/Sale/Sale';
// import Payment from './pages/Sale/PaymentSale';
// import Payment from './pages/Reports/PaymentReports';
import Quotation from './pages/Sale/Quotation';
import SaleReturn from './pages/Sale/SaleReturn';
import ExepenseLayout from './pages/ExepenseLayout';
import Expenses from './pages/Expense/Expenses';
import ExpenseCategory from './pages/Expense/ExpenseCategory';
import ReportsLayout from './pages/ReportsLayout';
import ExpenseReport from './pages/Reports/ExpenseReport';
import ProductSalesSummary from './pages/Reports/ProductSalesSummary';
import StockAlert from './pages/Reports/StockAlert';
import StockSummary from './pages/Reports/StockSummary';
import RateList from './pages/Reports/RateList';
import ProfitLoss from './pages/Reports/ProfitLoss';
import SaleSummary from './pages/Reports/SaleSummary';
import UserReport from './pages/Reports/UserReport';
import UtilityLayout from './pages/UtilityLayout';
import FrontSettings from './pages/Utility/FrontSettings';
import ProductCard from './pages/Utility/ProductCard';
import HrmLayout from './pages/HrmLayout';
import Attendance from './pages/HRM/Attendance';
import Dashboard from './pages/HRM/Dashboard';
import Holidays from './pages/HRM/Holidays';
import Leaves from './pages/HRM/Leaves';
import Payroll from './pages/HRM/Payroll';
import HRMSetting from './pages/HRM/HRMSetting';
import SettingsLayout from './pages/SettingsLayout';
import CompanySetting from './pages/Settings/CompanySetting';
import Currencies from './pages/Settings/Currencies';
import CustomFields from './pages/Settings/CustomFields';
import EmailSetting from './pages/Settings/EmailSetting';
import Modules from './pages/Settings/Modules';
import Profile from './pages/Settings/Profile';
import DatabaseBackup from './pages/Settings/DatabaseBackup';
import PaymentSetting from './pages/Settings/PaymentSetting';
import RolesPermission from './pages/Settings/RolesPermission';
import StorageSeting from './pages/Settings/StorageSeting';
import Settings from './pages/Settings/Settings';
import Taxes from './pages/Settings/Taxes';
import Translation from './pages/Settings/Translation';
import Units from './pages/Settings/Units';
import Warehouse from './pages/Settings/Warehouse';
import PaymentSale from './pages/Sale/PaymentSale';
import PaymentReports from './pages/Reports/PaymentReports';
import SaleLayout from './pages/SaleLayout';
import DashboardLayout from './pages/DashboardLayout';
import AddSupplier from './pages/Master/addsupplier';
import AddCustomer from './pages/Master/addcustomer';
import StockTransferForm from './pages/StockTransferForm';
import AddProductForm from './pages/ProductManager/addProduct';
import { Toaster } from "react-hot-toast";

function App ()  {
  return (
    <>
         <Toaster position="bottom-right" reverseOrder={false} />
        <Routes>
          <Route path="/login " element={<Login />} />
          <Route path="/" element={<DashboardLayout />}>
            <Route path="/graph" element={<Graph />} />
            <Route path="/onlineorder" element={<OnlineOrders />} />
            <Route path="/staffmember" element={<StaffMember />} />
            <Route path="/stockadjustment" element={<StocjAdjustment />} />
            <Route path="/stocktransfer" element={<StockTransfer />} />
            <Route path="/stocktransferform" element={<StockTransferForm />} />
            <Route path="/cashandbank" element={<CashandBank />} />

            <Route path="masterlayout" element={<MasterLayout />}>
              <Route path="customer" element={<Customer />} />
              <Route path="supplier" element={<Supplier />} />
              <Route path='supplier/new' element={<AddSupplier/>}/>
              <Route path='customer/new' element={<AddCustomer/>}/>
            </Route>
            <Route
              path="productmanagerlayout"
              element={<ProductManagerLayout />}
            >
              <Route path="brands" element={<Brands />} />
              <Route
                path="/productmanagerlayout/categories"
                element={<Categories />}
              />
              <Route
                path="/productmanagerlayout/variation"
                element={<Variation />}
              />
              <Route
                path="/productmanagerlayout/product"
                element={<Product />}
              />
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
              <Route path="/purchaselayout/purchase" element={<Purchase />} />
              <Route path="/purchaselayout/crnote" element={<CrNote />} />
              <Route
                path="/purchaselayout/purchaseout"
                element={<PurchaseOut />}
              />
            </Route>
            <Route path="/salelayout" element={<SaleLayout />}>
              <Route path="/salelayout/sale" element={<Sale />} />
              <Route path="/salelayout/salereturn" element={<SaleReturn />} />
              <Route path="/salelayout/payment" element={<PaymentSale />} />
              <Route path="/salelayout/quotation" element={<Quotation />} />
            </Route>
            <Route path="/expenselayout" element={<ExepenseLayout />}>
              <Route path="/expenselayout/expenses" element={<Expenses />} />
              <Route path="/expenselayout/expensecategories" element={<ExpenseCategory />} />
            </Route>
            <Route path='/reportlayout' element={<ReportsLayout/>}>
            <Route path='/reportlayout/payment' element={<PaymentReports/>}/>
            <Route path='/reportlayout/expensereport' element={<ExpenseReport/>}/>
            <Route path='/reportlayout/productsalessummary' element={<ProductSalesSummary/>}/>
            <Route path='/reportlayout/stockalert' element={<StockAlert/>}/>
            <Route path='/reportlayout/stocksummary' element={<StockSummary/>}/>
            <Route path='/reportlayout/ratelist' element={<RateList/>}/>
            <Route path='/reportlayout/profitloss' element={<ProfitLoss/>}/>
            <Route path='/reportlayout/salesummary' element={<SaleSummary/>}/>
            <Route path='/reportlayout/userreport' element={<UserReport/>}/>
            </Route>
            <Route path='/utilitylayout' element={<UtilityLayout/>}>
            <Route path='frontsettings' element={<FrontSettings/>}/>
            <Route path='productcard' element={<ProductCard/>}/>
            </Route>
            <Route path='/hrmlayout' element={<HrmLayout/>}>
            <Route path='/hrmlayout/attendance'element={<Attendance/>}/>
            <Route path='/hrmlayout/dashboard'element={<Dashboard/>}/>
            <Route path='/hrmlayout/holidays'element={<Holidays/>}/>
            <Route path='/hrmlayout/leaves'element={<Leaves/>}/>
            <Route path='/hrmlayout/payroll'element={<Payroll/>}/>
            <Route path='/hrmlayout/hrmsetting'element={<HRMSetting/>}/>

            </Route>
            <Route path='/settinglayout' element={<SettingsLayout/>}>
            <Route path='/settinglayout/companysetting' element={<CompanySetting/>}/>
            <Route path='/settinglayout/currencies' element={<Currencies/>}/>
            <Route path='/settinglayout/customfields' element={<CustomFields/>}/>
            <Route path='/settinglayout/emailsetting' element={<EmailSetting/>}/>
            <Route path='/settinglayout/modules' element={<Modules/>}/>
            <Route path='/settinglayout/profile' element={<Profile/>}/>
            <Route path='/settinglayout/databasebackup' element={<DatabaseBackup/>}/>
            <Route path='/settinglayout/payment' element={<PaymentSetting/>}/>
            <Route path='/settinglayout/rolepermission' element={<RolesPermission/>}/>
            <Route path='/settinglayout/storageseting' element={<StorageSeting/>}/>
            <Route path='/settinglayout/settings' element={<Settings/>}/>
            <Route path='/settinglayout/taxes' element={<Taxes/>}/>
            <Route path='/settinglayout/translation' element={<Translation/>}/>
            <Route path='/settinglayout/units' element={<Units/>}/>
            <Route path='/settinglayout/warehouse' element={<Warehouse/>}/>

            </Route>
          </Route>

          {/* <Route path="*" element={<NotFound />}>
            '404 Not Found
          </Route> */}
        </Routes>
   
    </>
  );
}

export default App
