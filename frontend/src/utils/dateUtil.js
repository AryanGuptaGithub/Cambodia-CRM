// utils/dateUtil.js
export const formatDateToReadable = (dateString, format = "dd MMM yyyy") => {
  if (!dateString) return "";
  
  try {
    // If the dateString is in YYYY-MM-DD format, parse it directly
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const parts = dateString.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${monthNames[month]} ${year}`;
    }
    
    let date;
    
    // If dateString is already a Date object
    if (dateString instanceof Date) {
      date = dateString;
    } else {
      // Parse the date string at noon to avoid timezone issues
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
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "";
    }
    
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
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
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


export const parseExcelDateValue = (dateValue) => {
  if (!dateValue && dateValue !== 0 && dateValue !== "") {
    return formatDateToYYYYMMDD(new Date());
  }
  if (dateValue instanceof Date) {
    const excelEpoch = new Date(1899, 11, 30);
    const diff = dateValue - excelEpoch;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const adjustedDays = days >= 60 ? days + 1 : days;
    const excelZero = new Date(1899, 11, 31);
    const reconstructedDate = new Date(
      excelZero.getTime() + (adjustedDays - 1) * 86400000,
    );
    const year = reconstructedDate.getFullYear();
    const month = String(reconstructedDate.getMonth() + 1).padStart(2, "0");
    const day = String(reconstructedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof dateValue === "number") {
    return excelSerialToDateString(dateValue);
  }
  if (typeof dateValue === "string") {
    const trimmed = dateValue.trim();
    if (!trimmed) return "";

    const asNumber = parseFloat(trimmed);
    if (!isNaN(asNumber)) {
      return excelSerialToDateString(asNumber);
    }

    const usFormatMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (usFormatMatch) {
      let month = parseInt(usFormatMatch[1], 10);
      let day = parseInt(usFormatMatch[2], 10);
      let year = parseInt(usFormatMatch[3], 10);
      if (year < 100) year += 2000;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const dateFormats = [
      /^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/i,
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
      /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/,
    ];
    for (const format of dateFormats) {
      const match = trimmed.match(format);
      if (match) {
        try {
          let year, month, day;
          if (format === dateFormats[0]) {
            day = parseInt(match[1], 10);
            const monthStr = match[2].toLowerCase().substring(0, 3);
            year = parseInt(match[3], 10);
            if (year < 100) year += 2000;
            const monthMap = {
              jan: 1,
              feb: 2,
              mar: 3,
              apr: 4,
              may: 5,
              jun: 6,
              jul: 7,
              aug: 8,
              sep: 9,
              oct: 10,
              nov: 11,
              dec: 12,
            };
            month = monthMap[monthStr];
            if (month === undefined) continue;
          } else if (format === dateFormats[1]) {
            year = parseInt(match[1], 10);
            month = parseInt(match[2], 10);
            day = parseInt(match[3], 10);
          } else {
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
    }

    try {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return formatDateToYYYYMMDD(date);
      }
    } catch (e) {
      console.warn("JavaScript Date constructor failed for:", trimmed);
    }
  }
  return formatDateToYYYYMMDD(new Date());
};