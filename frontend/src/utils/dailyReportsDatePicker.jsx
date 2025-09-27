import React, { useRef, useState } from "react";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_green.css";

const formatDate = (date, type) =>
  date
    ? date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : `Enter ${type} Date`;

const DailyPiChartDatePicker = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  
}) => {
  const [isSelectingStart, setIsSelectingStart] = useState(true);
  const pickerRef = useRef(null);
  const lastClickedRef = useRef(null);

  const handleDateChange = ([selected]) => {
    if (isSelectingStart) {
      setStartDate(selected);
      setIsSelectingStart(false);
    } else {
      setEndDate(selected);
      setIsSelectingStart(true);
    }
  };

  const openCalendar = (e, isStart) => {
    setIsSelectingStart(isStart);
    lastClickedRef.current = e.currentTarget;
    if (pickerRef.current?.flatpickr) {
      pickerRef.current.flatpickr.setDate(isStart ? startDate : endDate, false);
      pickerRef.current.flatpickr.open();
    }
  };

  const positionFlatpickrCalendar = () => {
    setTimeout(() => {
      const calendar = document.querySelector(".flatpickr-calendar");
      const target = lastClickedRef.current;

      if (!calendar || !target) return;

      const rect = target.getBoundingClientRect();
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft =
        window.pageXOffset || document.documentElement.scrollLeft;
      const calendarWidth = calendar.offsetWidth;

      let left = rect.left + scrollLeft - calendarWidth;
      const top = rect.bottom + scrollTop;

      calendar.style.position = "absolute";
      calendar.style.top = `${top}px`;
      calendar.style.left = `${left}px`;
      calendar.style.right = "auto";

      if (!calendar.querySelector(".custom-footer")) {
        const footer = document.createElement("div");
        footer.className =
          "custom-footer flex justify-between p-2 border-t border-gray-300 bg-gray-100";
        const btnClasses =
          "px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-200 cursor-pointer";

        const todayBtn = document.createElement("button");
        todayBtn.textContent = "Today";
        todayBtn.className = btnClasses;
        todayBtn.onclick = () => {
          const today = new Date();
          setStartDate(today);
          setEndDate(today);
          setIsSelectingStart(false);
          pickerRef.current.flatpickr.setDate(today, true);
          pickerRef.current.flatpickr.close();
        };

        const resetBtn = document.createElement("button");
        resetBtn.textContent = "Reset";
        resetBtn.className = btnClasses;
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
    <div className="flex justify-end items-center gap-6 p-1">
      <div className="flex flex-col items-start">
        <label className="text-sm font-semibold text-gray-700 mb-1">
          Start Date:
        </label>
        <div
          className="w-40 h-10 flex items-center justify-center border border-gray-300 rounded-md shadow-sm bg-white text-gray-800 text-sm cursor-pointer hover:border-green-500"
          onClick={(e) => openCalendar(e, true)}
        >
          {formatDate(startDate, "start")}
        </div>
      </div>

      <div className="flex flex-col items-start">
        <label className="text-sm font-semibold text-gray-700 mb-1">
          End Date:
        </label>
        <div
          className="w-40 h-10 flex items-center justify-center border border-gray-300 rounded-md shadow-sm bg-white text-gray-800 text-sm cursor-pointer hover:border-green-500"
          onClick={(e) => openCalendar(e, false)}
        >
          {formatDate(endDate, "end")}
        </div>
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

export default DailyPiChartDatePicker;
