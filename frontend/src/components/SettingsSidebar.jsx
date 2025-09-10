import React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

function SettingsSidebar({ onClose }) {
  return (
    <div className="bg-gray-800 text-white text-center w-56 flex flex-col shadow-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600">
        <span className="font-bold">Settings</span>
        <button onClick={onClose}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-2">
        <Link to="/settinglayout/companysetting" className="block p-2 hover:bg-gray-700 rounded">
          Company Settings
        </Link>
        <Link to="/settinglayout/profile" className="block p-2 hover:bg-gray-700 rounded">
          Profile
        </Link>
        <Link to="/settinglayout/translation" className="block p-2 hover:bg-gray-700 rounded">
          Translation
        </Link>
        <Link to="/settinglayout/warehouse" className="block p-2 hover:bg-gray-700 rounded">
          Warehouse
        </Link>
        <Link to="/settinglayout/rolepermission" className="block p-2 hover:bg-gray-700 rounded">
          Roles Permission
        </Link>
        <Link to="/settinglayout/taxes" className="block p-2 hover:bg-gray-700 rounded">
          Taxes
        </Link>
        <Link to="/settinglayout/currencies" className="block p-2 hover:bg-gray-700 rounded">
          Currencies
        </Link>
        <Link to="/settinglayout/emailsetting" className="block p-2 hover:bg-gray-700 rounded">
          Email Settings
        </Link>
        <Link to="/settinglayout/payment" className="block p-2 hover:bg-gray-700 rounded">
          Payment Modes
        </Link>
        <Link to="/settinglayout/units" className="block p-2 hover:bg-gray-700 rounded">
          Units
        </Link>
        <Link to="/settinglayout/customfields" className="block p-2 hover:bg-gray-700 rounded">
          Custom Fields
        </Link>
        <Link to="/settinglayout/modules" className="block p-2 hover:bg-gray-700 rounded">
          Modules
        </Link>
        <Link to="/settinglayout/storageseting" className="block p-2 hover:bg-gray-700 rounded">
          Storage Setting
        </Link>
        <Link to="/settinglayout/databasebackup" className="block p-2 hover:bg-gray-700 rounded">
          Database Backup
        </Link>
      </nav>
    </div>
  );
}

export default SettingsSidebar;
