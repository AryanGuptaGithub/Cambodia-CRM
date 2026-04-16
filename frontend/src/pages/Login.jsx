import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const medicineImages = [
  "/categories/pill.png",
  "/categories/syringe.png",
  "/categories/stethoscope.png",
  "/categories/flask.png",
  "/categories/heartbeat.png",
  "/categories/dna.png",
  "/categories/hospital.png",
  "/categories/thermometer.png",
  "/categories/microscope.png",
  "/categories/capsule.png",
  "/categories/first-aid-kit.png",
  "/categories/prescription.png",
];

const generateNonOverlappingElements = (count, windowWidth, windowHeight) => {
  const isMobile = windowWidth < 640;
  const minSize = isMobile ? 14 : 18;
  const maxSize = isMobile ? 24 : 32;

  const aspect = windowWidth / windowHeight;
  const cols = Math.ceil(Math.sqrt(count * (aspect > 1 ? 1.2 : 0.8)));
  const rows = Math.ceil(count / cols);

  const elements = [];
  const cellWidthPct = 100 / cols;
  const cellHeightPct = 100 / rows;
  const maxSizePct = Math.min(cellWidthPct, cellHeightPct) * 0.65;

  const grid = Array(rows)
    .fill()
    .map(() => Array(cols).fill(null));

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const forbiddenImages = new Set();
    if (col > 0 && grid[row][col - 1]) forbiddenImages.add(grid[row][col - 1]);
    if (row > 0 && grid[row - 1][col]) forbiddenImages.add(grid[row - 1][col]);

    let availableImages = medicineImages.filter(
      (img) => !forbiddenImages.has(img),
    );
    if (availableImages.length === 0) availableImages = [...medicineImages];

    const selectedImage =
      availableImages[Math.floor(Math.random() * availableImages.length)];
    grid[row][col] = selectedImage;

    const offsetXRatio = 0.2 + Math.random() * 0.6;
    const offsetYRatio = 0.2 + Math.random() * 0.6;

    let leftPct = col * cellWidthPct + offsetXRatio * cellWidthPct;
    let topPct = row * cellHeightPct + offsetYRatio * cellHeightPct;
    leftPct = Math.min(Math.max(leftPct, 0.5), 99.5);
    topPct = Math.min(Math.max(topPct, 0.5), 99.5);

    const size = Math.min(
      minSize + Math.random() * (maxSize - minSize),
      (maxSizePct * windowWidth) / 100,
    );

    elements.push({
      id: i,
      image: selectedImage,
      left: leftPct,
      top: topPct,
      size: 30,
      opacity: 0.9 + Math.random() * 0.3,
      rotation: Math.random() * 360,
      depth: 0.3 + Math.random() * 1.2,
    });
  }

  return elements;
};

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [floatingElements, setFloatingElements] = useState([]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);

  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const getResponsiveCounts = () => {
    const width = window.innerWidth;
    if (width < 640) return 18;
    if (width < 1024) return 28;
    return 42;
  };

  // PWA Installation Handler
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    const hasDismissedInstall =
      localStorage.getItem("dismissedInstall") === "true";

    if (!isStandalone && !hasDismissedInstall) {
      const handleBeforeInstallPrompt = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setTimeout(() => setShowInstallPrompt(true), 2000);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener(
          "beforeinstallprompt",
          handleBeforeInstallPrompt,
        );
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setShowInstallPrompt(false);

    if (outcome === "dismissed") {
      localStorage.setItem("dismissedInstall", "true");
    }
  };

  const handleDismissInstall = () => {
    setShowInstallPrompt(false);
    localStorage.setItem("dismissedInstall", "true");
  };

  // Mouse/Touch Tracking
  useEffect(() => {
    const handleMove = (clientX, clientY) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      targetRef.current = {
        x: (clientX - cx) / cx,
        y: (clientY - cy) / cy,
      };
    };

    const handleMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const animate = () => {
      currentRef.current.x +=
        (targetRef.current.x - currentRef.current.x) * 0.085;
      currentRef.current.y +=
        (targetRef.current.y - currentRef.current.y) * 0.085;

      const { x, y } = currentRef.current;

      document.querySelectorAll("[data-float]").forEach((el) => {
        const depth = parseFloat(el.dataset.depth);
        const baseLeft = parseFloat(el.dataset.left);
        const baseTop = parseFloat(el.dataset.top);
        const intensity = parseFloat(el.dataset.intensity || 80);
        const ox = x * intensity * depth;
        const oy = y * intensity * depth;
        el.style.left = `calc(${baseLeft}% + ${ox}px)`;
        el.style.top = `calc(${baseTop}% + ${oy}px)`;
      });

      const blob1 = document.getElementById("blob1");
      const blob2 = document.getElementById("blob2");
      const card = document.getElementById("login-card");
      const logo = document.getElementById("logo-img");

      const isMobile = window.innerWidth < 640;
      const moveFactor = isMobile ? 0.6 : 1;

      if (blob1)
        blob1.style.transform = `translate(${x * 18 * moveFactor}px, ${y * 18 * moveFactor}px)`;
      if (blob2)
        blob2.style.transform = `translate(${x * -22 * moveFactor}px, ${y * -22 * moveFactor}px)`;
      if (card)
        card.style.transform = `perspective(800px) rotateX(${y * 2.5 * moveFactor}deg) rotateY(${x * 2.5 * moveFactor}deg)`;
      if (logo)
        logo.style.transform = `translate(${x * -3 * moveFactor}px, ${y * -3 * moveFactor}px)`;

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Floating Elements
  const refreshFloatingElements = () => {
    const count = getResponsiveCounts();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const elements = generateNonOverlappingElements(count, width, height);
    setFloatingElements(elements);
  };

  useEffect(() => {
    refreshFloatingElements();
    const handleResize = () => refreshFloatingElements();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Login Handler
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
        if (res.status === 403)
          setError(data.message || "Access denied. Admin or SuperAdmin only.");
        else if (res.status === 401) setError("Invalid username or password");
        else setError(data.message || "Login failed");
        setLoading(false);
        return;
      }

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
        background:
          "linear-gradient(135deg, #c9d6ff 0%, #e2e2e2 50%, #fdfbfb 100%)",
      }}
    >
      {/* Install Prompt */}
      {showInstallPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
          <div className="bg-white rounded-2xl shadow-2xl p-4 border border-gray-200">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-mobile-screen-button text-white text-xl"></i>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 text-sm sm:text-base">
                  Install App
                </h3>
                <p className="text-gray-600 text-xs sm:text-sm mt-1">
                  Install this app on your device for faster access
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstallClick}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg text-sm font-medium"
                  >
                    Install
                  </button>
                  <button
                    onClick={handleDismissInstall}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
                  >
                    Maybe Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Elements */}
      {floatingElements.map((el) => (
        <div
          key={el.id}
          className="absolute pointer-events-none select-none z-0"
          data-float="true"
          data-depth={el.depth}
          data-left={el.left}
          data-top={el.top}
          data-intensity="95"
          style={{
            left: `${el.left}%`,
            top: `${el.top}%`,
            willChange: "left, top",
          }}
        >
          <img
            src={el.image}
            alt="medicine icon"
            style={{
              width: `${el.size}px`,
              height: `${el.size}px`,
              opacity: el.opacity,
              transform: `rotate(${el.rotation}deg)`,
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.15))",
              objectFit: "contain",
            }}
            loading="lazy"
          />
        </div>
      ))}

      {/* Blobs */}
      <div
        id="blob1"
        className="absolute top-10 left-10 rounded-full pointer-events-none"
        style={{
          width: window.innerWidth < 640 ? 200 : 400,
          height: window.innerWidth < 640 ? 200 : 400,
          background: "rgba(103, 232, 249, 0.15)",
          filter: "blur(60px)",
          willChange: "transform",
        }}
      />
      <div
        id="blob2"
        className="absolute bottom-20 right-10 rounded-full pointer-events-none"
        style={{
          width: window.innerWidth < 640 ? 180 : 340,
          height: window.innerWidth < 640 ? 180 : 340,
          background: "rgba(96, 165, 250, 0.14)",
          filter: "blur(55px)",
          willChange: "transform",
        }}
      />

      {/* Login Card */}
      <form
        id="login-card"
        onSubmit={handleLogin}
        className="w-full max-w-md p-5 sm:p-8 rounded-2xl sm:rounded-3xl relative z-10 mx-4 sm:mx-0"
        style={{
          background: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(12px)",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06)",
          border: "1px solid rgba(255,255,255,0.9)",
          willChange: "transform",
        }}
      >
        <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-5 relative">
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              background: "linear-gradient(135deg, #22d3ee, #3b82f6)",
              opacity: 0.35,
              filter: "blur(10px)",
            }}
          />
          <img
            id="logo-img"
            src="/mainlogo.png"
            alt="logo"
            className="w-full h-full object-cover rounded-xl relative z-10"
            loading="eager"
          />
        </div>

        <div className="text-center mb-5 sm:mb-7">
          <h2 className="text-xl sm:text-3xl font-bold mb-1 bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
            Admin Login
          </h2>
          <p className="text-gray-500 text-[10px] sm:text-sm">
            Restricted to Admin &amp; SuperAdmin only
          </p>
        </div>

        {error && (
          <div className="mb-4 sm:mb-5 p-2.5 sm:p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm text-center">
            ⚠️ {error}
          </div>
        )}

        <div className="mb-4 sm:mb-5">
          <div className="relative">
            <span className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs sm:text-base">
              <i className="fa-solid fa-user" />
            </span>
            <input
              type="text"
              placeholder="Username or Email"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              disabled={loading}
              className="w-full pl-8 sm:pl-11 pr-3 sm:pr-4 py-2.5 sm:py-3.5 rounded-xl border border-gray-300 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all bg-gray-50 focus:bg-white outline-none text-xs sm:text-base"
            />
          </div>
        </div>

        <div className="mb-5 sm:mb-6">
          <div className="relative">
            <span className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs sm:text-base">
              <i className="fa-solid fa-lock" />
            </span>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              disabled={loading}
              className="w-full pl-8 sm:pl-11 pr-3 sm:pr-4 py-2.5 sm:py-3.5 rounded-xl border border-gray-300 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition-all bg-gray-50 focus:bg-white outline-none text-xs sm:text-base"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl text-white font-semibold text-sm sm:text-lg transition-all active:scale-95"
          style={{
            background: loading
              ? "linear-gradient(135deg, #9ca3af, #6b7280)"
              : "linear-gradient(135deg, #0891b2, #3b82f6)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2 sm:gap-3">
              <svg
                className="animate-spin h-3.5 w-3.5 sm:h-5 sm:w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Authenticating...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2 sm:gap-3">
              <i className="fa-solid fa-right-to-bracket text-xs sm:text-base" />{" "}
              Login to Dashboard
            </span>
          )}
        </button>

        <div className="mt-5 sm:mt-6 p-2.5 sm:p-4 bg-blue-50 border border-blue-100 rounded-xl sm:rounded-2xl">
          <p className="text-[10px] sm:text-xs text-blue-700 text-center">
            <i className="fa-solid fa-shield-halved mr-1 sm:mr-2" /> Secure
            Access — Admin &amp; SuperAdmin Only
          </p>
        </div>
      </form>
    </div>
  );
};

export default Login;
