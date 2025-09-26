import React, { useRef, useState } from "react";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_green.css";

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
    setTimeout(() => {
      const calendar = document.querySelector(".flatpickr-calendar");
      const icon = document.getElementById("calendarTrigger");

      if (!calendar || !icon) return;

      const iconRect = icon.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      const calendarWidth = calendar.offsetWidth;
      const windowWidth = window.innerWidth;

      let left = iconRect.left + scrollLeft - calendarWidth;
      if (left < 10) left = 10;
      if (left + calendarWidth > windowWidth) {
        left = windowWidth - calendarWidth - 10;
      }

      const top = iconRect.bottom + scrollTop + 12;

      calendar.style.position = "absolute";
      calendar.style.top = `${top}px`;
      calendar.style.left = `${left}px`;
      calendar.style.right = "auto";

      if (!calendar.querySelector(".custom-footer")) {
        const footer = document.createElement("div");
        footer.className = "custom-footer flex justify-between p-2 border-t border-gray-300 bg-gray-100";

        const btnClasses =
          "px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-200 cursor-pointer";

        const todayBtn = document.createElement("button");
        todayBtn.textContent = "Today";
        todayBtn.className = btnClasses;

        const resetBtn = document.createElement("button");
        resetBtn.textContent = "Reset";
        resetBtn.className = btnClasses;

        todayBtn.onclick = () => {
          const today = new Date();
          pickerRef.current.flatpickr.setDate(today, true);
          setStartDate(today);
          setEndDate(today);
          setIsSelectingStart(false);
          pickerRef.current.flatpickr.close();
        };

        resetBtn.onclick = () => {
          pickerRef.current.flatpickr.clear();
          setStartDate(null);
          setEndDate(null);
          setIsSelectingStart(true);
          pickerRef.current.flatpickr.close();
        };

        footer.appendChild(todayBtn);
        footer.appendChild(resetBtn);
        calendar.appendChild(footer);
      }
    }, 0);
  };

  return (
    <div className="flex justify-end items-center gap-6 px-6 p-1">
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

      {/* Calendar Icon */}
      <div
        id="calendarTrigger"
        onClick={handleIconClick}
        className="text-2xl cursor-pointer select-none mt-2 hover:text-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 rounded"
        role="button"
        tabIndex={0}
        aria-label={isSelectingStart ? "Select Start Date" : "Select End Date"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleIconClick();
          }
        }}
      >
        📅
      </div>

      <Flatpickr
        ref={pickerRef}
        options={{
          mode: "single",
          dateFormat: "d-m-Y",
          clickOpens: false,
          onOpen: positionFlatpickrCalendar,
          onChange: handleDateChange,
        }}
        style={{ opacity: 0, pointerEvents: "none", position: "absolute" }}
      />
    </div>
  );
};

export default PiChartDatePicker;
