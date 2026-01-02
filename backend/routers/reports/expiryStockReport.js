import express from 'express';
import mongoose from 'mongoose';
import reportsInHand from '../../models/reports/reportsInHand.js';

const router = express.Router();

// Helper function to calculate days remaining
const calculateDaysRemaining = (expiryDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  const timeDiff = expiry.getTime() - today.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
};

// Helper function to format date to "2 Jan 2026" format
const formatDateForExcel = (date) => {
  const d = new Date(date);
  const day = d.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

// Helper function to get filter label
function getFilterLabel(filter) {
  switch (filter) {
    case 'all': return 'All Items';
    case 'expired': return 'Expired Items';
    case 'near-expiry': return 'Near Expiry (≤15 days)';
    case 'critical': return 'Critical (≤3 days)';
    default: return 'All Items';
  }
}

router.get('/expiry-stock-report', async (req, res) => {
  try {
    const { page = 1, limit = 10, filter = 'all' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all items with batches
    const allItems = await reportsInHand.find({
      'batches': { $exists: true, $not: { $size: 0 } }
    }).lean();

    let allExpiringBatches = [];
    let totalExpiringSoon = 0;
    let totalNearExpiryValue = 0;
    let criticalItems = 0;
    let expiredItems = 0;
    let expiredValue = 0;
    let totalBoxes = 0;
    let totalValue = 0;

    // Process each item and its batches
    allItems.forEach(item => {
      if (item.batches && item.batches.length > 0) {
        item.batches.forEach(batch => {
          if (batch.expiryDate) {
            const expiryDate = new Date(batch.expiryDate);
            expiryDate.setHours(0, 0, 0, 0);
            
            const daysRemaining = calculateDaysRemaining(batch.expiryDate);
            const isExpired = daysRemaining < 0;
            
            // Calculate values
            const boxes = batch.boxes || 0;
            const cifPrice = batch.cif || 0;
            const batchValue = boxes * cifPrice;
            
            totalBoxes += boxes;
            totalValue += batchValue;
            
            // Check if batch should be included based on filter
            let shouldInclude = false;
            
            if (filter === 'all') {
              shouldInclude = isExpired || daysRemaining <= 15;
            } else if (filter === 'expired') {
              shouldInclude = isExpired;
            } else if (filter === 'near-expiry') {
              shouldInclude = !isExpired && daysRemaining <= 15;
            } else if (filter === 'critical') {
              shouldInclude = !isExpired && daysRemaining <= 3;
            }
            
            if (shouldInclude) {
              // Add to totals
              if (!isExpired && daysRemaining <= 15) {
                totalExpiringSoon += boxes;
                totalNearExpiryValue += batchValue;
                
                if (daysRemaining <= 3) {
                  criticalItems += boxes;
                }
              }
              
              if (isExpired) {
                expiredItems += boxes;
                expiredValue += batchValue;
              }
              
              allExpiringBatches.push({
                productId: item._id,
                productName: item.productName || 'Unknown Product',
                supplierName: item.supplierName || 'Unknown Supplier',
                type: item.type || 'N/A',
                batchId: batch._id,
                batchNumber: batch.batchNumber || batch._id.toString().slice(-6),
                expiryDate: expiryDate,
                daysRemaining: Math.abs(daysRemaining),
                isExpired: isExpired,
                quantity: boxes,
                unitPrice: cifPrice,
                totalValue: batchValue,
                lc: batch.lc || 0,
                fob: batch.fob || 0,
                amount: batch.amount || 0,
                date: batch.date || null,
                status: item.status || 'Unknown'
              });
            }
          }
        });
      }
    });

    // Sort items (expired first, then by days remaining)
    allExpiringBatches.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    // Apply pagination
    const totalItemsCount = allExpiringBatches.length;
    const paginatedItems = allExpiringBatches.slice(skip, skip + limitNum);

    // Calculate filtered summary
    let filteredExpiringSoon = 0;
    let filteredNearExpiryValue = 0;
    let filteredCriticalItems = 0;
    let filteredExpiredItems = 0;
    let filteredExpiredValue = 0;

    paginatedItems.forEach(item => {
      filteredExpiringSoon += item.quantity;
      filteredNearExpiryValue += item.totalValue;
      if (item.isExpired) {
        filteredExpiredItems += item.quantity;
        filteredExpiredValue += item.totalValue;
      } else if (item.daysRemaining <= 3) {
        filteredCriticalItems += item.quantity;
      }
    });

    const responseData = {
      summary: {
        totalExpiringSoon: totalExpiringSoon,
        totalNearExpiryValue: parseFloat(totalNearExpiryValue.toFixed(2)),
        criticalItems: criticalItems,
        expiredItems: expiredItems,
        expiredValue: parseFloat(expiredValue.toFixed(2)),
        totalItems: totalItemsCount,
        totalBoxes: parseFloat(totalBoxes.toFixed(1)),
        totalValue: parseFloat(totalValue.toFixed(2)),
        filteredExpiringSoon: filteredExpiringSoon,
        filteredNearExpiryValue: parseFloat(filteredNearExpiryValue.toFixed(2)),
        filteredCriticalItems: filteredCriticalItems,
        filteredExpiredItems: filteredExpiredItems,
        filteredExpiredValue: parseFloat(filteredExpiredValue.toFixed(2))
      },
      items: paginatedItems,
      pagination: {
        total: totalItemsCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalItemsCount / limitNum)
      }
    };

    res.status(200).json({
      success: true,
      data: responseData,
      message: 'Expiry stock report retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching expiry stock report:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to fetch expiry stock report',
      error: error.message
    });
  }
});

// Separate endpoint for export data
router.get('/expiry-stock-report/export', async (req, res) => {
  try {
    const { filter = 'all' } = req.query;

    // Calculate dates for expiry range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find all items with batches
    const allItems = await reportsInHand.find({
      'batches': { $exists: true, $not: { $size: 0 } }
    }).lean();

    // Process items to find expiring batches
    let allExpiringBatches = [];
    let totalExpiringSoon = 0;
    let totalNearExpiryValue = 0;
    let criticalItems = 0;
    let expiredItems = 0;
    let expiredValue = 0;
    let totalBoxes = 0;
    let totalValue = 0;

    // Process each item and its batches
    allItems.forEach(item => {
      if (item.batches && item.batches.length > 0) {
        item.batches.forEach(batch => {
          if (batch.expiryDate) {
            const expiryDate = new Date(batch.expiryDate);
            expiryDate.setHours(0, 0, 0, 0);
            
            const timeDiff = expiryDate.getTime() - today.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
            const isExpired = daysRemaining < 0;
            
            // Calculate values for ALL batches (for totals)
            const boxes = batch.boxes || 0;
            const cifPrice = batch.cif || 0;
            const batchValue = boxes * cifPrice;
            
            totalBoxes += boxes;
            totalValue += batchValue;
            
            // Apply filter based on client request
            let shouldInclude = false;
            
            if (filter === 'all') {
              shouldInclude = isExpired || daysRemaining <= 15;
            } else if (filter === 'expired') {
              shouldInclude = isExpired;
            } else if (filter === 'near-expiry') {
              shouldInclude = !isExpired && daysRemaining <= 15;
            } else if (filter === 'critical') {
              shouldInclude = !isExpired && daysRemaining <= 3;
            } else {
              shouldInclude = isExpired || daysRemaining <= 15;
            }
            
            if (shouldInclude) {
              // Count all batches for summary
              if (!isExpired && daysRemaining <= 15) {
                totalExpiringSoon += boxes;
                totalNearExpiryValue += batchValue;
                
                if (daysRemaining <= 3) {
                  criticalItems += boxes;
                }
              }
              
              if (isExpired) {
                expiredItems += boxes;
                expiredValue += batchValue;
              }
              
              allExpiringBatches.push({
                productId: item._id,
                productName: item.productName || 'Unknown Product',
                supplierName: item.supplierName || 'Unknown Supplier',
                type: item.type || 'N/A',
                batchId: batch._id,
                batchNumber: batch.batchNumber || batch._id.toString().slice(-6),
                expiryDate: expiryDate,
                daysRemaining: Math.abs(daysRemaining),
                isExpired: isExpired,
                quantity: boxes,
                unitPrice: cifPrice,
                totalValue: batchValue,
                lc: batch.lc || 0,
                fob: batch.fob || 0,
                amount: batch.amount || 0,
                date: batch.date || null,
                status: item.status || 'Unknown'
              });
            }
          }
        });
      }
    });

    // Sort items (expired first, then by days remaining)
    allExpiringBatches.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    const exportData = {
      summary: {
        totalItems: allExpiringBatches.length,
        totalBoxes: parseFloat(totalBoxes.toFixed(1)),
        totalValue: parseFloat(totalValue.toFixed(2)),
        totalExpiringSoon: totalExpiringSoon,
        totalNearExpiryValue: parseFloat(totalNearExpiryValue.toFixed(2)),
        criticalItems: criticalItems,
        expiredItems: expiredItems,
        expiredValue: parseFloat(expiredValue.toFixed(2))
      },
      items: allExpiringBatches,
      filter: filter,
      generatedDate: formatDateForExcel(new Date()), // Use formatted date
      filterLabel: getFilterLabel(filter)
    };

    res.status(200).json({
      success: true,
      data: exportData,
      message: 'Export data retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching export data:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to fetch export data',
      error: error.message
    });
  }
});

export default router;