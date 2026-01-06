import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); // Add loading state
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!username || !password) {
      setError("Username and password are required");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // More specific error handling
        if (res.status === 403) {
          setError("Access denied. Admin users only.");
        } else if (res.status === 401) {
          setError("Invalid username or password");
        } else {
          setError(data.message || "Login failed");
        }
        setLoading(false);
        return;
      }

      // ✅ Save auth data in localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username || data.name);
      localStorage.setItem("isAdmin", data.isAdmin || data.role === "admin");

      // Optional: Save timestamp for token expiry check
      localStorage.setItem("loginTime", new Date().toISOString());

      // Navigate to graph page
      navigate("/graph");
    } catch (err) {
      setError("Network error. Please check your connection.");
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#c9d6ff] via-[#e2e2e2] to-[#fdfbfb]">
      {/* Decorative Blobs */}
      <div className="absolute top-10 left-10 w-80 h-80 bg-cyan-300 opacity-30 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-52 h-52 bg-blue-400 opacity-30 rounded-full blur-2xl" />
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-purple-300 opacity-20 rounded-full blur-3xl" />

      <form
        onSubmit={handleLogin}
        className="w-full max-w-md p-8 rounded-2xl shadow-2xl bg-white/20 backdrop-blur-md border border-white/30 text-gray-800 relative overflow-hidden"
      >
        {/* Logo */}
        <div className="w-28 h-28 mx-auto mb-6 relative">
          <img
            src="/mainlogo.png"
            alt="Nezal HealthCare Logo"
            className="w-full h-full object-cover rounded-2xl shadow-lg"
          />
        </div>

        {/* Title Section */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Admin Login
          </h2>
          <p className="text-xs text-gray-600 mb-1">
            Only administrator accounts can access this portal
          </p>
          <p className="text-xs text-gray-500 italic">
            Demo: admin@example.com / 123456
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm text-center font-medium">
              ⚠️ {error}
            </p>
          </div>
        )}

        {/* Username Field */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Username or Email"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
            }}
            className="w-full px-4 py-3 rounded-lg bg-white/70 placeholder-gray-500 text-gray-900
              focus:outline-none focus:ring-2 focus:ring-cyan-400 border border-gray-300
              transition-all duration-200"
            autoComplete="username"
            disabled={loading}
          />
        </div>

        {/* Password Field */}
        <div className="mb-6">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            className="w-full px-4 py-3 rounded-lg bg-white/70 placeholder-gray-500 text-gray-900
              focus:outline-none focus:ring-2 focus:ring-cyan-400 border border-gray-300
              transition-all duration-200"
            autoComplete="current-password"
            disabled={loading}
          />
        </div>

        {/* Login Button */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 mt-2 rounded-md text-white font-semibold
            border border-cyan-500 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2
            active:scale-[0.98] ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          style={{
            background: loading 
              ? 'linear-gradient(to right, #9ca3af, #6b7280)'
              : 'linear-gradient(to right, #0891b2, #3b82f6)'
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Authenticating...
            </div>
          ) : (
            'Login as Admin'
          )}
        </button>

        {/* Admin Only Notice */}
        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700 text-center">
            <span className="font-semibold">Note:</span> This portal is restricted to administrator accounts only. 
            Contact system administrator for access.
          </p>
        </div>
      </form>
    </div>
  );
};

export default Login;