import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      setError("Username and password are required");
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
        setError(data.message || "Login failed");
        return;
      }

      // Save token + role in localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);

      navigate("/graph");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    }
  };

  //   try {
  //     const response = await axios.post(`${backendUrl}/api/login`, {
  //       username,
  //       password,
  //     });

  //     const { token, role } = response.data;

  //     // Store token and username in localStorage
  //     localStorage.setItem("token", token);
  //     localStorage.setItem("username", username); // Store the username

  //     // Update user state immediately
  //     setUser({
  //       name: username,
  //       role: role,
  //       initials: username.substring(0, 2).toUpperCase(),
  //     });

  //     // Redirect or update state
  //  //   navigate("/dashboard");
  //   } catch (error) {
  //     console.error("Login failed:", error);
  //     showToast("error", "Login failed");
  //   }
  // };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#c9d6ff] via-[#e2e2e2] to-[#fdfbfb]">
      {/* Decorative Blobs */}
      <div className="absolute top-10 left-10 w-80 h-80 bg-cyan-300 opacity-30 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-52 h-52 bg-blue-400 opacity-30 rounded-full blur-2xl animate-pulse" />
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-purple-300 opacity-20 rounded-full blur-3xl animate-pulse" />

      <form
        onSubmit={handleLogin}
        className="fade-in w-full max-w-md p-8 rounded-2xl shadow-2xl bg-white/20 backdrop-blur-md border border-white/30 text-gray-800 relative overflow-hidden"
      >
        {/* Decorative Gradient Layer */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-200/10 via-white/10 to-blue-200/10 rounded-2xl pointer-events-none blur-[3px]" />

        {/* Logo / Image Container */}
        <div className="w-28 h-28 mx-auto mb-6 relative group">
          <img
            src="/mainlogo.png" // replace with your image path
            alt="Nezal HealthCare Logo"
            className="w-full h-full object-cover rounded-2xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
          />
          <div className="absolute inset-0 rounded-full bg-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg"></div>
        </div>

        {error && (
          <p className="text-red-600 text-sm mb-4 text-center font-medium z-10 relative">
            {error}
          </p>
        )}

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError("");
          }}
          className="w-full px-4 py-3 mb-4 rounded-lg bg-white/30 placeholder-gray-700 text-gray-900
   focus:outline-none focus:ring-4 focus:ring-cyan-400 focus:ring-opacity-75 shadow-[0_0_10px_2px_rgba(0,255,255,0.1)]
   transition-shadow duration-300"
        />

        <div className="relative mb-4 z-10">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            className="w-full px-4 py-3 mb-4 rounded-lg bg-white/30 placeholder-gray-700 text-gray-900
   focus:outline-none focus:ring-4 focus:ring-cyan-400 focus:ring-opacity-75 shadow-[0_0_10px_2px_rgba(0,255,255,0.1)]
   transition-shadow duration-300"
          />
          <span
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-700 cursor-pointer hover:text-cyan-600 transition"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </span>
        </div>

        <button
          type="submit"
          className="w-full py-3 mt-2 rounded-md bg-gradient-to-r from-cyan-600 to-blue-500 text-white font-semibold
    shadow-[0_8px_24px_4px_rgba(34,197,255,0.18)] border-2 border-cyan-400
    transition-transform  duration-300
    hover:scale-105 hover:shadow-[0_0_40px_5px_rgba(34,197,255,0.4),0_8px_24px_4px_rgba(34,197,255,0.18)]
    focus:outline-none focus:ring-4 focus:ring-cyan-300
    active:scale-95"
        >
          Login
        </button>
      </form>
    </div>
  );
};

export default Login;
