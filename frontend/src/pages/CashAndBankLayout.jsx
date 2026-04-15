import React from "react";
import { Outlet, NavLink } from "react-router-dom";

const CashAndBankLayout = () => {
  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 overflow-auto">
        <div className="px-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default CashAndBankLayout;
