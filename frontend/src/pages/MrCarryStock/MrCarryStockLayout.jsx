import React from "react";
import { Outlet } from "react-router-dom";

const MrCarryStockLayout = () => {
  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto">
      <div className="container mx-auto px-6 py-8">
        <Outlet />
      </div>
    </div>
  );
};

export default MrCarryStockLayout;