import React from "react";
import { Search } from "lucide-react";

export const DashboardHeader = ({ 
  searchTerm, 
  onSearchChange, 
  searchInputRef,
  user 
}) => (
  <div className="flex justify-between items-center bg-white shadow-sm border-b border-gray-200 mb-2 px-3 py-3">
    <div>
      <h2 className="text-2xl font-semibold text-gray-800">Business Dashboard</h2>
    </div>

    <div className="flex items-center gap-4">
      <div className="relative w-full md:w-72">
        <Search
          className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
          size={16}
          onClick={() => searchInputRef.current?.focus()}
        />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
        />
      </div>

      <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold">
          {user.initials}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-800">{user.name}</div>
          <div className="text-xs text-gray-600">{user.role}</div>
        </div>
      </div>
    </div>
  </div>
);