import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";

const MrCarryStockLayout = () => {
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto">
      <div className={`container mx-auto px-6 ${isMobileView ? "py-0" : "py-8"}`}>
        <Outlet />
      </div>
    </div>
  );
};

export default MrCarryStockLayout;