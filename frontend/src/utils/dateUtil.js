// utils/dateUtil.js

export const formatDateToReadable = (dateString, format = "dd MMM yyyy") => {
  if (!dateString) return "";

  try {
    if (typeof dateString === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const parts = dateString.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${day} ${monthNames[month]} ${year}`;
    }

    let date;
    if (dateString instanceof Date) {
      date = dateString;
    } else {
      const tempDate = new Date(dateString);
      if (!isNaN(tempDate.getTime())) {
        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();
        date = new Date(year, month, day, 12, 0, 0);
      } else {
        date = tempDate;
      }
    }

    if (isNaN(date.getTime())) return "";

    const day = date.getDate();
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return "";
  }
};

export const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDateToYYYYMMDD = (date) => {
  if (!date || isNaN(new Date(date).getTime())) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// ✅ FIXED: Defined BEFORE parseExcelDateValue so it is in scope when called
const excelSerialToDateString = (serial) => {
  if (!serial && serial !== 0) return "";
  const num = typeof serial === "string" ? parseFloat(serial) : serial;
  if (isNaN(num)) return "";
  // Excel has a leap-year bug for 1900, so serials >= 60 need adjustment
  const adjustedNum = num >= 60 ? num - 1 : num;
  const excelEpoch = new Date(Date.UTC(1900, 0, 0)); // 1899-12-31 UTC
  const date = new Date(excelEpoch.getTime() + adjustedNum * 86400000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseExcelDateValue = (dateValue) => {
  if (!dateValue && dateValue !== 0 && dateValue !== "") {
    return formatDateToYYYYMMDD(new Date());
  }

  // ✅ FIXED: Use UTC methods to avoid timezone shift (e.g. UTC+5:30 shifting date back 1 day)
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) return formatDateToYYYYMMDD(new Date());
    const year = dateValue.getUTCFullYear();
    const month = String(dateValue.getUTCMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Excel serial number (e.g. 45123)
  if (typeof dateValue === "number") {
    return excelSerialToDateString(dateValue);
  }

  if (typeof dateValue === "string") {
    const trimmed = dateValue.trim();
    if (!trimmed) return "";

    // Pure numeric string → treat as serial
    const asNumber = parseFloat(trimmed);
    if (!isNaN(asNumber) && String(asNumber) === trimmed) {
      return excelSerialToDateString(asNumber);
    }

    // MM/DD/YYYY (US format)
    const usFormatMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (usFormatMatch) {
      let month = parseInt(usFormatMatch[1], 10);
      let day = parseInt(usFormatMatch[2], 10);
      let year = parseInt(usFormatMatch[3], 10);
      if (year < 100) year += 2000;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const dateFormats = [
      // DD-Mon-YY(YY) e.g. "9-Jan-25", "8-Dec-2020"
      /^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/i,
      // YYYY-MM-DD
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
      // DD-MM-YYYY
      /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/,
    ];

    const monthMap = {
      jan: 1, feb: 2,  mar: 3,  apr: 4,
      may: 5, jun: 6,  jul: 7,  aug: 8,
      sep: 9, oct: 10, nov: 11, dec: 12,
    };

    for (let fi = 0; fi < dateFormats.length; fi++) {
      const match = trimmed.match(dateFormats[fi]);
      if (!match) continue;
      try {
        let year, month, day;
        if (fi === 0) {
          // DD-Mon-YY(YY)
          day = parseInt(match[1], 10);
          const monthStr = match[2].toLowerCase().substring(0, 3);
          year = parseInt(match[3], 10);
          if (year < 100) year += 2000;
          month = monthMap[monthStr];
          if (!month) continue;
        } else if (fi === 1) {
          // YYYY-MM-DD
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
          day = parseInt(match[3], 10);
        } else {
          // DD-MM-YYYY
          day = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
          year = parseInt(match[3], 10);
          if (year < 100) year += 2000;
        }
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      } catch (e) {
        console.warn("Failed to parse date string:", trimmed, e);
      }
    }

    // Last resort: JS Date constructor
    try {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) return formatDateToYYYYMMDD(date);
    } catch (e) {
      console.warn("JavaScript Date constructor failed for:", trimmed);
    }
  }

  return formatDateToYYYYMMDD(new Date());
};
