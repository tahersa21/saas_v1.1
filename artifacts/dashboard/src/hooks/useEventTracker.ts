const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function trackEvent(opts: {
  eventType: "click" | "time_on_page";
  page: string;
  element?: string;
  value?: number;
}) {
  fetch(`${API_BASE}/api/public/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    keepalive: true,
  }).catch(() => {});
}

export function trackClick(element: string, page = "/") {
  trackEvent({ eventType: "click", page, element });
}
