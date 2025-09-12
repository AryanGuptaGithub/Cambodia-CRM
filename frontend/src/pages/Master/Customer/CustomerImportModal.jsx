import { X } from "lucide-react";
import SampleCSVDownload from "../../../excels/SampleCSVDownload";

const CustomerImportModal = ({
  setShowImportModal,
  handleFileUpload,
  handleImport,
}) => {
  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
        <button
          onClick={() => setShowImportModal(false)}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Import Customer
        </h2>

        <SampleCSVDownload />

        <div className="mb-6">
          <label className="block text-gray-700 mb-2">File</label>
          <input
            type="file"
            accept=".csv, .xlsx"
            onChange={handleFileUpload}
            className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => setShowImportModal(false)}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg"
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerImportModal;
