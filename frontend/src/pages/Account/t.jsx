import {
  Search,
  Download,
  X,
  Plus,
  Trash2,
  Edit,
  Eye,
  Settings,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import TransactionExcelDownload from "../../excels/TransactionExcelDownload.jsx";
import * as XLSX from "xlsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Helper function to get display value


// Custom hook to fetch dropdown options from backend


// New hook to fetch sales invoices with payment status filtering


// Import Excel Modal Component




export default CashAndBank;