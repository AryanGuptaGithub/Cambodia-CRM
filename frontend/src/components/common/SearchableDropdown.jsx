import React, { useState, useEffect, useMemo } from "react";

const SearchableDropdown = React.memo(
  ({
    value,
    onChange,
    options,
    disabled,
    placeholder = "Select option",
    required = false,
    loading = false,
    error = "",
    label = "",
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = React.useRef(null);
    
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsOpen(false);
          setSearchTerm("");
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = useMemo(() => {
      if (!searchTerm) return options;
      const filtered = options.filter((option) =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return filtered.length > 0
        ? filtered
        : [{ value: "", label: "No options found", disabled: true }];
    }, [options, searchTerm]);

    const selectedOption = options.find((opt) => opt.value === value);

    const handleSelect = (optionValue) => {
      onChange(optionValue);
      setIsOpen(false);
      setSearchTerm("");
    };

    return (
      <div className="flex flex-col w-full">
        {label && (
          <label className="text-sm font-medium text-gray-700 mb-1">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative w-full" ref={dropdownRef}>
          {/* Main dropdown trigger - now looks like a select box */}
          <div
            className={`w-full border rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${error ? "border-red-500" : "border-gray-300"}
              ${disabled || loading
                ? "bg-gray-100 cursor-not-allowed opacity-60"
                : "bg-white cursor-pointer hover:border-gray-400"}
              ${!value ? "text-gray-500" : "text-gray-900"}
              flex items-center justify-between`}
            onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !disabled && !loading) {
                setIsOpen(!isOpen);
                e.preventDefault();
              }
            }}
          >
            {loading ? (
              <span className="text-gray-500">Loading...</span>
            ) : (
              <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
            )}
            {/* Dropdown arrow */}
            <svg 
              className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {isOpen && !disabled && !loading && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
              {/* Search Input */}
              <div className="p-2 border-b border-gray-300">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsOpen(false);
                      setSearchTerm("");
                    }
                  }}
                />
              </div>

              <div className="max-h-48 overflow-y-auto">
                {filteredOptions.map((option) => (
                  <div
                    key={option.value || option._id || option.label}
                    className={`w-full px-3 py-2 text-left transition-colors duration-150 cursor-pointer
                      ${option.disabled
                        ? "text-gray-400 cursor-not-allowed bg-gray-50"
                        : "hover:bg-blue-50 hover:text-blue-900 text-gray-900"}
                      ${value === option.value ? "bg-blue-100 text-blue-900 font-medium" : ""}`}
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !option.disabled) {
                        handleSelect(option.value);
                        e.preventDefault();
                      }
                    }}
                    tabIndex={option.disabled ? -1 : 0}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

export default SearchableDropdown;