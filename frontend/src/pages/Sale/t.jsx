const ImportSalesModal = ({
  isOpen,
  onClose,
  onImportSuccess,
  mrList = [],
  customerList = [],
  productsList = [],
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [importProgress, setImportProgress] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [importErrorDetails, setImportErrorDetails] = useState([]);
  const [validParsedData, setValidParsedData] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [showProgressBreakdown, setShowProgressBreakdown] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [importStep, setImportStep] = useState("");
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const abortControllerRef = useRef(null);
  const [activeImportType, setActiveImportType] = useState(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showParsedSection, setShowParsedSection] = useState(false);

  const parseExcelQuantity = (value) => {
    if (value === null || value === undefined) return 0;
    const str = String(value).trim();
    const num = parseFloat(str.replace(/,/g, ""));
    return isNaN(num) ? 0 : Math.abs(num);
  };

  const handleProductImport = async (dataToImport, importType = "all") => {
    if (!dataToImport?.length) {
      showToast("error", "No data to import");
      return;
    }

    setIsImporting(true);
    setIsCancelled(false);
    setActiveImportType(importType);
    setImportProgress(0);
    setImportStep(
      importType === "all"
        ? "Preparing all data for import..."
        : "Preparing valid data for import..."
    );
    setProcessedCount(0);
    setTotalToProcess(dataToImport.length);

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
      setImportProgress(20);

      const res = await axios.post(
        `${backendUrl}/api/sales/import`,
        { invoices: transformedInvoices },
        {
          timeout: 300000,
          signal: abortControllerRef.current.signal,
        }
      );

      setImportProgress(100);
      setProcessedCount(transformedInvoices.length);
      setImportStep("Import completed!");

      showToast(
        "success",
        `Successfully imported ${transformedInvoices.length} invoices`
      );

      setImportComplete(true);
      onImportSuccess?.();
    } catch (err) {
      if (axios.isCancel(err) || isCancelled) {
        showToast("info", "Import cancelled");
      } else {
        showToast("error", err.message || "Import failed");
      }
    } finally {
      setIsImporting(false);
      setActiveImportType(null);
      abortControllerRef.current = null;
    }
  };

  const handleImportAllData = async () => {
    await handleProductImport(parsedData, "all");
  };

  const handleImportValidOnly = async () => {
    await handleProductImport(validParsedData, "valid");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast("error", "File size too large. Maximum size is 20MB.");
      return;
    }

    setImportMessage("Reading file...");
    setImportProgress(10);
    setIsUploading(true);
    setIsProcessingFile(true);
    setImportErrorDetails([]);
    setValidParsedData([]);
    setImportResult(null);
    setImportComplete(false);
    setShowValidationErrors(false);
    setShowParsedSection(false);

    try {
      const data = await file.arrayBuffer();

      const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i].map((c) => String(c || "").trim());
        if (row.some((cell) => cell.toLowerCase().includes("invoice"))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        showToast("error", "Header row not found");
        return;
      }

      const headers = rows[headerIdx].map((h) => String(h || "").trim());
      const dataRows = rows.slice(headerIdx + 1);

      const getColIndex = (name) =>
        headers.findIndex((h) =>
          h.toLowerCase().includes(name.toLowerCase())
        );

      const groupedInvoices = {};
      const validationErrors = [];
      let rowCount = 0;

      for (const row of dataRows) {
        rowCount++;

        const invoiceNumber = String(
          row[getColIndex("Invoice")] || ""
        ).trim();

        const customerName = String(
          row[getColIndex("Customer Name")] || ""
        ).trim();

        const productName = String(
          row[getColIndex("Product Name")] || ""
        ).trim();

        const salesQty = parseExcelQuantity(row[getColIndex("Sales Qty")]);
        const bonusQty = parseExcelQuantity(row[getColIndex("Bonus Qty")]);
        const sellingPrice = Number(row[getColIndex("Selling Price")]) || 0;

        const errors = [];
        if (!invoiceNumber) errors.push("Invoice missing");
        if (!customerName) errors.push("Customer missing");
        if (!productName) errors.push("Product missing");
        if (salesQty + bonusQty <= 0) errors.push("Quantity invalid");

        if (errors.length) {
          validationErrors.push({
            row: rowCount + headerIdx + 1,
            invoiceNumber,
            customerName,
            productName,
            message: errors.join(", "),
          });
          continue;
        }

        if (!groupedInvoices[invoiceNumber]) {
          groupedInvoices[invoiceNumber] = {
            invoiceNumber,
            customerName,
            products: [],
            totalAmount: 0,
            paidAmount: 0,
          };
        }

        const amount = sellingPrice * salesQty;
        groupedInvoices[invoiceNumber].products.push({
          productName,
          salesQty,
          bonusQty,
          sellingPrice,
          netSellingAmount: amount,
        });

        groupedInvoices[invoiceNumber].totalAmount += amount;
      }

      Object.values(groupedInvoices).forEach((inv) => {
        inv.dueAmount = inv.totalAmount - inv.paidAmount;
      });

      /* ✅ FIX APPLIED HERE */
      const invoices = Object.values(groupedInvoices);

      const invalidInvoiceSet = new Set(
        validationErrors.map(err => err.invoiceNumber)
      );

      const validInvoices = invoices.filter(
        inv => !invalidInvoiceSet.has(inv.invoiceNumber)
      );

      setParsedData(invoices);
      setValidParsedData(validInvoices);
      setImportErrorDetails(validationErrors);

      setShowParsedSection(true);

      validationErrors.length
        ? showToast("warning", `Found ${validationErrors.length} validation errors`)
        : showToast("success", "Excel imported successfully");
    } catch (error) {
      showToast("error", error.message);
    } finally {
      setImportProgress(null);
      setIsUploading(false);
      setIsProcessingFile(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {showProgressBreakdown && (
        <ProgressBreakdownModal
          importResult={importResult}
          onClose={() => setShowProgressBreakdown(false)}
          onDownloadFailedReport={downloadValidationErrorsReport}
        />
      )}

      {ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              disabled={isImporting || isUploading || isProcessingFile}
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Import Sales Data
            </h2>

            {/* File Upload Progress Bar */}
            {(isUploading || isProcessingFile) && (
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-blue-800">
                    {isUploading ? "Uploading File" : "Processing File"}
                  </h3>
                  {importProgress !== null && (
                    <span className="text-sm font-medium text-blue-600">
                      {importProgress}%
                    </span>
                  )}
                </div>

                {importProgress !== null && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    ></div>
                  </div>
                )}

                <div className="text-sm text-gray-600">{importMessage}</div>
              </div>
            )}

            {/* Import Complete Success Message */}
            {importComplete && importSummary && (
              <div className="mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="text-green-600" size={24} />
                    <div>
                      <h3 className="font-medium text-green-800">
                        Import Completed Successfully!
                      </h3>
                      <p className="text-sm text-green-700">
                        {importSummary.successfullyImported || 0} invoices
                        imported
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!importComplete ? (
              <>
                {/* Initial Upload Section - Only show when no data is parsed */}
                {(!showParsedSection || parsedData.length === 0) && !isUploading && !isProcessingFile ? (
                  <div className="mb-6">
                    {isSampleFile && <SampleExcelDownloadSale />}

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload Excel/CSV File
                      </label>
                      <input
                        type="file"
                        accept=".csv, .xlsx, .xls"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        disabled={isUploading || isProcessingFile}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Supports .csv, .xlsx, .xls files (Max 20MB)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6">
                    {/* File Successfully Parsed Section - ALWAYS SHOWS when parsed */}
                    {showParsedSection && parsedData.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-green-800 mb-1">
                              File Successfully Parsed
                            </h3>
                            <p className="text-sm text-green-700 mb-2">
                              Found {parsedData.length} invoices
                            </p>
                            {importErrorDetails.length > 0 && (
                              <div className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded mb-2">
                                ⚠️ Found {importErrorDetails.length} validation
                                issues
                              </div>
                            )}
                          </div>
                          {!isImporting && (
                            <button
                              onClick={resetParsedData}
                              className="text-sm text-gray-600 hover:text-gray-800 cursor-pointer px-3 py-1"
                              disabled={isUploading || isProcessingFile}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Import Progress Bar - Shows DURING import */}
                    {isImporting && (
                      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-blue-800">
                            {getImportButtonText() || "Importing Data"}
                          </h3>
                          <span className="text-sm font-medium text-blue-600">
                            {importProgress}%
                          </span>
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                          <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${importProgress}%` }}
                          ></div>
                        </div>

                        <div className="text-sm text-gray-600 mb-4">
                          {importStep}
                          {totalToProcess > 0 && processedCount > 0 && (
                            <span className="ml-2">
                              ({processedCount}/{totalToProcess})
                            </span>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={handleCancelImport}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer text-sm"
                          >
                            Cancel Import
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Import Buttons - Show when NOT importing and data is parsed */}
                    {!isImporting && showParsedSection && parsedData.length > 0 && (
                      <>
                        <div className="flex flex-col gap-2 mb-4">
                          <button
                            onClick={handleImportAllData}
                            disabled={isUploading || isProcessingFile}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Import All Data
                          </button>
                          <button
                            onClick={handleImportValidOnly}
                            disabled={
                              isUploading ||
                              isProcessingFile ||
                              validParsedData.length === 0
                            }
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Import Valid Only ({validParsedData.length})
                          </button>
                        </div>

                        {importErrorDetails.length > 0 && (
                          <div className="border border-red-200 rounded-lg overflow-hidden mb-4">
                            <div className="bg-red-50 p-3 flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <AlertCircle
                                  className="text-red-600"
                                  size={18}
                                />
                                <h3 className="font-medium text-red-800">
                                  Validation Errors ({importErrorDetails.length}
                                  )
                                </h3>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    setShowValidationErrors(
                                      !showValidationErrors
                                    )
                                  }
                                  className="text-sm text-red-600 hover:text-red-800 cursor-pointer px-3 py-1 border border-red-300 rounded"
                                  disabled={isUploading || isProcessingFile}
                                >
                                  {showValidationErrors
                                    ? "Hide Details"
                                    : "Show Details"}
                                </button>
                                <button
                                  onClick={downloadValidationErrorsReport}
                                  className="text-sm bg-red-600 hover:bg-red-700 text-white cursor-pointer px-3 py-1 rounded flex items-center gap-1"
                                  disabled={isUploading || isProcessingFile}
                                >
                                  <Download size={14} />
                                  Download CSV
                                </button>
                              </div>
                            </div>

                            {showValidationErrors && (
                              <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                      <th className="p-2 text-left border-b">
                                        Excel Row
                                      </th>
                                      <th className="p-2 text-left border-b">
                                        Invoice #
                                      </th>
                                      <th className="p-2 text-left border-b">
                                        Customer
                                      </th>
                                      <th className="p-2 text-left border-b">
                                        Error Message
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {importErrorDetails
                                      .slice(0, 10)
                                      .map((error, index) => (
                                        <tr
                                          key={`validation-error-${index}`}
                                          className="hover:bg-red-50 border-b"
                                        >
                                          <td className="p-2 font-mono text-gray-700">
                                            {error.row}
                                          </td>
                                          <td className="p-2">
                                            {error.invoiceNumber || "N/A"}
                                          </td>
                                          <td className="p-2">
                                            {error.customerName || "N/A"}
                                          </td>
                                          <td className="p-2 text-red-600">
                                            {error.message}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Close Button */}
                <div className="flex justify-end items-center gap-3">
                  <button
                    onClick={handleClose}
                    disabled={isUploading || isProcessingFile}
                    className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              /* Import Complete - Show Close Button */
              <div className="flex justify-end mt-6 pt-4 border-t border-gray-300">
                <button
                  onClick={handleClose}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
