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