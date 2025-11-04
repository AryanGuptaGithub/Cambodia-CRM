// src/components/common/InputField.jsx
import React from "react";

const InputField = ({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  error,
  disabled = false,
  isTextArea = false, // Changed from multiline
  rows = 1,
  ...props
}) => {
  const handleChange = (e) => {
    if (onChange) {
      // Check if onChange expects (name, value) or event
      if (onChange.length === 2) {
        onChange(name, e.target.value);
      } else {
        onChange(e);
      }
    }
  };

  return (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {isTextArea ? ( // Changed from multiline
        <textarea
          name={name}
          value={value || ""}
          onChange={handleChange}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:border-black-500 ${
            error ? "border-red-500" : "border-gray-300"
          } ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
          {...props}
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value || ""}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2  ${
            error ? "border-red-500" : "border-gray-300"
          } ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
          {...props}
        />
      )}
      
      {error && <span className="text-red-500 text-xs mt-1">{error}</span>}
    </div>
  );
};

export default InputField;