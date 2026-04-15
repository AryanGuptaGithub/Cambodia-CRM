import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Mouse position state - MOVED TO TOP (This was the main bug)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const [floatingElements, setFloatingElements] = useState([]);
  const [capsuleElements, setCapsuleElements] = useState([]);
  const [crossElements, setCrossElements] = useState([]);

  const targetPositionRef = useRef({ x: 0, y: 0 });
  const currentPositionRef = useRef({ x: 0, y: 0 });
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const medicineIcons = [
    "fa-pills", "fa-syringe", "fa-stethoscope", "fa-flask", "fa-capsules",
    "fa-prescription-bottle", "fa-heartbeat", "fa-dna", "fa-hospital",
    "fa-first-aid", "fa-thermometer", "fa-microscope",
  ];

  // ====================== GOOGLE ANTIGRAVITY MOUSE TRACKING ======================
  useEffect(() => {
    let rafId = null;

    const handleMouseMove = (e) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      const targetX = (e.clientX - centerX) / centerX; // -1 to 1
      const targetY = (e.clientY - centerY) / centerY;

      targetPositionRef.current = { x: targetX, y: targetY };
    };

    const animate = () => {
      // Smooth inertia / antigravity feel
      currentPositionRef.current.x +=
        (targetPositionRef.current.x - currentPositionRef.current.x) * 0.085;
      currentPositionRef.current.y +=
        (targetPositionRef.current.y - currentPositionRef.current.y) * 0.085;

      setMousePosition({
        x: currentPositionRef.current.x,
        y: currentPositionRef.current.y,
      });

      rafId = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // ====================== CREATE FLOATING ELEMENTS ======================
  useEffect(() => {
    // Font Awesome
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
    document.head.appendChild(link);

    // Floating Medicine Icons
    const elements = [];
    for (let i = 0; i < 60; i++) {
      elements.push({
        id: i,
        icon: medicineIcons[Math.floor(Math.random() * medicineIcons.length)],
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 18 + Math.random() * 35,
        opacity: 0.4 + Math.random() * 0.5,
        rotation: Math.random() * 360,
        color: `hsl(${190 + Math.random() * 60}, 75%, 55%)`,
        depth: 0.3 + Math.random() * 1.3,
      });
    }
    setFloatingElements(elements);

    // Floating Capsules
    const capsules = [];
    for (let i = 0; i < 40; i++) {
      capsules.push({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        rotation: Math.random() * 360,
        width: 12 + Math.random() * 28,
        height: 6 + Math.random() * 12,
        color1: `hsl(${Math.random() * 60 + 180}, 75%, 55%)`,
        color2: `hsl(${Math.random() * 60 + 180}, 75%, 40%)`,
        depth: 0.4 + Math.random() * 1.1,
      });
    }
    setCapsuleElements(capsules);

    // Floating Crosses
    const crosses = [];
    for (let i = 0; i < 30; i++) {
      crosses.push({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        depth: 0.5 + Math.random() * 0.9,
      });
    }
    setCrossElements(crosses);
  }, []);

  // Antigravity Position Calculator
  const getAntigravityPosition = (baseLeft, baseTop, depth, intensity = 80) => {
    const offsetX = mousePosition.x * intensity * depth;
    const offsetY = mousePosition.y * intensity * depth;

    return {
      left: `calc(${baseLeft}% + ${offsetX}px)`,
      top: `calc(${baseTop}% + ${offsetY}px)`,
      transform: `scale(${1 + Math.abs(mousePosition.x) * 0.06 * depth})`,
    };
  };

  // ====================== LOGIN HANDLER ======================
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
        if (res.status === 403) {
          setError(data.message || "Access denied. Admin or SuperAdmin only.");
        } else if (res.status === 401) {
          setError("Invalid username or password");
        } else {
          setError(data.message || "Login failed");
        }
        setLoading(false);
        return;
      }

      // Store auth data
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("email", data.email);
      localStorage.setItem("username", data.email || data.name || "User");
      localStorage.setItem("isAdmin", "true");
      localStorage.setItem("loginTime", new Date().toISOString());

      navigate("/");
    } catch (err) {
      console.error("Login error:", err);
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #c9d6ff 0%, #e2e2e2 50%, #fdfbfb 100%)",
        cursor: "default",
      }}
    >
      {/* Floating Medicine Icons */}
      {floatingElements.map((element) => {
        const pos = getAntigravityPosition(element.left, element.top, element.depth, 95);
        return (
          <div
            key={element.id}
            className="absolute pointer-events-none select-none z-0"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.transform,
              willChange: "transform, left, top",
            }}
          >
            <i
              className={`fa-solid ${element.icon}`}
              style={{
                fontSize: `${element.size}px`,
                color: element.color,
                opacity: element.opacity,
                transform: `rotate(${element.rotation}deg)`,
                filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.2))",
              }}
            />
          </div>
        );
      })}

      {/* Floating Capsules */}
      {capsuleElements.map((capsule) => {
        const pos = getAntigravityPosition(capsule.left, capsule.top, capsule.depth, 70);
        return (
          <div
            key={`capsule-${capsule.id}`}
            className="absolute pointer-events-none select-none z-0"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.transform,
              willChange: "transform, left, top",
            }}
          >
            <div
              className="rounded-full"
              style={{
                width: `${capsule.width}px`,
                height: `${capsule.height}px`,
                background: `linear-gradient(135deg, ${capsule.color1}, ${capsule.color2})`,
                transform: `rotate(${capsule.rotation}deg)`,
                boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                opacity: 0.85,
              }}
            />
          </div>
        );
      })}

      {/* Floating Medical Crosses */}
      {crossElements.map((cross) => {
        const pos = getAntigravityPosition(cross.left, cross.top, cross.depth, 55);
        return (
          <div
            key={`cross-${cross.id}`}
            className="absolute pointer-events-none select-none z-0"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.transform,
              willChange: "transform, left, top",
            }}
          >
            <div className="relative" style={{ width: 28, height: 28, opacity: 0.75 }}>
              <div
                style={{
                  position: "absolute",
                  width: 28,
                  height: 8,
                  background: "#ef4444",
                  borderRadius: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  boxShadow: "0 2px 8px rgba(239,68,68,0.4)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: 8,
                  height: 28,
                  background: "#ef4444",
                  borderRadius: 4,
                  left: "50%",
                  transform: "translateX(-50%)",
                  boxShadow: "0 2px 8px rgba(239,68,68,0.4)",
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Background Blobs with Antigravity */}
      <div
        className="absolute top-10 left-10 rounded-full"
        style={{
          width: 400,
          height: 400,
          background: "rgba(103, 232, 249, 0.18)",
          filter: "blur(70px)",
          transform: `translate(${mousePosition.x * 18}px, ${mousePosition.y * 18}px)`,
          transition: "transform 0.12s cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
      <div
        className="absolute bottom-20 right-10 rounded-full"
        style={{
          width: 340,
          height: 340,
          background: "rgba(96, 165, 250, 0.16)",
          filter: "blur(65px)",
          transform: `translate(${mousePosition.x * -22}px, ${mousePosition.y * -22}px)`,
          transition: "transform 0.12s cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />

      {/* Login Form */}
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md p-8 rounded-3xl relative z-10"
        style={{
          background: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 30px 70px rgba(0, 0, 0, 0.16), 0 10px 25px rgba(0, 0, 0, 0.08)",
          border: "1px solid rgba(255,255,255,0.9)",
          transform: `perspective(1200px) rotateX(${mousePosition.y * 3}deg) rotateY(${mousePosition.x * 3}deg)`,
          transition: "transform 0.15s cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        {/* Logo */}
        <div className="w-28 h-28 mx-auto mb-6 relative">
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #22d3ee, #3b82f6)",
              opacity: 0.35,
              filter: "blur(18px)",
              transform: `translate(${mousePosition.x * 12}px, ${mousePosition.y * 12}px)`,
            }}
          />
          <img
            src="/mainlogo.png"
            alt="Nezal HealthCare Logo"
            className="w-full h-full object-cover rounded-2xl relative z-10"
            style={{
              transform: `translate(${mousePosition.x * -6}px, ${mousePosition.y * -6}px)`,
            }}
          />
        </div>

        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-2 bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
            Admin Login
          </h2>
          <p className="text-gray-500 text-sm">Restricted to Admin & SuperAdmin only</p>
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm text-center">
            ⚠️ {error}
          </div>
        )}

        {/* Username */}
        <div className="mb-5">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <i className="fa-solid fa-user" />
            </span>
            <input
              type="text"
              placeholder="Username or Email"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              disabled={loading}
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-300 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all bg-gray-50 focus:bg-white"
            />
          </div>
        </div>

        {/* Password */}
        <div className="mb-6">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <i className="fa-solid fa-lock" />
            </span>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              disabled={loading}
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-300 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all bg-gray-50 focus:bg-white"
            />
          </div>
        </div>

        {/* Login Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-semibold text-lg relative overflow-hidden transition-all active:scale-95"
          style={{
            background: loading
              ? "linear-gradient(135deg, #9ca3af, #6b7280)"
              : "linear-gradient(135deg, #0891b2, #3b82f6)",
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Authenticating...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-3">
              <i className="fa-solid fa-right-to-bracket" />
              Login to Dashboard
            </span>
          )}
        </button>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
          <p className="text-xs text-blue-700 text-center">
            <i className="fa-solid fa-shield-halved mr-2" />
            Secure Access — Admin & SuperAdmin Only
          </p>
        </div>
      </form>

      {/* Performance Styles */}
      <style jsx>{`
        .absolute {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
      `}</style>
    </div>
  );
};

export default Login;