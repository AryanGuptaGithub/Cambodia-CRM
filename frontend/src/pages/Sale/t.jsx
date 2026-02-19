const ImportSalesModal = ({
  isOpen,
  onClose,
  onImportSuccess,
  mrList = [],
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [importErrorDetails, setImportErrorDetails] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showParsedSection, setShowParsedSection] = useState(false);
  const [importStep, setImportStep] = useState("");
  const [isCancelled, setIsCancelled] = useState(false);
  const abortControllerRef = useRef(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [importSaleType, setImportSaleType] = useState("normal");
  const [serverProgress, setServerProgress] = useState(0);
  const [serverProcessed, setServerProcessed] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [failedInvoices, setFailedInvoices] = useState([]);
  const [showFailedInvoices, setShowFailedInvoices] = useState(false);
  const [showStockValidation, setShowStockValidation] = useState(false);
  const [stockValidationResult, setStockValidationResult] = useState(null);
  const [isValidatingStock, setIsValidatingStock] = useState(false);
  const [mrValidationResult, setMrValidationResult] = useState(null);
  const [showMRValidation, setShowMRValidation] = useState(false);
  const [isValidatingMR, setIsValidatingMR] = useState(false);

  const pollingIntervalRef = useRef(null);

  const clearPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const resetModal = useCallback(
    (fullReset = true) => {
      if (fullReset) {
        setParsedData([]);
        setImportErrorDetails([]);
        setFailedInvoices([]);
        setSessionId(null);
        setStockValidationResult(null);
        setMrValidationResult(null);
      }

      setShowParsedSection(false);
      setShowFailedInvoices(false);
      setShowStockValidation(false);
      setShowMRValidation(false);
      setServerProgress(0);
      setServerProcessed(0);
      setServerTotal(0);
      setIsImporting(false);
      setIsValidatingStock(false);
      setIsValidatingMR(false);
      setIsUploading(false);
      setIsProcessingFile(false);
      setImportStep("");
      setIsCancelled(false);
      clearPolling();

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = "";
    },
    [clearPolling],
  );

  const handleClose = useCallback(() => {
    if (isImporting || isUploading || isProcessingFile) {
      const shouldCancel = window.confirm(
        "Import is in progress. Are you sure you want to cancel and close?",
      );
      if (shouldCancel) {
        handleCancelImport();
        setTimeout(() => {
          resetModal();
          onClose();
        }, 500);
      }
      return;
    }
    resetModal();
    onClose();
  }, [isImporting, isUploading, isProcessingFile, resetModal, onClose]);

  const handleCancelImport = useCallback(() => {
    setIsCancelled(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    clearPolling();
    setIsImporting(false);
    setImportStep("Import cancelled by user");
    showToast("info", "Import cancelled");
  }, [clearPolling]);

  // ── parseExcelDate ────────────────────────────────────────────────────────
  const parseExcelDate = useCallback((value) => {
    if (value === null || value === undefined || value === "") {
      return new Date().toISOString().split("T")[0];
    }
    try {
      if (value instanceof Date && !isNaN(value)) {
        return value.toISOString().split("T")[0];
      }
      if (typeof value === "number") {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + (value - 1) * 86400000);
        return date.toISOString().split("T")[0];
      }
      if (typeof value === "string") {
        const str = value.trim();
        const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
          const d = new Date(
            parseInt(ddmmyyyy[3]),
            parseInt(ddmmyyyy[2]) - 1,
            parseInt(ddmmyyyy[1]),
          );
          if (!isNaN(d)) return d.toISOString().split("T")[0];
        }
        const yyyymmdd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (yyyymmdd) {
          const d = new Date(
            parseInt(yyyymmdd[1]),
            parseInt(yyyymmdd[2]) - 1,
            parseInt(yyyymmdd[3]),
          );
          if (!isNaN(d)) return d.toISOString().split("T")[0];
        }
        const parsed = new Date(str);
        if (!isNaN(parsed)) return parsed.toISOString().split("T")[0];
      }
      return new Date().toISOString().split("T")[0];
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  }, []);

  // ── parseExcelQuantity ────────────────────────────────────────────────────
  const parseExcelQuantity = useCallback((value) => {
    if (value === null || value === undefined || value === "") return 0;
    try {
      if (typeof value === "number") return Math.max(0, value);
      const cleaned = String(value).trim().replace(/,/g, "").replace(/[^\d.-]/g, "");
      const num = parseFloat(cleaned);
      if (isNaN(num) || !isFinite(num)) return 0;
      return Math.max(0, num);
    } catch {
      return 0;
    }
  }, []);

  // ── parseExcelAmount ──────────────────────────────────────────────────────
  const parseExcelAmount = useCallback((value) => {
    if (value === null || value === undefined || value === "") return 0;
    try {
      if (typeof value === "number") return Math.max(0, value);
      const cleaned = String(value).trim().replace(/[$,\s]/g, "").replace(/[^\d.-]/g, "");
      const num = parseFloat(cleaned);
      if (isNaN(num) || !isFinite(num)) return 0;
      return Math.max(0, num);
    } catch {
      return 0;
    }
  }, []);

const parseExcelFile = useCallback(
  async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, {
            type: "array",
            cellDates: true,
            cellNF: false,
            cellText: false,
          });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Convert all rows (including empty ones) to an array of arrays
          const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
            raw: true,
          });

          console.log("RAW EXCEL DATA - Total rows in sheet:", rows.length);

          // ----- Find the header row -----
          const isHeaderRow = (row) => {
            if (!Array.isArray(row) || row.length === 0) return false;
            return row
              .map((c) => String(c ?? "").toLowerCase().trim())
              .join(" ")
              .includes("invoice");
          };

          let headerIndex = -1;
          for (let i = 0; i < Math.min(rows.length, 20); i++) {
            if (isHeaderRow(rows[i])) {
              headerIndex = i;
              break;
            }
          }

          if (headerIndex === -1) {
            reject(
              new Error(
                "Could not find header row. Make sure your file has a row containing 'Invoice #' or 'Invoice'."
              )
            );
            return;
          }

          const headerRow = rows[headerIndex];
          // Get all rows after the header and filter out completely empty rows
          const allDataRows = rows.slice(headerIndex + 1);
          const dataRows = allDataRows.filter(
            (row) =>
              Array.isArray(row) &&
              row.some(
                (cell) =>
                  cell !== null &&
                  cell !== undefined &&
                  String(cell).trim() !== ""
              )
          );

          console.log(
            `Header found at row ${headerIndex + 1}. ` +
              `Data rows available: ${dataRows.length} (total rows after header: ${allDataRows.length})`
          );

          if (dataRows.length === 0) {
            reject(
              new Error(
                `No data rows found. Your file has a header row at row ${
                  headerIndex + 1
                } but no non‑empty data below it. ` +
                  `Please add invoice data starting from row ${
                    headerIndex + 2
                  }.`
              )
            );
            return;
          }

          // ----- Flexible column mapping (unchanged) -----
          const headerMap = {};
          headerRow.forEach((cell, idx) => {
            if (cell !== null && cell !== undefined) {
              const key = String(cell).toLowerCase().trim();
              if (key) headerMap[key] = idx;
            }
          });

          const findCol = (aliases) => {
            for (const alias of aliases) {
              if (headerMap[alias] !== undefined) return headerMap[alias];
            }
            for (const alias of aliases) {
              const found = Object.keys(headerMap).find((k) =>
                k.includes(alias)
              );
              if (found !== undefined) return headerMap[found];
            }
            return -1;
          };

          const col = {
            recordingDate: findCol([
              "recording date",
              "recording_date",
              "rec date",
            ]),
            invoiceNumber: findCol([
              "invoice #",
              "invoice#",
              "invoice no",
              "invoice number",
              "invoice_number",
              "invoice",
            ]),
            invoiceDate: findCol(["invoice date", "invoice_date", "inv date"]),
            mrName: findCol([
              "mr name",
              "mr_name",
              "mr",
              "medical rep",
              "medical rep name",
              "medrep",
            ]),
            customerCode: findCol([
              "customer code",
              "customer_code",
              "cust code",
              "cust_code",
              "customer id",
            ]),
            productName: findCol([
              "product name",
              "product_name",
              "item name",
              "item_name",
              "product",
            ]),
            salesQty: findCol([
              "sales qty",
              "sales_qty",
              "salesqty",
              "sale qty",
              "sale_qty",
              "qty",
              "quantity",
              "sales quantity",
            ]),
            bonusQty: findCol([
              "bonus qty",
              "bonus_qty",
              "bonusqty",
              "bonus quantity",
              "bonus",
            ]),
            sellingPrice: findCol([
              "selling price",
              "selling_price",
              "sellingprice",
              "price",
              "unit price",
              "sale price",
            ]),
            discount: findCol([
              "discount",
              "disc",
              "disc amount",
              "discount amount",
            ]),
            creditDays: findCol(["credit days", "credit_days", "creditdays"]),
            paidAmount: findCol([
              "paid amount",
              "paid_amount",
              "paidamount",
              "paid",
            ]),
            paymentStatus: findCol([
              "payment status",
              "payment_status",
              "paymentstatus",
              "status",
              "pay status",
            ]),
            remarks: findCol([
              "remarks",
              "remark",
              "notes",
              "note",
              "comment",
              "comments",
            ]),
          };

          const getVal = (row, index) => {
            if (index === -1 || index === undefined || index >= row.length)
              return "";
            const v = row[index];
            if (v === null || v === undefined) return "";
            if (v instanceof Date)
              return isNaN(v.getTime()) ? "" : v.toISOString().split("T")[0];
            return String(v).trim();
          };

          const groupedInvoices = {};
          const validationErrors = [];
          let validRowCount = 0;

          for (let ri = 0; ri < dataRows.length; ri++) {
            const row = dataRows[ri];
            const excelRow = headerIndex + 2 + ri; // original Excel row number

            const invoiceNumber = getVal(row, col.invoiceNumber);
            const invoiceDate = getVal(row, col.invoiceDate);
            const recordingDate =
              getVal(row, col.recordingDate) || invoiceDate;
            const mrName = getVal(row, col.mrName);
            const customerCode = getVal(row, col.customerCode);
            const productName = getVal(row, col.productName);
            const paymentStatus = getVal(row, col.paymentStatus);
            const remarks = getVal(row, col.remarks);

            const salesQty = parseExcelQuantity(getVal(row, col.salesQty));
            const bonusQty = parseExcelQuantity(getVal(row, col.bonusQty));
            const sellingPrice = parseExcelAmount(getVal(row, col.sellingPrice));
            const discount = parseExcelAmount(getVal(row, col.discount));
            const creditDays = parseExcelAmount(getVal(row, col.creditDays));
            const paidAmount = parseExcelAmount(getVal(row, col.paidAmount));

            const rowErrors = [];
            if (!invoiceNumber) rowErrors.push("Invoice number is required");
            if (!productName) rowErrors.push("Product name is required");
            if (salesQty < 0 || bonusQty < 0)
              rowErrors.push("Quantities cannot be negative");
            if (salesQty === 0 && bonusQty === 0)
              rowErrors.push("Sales Qty or Bonus Qty must be greater than 0");

            if (rowErrors.length > 0) {
              validationErrors.push({
                row: excelRow,
                invoiceNumber: invoiceNumber || "N/A",
                productName: productName || "N/A",
                mrName: mrName || "Unknown",
                error: rowErrors.join("; "),
                type: "validation",
              });
              continue;
            }

            validRowCount++;

            const netSellingAmount = sellingPrice * salesQty - discount;

            if (!groupedInvoices[invoiceNumber]) {
              groupedInvoices[invoiceNumber] = {
                recordingDate: parseExcelDate(recordingDate),
                invoiceNumber,
                invoiceDate: parseExcelDate(invoiceDate),
                mrName: mrName || "Unknown",
                customerName: "Unknown",
                customerCode: customerCode || "",
                customerId: "",
                creditDays: creditDays || 0,
                paidAmount: paidAmount || 0,
                products: [],
                totalAmount: 0,
                dueAmount: 0,
                paymentStatus: paymentStatus || "Credit",
                remark: remarks || "",
                isMrSaleImport: importSaleType === "mr",
              };
            }

            groupedInvoices[invoiceNumber].products.push({
              productName,
              salesQty,
              bonusQty,
              totalQty: salesQty + bonusQty,
              sellingPrice,
              amount: netSellingAmount,
              discount,
              netSellingAmount,
              averageUnitPrice:
                salesQty + bonusQty > 0
                  ? netSellingAmount / (salesQty + bonusQty)
                  : 0,
              lc: 0,
              profitLoss: 0,
              isProductAccept: true,
              remark: "",
            });

            groupedInvoices[invoiceNumber].totalAmount += netSellingAmount;
          }

          console.log(
            `Parsing summary — data rows: ${dataRows.length}, ` +
              `valid: ${validRowCount}, errors: ${validationErrors.length}`
          );

          const validInvoices = Object.values(groupedInvoices).filter(
            (inv) => inv.products && inv.products.length > 0
          );

          validInvoices.forEach((inv) => {
            inv.dueAmount = Math.max(0, inv.totalAmount - (inv.paidAmount || 0));
          });

          console.log(`Final result: ${validInvoices.length} valid invoices`);

          if (validInvoices.length === 0) {
            let errorMsg = "No valid invoices found. ";
            if (dataRows.length === 0) {
              errorMsg += `Your file has no data rows below the header (row ${
                headerIndex + 1
              }). Please add invoice data.`;
            } else if (validationErrors.length > 0) {
              errorMsg +=
                `${validationErrors.length} row(s) had validation errors. ` +
                validationErrors
                  .slice(0, 3)
                  .map((e) => `Row ${e.row}: ${e.error}`)
                  .join(" | ");
            } else {
              errorMsg += "No data rows found after the header row.";
            }
            reject(new Error(errorMsg));
            return;
          }

          resolve({ validInvoices, validationErrors });
        } catch (error) {
          console.error("Error parsing Excel:", error);
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  },
  [parseExcelDate, parseExcelQuantity, parseExcelAmount, importSaleType]
);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const validExtensions = [".xlsx", ".xls", ".csv"];
      const fileExtension = "." + file.name.split(".").pop().toLowerCase();

      if (!validExtensions.includes(fileExtension)) {
        showToast("error", "Invalid file type. Please upload Excel or CSV files only.");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        showToast("error", "File size too large. Maximum size is 20MB.");
        return;
      }

      resetModal(false);
      setImportMessage("Reading file...");
      setIsUploading(true);
      setIsProcessingFile(true);

      try {
        setImportMessage("Processing Excel data...");
        const { validInvoices, validationErrors } = await parseExcelFile(file);
        console.log("values of validInvoices", validInvoices);

        if (validInvoices.length === 0) {
          throw new Error("No valid invoices found in the file");
        }

        if (importSaleType === "mr") {
          validInvoices.forEach((inv) => { inv.isMrSaleImport = true; });
        }

        setParsedData(validInvoices);
        setImportErrorDetails(validationErrors);

        if (validationErrors.length > 0) {
          showToast("warning", `Found ${validInvoices.length} valid invoices with ${validationErrors.length} validation errors`);
        } else {
          showToast("success", `Successfully parsed ${validInvoices.length} invoices`);
        }

        setShowParsedSection(true);
      } catch (error) {
        console.error("File processing error:", error);
        showToast("error", `Failed to process file: ${error.message}`);
        resetModal(false);
      } finally {
        setIsUploading(false);
        setIsProcessingFile(false);
      }
    },
    [importSaleType, resetModal, parseExcelFile],
  );

  const validateMRsBeforeImport = useCallback(async (invoices) => {
    try {
      setIsValidatingMR(true);
      setImportMessage(`🔍 Validating MRs for ${invoices.length} invoices...`);

      const mrNames = new Set();
      const mrToInvoices = new Map();

      for (const invoice of invoices) {
        if (invoice.mrName && invoice.mrName.trim()) {
          const mrName = invoice.mrName.trim();
          mrNames.add(mrName);
          if (!mrToInvoices.has(mrName)) mrToInvoices.set(mrName, []);
          mrToInvoices.get(mrName).push({
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customerName,
          });
        }
      }

      if (mrNames.size === 0) {
        setIsValidatingMR(false);
        return { mrIssues: [], totalInvoices: invoices.length, summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 } };
      }

      const response = await axios.post(
        `${backendUrl}/api/sales/validate-mr`,
        { mrNames: Array.from(mrNames) },
        getAuthHeaders(),
      );

      setIsValidatingMR(false);

      if (response.data.success) {
        return { mrIssues: [], totalInvoices: invoices.length, summary: { totalMRs: mrNames.size, validMRs: mrNames.size, invalidMRs: 0 } };
      }

      const mrIssues = [];
      const invalidMRMap = new Map();

      response.data.invalidMRs.forEach((invalidMR) => {
        const affectedInvoices = mrToInvoices.get(invalidMR.mrName) || [];
        invalidMRMap.set(invalidMR.mrName, {
          mrName: invalidMR.mrName,
          message: invalidMR.message,
          affectedInvoices,
          affectedCount: affectedInvoices.length,
        });
      });

      mrIssues.push(...Array.from(invalidMRMap.values()));

      return {
        mrIssues,
        totalInvoices: invoices.length,
        summary: { totalMRs: mrNames.size, validMRs: mrNames.size - mrIssues.length, invalidMRs: mrIssues.length },
      };
    } catch (error) {
      console.error("MR validation error:", error);
      setIsValidatingMR(false);
      return { mrIssues: [], totalInvoices: invoices.length, summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 }, error: error.message };
    }
  }, []);

  const validateStockBeforeImport = useCallback(async (invoices) => {
    try {
      setIsValidatingStock(true);
      setImportMessage(`Checking stock for ${invoices.length} invoices...`);

      const response = await axios.post(
        `${backendUrl}/api/sales/validate-import-stock`,
        { invoices },
        getAuthHeaders(),
      );

      setIsValidatingStock(false);

      if (response.data.success) {
        return response.data.validationResult;
      } else {
        throw new Error(response.data.message || "Stock validation failed");
      }
    } catch (error) {
      console.error("Stock validation error:", error);
      setIsValidatingStock(false);
      return {
        stockIssues: [],
        totalInvoices: invoices.length,
        summary: { totalProducts: 0, totalRequired: 0, totalAvailable: 0, totalInsufficient: 0, missingProducts: 0, lowStockProducts: 0, hasCriticalIssues: true, hasInsufficientStock: false, importBlocked: true },
        insufficientStockIssues: [],
        missingProductIssues: [],
        importBlocked: true,
        blockReason: "VALIDATION_ERROR",
        message: `Stock validation failed: ${error.message}`,
      };
    }
  }, []);

  const handleImportData = useCallback(async () => {
    if (parsedData.length === 0) { showToast("error", "No data to import"); return; }

    const mrValResult = await validateMRsBeforeImport(parsedData);
    if (mrValResult.mrIssues && mrValResult.mrIssues.length > 0) {
      setMrValidationResult(mrValResult);
      setShowMRValidation(true);
      return;
    }

    const svResult = await validateStockBeforeImport(parsedData);
    if (svResult.stockIssues?.length > 0) {
      const insufficientStockIssues = svResult.stockIssues.filter((i) => i.productExists && i.insufficient);
      const missingProductIssues = svResult.stockIssues.filter((i) => !i.productExists);

      if (insufficientStockIssues.length > 0) {
        setStockValidationResult({ ...svResult, stockIssues: insufficientStockIssues, summary: { ...svResult.summary, totalInsufficient: insufficientStockIssues.length, hasInsufficientStock: true }, importBlocked: true, message: `${insufficientStockIssues.length} products have insufficient stock.` });
        setShowStockValidation(true);
        return;
      }

      if (missingProductIssues.length > 0 && insufficientStockIssues.length === 0) {
        setStockValidationResult({ ...svResult, stockIssues: missingProductIssues, summary: { ...svResult.summary, totalInsufficient: missingProductIssues.length, hasInsufficientStock: false }, importBlocked: false, message: `${missingProductIssues.length} products not found in inventory.` });
        setShowStockValidation(true);
        return;
      }
    }

    await handleProductImport(parsedData);
  }, [parsedData, validateMRsBeforeImport, validateStockBeforeImport]);

  const handleProceedWithMRIssues = useCallback(async () => {
    const confirmProceed = await confirmDialog({
      title: "Proceed with Invalid MRs",
      text: `${mrValidationResult?.summary?.invalidMRs || 0} MRs are not registered. These will be saved as provided. Do you want to proceed?`,
      icon: "warning",
      confirmButtonText: "Yes, Proceed Anyway",
      cancelButtonText: "Cancel",
    });
    if (confirmProceed.isConfirmed) {
      setShowMRValidation(false);
      await handleProductImport(parsedData);
    }
  }, [mrValidationResult, parsedData]);

  const handleProceedWithStockIssues = useCallback(async () => {
    if (!stockValidationResult) { showToast("error", "Stock validation data not available"); return; }
    if (stockValidationResult.summary?.hasInsufficientStock) { showToast("error", "Cannot proceed - there are insufficient stock issues"); return; }

    const confirmProceed = await confirmDialog({
      title: "Proceed with Missing Products",
      text: `${stockValidationResult.summary?.missingProducts || 0} products are not in inventory. These will be created during import. Do you want to proceed?`,
      icon: "warning",
      confirmButtonText: "Yes, Create Products",
      cancelButtonText: "Cancel",
    });
    if (confirmProceed.isConfirmed) {
      setShowStockValidation(false);
      await handleProductImport(parsedData);
    }
  }, [stockValidationResult, parsedData]);

  const handleCancelStockValidation = useCallback(() => {
    setShowStockValidation(false);
    setStockValidationResult(null);
    setIsValidatingStock(false);
    setImportStep("");
    showToast("info", "Import cancelled");
  }, []);

  const handleProductImport = useCallback(
    async (dataToImport) => {
      if (!dataToImport?.length) { showToast("error", "No data to import"); return; }

      setIsImporting(true);
      setImportStep("Preparing data...");
      setServerProgress(0);
      setServerProcessed(0);
      setServerTotal(dataToImport.length);
      setFailedInvoices([]);

      abortControllerRef.current = new AbortController();

      try {
        const isMrSale = importSaleType === "mr";

        const transformedInvoices = dataToImport.map((inv) => ({
          ...inv,
          invoiceDate:    inv.invoiceDate    || new Date().toISOString().split("T")[0],
          recordingDate:  inv.recordingDate  || new Date().toISOString().split("T")[0],
          paymentStatus:  inv.paymentStatus  || "Credit",
          totalAmount:    inv.totalAmount    || 0,
          dueAmount:      inv.dueAmount      || 0,
          isMrSaleImport: isMrSale,
          products: inv.products.map((product) => ({
            ...product,
            salesQty: Number(product.salesQty) || 0,
            bonusQty: Number(product.bonusQty) || 0,
            totalQty: (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0),
          })),
        }));

        setImportStep("Sending to server...");

        const response = await axios.post(
          `${backendUrl}/api/sales/import-with-stock-deduction`,
          { invoices: transformedInvoices, updateInventory: true, importTimestamp: new Date().toISOString() },
          { timeout: 300000, signal: abortControllerRef.current.signal, ...getAuthHeaders() },
        );

        if (response.data.success) {
          const newSessionId = response.data.sessionId;
          setSessionId(newSessionId);
          setImportStep("Import started – processing invoices...");

          pollingIntervalRef.current = setInterval(async () => {
            try {
              const progressResponse = await axios.get(
                `${backendUrl}/api/sales/import/progress/${newSessionId}`,
                { timeout: 5000, ...getAuthHeaders() },
              );

              if (progressResponse.data.success) {
                const progress = progressResponse.data.progress;
                setServerProgress(progress.percentage || 0);
                setServerProcessed(progress.processed || 0);
                setServerTotal(progress.total || dataToImport.length);

                if (progress.completed) {
                  clearPolling();
                  setIsImporting(false);

                  if (progress.failed > 0) {
                    try {
                      const failedResponse = await axios.get(
                        `${backendUrl}/api/sales/import/failed/${newSessionId}`,
                        getAuthHeaders(),
                      );
                      if (failedResponse.data.success) {
                        const failedInvoicesData = failedResponse.data.data.failedInvoices || [];
                        if (failedInvoicesData.length > 0) {
                          setFailedInvoices(failedInvoicesData);
                          setShowFailedInvoices(true);
                        }
                      }
                    } catch (fetchError) {
                      console.error("Error fetching failed invoices:", fetchError);
                    }
                    showToast("warning", `Import completed with ${progress.successful} successful and ${progress.failed} failed invoices`);
                  } else {
                    showToast("success", `Successfully imported ${progress.successful} invoices`);
                    if (onImportSuccess) {
                      onImportSuccess();
                      setTimeout(() => window.dispatchEvent(new CustomEvent("inventory-updated")), 1000);
                    }
                  }

                  setImportStep("Import completed");
                }
              }
            } catch (err) {
              if (err.code === "ERR_CANCELED") return;
              console.error("Progress polling error:", err);
            }
          }, 1000);
        } else {
          throw new Error(response.data.message || "Import failed");
        }
      } catch (err) {
        clearPolling();
        setIsImporting(false);

        if (axios.isCancel(err) || isCancelled) {
          setImportStep("Import cancelled");
          showToast("info", "Import cancelled");
        } else {
          const message = err.response?.data?.message || err.message || "Import failed";
          setImportStep("Import failed");
          showToast("error", message);
          if (err.response?.data?.failedInvoices) {
            setFailedInvoices(err.response.data.failedInvoices);
            setShowFailedInvoices(true);
          }
        }
      }
    },
    [clearPolling, isCancelled, onImportSuccess, importSaleType],
  );

  const resetParsedData = useCallback(() => {
    setParsedData([]);
    setImportErrorDetails([]);
    setShowParsedSection(false);
    setFailedInvoices([]);
    setShowFailedInvoices(false);
    setShowStockValidation(false);
    setStockValidationResult(null);
    setShowMRValidation(false);
    setMrValidationResult(null);
  }, []);

  useEffect(() => {
    return () => {
      clearPolling();
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [clearPolling]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <>
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

          {!isImporting && (
            <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
              <button
                onClick={() => { setImportSaleType("normal"); resetParsedData(); }}
                disabled={isImporting || isValidatingStock || isValidatingMR}
                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${importSaleType === "normal" ? "bg-indigo-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
              >
                <Package size={16} />
                Normal Sale
                <span className={`text-xs px-2 py-0.5 rounded-full ${importSaleType === "normal" ? "bg-indigo-500 text-white" : "bg-gray-200 text-gray-600"}`}>
                  Warehouse Stock
                </span>
              </button>
              <button
                onClick={() => { setImportSaleType("mr"); resetParsedData(); }}
                disabled={isImporting || isValidatingStock || isValidatingMR}
                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${importSaleType === "mr" ? "bg-green-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
              >
                <User size={16} />
                MR Sale
                <span className={`text-xs px-2 py-0.5 rounded-full ${importSaleType === "mr" ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600"}`}>
                  MR Hand Stock
                </span>
              </button>
            </div>
          )}

          {!isImporting && (
            <div className={`mb-5 p-3 rounded-lg text-sm ${importSaleType === "normal" ? "bg-indigo-50 text-indigo-800 border border-indigo-200" : "bg-green-50 text-green-800 border border-green-200"}`}>
              {importSaleType === "normal" ? (
                <p>📦 <strong>Normal Sale:</strong> Stock will be deducted from the main warehouse inventory.</p>
              ) : (
                <p>👤 <strong>MR Sale:</strong> Stock will be deducted from each MR's hand stock. The MR Name column in your Excel file determines which MR's stock is used.</p>
              )}
            </div>
          )}

          {!showParsedSection && !isUploading && !isProcessingFile && !isImporting && (
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Excel/CSV File
              </label>
              <div className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-lg p-8 text-center transition-colors">
                <Upload className="mx-auto text-gray-400 mb-3" size={48} />
                <p className="text-gray-600 mb-2">
                  Drag & drop your file here or click to browse
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  disabled={isUploading || isProcessingFile}
                />
                <p className="text-xs text-gray-500 mt-3">
                  Supported formats: Excel (.xlsx, .xls), CSV (.csv) | Max size: 20MB
                </p>
                <SampleExcelDownloadSale />
              </div>
            </div>
          )}

          {(isUploading || isProcessingFile) && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <h3 className="font-medium text-blue-800">
                  {isUploading ? "Uploading..." : "Processing file..."}
                </h3>
              </div>
              <p className="text-center text-gray-600">{importMessage}</p>
            </div>
          )}

          {isValidatingMR && (
            <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <div className="flex-1">
                  <h3 className="font-medium text-blue-800">Validating MRs...</h3>
                  <p className="text-sm text-blue-700 mt-1">Checking MR names for {parsedData.length} invoices...</p>
                </div>
              </div>
            </div>
          )}

          {isValidatingStock && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div>
                <div>
                  <h3 className="font-medium text-yellow-800">Checking Stock Availability</h3>
                  <p className="text-sm text-yellow-700 mt-1">Validating stock for {parsedData.length} invoices...</p>
                </div>
              </div>
            </div>
          )}

          {showParsedSection && parsedData.length > 0 && (
            <div className={`mb-6 border rounded-lg p-4 ${importSaleType === "mr" ? "bg-green-50 border-green-200" : "bg-indigo-50 border-indigo-200"}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className={`font-medium ${importSaleType === "mr" ? "text-green-800" : "text-indigo-800"}`}>
                    File Successfully Parsed
                  </h3>
                  <p className={`text-sm ${importSaleType === "mr" ? "text-green-700" : "text-indigo-700"}`}>
                    Found {parsedData.length} valid invoices ready for import
                  </p>
                  {importErrorDetails.length > 0 && (
                    <p className="text-sm text-yellow-700 mt-1">
                      ⚠️ {importErrorDetails.length} rows skipped due to errors
                    </p>
                  )}
                </div>
                <button
                  onClick={resetParsedData}
                  className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 border border-gray-300 rounded-lg cursor-pointer"
                  disabled={isImporting || isValidatingStock || isValidatingMR}
                >
                  Clear
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Invoices</div>
                  <div className="font-bold text-lg">{parsedData.length}</div>
                </div>
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Products</div>
                  <div className="font-bold text-lg">
                    {parsedData.reduce((sum, inv) => sum + (inv.products?.length || 0), 0)}
                  </div>
                </div>
                <div className="bg-white p-2 rounded border text-center">
                  <div className="text-xs text-gray-500">Total Amount</div>
                  <div className="font-bold text-lg">
                    ${parsedData.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {importSaleType === "mr" && (
                <div className="mt-3 p-2 bg-green-100 rounded text-xs text-green-800">
                  MRs detected in file:{" "}
                  {[...new Set(parsedData.map((inv) => inv.mrName).filter(Boolean))].join(", ") || "None"}
                </div>
              )}

              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Sample Data (First 3 invoices):</h4>
                <div className="bg-white border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Invoice</th>
                        <th className="p-2 text-left">MR</th>
                        <th className="p-2 text-left">Products</th>
                        <th className="p-2 text-left">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 3).map((inv, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 font-mono">{inv.invoiceNumber}</td>
                          <td className="p-2">{inv.mrName}</td>
                          <td className="p-2">{inv.products?.length || 0}</td>
                          <td className="p-2">${inv.totalAmount?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {importErrorDetails.length > 0 && showParsedSection && !isImporting && (
            <div className="mb-6 border border-yellow-200 rounded-lg overflow-hidden">
              <div className="bg-yellow-50 p-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertCircle className="text-yellow-600" size={18} />
                  <h3 className="font-medium text-yellow-800">
                    Validation Errors ({importErrorDetails.length})
                  </h3>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left border-b">Row</th>
                      <th className="p-2 text-left border-b">Invoice #</th>
                      <th className="p-2 text-left border-b">Product</th>
                      <th className="p-2 text-left border-b">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importErrorDetails.slice(0, 10).map((err, i) => (
                      <tr key={i} className="hover:bg-yellow-50 border-b">
                        <td className="p-2 font-mono">{err.row}</td>
                        <td className="p-2">{err.invoiceNumber}</td>
                        <td className="p-2">{err.productName}</td>
                        <td className="p-2 text-yellow-600 text-xs">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importErrorDetails.length > 10 && (
                  <div className="p-2 text-center text-gray-500 text-sm">
                    Showing 10 of {importErrorDetails.length} errors
                  </div>
                )}
              </div>
            </div>
          )}

          {isImporting && (
            <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-blue-900">
                  Importing {importSaleType === "mr" ? "MR Sale" : "Normal Sale"} Data...
                </h3>
                <span className="text-3xl font-extrabold text-indigo-700">{serverProgress}%</span>
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
              <p className="text-center text-gray-700 font-medium text-lg mb-6">{importStep}</p>
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

          {!isImporting && showParsedSection && parsedData.length > 0 && !isValidatingStock && !isValidatingMR && (
            <div className="mb-6">
              <button
                onClick={handleImportData}
                className={`w-full py-4 rounded-xl font-bold text-xl shadow-lg transition transform hover:scale-105 cursor-pointer text-white ${importSaleType === "mr" ? "bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800" : "bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800"}`}
                disabled={isImporting || isValidatingStock || isValidatingMR}
              >
                Start {importSaleType === "mr" ? "MR Sale" : "Normal Sale"} Import ({parsedData.length} invoices)
              </button>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-gray-200">
            <div>
              {showParsedSection && parsedData.length > 0 && (
                <button
                  onClick={resetParsedData}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
                  disabled={isImporting || isValidatingStock || isValidatingMR}
                >
                  Upload Different File
                </button>
              )}
            </div>
            <button
              onClick={handleClose}
              disabled={isUploading || isProcessingFile || isImporting}
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isImporting || isUploading ? "Cancel" : "Close"}
            </button>
          </div>
        </div>
      </div>

      {showStockValidation && stockValidationResult && (
        <StockValidationModal
          isOpen={showStockValidation}
          onClose={() => setShowStockValidation(false)}
          onProceed={handleProceedWithStockIssues}
          onCancel={handleCancelStockValidation}
          stockValidationResult={stockValidationResult}
        />
      )}

      {showMRValidation && mrValidationResult && (
        <MRValidationModal
          isOpen={showMRValidation}
          onClose={() => setShowMRValidation(false)}
          onProceed={handleProceedWithMRIssues}
          mrValidationResult={mrValidationResult}
        />
      )}

      {showFailedInvoices && (
        <FailedInvoicesModal
          isOpen={showFailedInvoices}
          onClose={() => setShowFailedInvoices(false)}
          failedInvoices={failedInvoices}
        />
      )}
    </>,
    document.body,
  );
};