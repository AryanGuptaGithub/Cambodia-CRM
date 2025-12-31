import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";

const router = express.Router();

router.get("/province-wise-sale", async (req, res) => {
  try {
    console.time("⏱️ province-wise-sale-query");
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
    console.log("1. Fetching sales data...");
    const salesMatch = { ...dateFilter };
    
    // Get sales data with customerId
    const salesData = await SaleSummary.find({
      ...salesMatch,
      customerId: { $exists: true, $ne: null }
    })
    .select('customerId totalAmount invoiceNumber invoiceDate products')
    .lean();
    
    console.log("2. Total sales found:", salesData.length);

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
    console.log("3. Unique customer IDs from sales:", customerIds.length);

    // Step 2: Get customers that match these IDs
    console.log("4. Fetching customers...");
    const customers = await Customer.find({
      _id: { $in: customerIds },
      ...customerSearchCondition,
      province: { $exists: true, $ne: null, $ne: "" }
    })
    .select('customerCode name province zone medicalRepName')
    .lean();
    
    console.log("5. Customers found:", customers.length);

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
    console.log("6. Matching sales with customers...");
    const provinceData = {};
    let matchedSalesCount = 0;
    
    salesData.forEach(sale => {
      const customerId = sale.customerId?.toString();
      const customer = customerId ? customerMap[customerId] : null;
      
      if (customer && customer.province) {
        matchedSalesCount++;
        const province = customer.province.trim();
        const provinceKey = province.toLowerCase();
        
        // Calculate sale amount and quantity from SaleSummary
        let saleAmount = 0;
        let saleQuantity = 0;
        
        // Use totalAmount from SaleSummary (most important fix!)
        saleAmount = sale.totalAmount || 0;
        
        // Calculate quantity from products if available
        if (Array.isArray(sale.products) && sale.products.length > 0) {
          saleQuantity = sale.products.reduce((sum, product) => sum + (product.qty || 0), 0);
        } else {
          saleQuantity = 1; // Default to 1 if no products array
        }
        
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
          amount: saleAmount,
          quantity: saleQuantity
        });
      }
    });

    console.log("7. Matched sales count:", matchedSalesCount);
    console.log("8. Processed provinces:", Object.keys(provinceData).length);

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
          averageSalePerInvoice: parseFloat((customer.totalSales / (customer.invoiceCount || 1)).toFixed(2)),
          // Include first invoice for display
          invoiceDate: customer.invoices[0]?.invoiceDate,
          invoiceNumber: customer.invoices[0]?.invoiceNumber,
          quantity: customer.invoices[0]?.quantity || 0
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
    console.log("9. Total provinces with sales:", totalCount);

    // Step 5: Apply pagination
    const paginatedRecords = records.slice(skip, skip + limitNum);
    console.log("10. Paginated records (page", pageNum, "):", paginatedRecords.length);

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
    console.log("11. Summary calculated:", summary);

    const totalPages = Math.ceil(totalCount / limitNum);
    console.log("12. Total pages:", totalPages);

    console.timeEnd("⏱️ province-wise-sale-query");

    res.json({
      success: true,
      data: {
        summary,
        records: paginatedRecords,
        uniqueProvincesCount: uniqueProvincesCount,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
    console.log("13. Response sent successfully");
    
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

export default router;