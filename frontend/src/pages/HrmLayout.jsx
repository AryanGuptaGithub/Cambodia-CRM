// pages/HrmLayout.jsx
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

const HrmLayout = () => {
  const location = useLocation();
  const [isMobileView, setIsMobileView] = React.useState(false);
  
  // Detect mobile view
  React.useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  // Check if the current route is the Holidays page
    const isHolidaysPage = location.pathname === '/hrm/dashboard' || 
                        location.pathname.includes('/dashboard');
  
  const layoutClass = (isHolidaysPage && isMobileView) 
    ? "h-full p-4" 
    : "h-full";
  
  return (
    <div className={layoutClass}>
      <Outlet />
    </div>
  );
};

export default HrmLayout;