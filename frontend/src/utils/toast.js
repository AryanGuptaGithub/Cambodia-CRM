import toast from 'react-hot-toast';

export const showToast = (type = "default", message = "Something happened") => {
  const options = { duration: 3000 };

  switch (type) {
    case "success":
      toast.success(message, options);
      break;
    case "error":
      toast.error(message, options);
      break;
    case "loading":
      toast.loading(message, options);
      break;
    case "warning":
      toast(message, {
        ...options,
        icon: '⚠️',
        style: {
          background: '#FEF3C7',  // light yellow
          color: '#92400E',       // dark orange text
          border: '1px solid #FACC15', // yellow border
        },
      });
      break;
    default:
      toast(message, options);
      break;
  }
};
