import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/global.css";

// Handle unhandled promise rejections from service worker
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.message?.includes("listener indicated an asynchronous response")) {
    console.warn("Service worker navigation error:", event.reason);
    event.preventDefault();
  }
});

// Only register service worker in production
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((registration) => {
        console.log("Service Worker registered with scope:", registration.scope);
      })
      .catch((err) => {
        console.warn("Service Worker registration failed:", err);
      });
  });
} else if ("serviceWorker" in navigator && import.meta.env.DEV) {
  // Unregister any existing service workers in development
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
          console.log("Service Worker unregistered in development");
        });
      })
      .catch((err) => {
        console.warn("Failed to unregister service worker:", err);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);