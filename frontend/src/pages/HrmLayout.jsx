// pages/HrmLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';

const HrmLayout = () => {
  return (
    <div className="h-full p-4">
      <Outlet />
    </div>
  );
};

export default HrmLayout;