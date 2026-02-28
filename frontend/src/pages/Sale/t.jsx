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

  const parseExcelQuantity = useCallback((value) => {
    if (value === null || value === undefined || value === "") return 0;
    try {
      if (typeof value === "number") return Math.max(0, value);
      const cleaned = String(value)
        .trim()
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "");
      const num = parseFloat(cleaned);
      if (isNaN(num) || !isFinite(num)) return 0;
      return Math.max(0, num);
    } catch {
      return 0;
    }
  }, []);

  const parseExcelAmount = useCallback((value) => {
    if (value === null || value === undefined || value === "") return 0;
    try {
      if (typeof value === "number") return Math.max(0, value);
      const cleaned = String(value)
        .trim()
        .replace(/[$,\s]/g, "")
        .replace(/[^\d.-]/g, "");
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
            const rows = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              defval: "",
              raw: true,
            });

            const isHeaderRow = (row) => {
              if (!Array.isArray(row) || row.length === 0) return false;
              const rowStr = row
                .map((c) =>
                  String(c ?? "")
                    .toLowerCase()
                    .trim(),
                )
                .join(" ");
              return rowStr.includes("invoice");
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
                  "Could not find header row. Make sure your file has a row containing 'Invoice #' or 'Invoice'.",
                ),
              );
              return;
            }

            const headerRow = rows[headerIndex];
            const allDataRows = rows.slice(headerIndex + 1);
            const dataRows = allDataRows.filter(
              (row) =>
                Array.isArray(row) &&
                row.some(
                  (cell) =>
                    cell !== null &&
                    cell !== undefined &&
                    String(cell).trim() !== "",
                ),
            );

            if (dataRows.length === 0) {
              reject(new Error(`No data rows found after the header row.`));
              return;
            }

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
                  k.includes(alias),
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
              invoiceDate: findCol([
                "invoice date",
                "invoice_date",
                "inv date",
              ]),
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
              const excelRow = headerIndex + 2 + ri;

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
              const sellingPrice = parseExcelAmount(
                getVal(row, col.sellingPrice),
              );
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
                  saleType: importSaleType === "mr" ? "MR Sale" : "Normal Sale",
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

            const validInvoices = Object.values(groupedInvoices).filter(
              (inv) => inv.products && inv.products.length > 0,
            );

            validInvoices.forEach((inv) => {
              inv.dueAmount = Math.max(
                0,
                inv.totalAmount - (inv.paidAmount || 0),
              );
            });

            if (validInvoices.length === 0) {
              let errorMsg = "No valid invoices found. ";
              if (validationErrors.length > 0) {
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
    [parseExcelDate, parseExcelQuantity, parseExcelAmount, importSaleType],
  );

  const handleFileUpload = useCallback(
    async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const validExtensions = [".xlsx", ".xls", ".csv"];
      const fileExtension = "." + file.name.split(".").pop().toLowerCase();
      if (!validExtensions.includes(fileExtension)) {
        showToast(
          "error",
          "Invalid file type. Please upload Excel or CSV files only.",
        );
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

        if (validInvoices.length === 0) {
          throw new Error("No valid invoices found in the file");
        }

        if (importSaleType === "mr") {
          validInvoices.forEach((inv) => {
            inv.isMrSaleImport = true;
            inv.saleType = "MR Sale";
          });
        } else {
          validInvoices.forEach((inv) => {
            inv.saleType = "Normal Sale";
          });
        }

        setParsedData(validInvoices);
        setImportErrorDetails(validationErrors);

        if (validationErrors.length > 0) {
          showToast(
            "warning",
            `Found ${validInvoices.length} valid invoices with ${validationErrors.length} validation errors`,
          );
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
        return {
          mrIssues: [],
          totalInvoices: invoices.length,
          summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 },
        };
      }

      const response = await axios.post(
        `${backendUrl}/api/sales/validate-mr`,
        { mrNames: Array.from(mrNames) },
        getAuthHeaders(),
      );

      setIsValidatingMR(false);

      if (response.data.success) {
        return {
          mrIssues: [],
          totalInvoices: invoices.length,
          summary: {
            totalMRs: mrNames.size,
            validMRs: mrNames.size,
            invalidMRs: 0,
          },
        };
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
        summary: {
          totalMRs: mrNames.size,
          validMRs: mrNames.size - mrIssues.length,
          invalidMRs: mrIssues.length,
        },
      };
    } catch (error) {
      console.error("MR validation error:", error);
      setIsValidatingMR(false);
      return {
        mrIssues: [],
        totalInvoices: invoices.length,
        summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 },
        error: error.message,
      };
    }
  }, []);

  const validateStockBeforeImport = useCallback(
    async (invoices) => {
      try {
        setIsValidatingStock(true);
        setImportMessage(`Checking stock for ${invoices.length} invoices...`);

        if (importSaleType === "mr") {
          setIsValidatingStock(false);
          return {
            stockIssues: [],
            totalInvoices: invoices.length,
            summary: {
              totalProducts: 0,
              totalRequired: 0,
              totalAvailable: 0,
              totalInsufficient: 0,
              missingProducts: 0,
              lowStockProducts: 0,
              hasCriticalIssues: false,
              hasInsufficientStock: false,
              importBlocked: false,
            },
            insufficientStockIssues: [],
            missingProductIssues: [],
            importBlocked: false,
            blockReason: "NO_ISSUES",
            message:
              "MR sale - stock from MR hands will be validated during import.",
          };
        }

        const response = await axios.post(
          `${backendUrl}/api/sales/validate-import-stock`,
          { invoices, isMrSaleImport: importSaleType === "mr" },
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
          summary: {
            totalProducts: 0,
            totalRequired: 0,
            totalAvailable: 0,
            totalInsufficient: 0,
            missingProducts: 0,
            lowStockProducts: 0,
            hasCriticalIssues: true,
            hasInsufficientStock: false,
            importBlocked: true,
          },
          insufficientStockIssues: [],
          missingProductIssues: [],
          importBlocked: true,
          blockReason: "VALIDATION_ERROR",
          message: `Stock validation failed: ${error.message}`,
        };
      }
    },
    [importSaleType],
  );

  const handleImportData = useCallback(async () => {
    if (parsedData.length === 0) {
      showToast("error", "No data to import");
      return;
    }

    const mrValResult = await validateMRsBeforeImport(parsedData);
    if (mrValResult.mrIssues && mrValResult.mrIssues.length > 0) {
      setMrValidationResult(mrValResult);
      setShowMRValidation(true);
      return;
    }

    const svResult = await validateStockBeforeImport(parsedData);
    if (svResult.stockIssues?.length > 0) {
      const insufficientStockIssues = svResult.stockIssues.filter(
        (i) => i.productExists && i.insufficient,
      );
      const missingProductIssues = svResult.stockIssues.filter(
        (i) => !i.productExists,
      );

      if (insufficientStockIssues.length > 0) {
        setStockValidationResult({
          ...svResult,
          stockIssues: insufficientStockIssues,
          summary: {
            ...svResult.summary,
            totalInsufficient: insufficientStockIssues.length,
            hasInsufficientStock: true,
          },
          importBlocked: true,
          message: `${insufficientStockIssues.length} products have insufficient stock.`,
        });
        setShowStockValidation(true);
        return;
      }

      if (
        missingProductIssues.length > 0 &&
        insufficientStockIssues.length === 0
      ) {
        setStockValidationResult({
          ...svResult,
          stockIssues: missingProductIssues,
          summary: {
            ...svResult.summary,
            totalInsufficient: missingProductIssues.length,
            hasInsufficientStock: false,
          },
          importBlocked: false,
          message: `${missingProductIssues.length} products not found in inventory.`,
        });
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
    if (!stockValidationResult) {
      showToast("error", "Stock validation data not available");
      return;
    }
    if (stockValidationResult.summary?.hasInsufficientStock) {
      showToast(
        "error",
        "Cannot proceed - there are insufficient stock issues",
      );
      return;
    }

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
      if (!dataToImport?.length) {
        showToast("error", "No data to import");
        return;
      }

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
          invoiceDate:
            inv.invoiceDate || new Date().toISOString().split("T")[0],
          recordingDate:
            inv.recordingDate || new Date().toISOString().split("T")[0],
          paymentStatus: inv.paymentStatus || "Credit",
          totalAmount: inv.totalAmount || 0,
          dueAmount: inv.dueAmount || 0,
          isMrSaleImport: isMrSale,
          isMRSale: isMrSale,
          saleType: isMrSale ? "MR Sale" : "Normal Sale",
          products: inv.products.map((product) => ({
            ...product,
            salesQty: Number(product.salesQty) || 0,
            bonusQty: Number(product.bonusQty) || 0,
            totalQty:
              (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0),
          })),
        }));

        setImportStep("Sending to server...");
        const response = await axios.post(
          `${backendUrl}/api/sales/import-with-stock-deduction`,
          {
            invoices: transformedInvoices,
            updateInventory: true,
            importTimestamp: new Date().toISOString(),
          },
          {
            timeout: 300000,
            signal: abortControllerRef.current.signal,
            ...getAuthHeaders(),
          },
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
                        const failedInvoicesData =
                          failedResponse.data.data.failedInvoices || [];
                        if (failedInvoicesData.length > 0) {
                          setFailedInvoices(failedInvoicesData);
                          setShowFailedInvoices(true);
                        }
                      }
                    } catch (fetchError) {
                      console.error(
                        "Error fetching failed invoices:",
                        fetchError,
                      );
                    }
                    showToast(
                      "warning",
                      `Import completed with ${progress.successful} successful and ${progress.failed} failed invoices`,
                    );
                  } else {
                    showToast(
                      "success",
                      `Successfully imported ${progress.successful} invoices`,
                    );
                    if (onImportSuccess) {
                      onImportSuccess();
                      setTimeout(
                        () =>
                          window.dispatchEvent(
                            new CustomEvent("inventory-updated"),
                          ),
                        1000,
                      );
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
          const message =
            err.response?.data?.message || err.message || "Import failed";
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
      <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-40">
        <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Upload size={20} />
            Import Sales Data
          </h2>

          {/* Sale type toggle */}
          {!isImporting && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 mb-4">
              <button
                onClick={() => {
                  setImportSaleType("normal");
                  resetParsedData();
                }}
                disabled={isImporting || isValidatingStock || isValidatingMR}
                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                  importSaleType === "normal"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Package size={16} />
                Normal Sale
                <span className="text-xs opacity-75">Warehouse Stock</span>
              </button>
              <button
                onClick={() => {
                  setImportSaleType("mr");
                  resetParsedData();
                }}
                disabled={isImporting || isValidatingStock || isValidatingMR}
                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                  importSaleType === "mr"
                    ? "bg-green-600 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <User size={16} />
                MR Sale
                <span className="text-xs opacity-75">MR Hand Stock</span>
              </button>
            </div>
          )}

          {/* Info banner */}
          {!isImporting && (
            <div
              className={`p-3 rounded-lg mb-4 text-sm ${
                importSaleType === "normal"
                  ? "bg-indigo-50 text-indigo-800"
                  : "bg-green-50 text-green-800"
              }`}
            >
              {importSaleType === "normal" ? (
                <p>
                  📦 <strong>Normal Sale:</strong> Stock will be deducted from
                  the main warehouse inventory.
                </p>
              ) : (
                <p>
                  👤 <strong>MR Sale:</strong> Stock will be deducted from each
                  MR's hand stock. The MR Name column in your Excel file
                  determines which MR's stock is used.
                </p>
              )}
            </div>
          )}

          {/* Upload area */}
          {!showParsedSection &&
            !isUploading &&
            !isProcessingFile &&
            !isImporting && (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors mb-4">
                <Upload size={40} className="text-gray-400 mb-3" />
                <p className="font-medium text-gray-700">
                  Upload Excel/CSV File
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Drag & drop your file here or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Supported formats: Excel (.xlsx, .xls), CSV (.csv) | Max size:
                  20MB
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}

          {/* Processing states */}
          {(isUploading || isProcessingFile) && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
              <p className="font-medium text-gray-700">
                {isUploading ? "Uploading..." : "Processing file..."}
              </p>
              <p className="text-sm text-gray-500 mt-1">{importMessage}</p>
            </div>
          )}

          {isValidatingMR && (
            <div className="text-center py-6 bg-yellow-50 rounded-lg mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600 mx-auto mb-2" />
              <p className="font-medium text-yellow-800">Validating MRs...</p>
              <p className="text-sm text-yellow-600">
                Checking MR names for {parsedData.length} invoices...
              </p>
            </div>
          )}

          {isValidatingStock && (
            <div className="text-center py-6 bg-blue-50 rounded-lg mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
              <p className="font-medium text-blue-800">
                Checking Stock Availability
              </p>
              <p className="text-sm text-blue-600">
                Validating stock for {parsedData.length} invoices...
              </p>
            </div>
          )}

          {/* Parsed data summary */}
          {showParsedSection && parsedData.length > 0 && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600" />
                  <span className="font-medium text-green-800">
                    File Successfully Parsed
                  </span>
                </div>
                <button
                  onClick={resetParsedData}
                  className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                >
                  <X size={14} />
                  Clear
                </button>
              </div>
              <p className="text-sm text-green-700 mb-3">
                Found {parsedData.length} valid invoices ready for import
              </p>
              {importErrorDetails.length > 0 && (
                <div className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1 rounded-full inline-block mb-3">
                  ⚠️ {importErrorDetails.length} rows skipped due to errors
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  ["Total Invoices", parsedData.length],
                  [
                    "Total Products",
                    parsedData.reduce(
                      (s, i) => s + (i.products?.length || 0),
                      0,
                    ),
                  ],
                  [
                    "Total Amount",
                    `$${parsedData.reduce((s, i) => s + (i.totalAmount || 0), 0).toFixed(2)}`,
                  ],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    className="bg-white rounded-lg p-3 text-center"
                  >
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="font-bold text-gray-800">{val}</div>
                  </div>
                ))}
              </div>

              {importSaleType === "mr" && (
                <p className="text-sm text-green-700 mb-3">
                  MRs detected in file:{" "}
                  {[
                    ...new Set(parsedData.map((i) => i.mrName).filter(Boolean)),
                  ].join(", ") || "None"}
                </p>
              )}

              {/* Sample preview */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sample Data (First 3 invoices):
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        {[
                          "Invoice",
                          "MR",
                          "Products",
                          "Amount",
                          "Sale Type",
                        ].map((h) => (
                          <th key={h} className="px-2 py-1 text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 3).map((inv, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-2 py-1">{inv.invoiceNumber}</td>
                          <td className="px-2 py-1">{inv.mrName}</td>
                          <td className="px-2 py-1">
                            {inv.products?.length || 0}
                          </td>
                          <td className="px-2 py-1">
                            ${inv.totalAmount?.toFixed(2)}
                          </td>
                          <td className="px-2 py-1">{inv.saleType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Validation errors */}
          {importErrorDetails.length > 0 &&
            showParsedSection &&
            !isImporting && (
              <div className="border border-red-200 rounded-lg mb-4 overflow-hidden">
                <div className="bg-red-50 px-4 py-2 font-medium text-sm text-red-800">
                  Validation Errors ({importErrorDetails.length})
                </div>
                <div className="overflow-x-auto max-h-40">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Row", "Invoice #", "Product", "Error"].map((h) => (
                          <th
                            key={h}
                            className="px-2 py-1 text-left font-medium text-gray-600"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importErrorDetails.slice(0, 10).map((err, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{err.row}</td>
                          <td className="px-2 py-1">{err.invoiceNumber}</td>
                          <td className="px-2 py-1">{err.productName}</td>
                          <td className="px-2 py-1 text-red-600">
                            {err.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importErrorDetails.length > 10 && (
                  <p className="text-xs text-gray-500 text-center py-1">
                    Showing 10 of {importErrorDetails.length} errors
                  </p>
                )}
              </div>
            )}

          {/* Import progress */}
          {isImporting && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-blue-800">
                  Importing{" "}
                  {importSaleType === "mr" ? "MR Sale" : "Normal Sale"} Data...
                </p>
                <span className="font-bold text-blue-800">
                  {serverProgress}%
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-3 mb-2">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${serverProgress}%` }}
                />
              </div>
              <p className="text-sm text-blue-700">
                {serverProcessed} / {serverTotal}
              </p>
              <p className="text-sm text-blue-600 mt-1">{importStep}</p>
              <button
                onClick={handleCancelImport}
                className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm"
              >
                Cancel Import
              </button>
            </div>
          )}

          {/* Action buttons */}
          {!isImporting &&
            showParsedSection &&
            parsedData.length > 0 &&
            !isValidatingStock &&
            !isValidatingMR && (
              <button
                onClick={handleImportData}
                className={`w-full py-3 rounded-lg font-semibold text-white mb-3 ${
                  importSaleType === "mr"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                Start {importSaleType === "mr" ? "MR Sale" : "Normal Sale"}{" "}
                Import ({parsedData.length} invoices)
              </button>
            )}

          <div className="flex justify-between">
            {showParsedSection && parsedData.length > 0 && (
              <label className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer text-sm">
                Upload Different File
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg ml-auto"
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