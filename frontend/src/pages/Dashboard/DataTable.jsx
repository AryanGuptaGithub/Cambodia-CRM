import React from "react";

export const DataTable = ({
  title,
  exportButton,
  loading,
  loadingText,
  emptyText,
  columns,
  data
}) => {
  const getValue = (item, accessor) => {
    if (typeof accessor === 'function') return accessor(item);
    if (typeof accessor === 'string') {
      return accessor.split('.').reduce((obj, key) => obj?.[key], item);
    }
    return item[accessor];
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
          {exportButton && (
            <button
              onClick={exportButton.onClick}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <exportButton.icon size={18} /> {exportButton.label}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map((column, index) => (
                <th key={index} className="p-4 text-sm font-semibold text-gray-700">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-gray-500">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className="ml-2">{loadingText}</span>
                  </div>
                </td>
              </tr>
            ) : data.length > 0 ? (
              data.map((item, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                  {columns.map((column, colIndex) => (
                    <td 
                      key={colIndex} 
                      className={`p-4 text-sm text-gray-600 ${column.className || ''}`}
                    >
                      {column.render 
                        ? column.render(item, rowIndex)
                        : getValue(item, column.accessor)
                      }
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-gray-500">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};