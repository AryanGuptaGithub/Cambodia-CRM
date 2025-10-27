import React from "react";
import { Outlet } from "react-router-dom";
import SettingsSidebar from "../components/SettingsSidebar";

function SettingsLayout() {
  return (
    <div className="flex min-h-screen">
      <SettingsSidebar />
      <div className="flex-1 p-6">
        <Outlet />
      </div>
    </div>
  );
}

export default SettingsLayout;