import express from 'express';
import mongoose from 'mongoose';
import PurchaseInventory from '../../models/purcharsing/purchaseInventory.js'; 

const router = express.Router();

router.get('/expiry-stock-report', async (req, res) => {
  try {
    // Calculate dates for expiry range
    const today = new Date();
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(today.getDate() + 15);

    // Find purchase inventory items expiring within next 15 days
    const expiringItems = await PurchaseInventory.find({
      expiryDate: {
        $gte: today, // greater than or equal to today
        $lte: fifteenDaysFromNow // less than or equal to 15 days from now
      }
    }).sort({ expiryDate: 1 }); // sort by expiry date ascending

    // Calculate summary statistics
    let totalExpiringSoon = 0;
    let totalNearExpiryValue = 0;
    let criticalItems = 0;

    // Calculate critical items (expiring in 3 days or less)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    // Process items to add calculated fields
    const itemsWithDetails = expiringItems.map(item => {
      const expiryDate = new Date(item.expiryDate);
      const daysRemaining = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      // Calculate total value for this item
      const totalValue = (item.quantityPerBoxStrip || 0) * (item.cif || 0);
      
      // Update summary counts
      totalExpiringSoon += item.quantityPerBoxStrip || 0;
      totalNearExpiryValue += totalValue;
      
      if (daysRemaining <= 3) {
        criticalItems += item.quantityPerBoxStrip || 0;
      }

      return {
        productName: item.productName,
        batchNumber: item.invoiceNumber, // Using invoice number as batch number
        expiryDate: item.expiryDate,
        daysRemaining: Math.max(0, daysRemaining), // Ensure non-negative
        quantity: item.quantityPerBoxStrip || 0,
        unitPrice: item.cif || 0, // Using CIF as unit price
        totalValue: totalValue,
        supplierName: item.supplierName,
        invoiceNumber: item.invoiceNumber,
        receivedDate: item.receivedDate
      };
    });

    // Prepare response data
    const responseData = {
      summary: {
        totalExpiringSoon: totalExpiringSoon,
        totalNearExpiryValue: parseFloat(totalNearExpiryValue.toFixed(2)),
        criticalItems: criticalItems
      },
      items: itemsWithDetails
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

export default router;