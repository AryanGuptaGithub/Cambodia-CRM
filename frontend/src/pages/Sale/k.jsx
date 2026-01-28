import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  UserPlus,
  Trash2,
  Edit,
  Upload,
  X,
  Eye,
  Search,
  Package,
  AlertCircle,
  Download,
  CheckCircle,
  Save,
  Calendar,
  DollarSign,
  ShoppingCart,
  User,
  ClipboardList,
  CreditCard,
  Truck,
  Clock,
  PackageCheck,
} from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { useNavigate } from "react-router-dom";
import SaleExcelDownload from "../../excels/download/ExcelDownload";
import { useInitialSaleData } from "./IntialLoading.jsx";
import {
  fetchMRList,
  fetchCustomerList,
} from "../../pages/ProductManager/common/fetchDropdown.jsx";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";
import * as XLSX from "xlsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";



export default ImportSalesModal;