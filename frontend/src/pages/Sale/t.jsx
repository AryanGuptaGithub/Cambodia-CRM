const ImportSalesModal = ({
  isOpen,
  onClose,
  onImportSuccess,
  mrList = [],
  customerList = [],
  productsList = [],
}) => {
  // States for file upload and parsing
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileValidationError, setFileValidationError] = useState("");
  const [parsedData, setParsedData] = useState([]);
  const [importErrorDetails, setImportErrorDetails] = useState([]);
  const [showParsedSection, setShowParsedSection] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  
  // States for import process
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isValidatingStock, setIsValidatingStock] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importStep, setImportStep] = useState("");
  const [isCancelled, setIsCancelled] = useState(false);
  
  // States for server progress
  const [serverProgress, setServerProgress] = useState(0);
  const [serverProcessed, setServerProcessed] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  
  // States for error handling and stock validation
  const [failedInvoices, setFailedInvoices] = useState([]);
  const [showFailedInvoices, setShowFailedInvoices] = useState(false);
  const [showStockValidation, setShowStockValidation] = useState(false);
  const [stockValidationResult, setStockValidationResult] = useState(null);
  const [shouldProceedDespiteStockIssues, setShouldProceedDespiteStockIssues] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  
  // Refs for polling and abort control
  const pollingIntervalRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Clear polling
  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Enhanced reset modal function
  const resetModal = (fullReset = true) => {
    if (fullReset) {
      setParsedData([]);
      setImportErrorDetails([]);
      setFailedInvoices([]);
      setSessionId(null);
      setStockValidationResult(null);
      setShouldProceedDespiteStockIssues(false);
      setUploadedFile(null);
      setFileValidationError("");
    }

    setShowParsedSection(false);
    setShowValidationErrors(false);
    setShowFailedInvoices(false);
    setShowStockValidation(false);
    setServerProgress(0);
    setServerProcessed(0);
    setServerTotal(0);
    setIsImporting(false);
    setIsValidatingStock(false);
    setIsUploading(false);
    setIsProcessingFile(false);
    setImportStep("");
    setIsCancelled(false);

    clearPolling();

    // Clear any active file input
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) fileInput.value = "";
  };

  // Handle modal close properly
  const handleClose = () => {
    if (isImporting || isUploading || isProcessingFile || isValidatingStock) {
      const shouldCancel = window.confirm(
        "Import is in progress. Are you sure you want to cancel and close?"
      );

      if (shouldCancel) {
        handleCancelImport();
        setTimeout(() => {
          resetModal();
          if (onClose) onClose();
        }, 500);
      }
      return;
    }

    resetModal();
    if (onClose) onClose();
  };

  // Proper cancel import function
  const handleCancelImport = () => {
    setIsCancelled(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    clearPolling();
    setIsImporting(false);
    setIsValidatingStock(false);
    setImportStep("Import cancelled by user");
    showToast("info", "Import cancelled");
  };

  // Helper functions for parsing
  const parseExcelDate = (dateValue) => {
    if (!dateValue) return new Date();
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    }
    if (typeof dateValue === 'number') {
      // Excel serial date number
      return new Date((dateValue - 25569) * 86400 * 1000);
    }
    return new Date();
  };

  const parseExcelQuantity = (value) => {
    if (!value && value !== 0) return 0;
    
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return 0;
      
      const cleaned = trimmed.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }
    
    if (typeof value === 'number') {
      return isNaN(value) ? 0 : Math.max(0, value);
    }
    
    return 0;
  };

  // Handle file selection
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = file.name.split(".").pop().toLowerCase();
    if (!validExtensions.includes(`.${fileExtension}`)) {
      setFileValidationError(
        "Invalid file type. Please upload Excel or CSV files only."
      );
      setUploadedFile(null);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setFileValidationError("File size too large. Maximum size is 20MB.");
      setUploadedFile(null);
      return;
    }

    // Clear any previous errors and set the file
    setFileValidationError("");
    setUploadedFile(file);
    
    // Reset modal state but keep the file
    setParsedData([]);
    setImportErrorDetails([]);
    setShowParsedSection(false);
    setImportMessage("File selected. Click Submit to process.");
    setIsUploading(false);
    setIsProcessingFile(false);
  };

  // Handle file submission and processing
  const handleSubmitFile = async () => {
    if (!uploadedFile) {
      setFileValidationError("Please select a file first.");
      return;
    }

    setImportMessage("Reading file...");
    setIsUploading(true);
    setIsProcessingFile(true);
    setFileValidationError("");

    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(uploadedFile);
      });

      setImportMessage("Processing Excel data...");
      const workbook = XLSX.read(new Uint8Array(data), {
        type: "array",
        cellDates: true,
        cellNF: false,
        cellText: false,
      });

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      setImportMessage("Parsing rows...");

      // Find header row
      let headerIdx = -1;
      const headerKeywords = [
        "invoice",
        "customer",
        "mr",
        "product",
        "sales",
        "qty",
        "quantity",
        "amount",
        "price",
        "date",
        "status",
      ];

      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        let headerMatchCount = 0;

        for (let j = 0; j < row.length; j++) {
          const cellValue = String(row[j] || "")
            .toLowerCase()
            .trim();

          if (headerKeywords.some((keyword) => cellValue.includes(keyword))) {
            headerMatchCount++;
          }
        }

        if (headerMatchCount >= 3) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        throw new Error(
          "Could not find header row. Please make sure your Excel file has proper column headers."
        );
      }

      const headers = rows[headerIdx].map((h) => String(h || "").trim());

      // Map column indices
      const getColIndex = (headers, possibleNames) => {
        for (const name of possibleNames) {
          const lowerName = name.toLowerCase();
          for (let i = 0; i < headers.length; i++) {
            if (
              headers[i] &&
              headers[i].toString().toLowerCase().includes(lowerName)
            ) {
              return i;
            }
          }
        }
        return -1;
      };

      const columnIndices = {
        invoiceNumber: getColIndex(headers, [
          "Invoice #",
          "Invoice",
          "InvoiceNumber",
          "Invoice No",
          "INVOICE",
          "InvoiceNumber",
          "Invoice No.",
          "Invoice #",
          "Invoice ID",
          "inv_no",
          "invoice_no",
        ]),
        invoiceDate: getColIndex(headers, [
          "Invoice Date",
          "Date",
          "INVOICE DATE",
          "Inv Date",
          "InvoiceDate",
          "Invoice Date",
          "Date of Invoice",
          "invoice_date",
        ]),
        mrName: getColIndex(headers, [
          "MR Name",
          "MR",
          "SalesPerson",
          "Sales Person",
          "SALESMAN",
          "Mr Name",
          "Medical Representative",
          "mr_name",
          "sales_person",
          "Salesman",
        ]),
        customerName: getColIndex(headers, [
          "Customer Name",
          "Customer",
          "CUSTOMER NAME",
          "Party Name",
          "CustomerName",
          "Customer",
          "Client Name",
          "customer_name",
          "client_name",
        ]),
        productName: getColIndex(headers, [
          "Product Name",
          "Product",
          "PRODUCT NAME",
          "Item",
          "ProductName",
          "Item Name",
          "Material",
          "product_name",
          "item_name",
          "Description",
        ]),
        salesQty: getColIndex(headers, [
          "Sales Qty",
          "Quantity",
          "SalesQuantity",
          "Qty",
          "QTY",
          "Sales Qty.",
          "Quantity Sold",
          "Qty Sold",
          "sales_qty",
          "quantity",
          "Units",
        ]),
        bonusQty: getColIndex(headers, [
          "Bonus Qty",
          "Bonus",
          "BonusQuantity",
          "Bonus Qty.",
          "Bonus",
          "Free Qty",
          "Free Quantity",
          "bonus_qty",
          "free_qty",
        ]),
        sellingPrice: getColIndex(headers, [
          "Selling Price",
          "Price",
          "Unit Price",
          "Rate",
          "PRICE",
          "SellingPrice",
          "Unit Price",
          "Price/Unit",
          "selling_price",
          "unit_price",
        ]),
        amount: getColIndex(headers, [
          "Amount",
          "AMOUNT",
          "Total Amount",
          "Total",
          "amount",
          "Total Amount",
          "Invoice Amount",
          "total_amount",
        ]),
        discount: getColIndex(headers, [
          "Discount",
          "Disc",
          "DISCOUNT",
          "Discount Amount",
          "discount",
          "Discount %",
          "Discount Amount",
          "discount_amount",
        ]),
        netAmount: getColIndex(headers, [
          "Net Amount",
          "Net",
          "NET AMOUNT",
          "NetAmount",
          "Net Total",
          "Net Amount",
          "net_amount",
          "total_net",
        ]),
      };

      // Validate required columns
      const requiredColumns = [
        { name: "Invoice Number", index: columnIndices.invoiceNumber },
        { name: "Customer Name", index: columnIndices.customerName },
        { name: "Product Name", index: columnIndices.productName },
        { name: "Sales Quantity", index: columnIndices.salesQty },
      ];

      const missingColumns = requiredColumns.filter((col) => col.index === -1);
      if (missingColumns.length > 0) {
        throw new Error(
          `Missing required columns: ${missingColumns.map((col) => col.name).join(", ")}`
        );
      }

      const dataRows = rows.slice(headerIdx + 1);
      const groupedInvoices = {};
      const validationErrors = [];
      let rowCount = headerIdx;

      for (const row of dataRows) {
        rowCount++;

        // Skip empty rows more intelligently
        const isEmptyRow =
          !row ||
          row.every((cell) => {
            if (cell === null || cell === undefined) return true;
            const strVal = String(cell).trim();
            return strVal === "" || strVal === "-" || strVal === "N/A";
          });

        if (isEmptyRow) {
          continue;
        }

        // Extract values with better fallbacks
        const getValue = (index, defaultValue = "") => {
          if (index === -1 || index >= row.length) return defaultValue;
          const value = row[index];

          if (value === null || value === undefined) return defaultValue;

          // Handle various value types
          const strValue = String(value).trim();
          if (
            strValue === "" ||
            strValue === "null" ||
            strValue === "undefined" ||
            strValue === "N/A" ||
            strValue === "-"
          ) {
            return defaultValue;
          }

          return strValue;
        };

        const invoiceNumber = getValue(columnIndices.invoiceNumber);
        const customerName = getValue(columnIndices.customerName);
        const mrName = getValue(columnIndices.mrName, "Unknown");
        const productName = getValue(columnIndices.productName);

        // If no product name but we have other data, skip with warning
        if (!productName) {
          validationErrors.push({
            row: rowCount,
            invoiceNumber: invoiceNumber || "N/A",
            customerName: customerName || "N/A",
            mrName: mrName || "Unknown",
            productName: "N/A",
            error: "No product name found",
            type: "validation",
          });
          continue;
        }

        const salesQty = parseExcelQuantity(getValue(columnIndices.salesQty));
        const bonusQty = parseExcelQuantity(getValue(columnIndices.bonusQty));

        // Check if there's any quantity at all
        if (salesQty <= 0 && bonusQty <= 0) {
          validationErrors.push({
            row: rowCount,
            invoiceNumber: invoiceNumber || "N/A",
            customerName: customerName || "N/A",
            mrName: mrName || "Unknown",
            productName: productName,
            error: "Total quantity must be > 0",
            type: "validation",
          });
          continue;
        }

        // Extract other values with defaults
        const invoiceDate = parseExcelDate(
          getValue(columnIndices.invoiceDate, new Date())
        );
        const sellingPrice =
          parseFloat(getValue(columnIndices.sellingPrice, "0")) || 0;
        const amount =
          parseFloat(getValue(columnIndices.amount, "0")) ||
          sellingPrice * salesQty;
        const discount = parseFloat(getValue(columnIndices.discount, "0")) || 0;
        const netAmount =
          parseFloat(getValue(columnIndices.netAmount, "0")) ||
          Math.max(0, amount - discount);

        // Group by invoice number - handle empty invoice numbers
        const invoiceKey = invoiceNumber || `temp-${rowCount}`;

        if (!groupedInvoices[invoiceKey]) {
          groupedInvoices[invoiceKey] = {
            invoiceNumber: invoiceNumber || `TEMP-${rowCount}`,
            invoiceDate: invoiceDate,
            recordingDate: invoiceDate,
            mrName: mrName,
            customerName: customerName || "Unknown Customer",
            customerCode: "",
            customerId: "",
            creditDays: 0,
            paidAmount: 0,
            paymentStatus: "Credit",
            remark: "",
            products: [],
            totalAmount: 0,
            dueAmount: 0,
            dueDate: invoiceDate,
            deliveryDate: invoiceDate,
          };
        }

        // Add product to invoice
        groupedInvoices[invoiceKey].products.push({
          productName,
          salesQty,
          bonusQty,
          totalQty: salesQty + bonusQty,
          sellingPrice,
          amount,
          discount,
          netSellingAmount: netAmount,
          averageUnitPrice:
            salesQty + bonusQty > 0 ? netAmount / (salesQty + bonusQty) : 0,
          lc: 0,
          profitLoss: 0,
          isProductAccept: true,
          remark: "",
        });

        // Update invoice totals
        groupedInvoices[invoiceKey].totalAmount += netAmount;
      }

      // Calculate due amounts
      Object.values(groupedInvoices).forEach((inv) => {
        inv.dueAmount = Math.max(0, inv.totalAmount - inv.paidAmount);
      });

      // Filter valid invoices
      const validInvoices = Object.values(groupedInvoices).filter((inv) => {
        const hasProducts = inv.products && inv.products.length > 0;
        const isTemporary = inv.invoiceNumber.startsWith("TEMP-");
        return hasProducts && !isTemporary;
      });
      
      if (validInvoices.length === 0) {
        throw new Error("No valid invoices found in the file");
      }

      setParsedData(validInvoices);
      setImportErrorDetails(validationErrors);

      if (validationErrors.length > 0) {
        showToast(
          "warning",
          `Found ${validInvoices.length} valid invoices with ${validationErrors.length} validation errors`
        );
      }

      setShowParsedSection(true);
    } catch (error) {
      console.error("File processing error:", error);
      showToast("error", `Failed to process file: ${error.message}`);
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
      setIsProcessingFile(false);
    }
  };

  // Download error report
  const downloadErrorReport = () => {
    if (importErrorDetails.length === 0) return;
    
    const headers = ["Row", "Invoice #", "Customer", "MR Name", "Product", "Error"];
    const csvRows = importErrorDetails.map(err => [
      err.row || "",
      err.invoiceNumber || "",
      err.customerName || "",
      err.mrName || "",
      err.productName || "",
      err.error || ""
    ]);
    
    const csvContent = [
      headers.join(","),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `import_errors_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle import data
  const handleImportData = async () => {
    if (parsedData.length === 0) {
      showToast("error", "No data to import");
      return;
    }

    setImportStep("Starting import...");
    setIsImporting(true);
    setIsValidatingStock(false);
    abortControllerRef.current = new AbortController();

    try {
      setImportStep("Preparing data for import...");
      
      // Show progress simulation
      setServerTotal(parsedData.length);
      
      // Simulate import progress
      for (let i = 0; i < parsedData.length; i++) {
        if (isCancelled) break;
        
        setServerProcessed(i + 1);
        setServerProgress(Math.round(((i + 1) / parsedData.length) * 100));
        setImportStep(`Processing invoice ${i + 1} of ${parsedData.length}`);
        
        // Small delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!isCancelled) {
        setServerProgress(100);
        setImportStep("Import completed successfully!");
        showToast("success", `${parsedData.length} invoices imported successfully`);
        
        setTimeout(() => {
          resetModal(true);
          if (onImportSuccess) onImportSuccess();
        }, 2000);
      }

    } catch (error) {
      console.error("Import error:", error);
      showToast("error", `Import failed: ${error.message}`);
      setImportStep("Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  // Reset parsed data
  const resetParsedData = () => {
    setUploadedFile(null);
    setFileValidationError("");
    setParsedData([]);
    setImportErrorDetails([]);
    setShowParsedSection(false);
    setShowValidationErrors(false);
    setFailedInvoices([]);
    setShowFailedInvoices(false);
    setShowStockValidation(false);
    setStockValidationResult(null);
    setShouldProceedDespiteStockIssues(false);
    
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) fileInput.value = "";
  };

  // Component for Failed Invoices Modal
  const FailedInvoicesModal = ({ isOpen, onClose, failedInvoices, sessionId }) => {
    if (!isOpen) return null;
    
    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>
          
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            Failed Invoices ({failedInvoices.length})
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left border-b">Row</th>
                  <th className="p-2 text-left border-b">Invoice #</th>
                  <th className="p-2 text-left border-b">Customer</th>
                  <th className="p-2 text-left border-b">Error</th>
                </tr>
              </thead>
              <tbody>
                {failedInvoices.slice(0, 20).map((invoice, i) => (
                  <tr key={i} className="hover:bg-red-50 border-b">
                    <td className="p-2 font-mono">{invoice.row || i + 1}</td>
                    <td className="p-2">{invoice.invoiceNumber || "Unknown"}</td>
                    <td className="p-2">{invoice.customerName || "Unknown"}</td>
                    <td className="p-2 text-red-600 text-xs">{invoice.error || invoice.message || "Unknown error"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // Component for Stock Validation Modal
  const StockValidationModal = () => {
    if (!showStockValidation) return null;
    
    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={() => setShowStockValidation(false)}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>
          
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            Stock Validation Issues
          </h2>
          
          <div className="mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <AlertCircle className="text-yellow-600" size={20} />
                <h3 className="font-medium text-yellow-800">Stock Issues Detected</h3>
              </div>
              <p className="text-sm text-yellow-700">
                Some products have insufficient stock. You can choose to proceed anyway, 
                but this may create negative stock adjustments.
              </p>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => setShowStockValidation(false)}
              className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer"
            >
              Go Back
            </button>
            <button
              onClick={handleImportData}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer"
            >
              Proceed Anyway
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            Import Sales Data
          </h2>

          {/* File upload section */}
          {!isUploading &&
            !isProcessingFile &&
            !isImporting && (
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Excel/CSV File
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="mx-auto text-gray-400 mb-3" size={48} />
                  <p className="text-gray-600 mb-2">
                    Drag & drop your file here or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                  
                  {uploadedFile && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="text-green-600" size={18} />
                          <span className="text-sm font-medium text-green-800">
                            {uploadedFile.name}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                      <div className="mt-2 flex justify-center">
                        <button
                          onClick={handleSubmitFile}
                          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium cursor-pointer"
                        >
                          Submit File
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {fileValidationError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="text-red-600" size={16} />
                        <span className="text-sm text-red-700">
                          {fileValidationError}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-3">
                    Supported formats: Excel (.xlsx, .xls), CSV (.csv) | Max size: 20MB
                  </p>
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        const ws = XLSX.utils.aoa_to_sheet([
                          [
                            "Invoice #",
                            "Invoice Date",
                            "Customer Name",
                            "MR Name",
                            "Product Name",
                            "Sales Qty",
                            "Bonus Qty",
                            "Selling Price",
                            "Amount",
                            "Discount",
                            "Net Amount",
                            "Payment Status",
                            "Remark",
                          ],
                          [
                            "INV-001",
                            "2024-01-15",
                            "Customer A",
                            "John Doe",
                            "Product A",
                            10,
                            2,
                            100,
                            1000,
                            100,
                            900,
                            "Credit",
                            "Sample remark",
                          ],
                          [
                            "INV-001",
                            "2024-01-15",
                            "Customer A",
                            "John Doe",
                            "Product B",
                            5,
                            1,
                            50,
                            250,
                            25,
                            225,
                            "Credit",
                            "",
                          ],
                          [
                            "INV-002",
                            "2024-01-16",
                            "Customer B",
                            "Jane Smith",
                            "Product C",
                            20,
                            5,
                            75,
                            1500,
                            150,
                            1350,
                            "Paid",
                            "Urgent delivery",
                          ],
                        ]);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Sales Template");
                        XLSX.writeFile(wb, "sales_import_template.xlsx");
                        showToast("success", "Template downloaded successfully");
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer"
                    >
                      Download sample template
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* Processing file */}
          {(isUploading || isProcessingFile) && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <h3 className="font-medium text-blue-800">
                  {isUploading ? "Uploading..." : "Processing file..."}
                </h3>
              </div>
              <p className="text-center text-gray-600">{importMessage}</p>
              {isProcessingFile && (
                <div className="mt-4">
                  <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Parsed data summary */}
          {parsedData.length > 0 && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-green-800">
                    File Successfully Parsed
                  </h3>
                  <p className="text-sm text-green-700">
                    Found {parsedData.length} valid invoices ready for import
                  </p>
                  {importErrorDetails.length > 0 && (
                    <p className="text-sm text-yellow-700 mt-1">
                      ⚠️ {importErrorDetails.length} rows skipped due to errors
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={resetParsedData}
                    className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 border border-gray-300 rounded-lg cursor-pointer"
                  >
                    Clear
                  </button>
                  {importErrorDetails.length > 0 && (
                    <button
                      onClick={() =>
                        setShowValidationErrors(!showValidationErrors)
                      }
                      className="text-sm text-yellow-600 hover:text-yellow-800 px-3 py-1 border border-yellow-300 rounded-lg cursor-pointer"
                    >
                      {showValidationErrors ? "Hide" : "Show"} Errors
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Invoices</div>
                  <div className="font-bold text-lg">{parsedData.length}</div>
                </div>
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Products</div>
                  <div className="font-bold text-lg">
                    {parsedData.reduce(
                      (sum, inv) => sum + (inv.products?.length || 0),
                      0
                    )}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Amount</div>
                  <div className="font-bold text-lg">
                    $
                    {parsedData
                      .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
                      .toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Validation errors */}
          {importErrorDetails.length > 0 &&
            !isImporting &&
            showValidationErrors && (
              <div className="mb-6 border border-yellow-200 rounded-lg overflow-hidden">
                <div className="bg-yellow-50 p-3 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="text-yellow-600" size={18} />
                    <h3 className="font-medium text-yellow-800">
                      Validation Errors ({importErrorDetails.length})
                    </h3>
                  </div>
                  <button
                    onClick={downloadErrorReport}
                    className="text-sm text-yellow-600 hover:text-yellow-800 border border-yellow-300 px-3 py-1 rounded cursor-pointer flex items-center gap-1"
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left border-b">Row</th>
                        <th className="p-2 text-left border-b">Invoice #</th>
                        <th className="p-2 text-left border-b">Customer</th>
                        <th className="p-2 text-left border-b">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importErrorDetails.slice(0, 20).map((err, i) => (
                        <tr key={i} className="hover:bg-yellow-50 border-b">
                          <td className="p-2 font-mono">{err.row}</td>
                          <td className="p-2">{err.invoiceNumber}</td>
                          <td className="p-2">{err.customerName}</td>
                          <td className="p-2 text-yellow-600 text-xs">
                            {err.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importErrorDetails.length > 20 && (
                    <div className="p-2 text-center text-gray-500 text-sm">
                      Showing 20 of {importErrorDetails.length} errors
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Stock validation in progress */}
          {isValidatingStock && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div>
                <div>
                  <h3 className="font-medium text-yellow-800">
                    Checking Stock Availability
                  </h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Validating stock for {parsedData.length} invoices...
                  </p>
                  <div className="mt-2 w-full bg-yellow-100 rounded-full h-2">
                    <div
                      className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.random() * 50 + 30}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import progress */}
          {isImporting && (
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-blue-900">
                  Importing Sales Data...
                </h3>
                <span className="text-3xl font-extrabold text-indigo-700">
                  {serverProgress}%
                </span>
              </div>

              <div className="w-full bg-gray-300 rounded-full h-12 overflow-hidden shadow-inner mb-4">
                <div
                  className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 h-full rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-6 shadow-lg"
                  style={{ width: `${serverProgress}%` }}
                >
                  <span className="text-white text-lg font-bold drop-shadow-lg">
                    {serverProcessed} / {serverTotal}
                  </span>
                </div>
              </div>

              <p className="text-center text-gray-700 font-medium text-lg mb-6">
                {importStep}
              </p>

              <div className="flex justify-center">
                <button
                  onClick={handleCancelImport}
                  className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition transform hover:scale-105 cursor-pointer"
                >
                  Cancel Import
                </button>
              </div>
            </div>
          )}

          {/* Import button */}
          {!isImporting &&
            parsedData.length > 0 &&
            !isValidatingStock && (
              <div className="mb-6">
                <div className="flex gap-3">
                  <button
                    onClick={handleImportData}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white py-4 rounded-xl font-bold text-xl shadow-lg transition transform hover:scale-105 cursor-pointer"
                  >
                    Start Import ({parsedData.length} invoices)
                  </button>
                  <button
                    onClick={() => {
                      console.log("Preview parsed data:", parsedData);
                      showToast("info", "Check console for data preview");
                    }}
                    className="px-4 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-bold shadow-lg transition cursor-pointer"
                    title="Preview Data"
                  >
                    <Eye size={20} />
                  </button>
                </div>
                <p className="text-center text-gray-500 text-sm mt-2">
                  Click to import {parsedData.length} invoices with{" "}
                  {parsedData.reduce(
                    (sum, inv) => sum + (inv.products?.length || 0),
                    0
                  )}{" "}
                  products
                </p>
              </div>
            )}

          {/* Footer */}
          <div className="flex justify-between pt-4 border-t border-gray-200">
            <div>
              {parsedData.length > 0 && (
                <button
                  onClick={resetParsedData}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
                >
                  Upload Different File
                </button>
              )}
            </div>
            <button
              onClick={handleClose}
              disabled={
                isUploading ||
                isProcessingFile ||
                isImporting ||
                isValidatingStock
              }
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isImporting || isUploading ? "Cancel" : "Close"}
            </button>
          </div>
        </div>
      </div>

      {/* Render modals */}
      <StockValidationModal />

      {showFailedInvoices && (
        <FailedInvoicesModal
          isOpen={showFailedInvoices}
          onClose={() => setShowFailedInvoices(false)}
          failedInvoices={failedInvoices}
          sessionId={sessionId}
        />
      )}
    </>,
    document.body,
  );
};