// utils/excelUtility.js
export const parseExcelDate = (dateStr) => {
  if (!dateStr) return null;
  
  const str = dateStr.toString().trim();
  if (!str || str.toLowerCase() === "n/a") return null;

  // Try parsing as Excel serial date (number)
  if (!isNaN(str) && str !== "") {
    const excelDate = parseFloat(str);
    if (excelDate > 0) {
      // Excel date system starts from January 1, 1900
      const baseDate = new Date(1900, 0, 1);
      const adjustedDate = excelDate > 60 ? excelDate - 1 : excelDate;
      const resultDate = new Date(baseDate.getTime() + (adjustedDate - 2) * 24 * 60 * 60 * 1000);
      
      // Create a new date without timezone offset issues
      const year = resultDate.getFullYear();
      const month = resultDate.getMonth();
      const day = resultDate.getDate();
      
      // Return date in local timezone (not UTC)
      return new Date(year, month, day, 12, 0, 0); // Set to noon to avoid timezone issues
    }
  }

  // Month names mapping
  const monthNames = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };

  // Try DD MMM YYYY format (e.g., "1 Jun 2021")
  const match1 = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match1) {
    const day = parseInt(match1[1], 10);
    const monthStr = match1[2].toLowerCase();
    const year = parseInt(match1[3], 10);
    
    let month = monthNames[monthStr];
    if (month === undefined) {
      for (const [key, value] of Object.entries(monthNames)) {
        if (key.startsWith(monthStr) || monthStr.startsWith(key)) {
          month = value;
          break;
        }
      }
    }
    
    if (month !== undefined && day >= 1 && day <= 31) {
      // Create date at noon to avoid timezone issues
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // Try DD-MMM-YYYY or DD/MMM/YYYY format (e.g., "1-Jun-2021")
  const match2 = str.match(/^(\d{1,2})[\/\-\s]+([A-Za-z]+)[\/\-\s]+(\d{4})$/);
  if (match2) {
    const day = parseInt(match2[1], 10);
    const monthStr = match2[2].toLowerCase();
    const year = parseInt(match2[3], 10);
    
    let month = monthNames[monthStr];
    if (month === undefined) {
      for (const [key, value] of Object.entries(monthNames)) {
        if (key.startsWith(monthStr) || monthStr.startsWith(key)) {
          month = value;
          break;
        }
      }
    }
    
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // Try DD/MM/YYYY or MM/DD/YYYY format
  const match3 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (match3) {
    const part1 = parseInt(match3[1], 10);
    const part2 = parseInt(match3[2], 10);
    const year = parseInt(match3[3], 10);
    
    if (part1 <= 31 && part2 <= 12) {
      const date = new Date(year, part2 - 1, part1, 12, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }
    
    if (part1 <= 12 && part2 <= 31) {
      const date = new Date(year, part1 - 1, part2, 12, 0, 0);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // Try YYYY-MM-DD format
  const match4 = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (match4) {
    const year = parseInt(match4[1], 10);
    const month = parseInt(match4[2], 10) - 1;
    const day = parseInt(match4[3], 10);
    
    return new Date(year, month, day, 12, 0, 0);
  }

  // Try JavaScript's Date constructor as last resort
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    // Return date at noon to avoid timezone issues
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    return new Date(year, month, day, 12, 0, 0);
  }
  
  return null;
};

export const formatDateToLocalYYYYMMDD = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};