import Swal from "sweetalert2";

export const confirmDialog = async ({
  iconName = "warning",
  text = "Are you sure?",
  confirmButtonText = "Confirm",
  cancelButtonText = "Cancel",
}) => {
  const iconMap = {
    warning: `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.721-1.36 3.486 0l6.518 11.598c.75 1.335-.213 3.003-1.743 3.003H3.482c-1.53 0-2.493-1.668-1.743-3.003L8.257 3.1zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-2a1 1 0 01-1-1V8a1 1 0 112 0v2a1 1 0 01-1 1z" clip-rule="evenodd" />
      </svg>
    `,
    success: "✅",
    error: "❌",
    info: "ℹ️",
    default: "❓",
  };

  const icon = iconMap[iconName] || iconMap.default;
  return await Swal.fire({
    icon: null,
    html: `
      <div class="flex flex-col items-center">
        <div class="mb-4">${icon}</div>
        <div class="text-gray-800 text-lg text-center">${text}</div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
     allowOutsideClick: false,   // ✅ prevent click outside
    allowEscapeKey: false,  
    customClass: {
      popup: "w-64 p-6 rounded-lg bg-white shadow-lg",
      confirmButton:
        "bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mr-2 cursor-pointer",
      cancelButton:
        "bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded cursor-pointer",
    },
    buttonsStyling: false,
  });
};
