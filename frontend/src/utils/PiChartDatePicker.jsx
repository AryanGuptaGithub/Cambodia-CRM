import React, { useRef, useEffect, useState } from "react";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_green.css"; // or any theme

const PiChartDatePicker = () => {
  const [selectedDates, setSelectedDates] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const pickerRef = useRef();
  const iconRef = useRef();

  // Your handler function when date range changes
  const onDateChangeHandler = (dates) => {
    console.log("Selected range:", dates);
    // Do something with the date range
  };

  // Custom positioning & footer logic
  const positionFlatpickrCalendar = (iconElement) => {
    const calendar = document.querySelector(".flatpickr-calendar");
    if (calendar && iconElement) {
      const rect = iconElement.getBoundingClientRect();
      calendar.style.top = `${rect.bottom + window.scrollY}px`;
      calendar.style.left = `${rect.left + window.scrollX}px`;
    }
  };

  const appendFooter = (fpInstance, startDate, endDate) => {
    const calendar = document.querySelector(".flatpickr-calendar");
    if (calendar && !calendar.querySelector(".custom-footer")) {
      const footer = document.createElement("div");
      footer.className = "custom-footer";
      footer.innerHTML = `
        <div style="padding: 10px; text-align: center;">
          <strong>From:</strong> ${startDate?.toLocaleDateString() || "-"} <br/>
          <strong>To:</strong> ${endDate?.toLocaleDateString() || "-"}
        </div>
      `;
      calendar.appendChild(footer);
    }
  };

  return (
    <div>
      <span ref={iconRef}>📅</span>

      <Flatpickr
        ref={pickerRef}
        options={{
          mode: "range",
          dateFormat: "d-m-Y",
          clickOpens: false,
          showMonths: 1,
          monthSelectorType: "dropdown",
          onOpen: () => {
            setTimeout(() => {
              positionFlatpickrCalendar(iconRef.current);
              appendFooter(
                pickerRef.current.flatpickr,
                selectedDates[0],
                selectedDates[1]
              );
            }, 0);
          },
          onChange: (dates) => {
            setSelectedDates(dates);
            if (!isSyncing) {
              onDateChangeHandler(dates);
            }
          }
        }}
      />
    </div>
  );
};

export default PiChartDatePicker;
