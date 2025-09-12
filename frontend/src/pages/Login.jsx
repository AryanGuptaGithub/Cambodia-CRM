import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }

    const fakeToken = 'pharma_secure_token_123';
    localStorage.setItem('token', fakeToken);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#c9d6ff] via-[#e2e2e2] to-[#fdfbfb]">
      {/* Decorative Blobs */}
      <div className="absolute top-10 left-10 w-40 h-40 bg-cyan-300 opacity-30 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-52 h-52 bg-blue-400 opacity-30 rounded-full blur-2xl animate-pulse" />
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-purple-300 opacity-20 rounded-full blur-3xl animate-pulse" />

      <form
        onSubmit={handleLogin}
        className="fade-in w-full max-w-md p-8 rounded-2xl shadow-2xl bg-white/20 backdrop-blur-md border border-white/30 text-gray-800 relative overflow-hidden"
      >
        {/* Decorative Gradient Layer */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-200/10 via-white/10 to-blue-200/10 rounded-2xl pointer-events-none blur-[3px]" />

        <h2 className="text-3xl font-bold text-center text-cyan-900 mb-6 tracking-wide drop-shadow-sm z-10 relative">
          Nezal HealthCare Portal
        </h2>

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
            setError('');
          }}
          className="w-full px-4 py-3 mb-4 rounded-lg bg-white/30 placeholder-gray-700 text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 backdrop-blur-sm z-10 relative"
        />

        <div className="relative mb-4 z-10">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            className="w-full px-4 py-3 pr-10 rounded-lg bg-white/30 placeholder-gray-700 text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 backdrop-blur-sm"
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
          className="w-full py-3 mt-2 rounded-md bg-gradient-to-r from-cyan-600 to-blue-500 text-white font-semibold shadow-md hover:scale-105 hover:shadow-cyan-500/50 transition-all duration-300 z-10 relative"
        >
          Login
        </button>
      </form>
    </div>
  );
};

export default Login;
