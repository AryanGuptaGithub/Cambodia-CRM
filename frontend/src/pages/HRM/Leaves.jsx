import React, { useState, useEffect } from 'react';

const Leaves = () => {
  const [leaves, setLeaves] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [showHolidayList, setShowHolidayList] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Load leaves from localStorage on component mount
  useEffect(() => {
    const savedLeaves = localStorage.getItem('leavesData');
    if (savedLeaves) {
      setLeaves(JSON.parse(savedLeaves));
    }
  }, []);

  // Save leaves to localStorage whenever leaves change
  useEffect(() => {
    localStorage.setItem('leavesData', JSON.stringify(leaves));
  }, [leaves]);

  // Add a new leave
  const addLeave = () => {
    if (selectedDate) {
      const date = new Date(selectedDate);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      
      // Check if it's not Sunday and not already added
      if (dayName !== 'Sunday' && !leaves.includes(selectedDate)) {
        setLeaves([...leaves, selectedDate]);
      }
      setSelectedDate('');
    }
  };

  // Remove a leave
  const removeLeave = (leaveToRemove) => {
    setLeaves(leaves.filter(leave => leave !== leaveToRemove));
  };

  // Check if a date is Sunday
  const isSunday = (date) => {
    return date.getDay() === 0;
  };

  // Check if a date is a leave (either Sunday or added leave)
  const isLeave = (date) => {
    const dateString = date.toISOString().split('T')[0];
    return isSunday(date) || leaves.includes(dateString);
  };

  // Get all days in current month
  const getDaysInMonth = () => {
    const days = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    
    // Add empty cells for days before the first day of month
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(currentYear, currentMonth, i));
    }
    
    return days;
  };

  // Navigate to previous month
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  // Navigate to next month
  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Get leave name for display in holiday list
  const getLeaveName = (dateString) => {
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `Leave on ${date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })} (${dayName})`;
  };

  const days = getDaysInMonth();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div style={{ 
      padding: '24px', 
      maxWidth: '1200px', 
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header with Add Leave and List of Holiday button */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              outline: 'none',
              fontSize: '14px'
            }}
          />
          <button
            onClick={addLeave}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#2563eb'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#3b82f6'}
          >
            Add Leave
          </button>
        </div>
        
        <button
          onClick={() => setShowHolidayList(!showHolidayList)}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#10b981'}
        >
          {showHolidayList ? 'Show Calendar' : 'List Of Holiday'}
        </button>
      </div>

      {showHolidayList ? (
        /* Holiday List View */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          padding: '24px'
        }}>
          <h2 style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            marginBottom: '16px', 
            color: '#1f2937' 
          }}>
            List of Holidays & Leaves
          </h2>
          {leaves.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No leaves added yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {leaves.map((leave, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px'
                  }}
                >
                  <span style={{ color: '#dc2626', fontWeight: '500' }}>
                    {getLeaveName(leave)}
                  </span>
                  <button
                    onClick={() => removeLeave(leave)}
                    style={{
                      backgroundColor: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Calendar View */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          padding: '24px'
        }}>
          {/* Calendar Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '24px' 
          }}>
            <button
              onClick={prevMonth}
              style={{
                backgroundColor: '#e5e7eb',
                padding: '8px 12px',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#d1d5db'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#e5e7eb'}
            >
              &larr;
            </button>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 'bold', 
              color: '#1f2937' 
            }}>
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <button
              onClick={nextMonth}
              style={{
                backgroundColor: '#e5e7eb',
                padding: '8px 12px',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#d1d5db'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#e5e7eb'}
            >
              &rarr;
            </button>
          </div>

          {/* Calendar Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '8px'
          }}>
            {/* Weekday Headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                style={{
                  textAlign: 'center',
                  fontWeight: '600',
                  padding: '8px 0',
                  color: day === 'Sun' ? '#dc2626' : '#374151'
                }}
              >
                {day}
              </div>
            ))}

            {/* Calendar Days */}
            {days.map((date, index) => {
              if (date === null) {
                return <div key={`empty-${index}`} style={{ height: '48px' }} />;
              }

              const isLeaveDay = isLeave(date);
              const isCurrentMonth = date.getMonth() === currentMonth;
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <div
                  key={date.toISOString()}
                  style={{
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: isToday && !isLeaveDay ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                    backgroundColor: isLeaveDay ? '#ef4444' : '#f9fafb',
                    color: isLeaveDay ? 'white' : '#374151',
                    opacity: !isCurrentMonth ? 0.4 : 1,
                    cursor: !isLeaveDay ? 'pointer' : 'default'
                  }}
                  onMouseOver={!isLeaveDay ? (e) => e.target.style.backgroundColor = '#f3f4f6' : undefined}
                  onMouseOut={!isLeaveDay ? (e) => e.target.style.backgroundColor = '#f9fafb' : undefined}
                >
                  {date.getDate()}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '16px', fontSize: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                backgroundColor: '#ef4444', 
                borderRadius: '4px' 
              }}></div>
              <span>Leave Day</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                backgroundColor: '#f9fafb', 
                border: '1px solid #e5e7eb',
                borderRadius: '4px' 
              }}></div>
              <span>Working Day</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                backgroundColor: '#3b82f6', 
                border: '2px solid #3b82f6',
                borderRadius: '4px' 
              }}></div>
              <span>Today</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leaves;