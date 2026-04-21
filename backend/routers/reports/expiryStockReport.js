import express from "express";
import mongoose from "mongoose";
import reportsInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

// Helper: days remaining from today
const calculateDaysRemaining = (expiryDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const timeDiff = expiry.getTime() - today.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
};

// Helper: format date for Excel export
const formatDateForExcel = (date) => {
  const d = new Date(date);
  const day = d.getDate();
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

// Helper: get human readable filter label
function getFilterLabel(filter) {
  switch (filter) {
    case "all":
      return "All Items";
    case "expired":
      return "Expired Items";
    case "near-expiry":
      return "Near Expiry (≤15 days)";
    case "critical":
      return "Critical (≤3 days)";
    default:
      return "All Items";
  }
}

// Helper: search grouped items by product name or supplier name
const searchItems = (items, searchTerm) => {
  if (!searchTerm || searchTerm.trim() === "") return items;
  const searchLower = searchTerm.toLowerCase().trim();
  return items.filter(
    (item) =>
      item.productName.toLowerCase().includes(searchLower) ||
      item.supplierName.toLowerCase().includes(searchLower),
  );
};

// Helper: Filter out ALL remove adjustments and cancelled add adjustments
const filterValidBatchesForExpiry = (batches) => {
  // First, separate batches by type
  const regularBatches = []; // Batches with no adjustmentType or adjustmentType === "batch"
  const addBatches = []; // Batches with adjustmentType === "add"
  const removeBatches = []; // Batches with adjustmentType === "remove"

  for (const batch of batches) {
    const adjType = batch.adjustmentType;

    if (adjType === "add") {
      addBatches.push(batch);
    } else if (adjType === "remove") {
      removeBatches.push(batch);
    } else {
      // Regular batches (no adjustmentType, "batch", or undefined)
      regularBatches.push(batch);
    }
  }

  // IMPORTANT: We EXCLUDE ALL remove batches completely
  // They represent stock that has been removed and should not appear in expiry report

  // For add batches, only keep them if they are NOT cancelled by a remove batch
  // Create a map of remove quantities for quick lookup
  const removeQuantities = new Map();
  for (const removeBatch of removeBatches) {
    const qty = Number(removeBatch.boxes) || 0;
    const key = qty.toString();
    if (!removeQuantities.has(key)) {
      removeQuantities.set(key, 0);
    }
    removeQuantities.set(key, removeQuantities.get(key) + 1);
  }

  // Keep add batches that don't have a matching remove batch
  const validAddBatches = [];
  for (const addBatch of addBatches) {
    const addQty = Number(addBatch.boxes) || 0;
    const key = addQty.toString();

    if (removeQuantities.has(key) && removeQuantities.get(key) > 0) {
      // This add batch is cancelled, decrement the counter
      removeQuantities.set(key, removeQuantities.get(key) - 1);
      // Skip this add batch (don't add to validAddBatches)
    } else {
      // No matching remove, keep this add batch
      validAddBatches.push(addBatch);
    }
  }

  // Return regular batches + valid (non-cancelled) add batches
  // Remove batches are completely excluded
  return [...regularBatches, ...validAddBatches];
};

// --------------------------------------------------------------
// MAIN REPORT ENDPOINT (grouped by product)
// --------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, filter = "all", search = "" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const searchTerm = search || "";

    // 1. Fetch all products that have batches
    let query = { batches: { $exists: true, $not: { $size: 0 } } };
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, "i");
      query.$or = [{ productName: searchRegex }, { supplierName: searchRegex }];
    }
    const allItems = await reportsInHand.find(query).lean();

    // 2. Collect every batch as a plain object, filtering out remove adjustments
    const rawBatches = [];
    allItems.forEach((item) => {
      if (!item.batches?.length) return;

      // Filter out remove adjustments and cancelled add adjustments
      const validBatches = filterValidBatchesForExpiry(item.batches);

      validBatches.forEach((batch) => {
        // Skip if no expiry date
        if (!batch.expiryDate) return;

        const expiryDate = new Date(batch.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        const daysRemaining = calculateDaysRemaining(batch.expiryDate);
        const isExpired = daysRemaining < 0;
        const boxes = batch.boxes || 0;
        const lcPrice = batch.lc || 0;
        const totalValue = boxes * lcPrice;

        rawBatches.push({
          productName: item.productName || "Unknown Product",
          supplierName: item.supplierName || "Unknown Supplier",
          type: item.type || "N/A",
          expiryDate: expiryDate,
          daysRemaining: Math.abs(daysRemaining),
          isExpired: isExpired,
          quantity: boxes,
          totalValue: totalValue,
          lc: lcPrice,
          fob: batch.fob || 0,
          amount: batch.amount || 0,
          date: batch.date || null,
          status: item.status || "Unknown",
          adjustmentType: batch.adjustmentType || "batch",
          batchNumber: batch.batchNumber,
        });
      });
    });

    // 3. Group by productName + supplierName + type
    const groupMap = new Map();
    for (const batch of rawBatches) {
      const key = `${batch.productName}|${batch.supplierName}|${batch.type}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          productName: batch.productName,
          supplierName: batch.supplierName,
          type: batch.type,
          totalQuantity: 0,
          totalAmount: 0,
          earliestExpiryDate: null,
          hasExpired: false,
          hasNearExpiry: false,
          hasCritical: false,
          status: batch.status,
          batches: [],
        });
      }
      const group = groupMap.get(key);
      group.totalQuantity += batch.quantity;
      group.totalAmount += batch.totalValue;
      group.batches.push(batch);
      if (
        !group.earliestExpiryDate ||
        batch.expiryDate < group.earliestExpiryDate
      ) {
        group.earliestExpiryDate = batch.expiryDate;
      }
      if (batch.isExpired) group.hasExpired = true;
      if (!batch.isExpired && batch.daysRemaining <= 15)
        group.hasNearExpiry = true;
      if (!batch.isExpired && batch.daysRemaining <= 3)
        group.hasCritical = true;
    }

    // 4. Convert groups to final item objects
    let groupedItems = [];
    for (const group of groupMap.values()) {
      const {
        totalQuantity,
        totalAmount,
        earliestExpiryDate,
        hasExpired,
        hasNearExpiry,
        hasCritical,
      } = group;
      if (totalQuantity === 0) continue;

      const unitPrice = totalAmount / totalQuantity;
      const daysRemaining = calculateDaysRemaining(earliestExpiryDate);
      const isExpired = daysRemaining < 0;

      // Determine if this product should be included based on the selected filter
      let include = false;
      if (filter === "all") include = hasExpired || hasNearExpiry;
      else if (filter === "expired") include = hasExpired;
      else if (filter === "near-expiry") include = hasNearExpiry;
      else if (filter === "critical") include = hasCritical;
      else include = hasExpired || hasNearExpiry;

      if (include) {
        groupedItems.push({
          productName: group.productName,
          supplierName: group.supplierName,
          type: group.type,
          expiryDate: earliestExpiryDate,
          daysRemaining: Math.abs(daysRemaining),
          isExpired: isExpired,
          quantity: totalQuantity,
          unitPrice: unitPrice,
          totalValue: totalAmount,
          lc: unitPrice,
          fob: 0,
          amount: totalAmount,
          date: null,
          status: group.status,
        });
      }
    }

    // 5. Apply search again
    if (searchTerm) {
      groupedItems = searchItems(groupedItems, searchTerm);
    }

    // 6. Sorting: expired first, then by days remaining (ascending)
    groupedItems.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    // 7. Compute summary totals from the filtered grouped items
    let totalExpiringSoon = 0;
    let totalNearExpiryValue = 0;
    let criticalItems = 0;
    let expiredItems = 0;
    let expiredValue = 0;
    let totalBoxes = 0;
    let totalValue = 0;

    for (const item of groupedItems) {
      totalBoxes += item.quantity;
      totalValue += item.totalValue;
      if (!item.isExpired && item.daysRemaining <= 15) {
        totalExpiringSoon += item.quantity;
        totalNearExpiryValue += item.totalValue;
        if (item.daysRemaining <= 3) criticalItems += item.quantity;
      }
      if (item.isExpired) {
        expiredItems += item.quantity;
        expiredValue += item.totalValue;
      }
    }

    // 8. Pagination
    const totalItemsCount = groupedItems.length;
    const paginatedItems = groupedItems.slice(skip, skip + limitNum);

    // 9. Compute filtered summary from ALL groupedItems
    let filteredExpiringSoon = 0;
    let filteredNearExpiryValue = 0;
    let filteredCriticalItems = 0;
    let filteredExpiredItems = 0;
    let filteredExpiredValue = 0;
    for (const item of groupedItems) {
      if (!item.isExpired && item.daysRemaining <= 15) {
        filteredExpiringSoon += item.quantity;
        filteredNearExpiryValue += item.totalValue;
        if (item.daysRemaining <= 3) filteredCriticalItems += item.quantity;
      }
      if (item.isExpired) {
        filteredExpiredItems += item.quantity;
        filteredExpiredValue += item.totalValue;
      }
    }

    const responseData = {
      summary: {
        totalExpiringSoon,
        totalNearExpiryValue: parseFloat(totalNearExpiryValue.toFixed(2)),
        criticalItems,
        expiredItems,
        expiredValue: parseFloat(expiredValue.toFixed(2)),
        totalItems: totalItemsCount,
        totalBoxes: parseFloat(totalBoxes.toFixed(1)),
        totalValue: parseFloat(totalValue.toFixed(2)),
        filteredExpiringSoon,
        filteredNearExpiryValue: parseFloat(filteredNearExpiryValue.toFixed(2)),
        filteredCriticalItems,
        filteredExpiredItems,
        filteredExpiredValue: parseFloat(filteredExpiredValue.toFixed(2)),
      },
      items: paginatedItems,
      pagination: {
        total: totalItemsCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalItemsCount / limitNum),
      },
    };

    res.status(200).json({
      success: true,
      data: responseData,
      message:
        "Expiry stock report (grouped by product) retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching expiry stock report:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Failed to fetch expiry stock report",
      error: error.message,
    });
  }
});

// --------------------------------------------------------------
// EXPORT ENDPOINT (grouped by product)
// --------------------------------------------------------------
router.get("/export", async (req, res) => {
  try {
    const { filter = "all", search = "" } = req.query;
    const searchTerm = search || "";

    let query = { batches: { $exists: true, $not: { $size: 0 } } };
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, "i");
      query.$or = [{ productName: searchRegex }, { supplierName: searchRegex }];
    }
    const allItems = await reportsInHand.find(query).lean();

    // Collect all batches with remove adjustment filtering
    const rawBatches = [];
    allItems.forEach((item) => {
      if (!item.batches?.length) return;

      // Filter out remove adjustments and cancelled add adjustments
      const validBatches = filterValidBatchesForExpiry(item.batches);

      validBatches.forEach((batch) => {
        if (!batch.expiryDate) return;
        const expiryDate = new Date(batch.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        const daysRemaining = calculateDaysRemaining(batch.expiryDate);
        const isExpired = daysRemaining < 0;
        const boxes = batch.boxes || 0;
        const lcPrice = batch.lc || 0;
        const totalValue = boxes * lcPrice;

        rawBatches.push({
          productName: item.productName || "Unknown Product",
          supplierName: item.supplierName || "Unknown Supplier",
          type: item.type || "N/A",
          expiryDate: expiryDate,
          daysRemaining: Math.abs(daysRemaining),
          isExpired: isExpired,
          quantity: boxes,
          totalValue: totalValue,
          lc: lcPrice,
          fob: batch.fob || 0,
          amount: batch.amount || 0,
          date: batch.date || null,
          status: item.status || "Unknown",
          adjustmentType: batch.adjustmentType || "batch",
          batchNumber: batch.batchNumber,
        });
      });
    });

    // Group by productName + supplierName + type
    const groupMap = new Map();
    for (const batch of rawBatches) {
      const key = `${batch.productName}|${batch.supplierName}|${batch.type}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          productName: batch.productName,
          supplierName: batch.supplierName,
          type: batch.type,
          totalQuantity: 0,
          totalAmount: 0,
          earliestExpiryDate: null,
          hasExpired: false,
          hasNearExpiry: false,
          hasCritical: false,
          status: batch.status,
        });
      }
      const group = groupMap.get(key);
      group.totalQuantity += batch.quantity;
      group.totalAmount += batch.totalValue;
      if (
        !group.earliestExpiryDate ||
        batch.expiryDate < group.earliestExpiryDate
      ) {
        group.earliestExpiryDate = batch.expiryDate;
      }
      if (batch.isExpired) group.hasExpired = true;
      if (!batch.isExpired && batch.daysRemaining <= 15)
        group.hasNearExpiry = true;
      if (!batch.isExpired && batch.daysRemaining <= 3)
        group.hasCritical = true;
    }

    // Build export items
    let exportItems = [];
    for (const group of groupMap.values()) {
      const {
        totalQuantity,
        totalAmount,
        earliestExpiryDate,
        hasExpired,
        hasNearExpiry,
        hasCritical,
      } = group;
      if (totalQuantity === 0) continue;

      const unitPrice = totalAmount / totalQuantity;
      const daysRemaining = calculateDaysRemaining(earliestExpiryDate);
      const isExpired = daysRemaining < 0;

      let include = false;
      if (filter === "all") include = hasExpired || hasNearExpiry;
      else if (filter === "expired") include = hasExpired;
      else if (filter === "near-expiry") include = hasNearExpiry;
      else if (filter === "critical") include = hasCritical;
      else include = hasExpired || hasNearExpiry;

      if (include) {
        exportItems.push({
          productName: group.productName,
          supplierName: group.supplierName,
          type: group.type,
          expiryDate: earliestExpiryDate,
          daysRemaining: Math.abs(daysRemaining),
          isExpired: isExpired,
          quantity: totalQuantity,
          unitPrice: unitPrice,
          totalValue: totalAmount,
          lc: unitPrice,
          fob: 0,
          amount: totalAmount,
          date: null,
          status: group.status,
        });
      }
    }

    // Apply search again
    if (searchTerm) {
      exportItems = searchItems(exportItems, searchTerm);
    }

    // Sorting
    exportItems.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    // Compute summary for export
    let totalExpiringSoon = 0;
    let totalNearExpiryValue = 0;
    let criticalItems = 0;
    let expiredItems = 0;
    let expiredValue = 0;
    let totalBoxes = 0;
    let totalValue = 0;

    for (const item of exportItems) {
      totalBoxes += item.quantity;
      totalValue += item.totalValue;
      if (!item.isExpired && item.daysRemaining <= 15) {
        totalExpiringSoon += item.quantity;
        totalNearExpiryValue += item.totalValue;
        if (item.daysRemaining <= 3) criticalItems += item.quantity;
      }
      if (item.isExpired) {
        expiredItems += item.quantity;
        expiredValue += item.totalValue;
      }
    }

    const exportData = {
      summary: {
        totalItems: exportItems.length,
        totalBoxes: parseFloat(totalBoxes.toFixed(1)),
        totalValue: parseFloat(totalValue.toFixed(2)),
        totalExpiringSoon,
        totalNearExpiryValue: parseFloat(totalNearExpiryValue.toFixed(2)),
        criticalItems,
        expiredItems,
        expiredValue: parseFloat(expiredValue.toFixed(2)),
      },
      items: exportItems,
      filter: filter,
      generatedDate: formatDateForExcel(new Date()),
      filterLabel: getFilterLabel(filter),
      searchTerm: searchTerm || null,
    };

    res.status(200).json({
      success: true,
      data: exportData,
      message: "Export data (grouped by product) retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching export data:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Failed to fetch export data",
      error: error.message,
    });
  }
});

export default router;
