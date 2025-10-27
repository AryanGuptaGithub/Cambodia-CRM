import React from "react";
import { Link, useLocation } from "react-router-dom";

function SettingsSidebar() {
  const location = useLocation();

  const menuItems = [
    { path: "/settingslayout/company-profile", label: "Company Profile" },
    { path: "/settingslayout/htabs-manipulation", label: "HTabs Manipulation" },
  ];

  return (
    <div className="w-64 bg-white shadow-lg h-screen p-4">
      <h2 className="text-xl font-bold mb-6 text-gray-800">Settings</h2>
      <nav>
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`block px-4 py-2 rounded-lg transition-colors ${
                  location.pathname === item.path
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default SettingsSidebar;