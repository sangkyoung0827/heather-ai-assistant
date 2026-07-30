"use client";

export function registerHeatherServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update()).catch(() => {
      // The app remains usable without the service worker.
    });
  });
}
