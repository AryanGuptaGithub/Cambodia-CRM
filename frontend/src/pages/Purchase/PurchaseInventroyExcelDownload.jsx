import React, { useState } from "react";
import { Download } from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleDownloadFile =
  import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";

function PurchaseInventoryExcelDownload() {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isSampleDownloadFile) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const token = localStorage.getItem("token");

      const response = await axios.get(
        `${backendUrl}/api/purchase/download-all-excel`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          responseType: "blob",
        }
      );

      const contentDisposition = response.headers["content-disposition"];
      let fileName = "PurchaseInventory.xlsx";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) fileName = match[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast("success", "Purchase inventory downloaded successfully!");
    } catch (error) {
      console.error("Download error:", error);
      const message =
        error.response?.data?.message ||
        "Failed to download purchase inventory";
      showToast("error", message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading}
      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors text-sm font-medium"
      title="Download all purchase entries as Excel"
    >
      {isDownloading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          Downloading…
        </>
      ) : (
        <>
          <Download size={16} />
          Download Purchase Excel
        </>
      )}
    </button>
  );
}

export default PurchaseInventoryExcelDownload;
