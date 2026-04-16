import React, { useState, useEffect } from "react";
import { Modal, Button, Space, message } from "antd";
import { DownloadOutlined, CloseOutlined } from "@ant-design/icons";

const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    setIsInstalled(isStandalone);

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Don't show if already installed or dismissed
      const hasDismissed = localStorage.getItem("pwaDismissed");
      if (!isStandalone && !hasDismissed) {
        setTimeout(() => setShowInstallModal(true), 3000);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for app installed event
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowInstallModal(false);
      message.success("✅ App installed successfully!");
    });

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      message.success("Installing app...");
      setShowInstallModal(false);
    } else {
      message.info("Installation cancelled");
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstallModal(false);
    localStorage.setItem("pwaDismissed", "true");
    message.info("You can install later from browser menu");
  };

  if (isInstalled) return null;

  return (
    <Modal
      title={
        <Space>
          <DownloadOutlined style={{ fontSize: 24, color: "#0891b2" }} />
          <span style={{ fontSize: 20 }}>Install App</span>
        </Space>
      }
      open={showInstallModal}
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
          Install <strong>HealthCare CRM</strong> as an app for:
        </p>

        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>🚀</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Faster Access</div>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>📴</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Offline Support</div>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>🪟</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Standalone Window</div>
          </div>
        </div>

        <div
          style={{
            background: "#f5f5f5",
            padding: 16,
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          <p style={{ fontWeight: "bold", marginBottom: 8 }}>How to install:</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Click the "Install Now" button above</li>
            <li>Or click the install icon in browser address bar</li>
            <li>Confirm installation when prompted</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
};

export default InstallPWA;
