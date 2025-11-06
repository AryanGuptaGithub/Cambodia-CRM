// src/utils/excelUtils.js
export const parseExcelDate = (value) => {
  if (!value && value !== 0) return null;

  if (typeof value === "number") {
    try {
      const days = value > 60 ? value - 1 : value; // Adjust for Excel's leap year bug
      const excelEpoch = new Date(1900, 0, 1);
      const jsDate = new Date(excelEpoch.getTime() + days * 86400 * 1000);

      if (isNaN(jsDate.getTime())) {
        console.warn("Invalid date from Excel serial:", value);
        return null;
      }

      console.log("Converted Excel serial to date:", jsDate);
      return jsDate;
    } catch (error) {
      console.error("Error converting Excel date:", error);
      return null;
    }
  }

  // Handle string date formats
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const dateFormats = [
      new Date(trimmedValue),
      new Date(trimmedValue.replace(/(\d+)\/(\d+)\/(\d+)/, "$2/$1/$3")), // DD/MM/YYYY
      new Date(trimmedValue.replace(/(\d+)-(\d+)-(\d+)/, "$2/$1/$3")), // DD-MM-YYYY
      new Date(trimmedValue.replace(/(\d+)\.(\d+)\.(\d+)/, "$2/$1/$3")), // DD.MM.YYYY
    ];

    for (const date of dateFormats) {
      if (!isNaN(date.getTime())) {
        console.log("Parsed string date:", date);
        return date;
      }
    }

    console.warn("Could not parse date string:", trimmedValue);
    return null;
  }

  // Handle Date object
  if (value instanceof Date) {
    return !isNaN(value.getTime()) ? value : null;
  }
  
  return null;
};