import { toast } from 'react-hot-toast';

export const useCustomToast = () => {
  const showInsufficientStockToast = (count) => {
    toast.custom((t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } fixed bottom-4 right-4 z-50 max-w-md w-full bg-white rounded-lg shadow-xl border border-red-200 transform transition-all`}
      >
        <div className="p-4">
          {/* Header with icon */}
          <div className="flex items-center justify-center mb-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg 
                className="w-6 h-6 text-red-600" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="2" 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.332 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
          </div>

          {/* Message */}
          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Insufficient Stock
            </h3>
            <p className="text-sm text-gray-600">
              {count} product(s) have insufficient stock.
              <br />
              Only invoices with sufficient stock will be imported.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex justify-center space-x-3">
            <button
              onClick={() => {
                // Handle cancel/retry logic here
                toast.dismiss(t.id);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Handle OK/proceed logic here
                toast.dismiss(t.id);
                // Add your import logic here
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
            >
              Proceed Anyway
            </button>
          </div>
        </div>
      </div>
    ), {
      duration: Infinity, // Custom toast stays until dismissed
      position: 'bottom-right',
    });
  };

  return { showInsufficientStockToast };
};