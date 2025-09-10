import React from 'react';
import { Outlet, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const SaleLayout = () => {
  const location = useLocation();
  
  // Extract last segment of URL for breadcrumb
  const current = location.pathname.split("/").pop();
  
  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumbs */}
      <div className="flex items-center text-sm text-gray-600 font-medium">
        <span>Dashboard</span>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span>Sales</span>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="capitalize text-gray-900">{current}</span>
      </div>

      {/* Nested page (Order/Invoice/etc.) */}
      <Outlet />
    </div>
  );
};

export default SaleLayout;
