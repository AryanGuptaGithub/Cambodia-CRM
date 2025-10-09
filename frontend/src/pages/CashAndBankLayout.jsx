import React from "react";
import { Outlet, NavLink } from "react-router-dom";

const CashAndBankLayout = () => {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default CashAndBankLayout;
