import { useEffect, useState } from "react";
import { X, Megaphone, Sparkles, Wrench, AlertTriangle, Tag } from "lucide-react";
import i18n from "@/i18n";

interface Announcement {
  id: number;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  type: string;
  createdAt: string;
}

const STORAGE_KEY = "dismissed_announcements";

const TYPE_STYLES: Record<string, { bg: string; border: string; icon: typeof Megaphone; iconColor: string }> = {
  info: {
    bg: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))",
    border: "rgba(59,130,246,0.3)",
    icon: Megaphone,
    iconColor: "#60a5fa",
  },
  update: {
    bg: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))",
    border: "rgba(16,185,129,0.3)",
    icon: Sparkles,
    iconColor: "#34d399",
  },
  promo: {
    bg: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.05))",
    border: "rgba(168,85,247,0.35)",
    icon: Tag,
    iconColor: "#c084fc",
  },
  maintenance: {
    bg: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))",
    border: "rgba(245,158,11,0.3)",
    icon: Wrench,
    iconColor: "#fbbf24",
  },
  warning: {
    bg: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))",
    border: "rgba(239,68,68,0.35)",
    icon: AlertTriangle,
    iconColor: "#f87171",
  },
};

function getDismissed(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function addDismissed(id: number): void {
  try {
    const list = getDismissed();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-100)));
    }
  } catch {
    // ignore
  }
}

export function AnnouncementBanner(): JSX.Element | null {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<number[]>(() => getDismissed());
  const isAr = i18n.language === "ar";

  useEffect(() => {
    const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");
    let cancelled = false;
    let es: EventSource | null = null;
    let pollInterval: number | null = null;
    let reconnectTimer: number | null = null;

    const load = () => {
      fetch(`${apiBase}/api/public/announcements/active`, {
        credentials: "include",
        cache: "no-store",
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ announcements: Announcement[] }>) : null))
        .then((data) => {
          if (!cancelled && data?.announcements) setAnnouncements(data.announcements);
        })
        .catch(() => {});
    };

    const connectStream = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`${apiBase}/api/public/announcements/stream`, {
          withCredentials: true,
        });
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as { announcements: Announcement[] };
            if (!cancelled && Array.isArray(data.announcements)) {
              setAnnouncements(data.announcements);
            }
          } catch {
            // ignore malformed payload
          }
        };
        es.onerror = () => {
          // EventSource auto-reconnects, but if it closes for good (e.g. server
          // restart), retry after a short delay and lean on polling meanwhile.
          es?.close();
          es = null;
          if (!cancelled && reconnectTimer === null) {
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              connectStream();
            }, 5_000);
          }
        };
      } catch {
        // EventSource not supported — fall back to polling only.
      }
    };

    // Initial fetch + open the live stream.
    load();
    connectStream();

    // Safety-net polling every 60s in case the stream drops silently.
    pollInterval = window.setInterval(load, 60_000);

    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      es?.close();
      if (pollInterval !== null) window.clearInterval(pollInterval);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const visible = announcements.filter((a) => !dismissedIds.includes(a.id));
  if (visible.length === 0) return null;

  const handleDismiss = (id: number) => {
    addDismissed(id);
    setDismissedIds((prev) => [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
      <div
        className="absolute inset-0 pointer-events-auto"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        onClick={() => visible.forEach((a) => handleDismiss(a.id))}
      />
      <div className="relative pointer-events-auto w-full max-w-md max-h-[85vh] overflow-y-auto space-y-3">
        {visible.map((a) => {
          const style = TYPE_STYLES[a.type] ?? TYPE_STYLES.info!;
          const Icon = style.icon;
          return (
            <div
              key={a.id}
              className="rounded-2xl p-5 shadow-2xl"
              style={{
                background: "#0d0d1a",
                border: `1px solid ${style.border}`,
                backgroundImage: style.bg,
              }}
              dir={isAr ? "rtl" : "ltr"}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <Icon className="h-5 w-5" style={{ color: style.iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-base">
                    {isAr ? a.titleAr : a.titleEn}
                  </h3>
                  {(isAr ? a.bodyAr : a.bodyEn) && (
                    <p
                      className="text-sm mt-2 whitespace-pre-wrap"
                      style={{ color: "rgba(255,255,255,0.75)" }}
                    >
                      {isAr ? a.bodyAr : a.bodyEn}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDismiss(a.id)}
                  className="p-1.5 rounded-lg shrink-0 transition-colors"
                  style={{ color: "rgba(255,255,255,0.45)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => handleDismiss(a.id)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                >
                  {isAr ? "حسناً" : "Got it"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
