// Format date as "MMM YYYY" (e.g., "Oct 2025")
export const formatMonthYear = (date) => {
  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
};

// Get current date ranges
export const getDateRanges = () => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Today
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Current Month (1st to today)
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(today);
  monthEnd.setHours(23, 59, 59, 999);

  // Current Year (Jan 1st to today)
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(today);
  yearEnd.setHours(23, 59, 59, 999);

  // Format labels
  const todayLabel = today.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
  const monthLabel = today.toLocaleString("en-US", {
    month: "short",
  });
  const yearLabel = today.getFullYear().toString();

  const yearRangeLabel = `1 Jan - ${today.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
  })}`;

  return {
    today: { start: todayStart, end: todayEnd, label: todayLabel },
    month: { start: monthStart, end: monthEnd, label: monthLabel },
    year: {
      start: yearStart,
      end: yearEnd,
      label: yearLabel,
      rangeLabel: yearRangeLabel,
    },
  };
};

// Get previous month date ranges for Payroll
export const getPreviousMonthRanges = () => {
  const today = new Date();
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthYear = previousMonth.getFullYear();
  const previousMonthNumber = previousMonth.getMonth();

  // Previous Month (full month)
  const prevMonthStart = new Date(previousMonthYear, previousMonthNumber, 1);
  const prevMonthEnd = new Date(previousMonthYear, previousMonthNumber + 1, 0);
  prevMonthEnd.setHours(23, 59, 59, 999);

  // Previous Month Year to Date (Jan 1st to end of previous month)
  const prevMonthYearStart = new Date(previousMonthYear, 0, 1);
  const prevMonthYearEnd = new Date(
    previousMonthYear,
    previousMonthNumber + 1,
    0
  );
  prevMonthYearEnd.setHours(23, 59, 59, 999);

  // Format labels
  const prevMonthLabel = previousMonth.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
  const prevMonthYearLabel = previousMonthYear.toString();

  return {
    prevMonth: {
      start: prevMonthStart,
      end: prevMonthEnd,
      label: prevMonthLabel,
    },
    prevMonthYear: {
      start: prevMonthYearStart,
      end: prevMonthYearEnd,
      label: prevMonthYearLabel,
    },
  };
};

// Calculate growth percentage
export const calculateGrowth = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
};

// Format currency
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Get modal data type
export const getModalDataType = (data) => {
  if (!data || data.length === 0) return "unknown";

  const firstItem = data[0];

  // Check for outstanding data structure
  if (
    firstItem.dueAmount !== undefined ||
    firstItem.invoiceNumber !== undefined
  ) {
    return "outstanding";
  }

  // Check for sales data structure
  if (
    firstItem.productName !== undefined ||
    firstItem.sellingPrice !== undefined
  ) {
    return "sales";
  }

  return "unknown";
};

// Format date to readable (fixed version)
export const formatDateToReadableFixed = (dateString) => {
  if (!dateString) return "N/A";
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid Date";
  }
};

// Add these functions to your existing DashboardUtil.js

// Get stock date ranges
export const getStockDateRanges = () => {
  const today = new Date();
  
  // Today
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Current Month (1st to today)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today);
  monthEnd.setHours(23, 59, 59, 999);

  // Current Year (Jan 1st to today)
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today);
  yearEnd.setHours(23, 59, 59, 999);

  // Format labels
  const todayLabel = today.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
  const monthLabel = today.toLocaleString("en-US", {
    month: "short",
  });
  const yearLabel = today.getFullYear().toString();

  return {
    today: { start: todayStart, end: todayEnd, label: todayLabel },
    month: { start: monthStart, end: monthEnd, label: monthLabel },
    year: { start: yearStart, end: yearEnd, label: yearLabel },
  };
};

// Calculate stock value
export const calculateStockValue = (stockItems) => {
  if (!stockItems || !Array.isArray(stockItems)) return 0;
  
  return stockItems.reduce((total, item) => {
    const quantity = item.quantity?.boxes || 0;
    const lc = item.lc || 0;
    return total + (quantity * lc);
  }, 0);
};

export const getLowStockItems = (stockItems) => {
  if (!stockItems || !Array.isArray(stockItems)) return [];
  
  return stockItems.filter(item => {
    const currentStock = item.quantity?.boxes || 0;
    const minStockLevel = item.minStockLevel || 0;
    return currentStock < minStockLevel;
  });
};