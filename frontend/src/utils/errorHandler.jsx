export const handleAxiosError = (error, showToast) => {
  if (error.response) {
    const { message } = error.response.data;
    const cleanMessage = message.replace(/<[^>]+>/g, ""); 
    showToast("error", cleanMessage || "Failed to import customers.");
  } else {
    showToast("error", "Network error. Please try again.");
  }
};