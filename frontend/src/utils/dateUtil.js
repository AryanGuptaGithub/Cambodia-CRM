// // utils/dateUtil.js

// export const formatDateToReadable = (dateString, format = "dd MMM yyyy") => {
//   if (!dateString) return "";

//   try {
//     if (typeof dateString === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
//       const parts = dateString.split("-");
//       const year = parseInt(parts[0], 10);
//       const month = parseInt(parts[1], 10) - 1;
//       const day = parseInt(parts[2], 10);
//       const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
//       return `${day} ${monthNames[month]} ${year}`;
//     }

//     let date;
//     if (dateString instanceof Date) {
//       date = dateString;
//     } else {
//       const tempDate = new Date(dateString);
//       if (!isNaN(tempDate.getTime())) {
//         const year = tempDate.getFullYear();
//         const month = tempDate.getMonth();
//         const day = tempDate.getDate();
//         date = new Date(year, month, day, 12, 0, 0);
//       } else {
//         date = tempDate;
//       }
//     }

//     if (isNaN(date.getTime())) return "";

//     const day = date.getDate();
//     const month = date.toLocaleString("default", { month: "short" });
//     const year = date.getFullYear();
//     return `${day} ${month} ${year}`;
//   } catch (error) {
//     console.error("Error formatting date:", error);
//     return "";
//   }
// };

// const excelSerialToDateString = (serial) => {
//   if (serial === null || serial === undefined || serial === "") return "";

//   const num = Number(serial);
//   if (isNaN(num)) return "";

//   // Excel leap year bug fix (1900 issue)
//   const adjusted = num > 59 ? num - 1 : num;

//   const epoch = new Date(Date.UTC(1899, 11, 31)); // 1899-12-31
//   const date = new Date(epoch.getTime() + adjusted * 86400000);

//   return formatUTCDate(date);
// };

// // Format date using UTC to avoid timezone shift
// const formatUTCDate = (date) => {
//   const year = date.getUTCFullYear();
//   const month = String(date.getUTCMonth() + 1).padStart(2, "0");
//   const day = String(date.getUTCDate()).padStart(2, "0");
//   return `${year}-${month}-${day}`;
// };

// // ===============================
// // utils/dateUtil.js
// // ===============================

// // ==========================================
// // FORMAT DATE TO YYYY-MM-DD (SAFE)
// // ==========================================
// export const formatDateToYYYYMMDD = (date) => {
//   if (!date) return "";

//   const d = new Date(date);
//   if (isNaN(d.getTime())) return "";

//   return `${d.getUTCFullYear()}-${String(
//     d.getUTCMonth() + 1
//   ).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
// };

// // ==========================================
// // FORMAT DATE TO READABLE (dd MMM yyyy)
// // ==========================================

// // ==========================================
// // GET TODAY DATE (UTC SAFE)
// // ==========================================
// export const getTodayDate = () => {
//   const now = new Date();
//   return `${now.getUTCFullYear()}-${String(
//     now.getUTCMonth() + 1
//   ).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
// };

// // ==========================================
// // CONVERT EXCEL SERIAL TO DATE
// // ==========================================
// const excelSerialToDate = (serial) => {
//   const num = Number(serial);
//   if (isNaN(num)) return "";

//   // Excel 1900 leap year bug fix
//   const adjusted = num > 59 ? num - 1 : num;

//   const epoch = new Date(Date.UTC(1899, 11, 31));
//   const date = new Date(epoch.getTime() + adjusted * 86400000);

//   return `${date.getUTCFullYear()}-${String(
//     date.getUTCMonth() + 1
//   ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
// };

// // ==========================================
// // MAIN PARSER (NO TIMEZONE BUG)
// // ==========================================
// export const parseExcelDateValue = (value) => {
//   if (value === null || value === undefined || value === "")
//     return "";

//   // 1️⃣ If already Date object (SheetJS case)
//   if (value instanceof Date) {
//     if (isNaN(value.getTime())) return "";

//     return `${value.getUTCFullYear()}-${String(
//       value.getUTCMonth() + 1
//     ).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
//   }

//   // 2️⃣ Excel serial number
//   if (typeof value === "number") {
//     return excelSerialToDate(value);
//   }

//   if (typeof value === "string") {
//     const trimmed = value.trim();
//     if (!trimmed) return "";

//     // 3️⃣ Pure number string → serial
//     if (/^\d+(\.\d+)?$/.test(trimmed)) {
//       return excelSerialToDate(Number(trimmed));
//     }

//     const monthMap = {
//       january:1, jan:1,
//       february:2, feb:2,
//       march:3, mar:3,
//       april:4, apr:4,
//       may:5,
//       june:6, jun:6,
//       july:7, jul:7,
//       august:8, aug:8,
//       september:9, sep:9,
//       october:10, oct:10,
//       november:11, nov:11,
//       december:12, dec:12,
//     };

//     let match;

//     // 4️⃣ 1 June 2021
//     match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
//     if (match) {
//       const day = parseInt(match[1], 10);
//       const month = monthMap[match[2].toLowerCase()];
//       const year = parseInt(match[3], 10);

//       if (month)
//         return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
//     }

//     // 5️⃣ 9-Jan-25 or 9-Jan-2025
//     match = trimmed.match(/^(\d{1,2})[-\/]([A-Za-z]+)[-\/](\d{2,4})$/i);
//     if (match) {
//       const day = parseInt(match[1], 10);
//       const month = monthMap[match[2].toLowerCase()];
//       let year = parseInt(match[3], 10);

//       if (year < 100) year += 2000;

//       if (month)
//         return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
//     }

//     // 6️⃣ YYYY-MM-DD
//     match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
//     if (match) {
//       return trimmed; // already correct
//     }

//     // 7️⃣ DD-MM-YYYY
//     match = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
//     if (match) {
//       return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
//     }
//   }

//   return "";
// };

// ===============================
// utils/dateUtil.js (FULL DEBUG)
// ===============================

// ==========================================
// FORMAT DATE TO READABLE
// ==========================================
export const formatDateToReadable = (dateString, format = "dd MMM yyyy") => {
  if (!dateString) {
    return "";
  }

  try {
    if (
      typeof dateString === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ) {
      const parts = dateString.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

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
      const result = `${day} ${monthNames[month]} ${year}`;
      return result;
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

    if (isNaN(date.getTime())) {
      return "";
    }

    const day = date.getDate();
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getFullYear();

    const result = `${day} ${month} ${year}`;
    return result;
  } catch (error) {
    console.error("Error formatting date:", error);
    return "";
  }
};

// ==========================================
// FORMAT DATE TO YYYY-MM-DD
// ==========================================
export const formatDateToYYYYMMDD = (date) => {
  if (!date) {
    return "";
  }

  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return "";
  }

  const result = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return result;
};

// ==========================================
// GET TODAY DATE
// ==========================================
export const getTodayDate = () => {
  const now = new Date();

  const result = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  return result;
};

// ==========================================
// EXCEL SERIAL CONVERSION
// ==========================================
const excelSerialToDate = (serial) => {
  const num = Number(serial);

  if (isNaN(num)) {
    return "";
  }

  const adjusted = num > 59 ? num - 1 : num;

  const epoch = new Date(Date.UTC(1899, 11, 31));
  const date = new Date(epoch.getTime() + adjusted * 86400000);

  const result = `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

  return result;
};

// ==========================================
// MAIN PARSER
// ==========================================
export const parseExcelDateValue = (value) => {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return "";
    }

    let year = value.getFullYear();
    let month = value.getMonth();
    let day = value.getDate();

    const hours = value.getHours();
    const minutes = value.getMinutes();
    const seconds = value.getSeconds();

    // ✅ If time is near midnight (Excel timezone bug case)
    if (hours >= 23) {
      const tempDate = new Date(year, month, day + 1);
      year = tempDate.getFullYear();
      month = tempDate.getMonth();
      day = tempDate.getDate();
    }

    const result = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;

    return result;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);

    if (match) {
      const monthMap = {
        january: 1,
        jan: 1,
        february: 2,
        feb: 2,
        march: 3,
        mar: 3,
        april: 4,
        apr: 4,
        may: 5,
        june: 6,
        jun: 6,
        july: 7,
        jul: 7,
        august: 8,
        aug: 8,
        september: 9,
        sep: 9,
        october: 10,
        oct: 10,
        november: 11,
        nov: 11,
        december: 12,
        dec: 12,
      };

      const day = parseInt(match[1], 10);
      const month = monthMap[match[2].toLowerCase()];
      const year = parseInt(match[3], 10);

      if (month) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  return "";
};
