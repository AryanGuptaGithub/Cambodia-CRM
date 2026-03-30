import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const MasterLayout = () => {
  const location = useLocation();

  // Extract last segment of URL for breadcrumb
  const current = location.pathname.split("/").pop();

  return (
    <div className="flex flex-col">
      <Outlet />
    </div>
  );
};

export default MasterLayout;
