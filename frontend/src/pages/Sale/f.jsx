const ImportSalesModal = ({
  isOpen,
  onClose,
  onImportSuccess,
  mrList = [],
  customerList = [],
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [importErrorDetails, setImportErrorDetails] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [importStep, setImportStep] = useState("");
  const [isCancelled, setIsCancelled] = useState(false);
  const abortControllerRef = useRef(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showParsedSection, setShowParsedSection] = useState(false);
  const [failedInvoicesList, setFailedInvoicesList] = useState([]);
  const [showFailedInvoices, setShowFailedInvoices] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [isDownloadingFailed, setIsDownloadingFailed] = useState(false);

  // New states for real server progress
  const [sessionId, setSessionId] = useState(null);
  const [serverProgress, setServerProgress] = useState(0);
  const [serverProcessed, setServerProcessed] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const pollingIntervalRef = useRef(null);

  const parseExcelQuantity = (value) => {
    if (value === null || value === undefined) return 0;
    const str = String(value).trim();
    const num = parseFloat(str.replace(/,/g, ""));
    return isNaN(num) ? 0 : Math.abs(num);
  };

  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const downloadFailedReport = async () => {
    try {
      setIsDownloadingFailed(true);
      
      // If we have sessionId, try to fetch from backend for complete data
      let failedInvoices = failedInvoicesList;
      if (sessionId) {
        try {
          const response = await axios.get(`${backendUrl}/api/sales/import/failed/${sessionId}`);
          if (response.data.success && response.data.data.failedInvoices) {
            // Use the fetched data
            failedInvoices = response.data.data.failedInvoices;
          }
        } catch (fetchError) {
          console.warn("Could not fetch failed invoices from backend:", fetchError.message);
        }
      }

      const csvRows = [
        ['Row', 'Invoice Number', 'Customer Name', 'MR Name', 'Error Type', 'Error Message', 'Timestamp'],
        ...failedInvoices.map(inv => [
          inv.row || 'N/A',
          inv.invoiceNumber,
          inv.customerName,
          inv.mrName,
          inv.type || 'unknown',
          inv.error || inv.message || 'Unknown error',
          inv.timestamp || new Date().toISOString()
        ])
      ];

      const csvContent = csvRows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `failed_invoices_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('success', 'Failed invoices report downloaded');
    } catch (error) {
      console.error('Error downloading report:', error);
      showToast('error', 'Failed to download report');
    } finally {
      setIsDownloadingFailed(false);
    }
  };

  const fetchFailedInvoices = async () => {
    if (!sessionId) return;
    
    try {
      const response = await axios.get(`${backendUrl}/api/sales/import/failed/${sessionId}`);
      if (response.data.success) {
        setFailedInvoicesList(response.data.data.failedInvoices || []);
        setShowFailedInvoices(true);
      }
    } catch (error) {
      console.error("Error fetching failed invoices:", error);
      // If backend fetch fails, show what we have locally
      if (failedInvoicesList.length > 0) {
        setShowFailedInvoices(true);
      }
    }
  };

  const handleProductImport = async (dataToImport) => {
    if (!dataToImport?.length) {
      showToast("error", "No data to import");
      return;
    }

    setIsImporting(true);
    setIsCancelled(false);
    setImportStep("Preparing data for import...");
    setServerProgress(0);
    setServerProcessed(0);
    setServerTotal(dataToImport.length);
    setFailedInvoicesList([]);
    setImportSummary(null);
    setShowFailedInvoices(false);

    abortControllerRef.current = new AbortController();

    try {
      const transformedInvoices = dataToImport.map((inv) => ({
        ...inv,
        invoiceDate: inv.invoiceDate || new Date().toISOString().split("T")[0],
        recordingDate:
          inv.recordingDate || new Date().toISOString().split("T")[0],
        paymentStatus: inv.paymentStatus || "Credit",
        totalAmount:
          inv.totalAmount ||
          inv.products.reduce((s, p) => s + (p.netSellingAmount || 0), 0),
        dueAmount: (inv.totalAmount || 0) - (inv.paidAmount || 0),
      }));

      setImportStep("Sending data to server...");

      const res = await axios.post(
        `${backendUrl}/api/sales/import`,
        { invoices: transformedInvoices },
        {
          timeout: 300000,
          signal: abortControllerRef.current.signal,
        }
      );

      const { sessionId: newSessionId } = res.data;
      setSessionId(newSessionId);

      showToast("info", "Import started on server. Processing invoices...");

      // Start polling server for real progress
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const progRes = await axios.get(
            `${backendUrl}/api/sales/import/progress/${newSessionId}`
          );
          const prog = progRes.data.progress;

          setServerProgress(prog.percentage);
          setServerProcessed(prog.processed);
          setServerTotal(prog.total);
          
          if (prog.status === "completed" || prog.completed) {
            setImportStep("Import completed!");
            setImportSummary({
              successful: prog.successful || 0,
              failed: prog.failed || 0,
              total: prog.total || 0,
              cashSales: prog.cashSales || 0,
              cashAmount: prog.cashAmount || 0
            });
            
            // Fetch failed invoices
            if (prog.failed > 0) {
              setTimeout(() => {
                fetchFailedInvoices();
              }, 1000);
            }
            
            if (onImportSuccess) {
              setTimeout(onImportSuccess, 1500);
            }
            
            clearPolling();
            setIsImporting(false);
            
            if (prog.error) {
              showToast("error", prog.error || "Import failed on server");
            } else {
              const successMsg = `Successfully imported ${prog.successful} invoices`;
              if (prog.failed > 0) {
                showToast("warning", `${successMsg}, ${prog.failed} failed`);
              } else {
                showToast("success", successMsg);
              }
            }
          } else if (prog.error) {
            setImportStep("Import failed on server");
            showToast("error", prog.error);
            clearPolling();
            setIsImporting(false);
          } else {
            setImportStep(`Processing invoices... (${prog.processed}/${prog.total})`);
          }
        } catch (err) {
          console.error("Progress polling error:", err);
          if (err.response?.status === 404) {
            clearPolling();
            setIsImporting(false);
            showToast("error", "Import session not found");
          }
        }
      }, 1500);
    } catch (err) {
      clearPolling();
      if (axios.isCancel(err) || isCancelled) {
        setImportStep("Import cancelled");
        showToast("info", "Import was cancelled");
      } else {
        console.error("Import error:", err);
        const message =
          err.response?.data?.message || err.message || "Import failed";
        setImportStep("Import failed");
        showToast("error", message);
        
        // If there are validation errors in response, show them
        if (err.response?.data?.errors) {
          setFailedInvoicesList(err.response.data.errors);
          setShowFailedInvoices(true);
        }
      }
      setIsImporting(false);
    }
  };

  const handleImportData = () => {
    handleProductImport(parsedData);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast("error", "File size too large. Maximum size is 20MB.");
      return;
    }

    setImportMessage("Reading file...");
    setIsUploading(true);
    setIsProcessingFile(true);
    setImportErrorDetails([]);
    setShowValidationErrors(false);
    setShowParsedSection(false);
    setShowFailedInvoices(false);

    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      setImportMessage("Processing Excel data...");

      const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      setImportMessage("Parsing rows...");

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i].map((c) =>
          String(c || "")
            .trim()
            .toLowerCase()
        );
        if (row.some((cell) => cell.includes("invoice"))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        throw new Error("Header row with 'Invoice' not found in first 20 rows");
      }

      const headers = rows[headerIdx].map((h) => String(h || "").trim());
      const dataRows = rows
        .slice(headerIdx + 1)
        .filter((row) =>
          row.some(
            (cell) =>
              cell !== null && cell !== undefined && String(cell).trim() !== ""
          )
        );

      const getColIndex = (colName) =>
        headers.findIndex((h) =>
          h.toLowerCase().includes(colName.toLowerCase())
        );

      const groupedInvoices = {};
      const validationErrors = [];
      let rowCount = headerIdx;

      for (const row of dataRows) {
        rowCount++;
        const invoiceNumber = String(
          row[getColIndex("Invoice #")] || row[getColIndex("Invoice")] || ""
        ).trim();
        const customerName = String(
          row[getColIndex("Customer Name")] || ""
        ).trim();
        const productName = String(
          row[getColIndex("Product Name")] || ""
        ).trim();

        const salesQty = parseExcelQuantity(row[getColIndex("Sales Qty")]);
        const bonusQty = parseExcelQuantity(row[getColIndex("Bonus Qty")]) || 0;
        const sellingPrice = Number(row[getColIndex("Selling Price")]) || 0;

        const rowErrors = [];

        if (!invoiceNumber) rowErrors.push("Invoice number is required");
        if (!customerName) rowErrors.push("Customer name is required");
        if (!productName) rowErrors.push("Product name is required");

        const totalQty = salesQty + bonusQty;
        if (totalQty <= 0) {
          rowErrors.push(
            "Sales quantity + Bonus quantity must be greater than 0"
          );
        }
        if (sellingPrice < 0) {
          rowErrors.push("Selling price cannot be negative");
        }

        if (rowErrors.length > 0) {
          validationErrors.push({
            row: rowCount + 1,
            invoiceNumber: invoiceNumber || "N/A",
            customerName: customerName || "N/A",
            mrName: String(row[getColIndex("MR Name")] || "").trim() || "Unknown",
            error: rowErrors.join("; "),
            type: "validation",
          });
          continue;
        }

        if (!groupedInvoices[invoiceNumber]) {
          const creditDays = Number(row[getColIndex("Credit Days")]) || 0;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + creditDays);

          groupedInvoices[invoiceNumber] = {
            recordingDate: new Date().toISOString().split("T")[0],
            invoiceNumber,
            invoiceDate: new Date().toISOString().split("T")[0],
            mrName: String(row[getColIndex("MR Name")] || "").trim(),
            customerName,
            customerCode: String(
              row[getColIndex("Customer Code")] || ""
            ).trim(),
            customerId: "",
            creditDays,
            paidAmount: Number(row[getColIndex("Paid Amount")]) || 0,
            paymentStatus: "Credit",
            remark: String(row[getColIndex("Remarks")] || "").trim(),
            products: [],
            totalAmount: 0,
            dueAmount: 0,
            dueDate: dueDate.toISOString().split("T")[0],
            deliveryDate: new Date().toISOString().split("T")[0],
          };
        }

        const discount = Number(row[getColIndex("Discount")]) || 0;
        const amount = sellingPrice * Math.abs(salesQty);
        const netSellingAmount = amount - discount;

        groupedInvoices[invoiceNumber].products.push({
          productName,
          salesQty,
          bonusQty,
          totalQty,
          sellingPrice,
          amount,
          discount,
          netSellingAmount,
          averageUnitPrice: totalQty > 0 ? netSellingAmount / totalQty : 0,
          lc: 0,
          profitLoss: 0,
          isProductAccept: true,
          remark: "",
        });

        groupedInvoices[invoiceNumber].totalAmount += netSellingAmount;
      }

      Object.values(groupedInvoices).forEach((inv) => {
        inv.dueAmount = inv.totalAmount - inv.paidAmount;
      });

      const validInvoices = Object.values(groupedInvoices).filter(
        (inv) => inv.products.length > 0 && inv.totalAmount > 0
      );

      setParsedData(validInvoices);
      setImportErrorDetails(validationErrors);

      if (validationErrors.length > 0) {
        showToast(
          "warning",
          `Found ${validationErrors.length} validation issues`
        );
      } else {
        showToast("success", "File parsed successfully – ready to import");
      }

      setShowParsedSection(true);
    } catch (error) {
      console.error("File processing error:", error);
      showToast("error", "Failed to process file: " + error.message);
    } finally {
      setIsUploading(false);
      setIsProcessingFile(false);
    }
  };

  const downloadValidationErrorsReport = () => {
    if (importErrorDetails.length === 0) {
      showToast("warning", "No errors to download");
      return;
    }

    const csvRows = [
      ["Excel Row", "Invoice #", "Customer", "MR Name", "Error Message"],
      ...importErrorDetails.map((e) => [
        e.row,
        e.invoiceNumber,
        e.customerName,
        e.mrName || "N/A",
        e.error || e.message,
      ]),
    ];

    const csvContent = csvRows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `validation_errors_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "Validation errors downloaded");
  };

  const resetModal = () => {
    setParsedData([]);
    setImportErrorDetails([]);
    setIsImporting(false);
    setShowParsedSection(false);
    setShowValidationErrors(false);
    setImportStep("");
    setSessionId(null);
    setServerProgress(0);
    setServerProcessed(0);
    setServerTotal(0);
    setImportSummary(null);
    setFailedInvoicesList([]);
    setShowFailedInvoices(false);
    clearPolling();
  };

  const resetParsedData = () => {
    setParsedData([]);
    setImportErrorDetails([]);
    setShowParsedSection(false);
    setShowValidationErrors(false);
    setImportSummary(null);
    setFailedInvoicesList([]);
    setShowFailedInvoices(false);
  };

  const handleCancelImport = () => {
    setIsCancelled(true);
    abortControllerRef.current?.abort();
    clearPolling();
    setIsImporting(false);
    setImportStep("Import cancelled");
    showToast("info", "Import cancelled");
  };

  const handleClose = () => {
    if (isImporting || isUploading || isProcessingFile) {
      if (window.confirm("Upload/import in progress. Cancel and close?")) {
        handleCancelImport();
        setTimeout(() => {
          clearPolling();
          resetModal();
          onClose();
        }, 500);
      }
      return;
    }
    clearPolling();
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          disabled={isImporting || isUploading || isProcessingFile}
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold text-gray-800 mb-6">
          Import Sales Data
        </h2>

        {/* File Processing */}
        {(isUploading || isProcessingFile) && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <h3 className="font-medium text-blue-800">
                {isUploading ? "Uploading..." : "Processing file..."}
              </h3>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all"
                style={{ width: "70%" }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">{importMessage}</p>
          </div>
        )}

        {/* Parsed Success */}
        {showParsedSection && parsedData.length > 0 && (
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
                    ⚠️ {importErrorDetails.length} row
                    {importErrorDetails.length > 1 ? "s" : ""} had
                    validation errors (skipped)
                  </p>
                )}
              </div>
              <button
                onClick={resetParsedData}
                className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Import Summary */}
        {importSummary && (
          <div className={`mb-6 border rounded-lg p-4 ${
            importSummary.failed > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-start gap-3">
              {importSummary.failed > 0 ? (
                <AlertCircle className="text-yellow-500 mt-0.5" size={20} />
              ) : (
                <CheckCircle className="text-green-500 mt-0.5" size={20} />
              )}
              <div>
                <h3 className="font-medium mb-1">
                  {importSummary.failed > 0 ? 'Import Completed with Errors' : 'Import Successful!'}
                </h3>
                <p className="text-sm mb-2">
                  Successfully imported {importSummary.successful} of {importSummary.total} invoices.
                  {importSummary.failed > 0 && ` ${importSummary.failed} invoices failed.`}
                </p>
                {importSummary.failed > 0 && (
                  <button
                    onClick={() => setShowFailedInvoices(!showFailedInvoices)}
                    className="text-sm text-red-600 hover:text-red-800 font-medium cursor-pointer"
                  >
                    {showFailedInvoices ? "Hide" : "Show"} Failed Invoices ({importSummary.failed})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Real Server Import Progress */}
        {isImporting && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <h3 className="font-medium text-blue-800">
                Importing Data...
              </h3>
              <span className="text-sm font-medium text-blue-600">
                {serverProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${serverProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {importStep}
              {serverTotal > 0 && (
                <span className="ml-2 font-medium">
                  ({serverProcessed}/{serverTotal})
                </span>
              )}
            </p>
            <div className="flex justify-end">
              <button
                onClick={handleCancelImport}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
              >
                Cancel Import
              </button>
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {importErrorDetails.length > 0 &&
          showParsedSection && (
            <div className="mb-6 border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 p-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertCircle className="text-red-600" size={18} />
                  <h3 className="font-medium text-red-800">
                    Validation Errors ({importErrorDetails.length})
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setShowValidationErrors(!showValidationErrors)
                    }
                    className="text-sm text-red-600 hover:text-red-800 border border-red-300 px-3 py-1 rounded"
                  >
                    {showValidationErrors ? "Hide" : "Show"} Details
                  </button>
                  <button
                    onClick={downloadValidationErrorsReport}
                    className="text-sm bg-red-600 text-white px-3 py-1 rounded flex items-center gap-1 hover:bg-red-700"
                  >
                    <Download size={14} /> Download CSV
                  </button>
                </div>
              </div>
              {showValidationErrors && (
                <div className="max-h-60 overflow-y-auto bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left border-b">Row</th>
                        <th className="p-2 text-left border-b">
                          Invoice #
                        </th>
                        <th className="p-2 text-left border-b">Customer</th>
                        <th className="p-2 text-left border-b">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importErrorDetails.slice(0, 10).map((err, i) => (
                        <tr key={i} className="hover:bg-red-50 border-b">
                          <td className="p-2">{err.row}</td>
                          <td className="p-2">{err.invoiceNumber}</td>
                          <td className="p-2">{err.customerName}</td>
                          <td className="p-2 text-red-600 text-xs">
                            {err.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        {/* Failed Invoices List (Shown after validation failed div) */}
        {showFailedInvoices && failedInvoicesList.length > 0 && (
          <div className="mb-6 border border-red-300 rounded-lg overflow-hidden">
            <div className="bg-red-50 p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-red-600" size={20} />
                <div>
                  <h3 className="font-medium text-red-800">
                    Failed Invoices ({failedInvoicesList.length})
                  </h3>
                  <p className="text-sm text-red-700">
                    These invoices could not be imported. Please review and correct the errors.
                  </p>
                </div>
              </div>
              <button
                onClick={downloadFailedReport}
                disabled={isDownloadingFailed}
                className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 cursor-pointer disabled:opacity-50 text-sm"
              >
                <Download size={16} />
                {isDownloadingFailed ? 'Downloading...' : 'Download Report'}
              </button>
            </div>
            
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-3 text-left border-b">Row</th>
                    <th className="p-3 text-left border-b">Invoice #</th>
                    <th className="p-3 text-left border-b">Customer</th>
                    <th className="p-3 text-left border-b">MR Name</th>
                    <th className="p-3 text-left border-b">Error Type</th>
                    <th className="p-3 text-left border-b">Error Message</th>
                  </tr>
                </thead>
                <tbody>
                  {failedInvoicesList.slice(0, 20).map((inv, idx) => (
                    <tr key={idx} className="hover:bg-red-50 border-b">
                      <td className="p-3 font-mono">{inv.row || idx + 1}</td>
                      <td className="p-3 font-medium">{inv.invoiceNumber}</td>
                      <td className="p-3">{inv.customerName}</td>
                      <td className="p-3">{inv.mrName}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          inv.type === 'validation' ? 'bg-yellow-100 text-yellow-800' :
                          inv.type === 'import_error' ? 'bg-red-100 text-red-800' :
                          inv.type === 'duplicate_error' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {inv.type || 'error'}
                        </span>
                      </td>
                      <td className="p-3 text-red-600 max-w-xs" title={inv.error || inv.message}>
                        <div className="truncate">
                          {inv.error || inv.message || 'Unknown error'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {failedInvoicesList.length > 20 && (
                <div className="p-3 text-center text-gray-500 text-sm bg-gray-50">
                  Showing 20 of {failedInvoicesList.length} failed invoices
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-3 flex justify-end border-t border-gray-200">
              <button
                onClick={() => setShowFailedInvoices(false)}
                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer text-sm"
              >
                Hide Failed Invoices
              </button>
            </div>
          </div>
        )}

        {/* File Upload */}
        {!showParsedSection && !isUploading && !isProcessingFile && (
          <div className="mb-8">
            {isSampleFile && <SampleExcelDownloadSale />}
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Excel File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-gray-500 mt-1">Max 20MB</p>
          </div>
        )}

        {/* Import Button */}
        {!isImporting && showParsedSection && parsedData.length > 0 && (
          <div className="mb-6">
            <button
              onClick={handleImportData}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium text-lg"
            >
              Import Data ({parsedData.length} invoices)
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            onClick={handleClose}
            disabled={isUploading || isProcessingFile}
            className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};