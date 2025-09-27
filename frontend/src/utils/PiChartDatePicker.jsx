import React, { useRef, useState, useEffect } from "react";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_green.css";

const formatDate = (date, type) =>
  date?.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) || `Enter ${type} Date`;

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const PiChartDatePicker = ({ setDailySummariesDateWise }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
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

  // Fetch data when both dates are selected
  useEffect(() => {
    if (startDate && endDate) {
      const fetchData = async () => {
        try {
          const response = await fetch(
            `${backendUrl}/api/dailysummary/byDate?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
          );
          const data = await response.json();
          setDailySummariesDateWise(data);
        } catch (error) {
          console.error("API call failed:", error);
        }
      };

      fetchData();
    }
  }, [startDate, endDate]);

  const openCalendar = (e, isStart) => {
    setIsSelectingStart(isStart);
    lastClickedRef.current = e.currentTarget;
    if (pickerRef.current?.flatpickr) {
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
      const windowWidth = window.innerWidth;

      let left = rect.left + scrollLeft - calendarWidth;
      if (left < 10) left = 10;
      if (left + calendarWidth > windowWidth) {
        left = windowWidth - calendarWidth - 10;
      }

      const top = rect.bottom + scrollTop + 12;

      calendar.style.position = "absolute";
      calendar.style.top = `${top}px`;
      calendar.style.left = `${left}px`;
      calendar.style.right = "auto";

      // Inject footer buttons (Today, Reset) only once
      if (!calendar.querySelector(".custom-footer")) {
        const footer = document.createElement("div");
        footer.className =
          "custom-footer flex justify-between p-2 border-t border-gray-300 bg-gray-100";

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
          setStartDate(today);
          setEndDate(today);
          setIsSelectingStart(false);
          pickerRef.current.flatpickr.setDate(today, true);
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

      {/* End Date */}
      <div className="flex flex-col items-start">
        <label className="text-sm font-semibold text-gray-700 mb-1">
          End Date:
        </label>
        <div
          className="w-40 h-10 flex items-center justify-center border border-gray-300 rounded-md shadow-sm
           bg-white text-gray-800 text-sm cursor-pointer hover:border-green-500"
          onClick={(e) => openCalendar(e, false)}
        >
          {formatDate(endDate, "end")}
        </div>
      </div>

      {/* Hidden Flatpickr Calendar */}
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
