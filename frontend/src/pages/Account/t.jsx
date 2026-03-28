import {
  Search,
  Download,
  X,
  Plus,
  Trash2,
  Edit,
  Settings,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import * as XLSX from "xlsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const ITEMS_PER_PAGE = 7;

















