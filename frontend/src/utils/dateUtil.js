export const formatDateToReadable = (isoString) => {
  if (!isoString) return "";

  const date = new Date(isoString);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};
