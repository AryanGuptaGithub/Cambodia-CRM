import React from "react";
import { Outlet, useLocation } from "react-router-dom";

const ExpenseLayout = () => {
  const location = useLocation();

  const current = location.pathname.split("/").pop();

  return (
    <div className="flex flex-col gap-4">
      <Outlet />
    </div>
  );
};

export default ExpenseLayout;