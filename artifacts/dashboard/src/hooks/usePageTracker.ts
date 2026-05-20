import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function sendTimeOnPage(page: string, startTime: number) {
  const seconds = Math.round((Date.now() - startTime) / 1000);
  if (seconds < 2) return;
  fetch(`${API_BASE}/api/public/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType: "time_on_page", page, value: seconds }),
    keepalive: true,
  }).catch(() => {});
}

export function usePageTracker() {
  const location = useLocation();
  const lastTracked = useRef<string>("");
  const startTime = useRef<number>(Date.now());
  const firstRender = useRef<boolean>(true);

  useEffect(() => {
    const page = location.pathname;
    if (page === lastTracked.current) return;

    if (!firstRender.current && lastTracked.current && !lastTracked.current.startsWith("/admin") && !lastTracked.current.startsWith("/portal")) {
      sendTimeOnPage(lastTracked.current, startTime.current);
    }
    firstRender.current = false;
    lastTracked.current = page;
    startTime.current = Date.now();

    if (page.startsWith("/admin") || page.startsWith("/portal")) return;

    fetch(`${API_BASE}/api/public/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page,
        referrer: document.referrer || null,
        language: navigator.language || null,
        screenWidth: window.screen.width,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const page = lastTracked.current;
        if (page && !page.startsWith("/admin") && !page.startsWith("/portal")) {
          sendTimeOnPage(page, startTime.current);
          startTime.current = Date.now();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
}
