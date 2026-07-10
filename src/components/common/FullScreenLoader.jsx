// src/components/common/FullScreenLoader.jsx
import React from "react";
import "./FullScreenLoader.css";

export default function FullScreenLoader({ label = "Loading BackOffice…" }) {
  return (
    <div className="fsl">
      <div className="fsl-mark">
        <span className="fsl-mark-a" />
        <span className="fsl-mark-b" />
      </div>
      <p className="fsl-label">{label}</p>
    </div>
  );
}
