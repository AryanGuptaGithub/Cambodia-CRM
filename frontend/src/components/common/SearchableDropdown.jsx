import React, { useState, useEffect, useMemo, useRef } from "react";

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
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target)
        ) {
          setIsOpen(false);
          setSearchTerm("");
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
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
      <div className="flex flex-col">
        {label && (
          <label className="text-sm font-medium text-gray-700 mb-1">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative w-full" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
            className={`w-full border rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              error ? "border-red-500" : "border-gray-300"
            } ${
              disabled || loading
                ? "bg-gray-100 cursor-not-allowed opacity-60"
                : "bg-white cursor-pointer hover:border-gray-400"
            } ${!value ? "text-gray-500" : "text-gray-900"}`}
          >
            {loading ? (
              <span className="text-gray-500">Loading...</span>
            ) : (
              <span className="truncate">
                {selectedOption ? selectedOption.label : placeholder}
              </span>
            )}
          </button>

          {isOpen && !disabled && !loading && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
              {/* Search Input */}
              <div className="p-2 border-b border-gray-200">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsOpen(false);
                      setSearchTerm("");
                    }
                  }}
                />
              </div>

              {/* Options List */}
              <div className="max-h-48 overflow-y-auto">
                {filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      !option.disabled && handleSelect(option.value)
                    }
                    className={`w-full px-3 py-2 text-left transition-colors duration-150 ${
                      option.disabled
                        ? "text-gray-400 cursor-not-allowed bg-gray-50"
                        : "hover:bg-blue-50 hover:text-blue-900 text-gray-900 cursor-pointer"
                    } ${
                      value === option.value
                        ? "bg-blue-100 text-blue-900 font-medium"
                        : ""
                    }`}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </button>
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