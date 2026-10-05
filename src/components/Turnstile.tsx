import { useEffect, useRef } from "react";

// Minimal Cloudflare Turnstile integration (explicit render). The project
// has no turnstile package, and we only need render + reset.

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded but API missing"));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function Turnstile({
  onToken,
  onReset,
}: {
  onToken: (token: string) => void;
  onReset: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onResetRef = useRef(onReset);
  onTokenRef.current = onToken;
  onResetRef.current = onReset;

  useEffect(() => {
    if (!SITE_KEY) {
      console.error("[Turnstile] VITE_TURNSTILE_SITE_KEY is not set");
      return;
    }
    let cancelled = false;

    void loadTurnstile().then((ts) => {
      if (cancelled || !hostRef.current) return;
      widgetIdRef.current = ts.render(hostRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onResetRef.current(),
        "error-callback": () => onResetRef.current(),
        theme: "auto",
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // widget already gone
        }
      }
      widgetIdRef.current = null;
    };
  }, []);

  // Let the parent reset the widget after a failed sign-in by unmounting
  // key changes; expose reset via a custom event to keep this simple.
  useEffect(() => {
    const handler = () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    };
    window.addEventListener("nv:turnstile-reset", handler);
    return () => window.removeEventListener("nv:turnstile-reset", handler);
  }, []);

  return <div ref={hostRef} className="flex justify-center" />;
}

export function resetTurnstile() {
  window.dispatchEvent(new Event("nv:turnstile-reset"));
}
