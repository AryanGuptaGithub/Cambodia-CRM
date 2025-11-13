import React from "react";
import { LoaderPinwheelIcon, BriefcaseMedical } from "lucide-react"; // or wherever you're importing it from

const LoadingOverlay = ({ text = "Loading...", color = "text-blue-600", bg = "bg-white" }) => {
  return (
    <div className={`fixed inset-0 flex items-center justify-center ${bg} z-50`}>
      <div className="flex items-center">
        <LoaderPinwheelIcon className={`animate-spin ${color} w-8 h-8`} />
        <span className={`ml-3 ${color} font-medium text-lg`}>{text}</span>
      </div>
    </div>
  );
};

export default LoadingOverlay;
