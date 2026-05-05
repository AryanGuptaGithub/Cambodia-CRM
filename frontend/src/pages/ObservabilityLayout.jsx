/**
 * ObservabilityLayout.jsx
 * ─────────────────────────────────────────────
 * Layout wrapper for the Observability section.
 * Follows the same pattern as other Layout files in this project.
 *
 * Place at: frontend/src/pages/ObservabilityLayout.jsx
 */

import React from "react";
import { Outlet } from "react-router-dom";

function ObservabilityLayout() {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <Outlet />
    </div>
  );
}

export default ObservabilityLayout;