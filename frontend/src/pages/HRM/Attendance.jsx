import React, { useState, useEffect } from 'react';

const Attendance = () => {
  const [activeTab, setActiveTab] = useState('add');
  const [loginTime, setLoginTime] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [currentUser, setCurrentUser] = useState('');

  // Load data from localStorage on component mount
  useEffect(() => {
    const savedRecords = localStorage.getItem('attendanceRecords');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedRecords) {
      setAttendanceRecords(JSON.parse(savedRecords));
    }
    if (savedUser) {
      setCurrentUser(savedUser);
    }
  }, []);

  // Save to localStorage whenever records change
  useEffect(() => {
    localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
  }, [attendanceRecords]);

  const handleLogin = () => {
    if (!currentUser.trim()) {
      alert('Please enter your name first');
      return;
    }

    const now = new Date();
    setLoginTime(now);
    
    // Create new attendance record
    const newRecord = {
      id: Date.now(),
      user: currentUser,
      loginTime: now.toLocaleString(),
      logoutTime: null,
      totalTime: null
    };
    
    setAttendanceRecords(prev => [...prev, newRecord]);
    alert(`Login recorded at ${now.toLocaleTimeString()}`);
  };

  const handleLogout = () => {
    if (!loginTime) {
      alert('You are not logged in!');
      return;
    }

    const now = new Date();
    const loginTimestamp = new Date(loginTime);
    const timeDiff = now - loginTimestamp; // in milliseconds
    
    // Convert milliseconds to hours, minutes, seconds
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    const totalTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Update the latest record with logout time and total time
    setAttendanceRecords(prev => {
      const updatedRecords = [...prev];
      const lastRecordIndex = updatedRecords.length - 1;
      
      if (lastRecordIndex >= 0) {
        updatedRecords[lastRecordIndex] = {
          ...updatedRecords[lastRecordIndex],
          logoutTime: now.toLocaleString(),
          totalTime: totalTime
        };
      }
      
      return updatedRecords;
    });

    setLoginTime(null);
    alert(`Logout recorded at ${now.toLocaleTimeString()}\nTotal time: ${totalTime}`);
  };

  const handleUserChange = (e) => {
    setCurrentUser(e.target.value);
    localStorage.setItem('currentUser', e.target.value);
  };

  const clearRecords = () => {
    if (window.confirm('Are you sure you want to clear all attendance records?')) {
      setAttendanceRecords([]);
      localStorage.removeItem('attendanceRecords');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>Attendance System</h1>
      
      {/* User Input */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="userName" style={{ marginRight: '10px' }}>Your Name:</label>
        <input
          id="userName"
          type="text"
          value={currentUser}
          onChange={handleUserChange}
          placeholder="Enter your name"
          style={{ padding: '8px', width: '200px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('add')}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: activeTab === 'add' ? '#007bff' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Add Attendance
        </button>
        <button
          onClick={() => setActiveTab('view')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'view' ? '#007bff' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          View Attendance
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'add' && (
        <div style={{ textAlign: 'center', padding: '20px', border: '1px solid #ddd', borderRadius: '4px' }}>
          <h2>Record Attendance</h2>
          <div style={{ marginBottom: '20px' }}>
            <p>Current Status: <strong>{loginTime ? 'Logged In' : 'Logged Out'}</strong></p>
            {loginTime && (
              <p>Login Time: <strong>{new Date(loginTime).toLocaleString()}</strong></p>
            )}
          </div>
          <div>
            <button
              onClick={handleLogin}
              disabled={!!loginTime}
              style={{
                padding: '10px 20px',
                marginRight: '10px',
                backgroundColor: loginTime ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loginTime ? 'not-allowed' : 'pointer'
              }}
            >
              Login
            </button>
            <button
              onClick={handleLogout}
              disabled={!loginTime}
              style={{
                padding: '10px 20px',
                backgroundColor: !loginTime ? '#6c757d' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: !loginTime ? 'not-allowed' : 'pointer'
              }}
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {activeTab === 'view' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>Attendance Records</h2>
            {attendanceRecords.length > 0 && (
              <button
                onClick={clearRecords}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Clear All Records
              </button>
            )}
          </div>
          
          {attendanceRecords.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666' }}>No attendance records found.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>User</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Login Time</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Logout Time</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Total Time</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.map(record => (
                    <tr key={record.id}>
                      <td style={{ padding: '12px', border: '1px solid #ddd' }}>{record.user}</td>
                      <td style={{ padding: '12px', border: '1px solid #ddd' }}>{record.loginTime}</td>
                      <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                        {record.logoutTime || 'Not logged out yet'}
                      </td>
                      <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                        {record.totalTime || '--:--:--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Attendance;