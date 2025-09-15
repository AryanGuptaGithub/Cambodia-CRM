import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token) {
    // User is not logged in, redirect to login
    return <Navigate to="/login" replace />;
  }

  return children; // User is logged in, allow access
};

export default ProtectedRoute;
