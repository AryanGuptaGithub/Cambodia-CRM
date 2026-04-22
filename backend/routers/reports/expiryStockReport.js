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

// Helper: search grouped items by product name or supplier name (case-insensitive)
const searchItems = (items, searchTerm) => {
  if (!searchTerm || searchTerm.trim() === "") return items;
  const searchLower = searchTerm.toLowerCase().trim();
  return items.filter(
    (item) =>
      item.productName.toLowerCase().includes(searchLower) ||
      item.supplierName.toLowerCase().includes(searchLower),
  );
};

// Helper: capitalize first letter of each word
const capitalizeFirstLetter = (str) => {
  if (!str || typeof str !== "string") return "";
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// Helper: Check if product has valid stock (totalBoxes > 0)
const hasValidStock = (item) => {
  return item.totalBoxes > 0;
};

// Helper: Calculate effective batch quantity considering removals
const getEffectiveBatchQuantity = (batch, productTotalBoxes) => {
  // If batch has adjustmentType "remove", skip it
  if (batch.adjustmentType === "remove") {
    return 0;
  }

  // Get batch boxes
  let boxes = batch.boxes || 0;

  // If boxes is negative or zero, skip
  if (boxes <= 0) {
    return 0;
  }

  return boxes;
};

// Helper: Check if product should be shown in expiry stock (only specific products)
const shouldShowProduct = (productName) => {
  const targetProducts = ["tranekam", "bupikam", "carboxykam 0.5", "liasix"];

  const lowerCaseName = productName.toLowerCase();
  return targetProducts.some((target) =>
    lowerCaseName.includes(target.toLowerCase()),
  );
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

    // 1. Fetch all products that have batches AND have stock > 0 (totalBoxes > 0)
    let query = {
      batches: { $exists: true, $not: { $size: 0 } },
      totalBoxes: { $gt: 0 }, // Only get products with current stock > 0
    };

    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, "i"); // Case-insensitive regex
      query.$or = [{ productName: searchRegex }, { supplierName: searchRegex }];
    }

    const allItems = await reportsInHand.find(query).lean();

    // 2. Collect every batch as a plain object (only valid stock batches)
    const rawBatches = [];
    allItems.forEach((item) => {
      if (!item.batches?.length) return;

      // Skip if product has no valid stock
      if (!hasValidStock(item)) return;

      // Check if this is one of the target products
      const isTargetProduct = shouldShowProduct(item.productName);

      // For non-target products, skip them (only show target products)
      if (!isTargetProduct) return;

      item.batches.forEach((batch) => {
        if (!batch.expiryDate) return;

        // Skip removed batches
        if (batch.adjustmentType === "remove") return;

        const expiryDate = new Date(batch.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        const daysRemaining = calculateDaysRemaining(batch.expiryDate);
        const isExpired = daysRemaining < 0;

        // Get effective batch quantity (skip removed batches)
        const boxes = getEffectiveBatchQuantity(batch, item.totalBoxes);

        // Skip if no quantity
        if (boxes <= 0) return;

        const lcPrice = batch.lc || 0;
        const totalValue = boxes * lcPrice;

        rawBatches.push({
          productId: item._id,
          productName: item.productName || "Unknown Product",
          supplierName: item.supplierName || "Unknown Supplier",
          type: item.type || "N/A",
          batchNumber: batch.batchNumber || "N/A",
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
        });
      });
    });

    // 3. Group by productName + supplierName + type (case-insensitive grouping)
    const groupMap = new Map();
    for (const batch of rawBatches) {
      // Create case-insensitive key by converting to lowercase
      const key = `${batch.productName.toLowerCase()}|${batch.supplierName.toLowerCase()}|${batch.type.toLowerCase()}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          productName: batch.productName, // Keep original case for display
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
          totalBoxes: 0, // Track total boxes for this group
        });
      }
      const group = groupMap.get(key);
      group.totalQuantity += batch.quantity;
      group.totalAmount += batch.totalValue;
      group.totalBoxes += batch.quantity;

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

      group.batches.push({
        batchNumber: batch.batchNumber,
        quantity: batch.quantity,
        expiryDate: batch.expiryDate,
        daysRemaining: batch.daysRemaining,
        isExpired: batch.isExpired,
        adjustmentType: batch.adjustmentType,
      });
    }

    // 4. Convert groups to final item objects (only if totalQuantity > 0)
    let groupedItems = [];
    for (const group of groupMap.values()) {
      const {
        totalQuantity,
        totalAmount,
        earliestExpiryDate,
        hasExpired,
        hasNearExpiry,
        hasCritical,
        totalBoxes,
      } = group;

      // Skip if total quantity is 0
      if (totalQuantity === 0) continue;

      // Skip if total boxes is 0 (no stock)
      if (totalBoxes <= 0) continue;

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
          productName: capitalizeFirstLetter(group.productName),
          supplierName: capitalizeFirstLetter(group.supplierName),
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
          batches: group.batches,
          totalBoxes: totalBoxes, // Include total boxes in response
        });
      }
    }

    // 5. Apply search again (already filtered by DB, but group keys may have changed)
    if (searchTerm) {
      groupedItems = searchItems(groupedItems, searchTerm);
    }

    // 6. Sorting: expired first, then by days remaining (ascending)
    groupedItems.sort((a, b) => {
      if (a.isExpired && !b.isExpired) return -1;
      if (!a.isExpired && b.isExpired) return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    // 7. Compute summary totals
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

    // 9. Compute filtered summary
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
        "Expiry stock report for selected products retrieved successfully",
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

    let query = {
      batches: { $exists: true, $not: { $size: 0 } },
      totalBoxes: { $gt: 0 }, // Only get products with stock > 0
    };

    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, "i"); // Case-insensitive regex
      query.$or = [{ productName: searchRegex }, { supplierName: searchRegex }];
    }

    const allItems = await reportsInHand.find(query).lean();

    // Collect all batches (only valid stock for target products)
    const rawBatches = [];
    allItems.forEach((item) => {
      if (!item.batches?.length) return;

      // Skip if product has no valid stock
      if (!hasValidStock(item)) return;

      // Check if this is one of the target products
      const isTargetProduct = shouldShowProduct(item.productName);

      // For non-target products, skip them (only show target products)
      if (!isTargetProduct) return;

      item.batches.forEach((batch) => {
        if (!batch.expiryDate) return;

        // Skip removed batches
        if (batch.adjustmentType === "remove") return;

        const expiryDate = new Date(batch.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        const daysRemaining = calculateDaysRemaining(batch.expiryDate);
        const isExpired = daysRemaining < 0;

        const boxes = getEffectiveBatchQuantity(batch, item.totalBoxes);
        if (boxes <= 0) return;

        const lcPrice = batch.lc || 0;
        const totalValue = boxes * lcPrice;

        rawBatches.push({
          productName: item.productName || "Unknown Product",
          supplierName: item.supplierName || "Unknown Supplier",
          type: item.type || "N/A",
          batchNumber: batch.batchNumber || "N/A",
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
        });
      });
    });

    // Group by productName + supplierName + type (case-insensitive)
    const groupMap = new Map();
    for (const batch of rawBatches) {
      const key = `${batch.productName.toLowerCase()}|${batch.supplierName.toLowerCase()}|${batch.type.toLowerCase()}`;

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

    // Build export items (only if totalQuantity > 0)
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
          productName: capitalizeFirstLetter(group.productName),
          supplierName: capitalizeFirstLetter(group.supplierName),
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
      message: "Export data for selected products retrieved successfully",
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
