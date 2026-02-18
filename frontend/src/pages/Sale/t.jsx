// Main Excel parsing function - FIXED for your specific format with headers
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
            cellText: true,
          });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Convert to array of arrays (raw values)
          const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
            raw: true,
          });

          console.log("RAW EXCEL DATA - Full rows:", rows);
          console.log("Number of rows:", rows.length);

          // Keywords that must be present in a valid header row (case‑insensitive)
          const requiredHeaderKeywords = [
            "invoice",
            "product name",
            "sales qty",
          ];

          // Helper: check if a row could be a header
          const isHeaderRow = (row) => {
            if (!Array.isArray(row) || row.length === 0) return false;
            const rowString = row
              .map((cell) => String(cell || "").toLowerCase().trim())
              .join(" ");
            // All required keywords must appear somewhere in the row
            return requiredHeaderKeywords.every((kw) =>
              rowString.includes(kw.toLowerCase())
            );
          };

          // Find the index of the header row
          let headerIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (isHeaderRow(rows[i])) {
              headerIndex = i;
              break;
            }
          }

          if (headerIndex === -1) {
            reject(
              new Error(
                "Could not find header row. Ensure the file contains a row with column names like 'Invoice #', 'Product Name', 'Sales Qty'."
              )
            );
            return;
          }

          const headerRow = rows[headerIndex];
          console.log("Detected header row at index", headerIndex, ":", headerRow);

          // Map column headers to indices
          const headerMap = {};
          if (headerRow && Array.isArray(headerRow)) {
            headerRow.forEach((header, index) => {
              if (header && typeof header === "string") {
                const headerLower = header.toLowerCase().trim();
                headerMap[headerLower] = index;
                console.log(`Header "${header}" at column ${index}`);
              }
            });
          }

          console.log("Header map:", headerMap);

          // Define column indices based on your known header structure
          const columnIndices = {
            recordingDate:
              headerMap["recording date"] !== undefined
                ? headerMap["recording date"]
                : 0,
            invoiceNumber:
              headerMap["invoice #"] !== undefined
                ? headerMap["invoice #"]
                : headerMap["invoice"] !== undefined
                ? headerMap["invoice"]
                : 1,
            invoiceDate:
              headerMap["invoice date"] !== undefined
                ? headerMap["invoice date"]
                : 2,
            mrName:
              headerMap["mr name"] !== undefined ? headerMap["mr name"] : 3,
            customerCode:
              headerMap["customer code"] !== undefined
                ? headerMap["customer code"]
                : 4,
            productName:
              headerMap["product name"] !== undefined
                ? headerMap["product name"]
                : 5,
            salesQty:
              headerMap["sales qty"] !== undefined ? headerMap["sales qty"] : 6,
            bonusQty:
              headerMap["bonus qty"] !== undefined ? headerMap["bonus qty"] : 7,
            sellingPrice:
              headerMap["selling price"] !== undefined
                ? headerMap["selling price"]
                : 8,
            discount:
              headerMap["discount"] !== undefined ? headerMap["discount"] : 9,
            creditDays:
              headerMap["credit days"] !== undefined
                ? headerMap["credit days"]
                : 10,
            paidAmount:
              headerMap["paid amount"] !== undefined
                ? headerMap["paid amount"]
                : 11,
            paymentStatus:
              headerMap["payment status"] !== undefined
                ? headerMap["payment status"]
                : 12,
            remarks:
              headerMap["remarks"] !== undefined ? headerMap["remarks"] : 13,
          };

          console.log("Using column indices:", columnIndices);

          // Data rows start after the header row
          const dataRows = rows.slice(headerIndex + 1);
          console.log(`Processing ${dataRows.length} data rows`);

          const groupedInvoices = {};
          const validationErrors = [];
          let validRowCount = 0;
          let emptyRowCount = 0;

          for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
            const row = dataRows[rowIndex];
            const excelRowNumber = headerIndex + 2 + rowIndex; // correct row number for user feedback

            // Skip completely empty rows
            if (
              !row ||
              !Array.isArray(row) ||
              row.length === 0 ||
              row.every(
                (cell) =>
                  cell === null ||
                  cell === undefined ||
                  String(cell).trim() === ""
              )
            ) {
              console.log(`Row ${excelRowNumber} is empty, skipping`);
              emptyRowCount++;
              continue;
            }

            console.log(`\n--- Processing row ${excelRowNumber} ---`);
            console.log("Raw row data:", row);

            const getValue = (index) => {
              if (index === -1 || index >= row.length) return "";
              const value = row[index];
              if (value === null || value === undefined) return "";
              const strValue = String(value).trim();
              console.log(
                `  Col ${index}: "${strValue}" (original: ${value}, type: ${typeof value})`
              );
              return strValue;
            };

            const invoiceNumber = getValue(columnIndices.invoiceNumber);
            const invoiceDate = getValue(columnIndices.invoiceDate);
            const recordingDate =
              getValue(columnIndices.recordingDate) || invoiceDate;
            const mrName = getValue(columnIndices.mrName);
            const customerCode = getValue(columnIndices.customerCode);
            const productName = getValue(columnIndices.productName);

            const salesQty = parseExcelQuantity(
              getValue(columnIndices.salesQty)
            );
            const bonusQty = parseExcelQuantity(
              getValue(columnIndices.bonusQty)
            );
            const sellingPrice = parseExcelAmount(
              getValue(columnIndices.sellingPrice)
            );
            const discount = parseExcelAmount(getValue(columnIndices.discount));
            const creditDays = parseExcelAmount(
              getValue(columnIndices.creditDays)
            );
            const paidAmount = parseExcelAmount(
              getValue(columnIndices.paidAmount)
            );
            const paymentStatus = getValue(columnIndices.paymentStatus);
            const remarks = getValue(columnIndices.remarks);

            console.log(`Parsed values for row ${excelRowNumber}:`, {
              invoiceNumber,
              invoiceDate,
              recordingDate,
              mrName,
              customerCode,
              productName,
              salesQty,
              bonusQty,
              sellingPrice,
              discount,
              creditDays,
              paidAmount,
              paymentStatus,
              remarks,
            });

            const rowErrors = [];

            if (!invoiceNumber || invoiceNumber === "") {
              rowErrors.push("Invoice number is required");
            }

            if (!productName || productName === "") {
              rowErrors.push("Product name is required");
            }

            if (salesQty <= 0 && bonusQty <= 0) {
              rowErrors.push("Total quantity must be greater than 0");
            }

            if (rowErrors.length > 0) {
              console.log(
                `Row ${excelRowNumber} validation errors:`,
                rowErrors
              );
              validationErrors.push({
                row: excelRowNumber,
                invoiceNumber: invoiceNumber || "N/A",
                productName: productName || "N/A",
                mrName: mrName || "Unknown",
                error: rowErrors.join("; "),
                type: "validation",
              });
              continue;
            }

            validRowCount++;

            // Calculate net amount
            const amount = sellingPrice * salesQty;
            const netSellingAmount = amount - discount;

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
              };
              console.log(`Created new invoice group: ${invoiceNumber}`);
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

          console.log("\n=== PARSING SUMMARY ===");
          console.log(`Total rows processed: ${rows.length}`);
          console.log(`Data rows: ${dataRows.length}`);
          console.log(`Empty rows skipped: ${emptyRowCount}`);
          console.log(`Valid rows: ${validRowCount}`);
          console.log(`Validation errors: ${validationErrors.length}`);
          console.log("Grouped invoices:", Object.keys(groupedInvoices));

          const validInvoices = Object.values(groupedInvoices).filter(
            (inv) => inv.products && inv.products.length > 0
          );

          validInvoices.forEach((inv) => {
            inv.dueAmount = Math.max(
              0,
              inv.totalAmount - (inv.paidAmount || 0)
            );
          });

          console.log(`\nFinal result: ${validInvoices.length} valid invoices`);

          if (validInvoices.length === 0) {
            if (validationErrors.length > 0) {
              const errorSummary = validationErrors
                .slice(0, 3)
                .map((err) => `Row ${err.row}: ${err.error}`)
                .join("; ");

              reject(
                new Error(
                  `No valid invoices found. ${validationErrors.length} validation errors. First errors: ${errorSummary}`
                )
              );
            } else {
              reject(
                new Error(
                  "No valid invoices found in the file. Please check that your Excel file has data rows after the header."
                )
              );
            }
            return;
          }

          resolve({ validInvoices, validationErrors });
        } catch (error) {
          console.error("Error parsing Excel:", error);
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsArrayBuffer(file);
    });
  },
  [parseExcelDate, parseExcelQuantity, parseExcelAmount]
);