import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react"; // Make sure lucide-react is installed

const CustomDropdown = ({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select Product",
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2
           focus:ring-indigo-500 disabled:bg-gray-100 flex justify-between items-center ${
             disabled
               ? "cursor-not-allowed opacity-60"
               : "cursor-pointer hover:border-gray-400"
           } ${!value ? "text-gray-500" : "text-gray-900"}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {!disabled && (
          <span className="text-gray-400 flex-shrink-0 ml-2">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">
              No options available
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setIsOpen(false);
                  }
                }}
                className={`w-full px-3 py-2 text-left hover:bg-indigo-50 hover:text-indigo-900 transition-colors duration-150 ${
                  value === option.value
                    ? "bg-indigo-100 text-indigo-900 font-medium"
                    : "text-gray-900"
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={option.disabled}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
