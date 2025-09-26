import React, { useRef, useState } from "react";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_green.css";

// Format date to "27 Sept 2025"
const formatDate = (date, type) =>
  date?.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) || `Enter ${type} Date`;

const PiChartDatePicker = () => {
  const pickerRef = useRef(null);
  const [isSelectingStart, setIsSelectingStart] = useState(true);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const handleIconClick = () => {
    if (pickerRef.current?.flatpickr) {
      pickerRef.current.flatpickr.open();
    }
  };

  const handleDateChange = ([selected]) => {
    if (isSelectingStart) {
      setStartDate(selected);
      setIsSelectingStart(false);
    } else {
      setEndDate(selected);
      setIsSelectingStart(true);
    }
  };

  const positionFlatpickrCalendar = () => {
    const calendar = document.querySelector(".flatpickr-calendar");
    const trigger = document.getElementById("calendarTrigger");
    if (calendar && trigger) {
      const rect = trigger.getBoundingClientRect();
      calendar.style.top = `${rect.bottom + window.scrollY}px`;
      calendar.style.left = `${rect.left + window.scrollX}px`;
    }
  };

  return (
    <div className="calendar-date-filter flex justify-end items-center gap-6 px-6 py-2">
      {/* Start Date */}
      <div className="flex flex-col items-start">
        <label
          htmlFor="calendarTrigger"
          className="text-sm font-semibold text-gray-700 mb-1"
        >
          Start Date:
        </label>
        <div
          id="startDateLabel"
          className="w-40 h-10 flex items-center justify-center border border-gray-300 rounded-md shadow-sm bg-white text-gray-800 text-sm"
        >
          {formatDate(startDate, "start")}
        </div>
      </div>

      {/* End Date */}
      <div className="flex flex-col items-start">
        <label
          htmlFor="calendarTrigger"
          className="text-sm font-semibold text-gray-700 mb-1"
        >
          End Date:
        </label>
        <div
          id="endDateLabel"
          className="w-40 h-10 flex items-center justify-center border border-gray-300 rounded-md shadow-sm bg-white text-gray-800 text-sm"
        >
          {formatDate(endDate, "end")}
        </div>
      </div>

      <div
        id="calendarTrigger"
        onClick={handleIconClick}
        className="text-xl cursor-pointer select-none"
        title={isSelectingStart ? "Select Start Date" : "Select End Date"}
      >
        📅
      </div>

      {/* Hidden Flatpickr input */}
      <Flatpickr
        ref={pickerRef}
        options={{
          mode: "single",
          dateFormat: "d-m-Y",
          clickOpens: false,
          onOpen: positionFlatpickrCalendar,
          onChange: handleDateChange,
        }}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
};

export default PiChartDatePicker;
