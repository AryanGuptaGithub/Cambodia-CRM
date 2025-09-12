// src/components/TopTabs.jsx
import { NavLink } from "react-router-dom";

const tabs = [
  { path: "/graph", label: "Graph" },
  { path: "/masterlayout/customer", label: "Customers" },
  { path: "/masterlayout/supplier", label: "Suppliers" },
  { path: "/purchaselayout/purchase", label: "Purchase" },
  { path: "/salelayout/sale", label: "Sales" },
  { path: "/reportlayout/payment", label: "Reports" },
  // Add more tabs as needed
];

const TopTabs = () => {
  return (
    <div className="flex space-x-2 bg-white shadow px-4 py-2 border-b">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) =>
            `px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 
            ${isActive ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
};

export default TopTabs;
