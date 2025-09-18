import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const StaffMemberLayout = () => {
  const location = useLocation();
  const current = location.pathname.split("/").pop();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center text-sm text-gray-600 font-medium">
        <span>Dashboard</span>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span>Staff Member</span>
        <ChevronRight className="w-4 h-4 mx-1" />
        <span className="capitalize text-gray-900">{current}</span>
      </div>
      <Outlet />
    </div>
  );
};

export default StaffMemberLayout;
