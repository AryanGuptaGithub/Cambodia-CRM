import React, { useState, useEffect } from "react";
import { Modal, Button, Space } from "antd";
import { DownloadOutlined, CloseOutlined } from "@ant-design/icons";
import { toast } from "react-toastify";

const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // If already installed as standalone, do nothing
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    // If user already dismissed, do nothing
    if (localStorage.getItem("pwaDismissed")) return;

    const handler = (e) => {
      e.preventDefault(); // Stop Chrome's mini-infobar
      setDeferredPrompt(e);
      // Show our custom modal after a short delay
      setTimeout(() => setShowModal(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setShowModal(false);
      setDeferredPrompt(null);
      toast.success("✅ App installed successfully!");
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      toast.success("Installing app...");
    } else {
      toast.info("Installation cancelled");
    }
    setDeferredPrompt(null);
    setShowModal(false);
  };

  const handleDismiss = () => {
    setShowModal(false);
    localStorage.setItem("pwaDismissed", "true");
  };

  // Don't render modal if no prompt is available AND modal not forced open
  if (!deferredPrompt && !showModal) return null;

  return (
    <Modal
      title={
        <Space>
          <DownloadOutlined style={{ fontSize: 24, color: "#0891b2" }} />
          <span style={{ fontSize: 20 }}>Install App</span>
        </Space>
      }
      open={showModal}
      onCancel={handleDismiss}
      footer={[
        <Button key="dismiss" onClick={handleDismiss} icon={<CloseOutlined />}>
          Maybe Later
        </Button>,
        <Button
          key="install"
          type="primary"
          onClick={handleInstall}
          icon={<DownloadOutlined />}
          style={{ background: "linear-gradient(135deg, #0891b2, #3b82f6)" }}
        >
          Install Now
        </Button>,
      ]}
      width={450}
      centered
    >
      <div style={{ padding: "16px 0" }}>
        <p style={{ fontSize: 16, marginBottom: 16 }}>
          Install <strong>HealthCare CRM</strong> as a desktop app for:
        </p>
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {[
            { icon: "🚀", label: "Faster Access" },
            { icon: "📴", label: "Offline Support" },
            { icon: "🪟", label: "Standalone Window" },
          ].map(({ icon, label }) => (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 32 }}>{icon}</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "#f5f5f5", padding: 16, borderRadius: 8 }}>
          <p style={{ fontWeight: "bold", marginBottom: 8 }}>How to install:</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              Click "Install Now" below, <strong>or</strong>
            </li>
            <li>Click the install icon (⊕) in Chrome's address bar</li>
            <li>Confirm when Chrome prompts you</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
};

export default InstallPWA;
