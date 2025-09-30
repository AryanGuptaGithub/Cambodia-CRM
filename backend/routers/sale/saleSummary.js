import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import paymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
const router = express.Router();

// 🔧 Convert Excel serial date to JS Date
const excelDateToJSDate = (serial) => {
  if (typeof serial === "number") {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }

  const parsed = new Date(serial);
  return !isNaN(parsed) ? parsed : null;
};

router.post("/sale/import", async (req, res) => {
  try {
    const parsedData = req.body;

    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      return res.status(400).json({ message: "No data provided for import." });
    }

    const validDocs = [];
    const skippedRows = [];

    const parseExcelDate = (value) => {
      if (!value || isNaN(value)) return null;
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return isNaN(date.getTime()) ? null : date;
    };

    parsedData.forEach((item, index) => {
      const rowNumber = index + 2;

      const invoiceDate = parseExcelDate(Number(item.invoiceDate));
      const recordingDate = parseExcelDate(Number(item.recordingDate));
      const deliveryDate = invoiceDate;

      // Credit days to dueDate
      const creditDays =
        item.creditDays !== "" ? Number(item.creditDays) : null;
      const dueDate =
        creditDays !== null && !isNaN(creditDays)
          ? new Date(Date.now() + creditDays * 86400000)
          : null;

      const addSkip = (reason) => {
        skippedRows.push({ row: rowNumber, reason, data: item });
      };

      // === Validations ===
      if (
        !item.mrName ||
        typeof item.mrName !== "string" ||
        item.mrName.trim() === ""
      ) {
        return addSkip("Missing or invalid 'mrName'");
      }

      if (!item.customerCode || isNaN(Number(item.customerCode))) {
        return addSkip("Missing or invalid 'customerCode'");
      }

      if (!invoiceDate) {
        return addSkip("Missing or invalid 'invoiceDate'");
      }

      // === Conversions and calculations ===
      const salesQty = Number(item.salesQty) || 0;
      const bonusQty = Number(item.bonusQty) || 0;
      const totalQty = salesQty + bonusQty;
      const sellingPrice = Number(item.sellingPrice) || 0;
      const discount = Number(item.discount) || 0;
      const lc = Number(item.lc) || 0;
      const paidAmount = Number(item.paidAmount) || 0;

      const amount = salesQty * sellingPrice;
      const netSellingAmount = amount - discount;
      const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;
      const profitLoss = netSellingAmount - totalQty * lc;
      const dueAmount = netSellingAmount - paidAmount;

      // === Final doc ===
      validDocs.push({
        recordingDate,
        invoiceNumber: item.invoiceNumber || "",
        invoiceDate,
        mrName: item.mrName.trim(),
        customerCode: Number(item.customerCode),
        productName: item.productName || "",
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        lc,
        averageUnitPrice,
        profitLoss,
        creditDays,
        dueDate,
        deliveryDate,
        paymentStatus: item.paymentStatus || "Pending",
        paidAmount,
        dueAmount,
        remark: item.remark || "",
      });
    });

    if (validDocs.length === 0) {
      return res.status(400).json({
        message: "❌ No valid rows to import. Please check required fields.",
        skippedRows,
      });
    }

    const inserted = await SaleSummary.insertMany(validDocs);

    return res.status(200).json({
      message: `<b>${inserted.length}</b> sale summary records imported successfully.`,
      insertedCount: inserted.length,
      skippedCount: skippedRows.length,
      skippedRows,
    });
  } catch (error) {
    console.error("❌ Error importing sale summary:", error);
    return res.status(500).json({ message: "Failed to import sale summary." });
  }
});

router.get("/sales", async (req, res) => {
  try {
    const summaries = await SaleSummary.aggregate([
      {
        $lookup: {
          from: "customers", // 👈 the MongoDB collection name (should be lowercase and plural)
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true, // if you want to include sales even if customer not found
        },
      },
      {
        $sort: {
          recordingDate: -1,
        },
      },
    ]);

    res.status(200).json(summaries);
  } catch (error) {
    console.error(
      "❌ Error fetching sale summaries with customer info:",
      error
    );
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const updatedSale = await SaleSummary.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    res.status(200).json(updatedSale);
  } catch (err) {
    console.error("Error updating sale:", err);
    res.status(500).json({ error: "Failed to update sales record." });
  }
});

router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedSale = await SaleSummary.findByIdAndDelete(id);

    if (!deletedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    res.status(200).json({ message: "Sales record deleted successfully." });
  } catch (err) {
    console.error("Error deleting sale:", err);
    res.status(500).json({ error: "Failed to delete sales record." });
  }
});

router.delete("/sales", async (req, res) => {
  try {
    let { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No sale IDs provided." });
    }

    if (typeof ids[0] === "object" && ids[0]?.id) {
      ids = ids.map((item) => item.id);
    }

    const result = await SaleSummary.deleteMany({ _id: { $in: ids } });

    return res.status(200).json({
      message: `${result.deletedCount} sale(s) deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting sales:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/sales", async (req, res) => {
  try {
    const newSaleData = req.body;
    const newSale = new SaleSummary(newSaleData);
    const savedSale = await newSale.save();

    res.status(201).json({
      message: `Sale <b>${newSaleData.productName} - ${newSaleData.invoiceNumber}</b> added successfully`,
      sale: savedSale,
    });
  } catch (error) {
    console.error("Sale creation error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to add new sale" });
  }
});

router.get("/sales/payment-status", async (req, res) => {
  try {
    const statuses = await paymentStatus.find().sort({ type: 1 });
    res.status(200).json(statuses);
  } catch (error) {
    console.error("❌ Error fetching payment statuses:", error.message);
    res.status(500).json({ error: "Failed to fetch payment statuses." });
  }
});

router.get("/sales/unique-names", async (req, res) => {
  try {
    const uniqueNames = await Product.distinct("productName", {
      productName: { $ne: null },
    });

    uniqueNames.sort((a, b) => a.localeCompare(b));

    res.status(200).json({ productNames: uniqueNames });
  } catch (error) {
    console.error("Error fetching unique product names:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sales/download-sales-excel", async (req, res) => {
  try {
    const { salesData = [], customersData = [], startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    // Filter sales data based on date range
    const filteredSalesData = salesData.filter((sale) => {
      if (!sale.invoiceDate) return false;
      const saleDate = new Date(sale.invoiceDate);
      return saleDate >= start && saleDate <= end;
    });

    if (filteredSalesData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales data found for the selected date range",
      });
    }

    // Create customer lookup map
    const customerMap = {};
    customersData.forEach((customer) => {
      customerMap[customer.customerCode] = customer;
    });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sale Summary");

    // === Sheet Titles ===
    worksheet.mergeCells("A1:AB1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    worksheet.mergeCells("A2:AB2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = `Sale Summary List (${startDate} to ${endDate})`;
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // === Define Columns ===
    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "recordingDate", width: 12 },
      { key: "invoiceNumber", width: 10 },
      { key: "invoiceDate", width: 12 },
      { key: "mrName", width: 15 },
      { key: "customerCode", width: 12 },
      { key: "customerName", width: 25 },
      { key: "customerNumber", width: 15 },
      { key: "address", width: 30 },
      { key: "zone", width: 15 },
      { key: "productName", width: 20 },
      { key: "salesQty", width: 10 },
      { key: "bonusQty", width: 10 },
      { key: "totalQty", width: 10 },
      { key: "sellingPrice", width: 12 },
      { key: "amount", width: 12 },
      { key: "discount", width: 10 },
      { key: "netSellingAmount", width: 15 },
      { key: "averageUnitPrice", width: 15 },
      { key: "lc", width: 10 },
      { key: "profitLoss", width: 12 },
      { key: "creditDays", width: 10 },
      { key: "dueDate", width: 12 },
      { key: "deliveryDate", width: 12 },
      { key: "paidAmount", width: 12 },
      { key: "dueAmount", width: 12 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
    ];

    // === Header Row ===
    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "No",
      "Recording Date",
      "Invoice #",
      "Invoice Date",
      "MR Name",
      "Customer Code",
      "Customer Name",
      "Customer Number",
      "Address",
      "Zone",
      "Product Name",
      "Sales Qty",
      "Bonus Qty",
      "Total Qty",
      "Selling Price",
      "Amount",
      "Discount",
      "Net Amount",
      "Avg Unit Price",
      "LC",
      "Profit/Loss",
      "Credit Days",
      "Due Date",
      "Delivery Date",
      "Paid Amount",
      "Due Amount",
      "Payment Status",
      "Remarks",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    // === Format Date Columns ===
    ["recordingDate", "invoiceDate", "dueDate", "deliveryDate"].forEach(
      (key) => {
        const col = worksheet.getColumn(key);
        if (col) col.numFmt = "dd-mmm-yy";
      }
    );

    // === Format Numeric Columns ===
    [
      "salesQty",
      "bonusQty",
      "totalQty",
      "sellingPrice",
      "amount",
      "discount",
      "netSellingAmount",
      "averageUnitPrice",
      "lc",
      "profitLoss",
      "paidAmount",
      "dueAmount",
    ].forEach((key) => {
      const col = worksheet.getColumn(key);
      if (col) col.numFmt = "#,##0.00";
    });

    // === Add Data Rows ===
    filteredSalesData.forEach((sale, index) => {
      const customer = customerMap[sale.customerCode] || {};

      // Format dates for Excel display
      const formatDateForDisplay = (dateString) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "";
        return date;
      };

      // Format customer code with leading zeros
      const formatCustomerCode = (code) => {
        if (!code) return "";
        const codeStr = code.toString();
        return codeStr.padStart(5, "0");
      };

      const row = worksheet.addRow({
        no: index + 1,
        recordingDate: formatDateForDisplay(sale.recordingDate),
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: formatDateForDisplay(sale.invoiceDate),
        mrName: sale.mrName,
        customerCode: formatCustomerCode(sale.customerCode),
        customerName: customer.name || "",
        customerNumber: customer.customerNumber || "",
        address: customer.address || "",
        zone: customer.zone || "",
        productName: sale.productName,
        salesQty: sale.salesQty,
        bonusQty: sale.bonusQty,
        totalQty: sale.totalQty,
        sellingPrice: sale.sellingPrice,
        amount: sale.amount,
        discount: sale.discount,
        netSellingAmount: sale.netSellingAmount,
        averageUnitPrice: sale.averageUnitPrice,
        lc: sale.lc,
        profitLoss: sale.profitLoss,
        creditDays: sale.creditDays,
        dueDate: formatDateForDisplay(sale.dueDate),
        deliveryDate: formatDateForDisplay(sale.deliveryDate),
        paidAmount: sale.paidAmount,
        dueAmount: sale.dueAmount,
        paymentStatus: sale.paymentStatus,
        remark: sale.remark,
      });

      // Apply borders to all cells in the row
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // Set response headers for file download
    const fileName = `sale_summary_${startDate}_to_${endDate}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // Send the Excel file directly
    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    console.error("Error generating Excel file:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel file",
      error: error.message,
    });
  }
});

export default router;
