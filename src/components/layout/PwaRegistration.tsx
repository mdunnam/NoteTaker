"use client";

import { useEffect } from "react";

/** Register the minimal service worker required for installable-browser capture flows. */
export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Could not register service worker:", error);
    });
  }, []);

  return null;
}