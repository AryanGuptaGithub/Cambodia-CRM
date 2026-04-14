import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from "exceljs";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 9, search = "", period = "all" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let customerSearchCondition = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      customerSearchCondition = {
        $or: [
          { province: searchRegex },
          { zone: searchRegex },
          { name: searchRegex },
          { medicalRepName: searchRegex },
          { customerCode: searchRegex }
        ],
      };
    }

    // Date filter for sales
    let dateFilter = {};
    const now = new Date();
    
    if (period === "last_month") {
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastMonth,
          $lte: lastDayOfLastMonth
        }
      };
    } else if (period === "last_year") {
      const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastYear,
          $lte: lastDayOfLastYear
        }
      };
    }

    // Get unique provinces count from all customers with province
    const provincesWithData = await Customer.aggregate([
      {
        $match: {
          ...customerSearchCondition,
          province: { $exists: true, $ne: null, $ne: "" }
        }
      },
      {
        $group: {
          _id: { $toLower: "$province" },
          province: { $first: "$province" }
        }
      },
      {
        $count: "totalProvinces"
      }
    ]);

    const uniqueProvincesCount = provincesWithData.length > 0 ? provincesWithData[0].totalProvinces : 0;

    // Step 1: Get sales data FIRST with date filter
    const salesMatch = { ...dateFilter };
    
    // Get sales data with customerId
    const salesData = await SaleSummary.find({
      ...salesMatch,
      customerId: { $exists: true, $ne: null }
    })
    .select('customerId totalAmount invoiceNumber invoiceDate products')
    .lean();
    
    if (salesData.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: {
            totalSales: 0,
            totalProvinces: uniqueProvincesCount,
            totalInvoices: 0,
            totalCustomers: 0,
            averageSalePerProvince: 0,
            averageSalePerInvoice: 0,
          },
          records: [],
          uniqueProvincesCount: uniqueProvincesCount,
        },
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Extract unique customer IDs from sales
    const customerIds = [...new Set(salesData.map(sale => sale.customerId.toString()))];

    // Step 2: Get customers that match these IDs
    const customers = await Customer.find({
      _id: { $in: customerIds },
      ...customerSearchCondition,
      province: { $exists: true, $ne: null, $ne: "" }
    })
    .select('customerCode name province zone medicalRepName')
    .lean();
    
    if (customers.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: {
            totalSales: 0,
            totalProvinces: uniqueProvincesCount,
            totalInvoices: 0,
            totalCustomers: 0,
            averageSalePerProvince: 0,
            averageSalePerInvoice: 0,
          },
          records: [],
          uniqueProvincesCount: uniqueProvincesCount,
        },
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Create a map of customerId to customer data
    const customerMap = {};
    customers.forEach(customer => {
      customerMap[customer._id.toString()] = customer;
    });

    // Step 3: Match sales with customers and group by province
    const provinceData = {};
    let matchedSalesCount = 0;
    
    salesData.forEach(sale => {
      const customerId = sale.customerId?.toString();
      const customer = customerId ? customerMap[customerId] : null;
      
      if (customer && customer.province) {
        matchedSalesCount++;
        const province = customer.province.trim();
        const provinceKey = province.toLowerCase();
        
        // Calculate sale amount
        let saleAmount = sale.totalAmount || 0;
        
        // Initialize province data if not exists
        if (!provinceData[provinceKey]) {
          provinceData[provinceKey] = {
            province: province,
            totalSalesAmount: 0,
            totalInvoices: 0,
            uniqueCustomers: new Set(),
            customerDetails: []
          };
        }
        
        // Update province totals
        provinceData[provinceKey].totalSalesAmount += saleAmount;
        provinceData[provinceKey].totalInvoices += 1;
        provinceData[provinceKey].uniqueCustomers.add(customer._id.toString());
        
        // Find or create customer detail
        let customerDetail = provinceData[provinceKey].customerDetails.find(
          detail => detail.customerId === customer._id.toString()
        );
        
        if (!customerDetail) {
          customerDetail = {
            customerId: customer._id.toString(),
            customerCode: customer.customerCode,
            customerName: customer.name,
            zone: customer.zone,
            medicalRepName: customer.medicalRepName,
            totalSales: 0,
            invoiceCount: 0,
            invoices: []
          };
          provinceData[provinceKey].customerDetails.push(customerDetail);
        }
        
        // Update customer detail
        customerDetail.totalSales += saleAmount;
        customerDetail.invoiceCount += 1;
        customerDetail.invoices.push({
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.invoiceDate,
          amount: saleAmount
        });
      }
    });

    // Step 4: Convert to array and calculate metrics
    let records = Object.values(provinceData).map(data => {
      const totalCustomers = data.uniqueCustomers.size;
      const avgSaleValue = data.totalInvoices > 0 ? data.totalSalesAmount / data.totalInvoices : 0;
      const avgSalePerCustomer = totalCustomers > 0 ? data.totalSalesAmount / totalCustomers : 0;
      
      // Sort customer details by total sales (descending)
      const sortedCustomerDetails = data.customerDetails
        .sort((a, b) => b.totalSales - a.totalSales)
        .map(customer => ({
          customerId: customer.customerId,
          customerCode: customer.customerCode,
          customerName: customer.customerName,
          zone: customer.zone,
          medicalRepName: customer.medicalRepName,
          totalSales: parseFloat(customer.totalSales.toFixed(2)),
          invoiceCount: customer.invoiceCount,
          averageSalePerInvoice: parseFloat((customer.totalSales / (customer.invoiceCount || 1)).toFixed(2))
        }));
      
      return {
        province: data.province,
        totalSalesAmount: parseFloat(data.totalSalesAmount.toFixed(2)),
        totalInvoices: data.totalInvoices,
        totalCustomers: totalCustomers,
        averageSaleValue: parseFloat(avgSaleValue.toFixed(2)),
        averageSalePerCustomer: parseFloat(avgSalePerCustomer.toFixed(2)),
        customerDetails: sortedCustomerDetails
      };
    });

    // Sort records by total sales amount (descending)
    records.sort((a, b) => b.totalSalesAmount - a.totalSalesAmount);
    
    const totalCount = records.length;

    // Step 5: Apply pagination
    const paginatedRecords = records.slice(skip, skip + limitNum);

    // Step 6: Calculate summary
    const totalSalesAmount = parseFloat(records.reduce((sum, record) => sum + record.totalSalesAmount, 0).toFixed(2));
    const totalInvoices = records.reduce((sum, record) => sum + record.totalInvoices, 0);
    const totalCustomers = records.reduce((sum, record) => sum + record.totalCustomers, 0);

    const summary = {
      totalSales: totalSalesAmount,
      totalProvinces: uniqueProvincesCount,
      totalInvoices: totalInvoices,
      totalCustomers: totalCustomers,
      averageSalePerProvince: uniqueProvincesCount > 0 ? 
        parseFloat((totalSalesAmount / uniqueProvincesCount).toFixed(2)) : 0,
      averageSalePerInvoice: totalInvoices > 0 ?
        parseFloat((totalSalesAmount / totalInvoices).toFixed(2)) : 0
    };

    const totalPages = Math.ceil(totalCount / limitNum);

    console.timeEnd("⏱️ province-wise-sale-query");

    res.json({
      success: true,
      data: {
        summary,
        records: paginatedRecords,
        uniqueProvincesCount: uniqueProvincesCount,
        allRecords: records, // Include all records for export
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
    
  } catch (error) {
    console.error("❌ Error in /province-wise-sale:", error);
    console.timeEnd("⏱️ province-wise-sale-query");
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch province wise sale data",
      error: error.message,
    });
  }
});

// Export to Excel endpoint
router.get("/export", async (req, res) => {
  try {
    const { search = "", period = "all" } = req.query;
    
    let customerSearchCondition = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      customerSearchCondition = {
        $or: [
          { province: searchRegex },
          { zone: searchRegex },
          { name: searchRegex },
          { medicalRepName: searchRegex },
          { customerCode: searchRegex }
        ],
      };
    }

    // Date filter for sales
    let dateFilter = {};
    const now = new Date();
    
    if (period === "last_month") {
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastMonth,
          $lte: lastDayOfLastMonth
        }
      };
    } else if (period === "last_year") {
      const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastYear,
          $lte: lastDayOfLastYear
        }
      };
    }

    // Get sales data with date filter
    const salesData = await SaleSummary.find({
      ...dateFilter,
      customerId: { $exists: true, $ne: null }
    })
    .select('customerId totalAmount invoiceNumber invoiceDate')
    .lean();
    
    if (salesData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data available for export",
      });
    }

    // Extract unique customer IDs from sales
    const customerIds = [...new Set(salesData.map(sale => sale.customerId.toString()))];

    // Get customers
    const customers = await Customer.find({
      _id: { $in: customerIds },
      ...customerSearchCondition,
      province: { $exists: true, $ne: null, $ne: "" }
    })
    .select('customerCode name province zone medicalRepName')
    .lean();

    // Create a map of customerId to customer data
    const customerMap = {};
    customers.forEach(customer => {
      customerMap[customer._id.toString()] = customer;
    });

    // Group by province and collect customer data
    const provinceData = {};
    const customerExportData = [];
    let srNo = 1;
    
    salesData.forEach(sale => {
      const customerId = sale.customerId?.toString();
      const customer = customerId ? customerMap[customerId] : null;
      
      if (customer && customer.province) {
        const province = customer.province.trim();
        const provinceKey = province.toLowerCase();
        
        if (!provinceData[provinceKey]) {
          provinceData[provinceKey] = {
            province: province,
            totalSalesAmount: 0,
            totalInvoices: 0,
            uniqueCustomers: new Set(),
          };
        }
        
        // Update province totals
        const saleAmount = sale.totalAmount || 0;
        provinceData[provinceKey].totalSalesAmount += saleAmount;
        provinceData[provinceKey].totalInvoices += 1;
        provinceData[provinceKey].uniqueCustomers.add(customer._id.toString());
        
        // Add customer data for export
        customerExportData.push({
          srNo: srNo++,
          province: province,
          customerCode: customer.customerCode,
          customerName: customer.name,
          zone: customer.zone || "N/A",
          medicalRepName: customer.medicalRepName || "N/A",
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.invoiceDate ? new Date(sale.invoiceDate).toLocaleDateString() : "N/A",
          totalSales: saleAmount,
        });
      }
    });

    // Convert province data to array
    const provinceRecords = Object.values(provinceData).map(data => {
      const totalCustomers = data.uniqueCustomers.size;
      const avgSaleValue = data.totalInvoices > 0 ? data.totalSalesAmount / data.totalInvoices : 0;
      const avgSalePerCustomer = totalCustomers > 0 ? data.totalSalesAmount / totalCustomers : 0;
      
      return {
        province: data.province,
        totalSalesAmount: parseFloat(data.totalSalesAmount.toFixed(2)),
        totalInvoices: data.totalInvoices,
        totalCustomers: totalCustomers,
        averageSaleValue: parseFloat(avgSaleValue.toFixed(2)),
        averageSalePerCustomer: parseFloat(avgSalePerCustomer.toFixed(2)),
      };
    });

    // Sort province records
    provinceRecords.sort((a, b) => b.totalSalesAmount - a.totalSalesAmount);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    
    // Add Province Summary sheet
    const provinceSheet = workbook.addWorksheet('Province Summary');
    
    // Define headers for province summary
    provinceSheet.columns = [
      { header: 'Sr No', key: 'srNo', width: 10 },
      { header: 'Province', key: 'province', width: 25 },
      { header: 'Total Sales ($)', key: 'totalSalesAmount', width: 20 },
      { header: 'Invoices', key: 'totalInvoices', width: 15 },
      { header: 'Customers', key: 'totalCustomers', width: 15 },
      { header: 'Avg Sale Value ($)', key: 'averageSaleValue', width: 20 },
      { header: 'Avg Sale/Customer ($)', key: 'averageSalePerCustomer', width: 20 },
    ];

    // Add data rows with serial numbers
    provinceRecords.forEach((record, index) => {
      provinceSheet.addRow({
        srNo: index + 1,
        province: record.province,
        totalSalesAmount: record.totalSalesAmount,
        totalInvoices: record.totalInvoices,
        totalCustomers: record.totalCustomers,
        averageSaleValue: record.averageSaleValue,
        averageSalePerCustomer: record.averageSalePerCustomer,
      });
    });

    // Format headers
    provinceSheet.getRow(1).font = { bold: true };
    provinceSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Format currency columns
    [3, 6, 7].forEach(colIndex => {
      provinceSheet.getColumn(colIndex).numFmt = '$#,##0.00';
    });

    // Add Customer Details sheet
    const customerSheet = workbook.addWorksheet('Customer Details');
    
    // Define headers for customer details
    customerSheet.columns = [
      { header: 'Sr No', key: 'srNo', width: 10 },
      { header: 'Province', key: 'province', width: 20 },
      { header: 'Customer Code', key: 'customerCode', width: 20 },
      { header: 'Customer Name', key: 'customerName', width: 30 },
      { header: 'Zone', key: 'zone', width: 15 },
      { header: 'Medical Rep', key: 'medicalRepName', width: 20 },
      { header: 'Invoice Number', key: 'invoiceNumber', width: 20 },
      { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
      { header: 'Total Sales ($)', key: 'totalSales', width: 20 },
    ];

    // Add customer data
    customerExportData.forEach(row => {
      customerSheet.addRow(row);
    });

    // Format headers
    customerSheet.getRow(1).font = { bold: true };
    customerSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Format currency column
    customerSheet.getColumn(9).numFmt = '$#,##0.00';

    // Add Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    
    // Calculate totals
    const totalSales = provinceRecords.reduce((sum, record) => sum + record.totalSalesAmount, 0);
    const totalInvoices = provinceRecords.reduce((sum, record) => sum + record.totalInvoices, 0);
    const totalCustomers = provinceRecords.reduce((sum, record) => sum + record.totalCustomers, 0);
    const avgSalePerInvoice = totalInvoices > 0 ? totalSales / totalInvoices : 0;
    const avgSalePerCustomer = totalCustomers > 0 ? totalSales / totalCustomers : 0;

    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 25 },
    ];

    summarySheet.addRow({ metric: 'Report Period', value: period === 'all' ? 'All Time' : period === 'last_month' ? 'Last Month' : 'Last Year' });
    summarySheet.addRow({ metric: 'Export Date', value: new Date().toLocaleDateString() });
    summarySheet.addRow({ metric: 'Total Provinces with Sales', value: provinceRecords.length });
    summarySheet.addRow({ metric: 'Total Sales', value: totalSales });
    summarySheet.addRow({ metric: 'Total Invoices', value: totalInvoices });
    summarySheet.addRow({ metric: 'Total Customers', value: totalCustomers });
    summarySheet.addRow({ metric: 'Average Sale per Invoice', value: avgSalePerInvoice });
    summarySheet.addRow({ metric: 'Average Sale per Customer', value: avgSalePerCustomer });

    // Format summary sheet
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(4).font = { bold: true };
    summarySheet.getRow(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };

    // Format currency values in summary
    [4, 6, 7].forEach(rowIndex => {
      const cell = summarySheet.getCell(`B${rowIndex + 1}`);
      if (rowIndex === 4) cell.numFmt = '$#,##0.00';
      if (rowIndex === 6) cell.numFmt = '$#,##0.00';
      if (rowIndex === 7) cell.numFmt = '$#,##0.00';
    });

    // Generate filename with period
    const periodMap = {
      'all': 'All-Time',
      'last_month': 'Last-Month',
      'last_year': 'Last-Year'
    };
    const filename = `Province-Wise-Sales-${periodMap[period]}-${new Date().toISOString().split('T')[0]}.xlsx`;

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("❌ Error in export:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

export default router;