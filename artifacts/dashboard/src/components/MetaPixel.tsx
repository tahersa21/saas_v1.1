import { useEffect, useRef } from "react";

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

export function MetaPixel({ pixelId }: { pixelId: string | null }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!pixelId || initialized.current) return;

    // Defer until the browser is idle so it doesn't compete with LCP/FID.
    const init = () => {
      if (initialized.current || window.fbq) return;
      initialized.current = true;

      const queue: unknown[][] = [];
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) {
          fbq.callMethod(...args);
        } else {
          fbq.queue.push(args);
        }
      } as FbqFn;

      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.queue = queue;

      window._fbq = fbq;
      window.fbq = fbq;

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      const first = document.getElementsByTagName("script")[0];
      first?.parentNode?.insertBefore(script, first);

      window.fbq("init", pixelId);
      window.fbq("track", "PageView");
    };

    // Use requestIdleCallback if available, otherwise fall back to a 3-second timeout.
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(init, { timeout: 4000 });
    } else {
      setTimeout(init, 3000);
    }
  }, [pixelId]);

  if (!pixelId) return null;

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
