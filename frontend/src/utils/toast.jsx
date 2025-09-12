// showToast.js
import toast from 'react-hot-toast';

export const showToast = (type = "default", message = "Something happened") => {
  const options = { duration: 3000 };

  const styledMessage = <span dangerouslySetInnerHTML={{ __html: message }} />;

  switch (type) {
    case "success":
      toast.success(styledMessage, options);
      break;
    case "error":
      toast.error(styledMessage, options);
      break;
    case "loading":
      toast.loading(styledMessage, options);
      break;
    case "warning":
      toast(styledMessage, {
        ...options,
        icon: '⚠️',
        style: {
          background: '#FEF3C7',
          color: '#92400E',
          border: '1px solid #FACC15',
        },
      });
      break;
    default:
      toast(styledMessage, options);
      break;
  }
};
