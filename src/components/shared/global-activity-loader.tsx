"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Activity = {
  id: number;
  message: string;
};

function getFetchMessage(input: RequestInfo | URL, init?: RequestInit) {
  const method =
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  const url = getUrl(input);
  const normalizedMethod = method.toUpperCase();

  if (!url) return normalizedMethod === "GET" ? "Loading app data..." : "Submitting request...";

  const pathname = url.pathname;

  if (pathname === "/api/analyze") return "Preparing AI safety analysis...";
  if (pathname === "/api/reports" && normalizedMethod === "POST") return "Submitting your civic report...";
  if (pathname.includes("/analysis")) return "Saving analysis result...";
  if (pathname.includes("/delivery")) return "Updating delivery status...";
  if (pathname.includes("/verification")) return "Recording community verification...";
  if (pathname === "/api/emergency-reports" && normalizedMethod === "POST") return "Saving emergency record...";
  if (pathname === "/api/emergency-reports") return "Checking nearby emergency alerts...";
  if (pathname === "/api/public-reports") return "Loading nearby civic reports...";
  if (pathname === "/api/emergency-nearby") return "Finding nearby emergency help...";
  if (pathname === "/api/department-nearby") return "Finding the right department...";
  if (pathname === "/api/geocode") {
    return url.searchParams.has("q") ? "Searching locations..." : "Finding your area...";
  }
  if (pathname === "/api/feedback") return "Sending your feedback...";
  if (pathname === "/api/civic-sense") return "Submitting Civic Sense moment...";
  if (pathname.includes("/api/moderator") && normalizedMethod === "GET") return "Loading moderator workspace...";
  if (pathname.includes("/api/moderator")) return "Updating moderator action...";
  if (pathname.includes("/api/auth/gmail")) return "Checking Gmail connection...";
  if (pathname === "/api/send-email") return "Sending department email...";

  return normalizedMethod === "GET" ? "Loading app data..." : "Submitting request...";
}

function getUrl(input: RequestInfo | URL) {
  try {
    if (typeof input === "string") return new URL(input, window.location.origin);
    if (input instanceof URL) return input;
    return new URL(input.url, window.location.origin);
  } catch {
    return null;
  }
}

function shouldTrackFetch(input: RequestInfo | URL) {
  const url = getUrl(input);
  return Boolean(url && url.origin === window.location.origin && url.pathname.startsWith("/api/"));
}

export function GlobalActivityLoader() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const begin = (message: string) => {
      const id = nextId.current;
      nextId.current += 1;
      setActivities((current) => [...current, { id, message }]);
      return id;
    };

    const end = (id: number) => {
      setActivities((current) => current.filter((activity) => activity.id !== id));
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!shouldTrackFetch(input)) return originalFetch(input, init);

      const id = begin(getFetchMessage(input, init));
      try {
        return await originalFetch(input, init);
      } finally {
        end(id);
      }
    };

    const geolocation = navigator.geolocation;
    const originalGetCurrentPosition = geolocation?.getCurrentPosition.bind(geolocation);

    if (geolocation && originalGetCurrentPosition) {
      try {
        geolocation.getCurrentPosition = (success, error, options) => {
          const id = begin("Requesting your current location...");
          try {
            return originalGetCurrentPosition(
              (position) => {
                end(id);
                success(position);
              },
              (positionError) => {
                end(id);
                error?.(positionError);
              },
              options,
            );
          } catch (positionError) {
            end(id);
            throw positionError;
          }
        };
      } catch {
        // Some browsers expose geolocation as read-only. Fetch tracking still works.
      }
    }

    return () => {
      window.fetch = originalFetch;
      if (geolocation && originalGetCurrentPosition) {
        try {
          geolocation.getCurrentPosition = originalGetCurrentPosition;
        } catch {}
      }
    };
  }, []);

  const latestActivity = activities.length ? activities[activities.length - 1] : null;
  const statusMessage = useMemo(() => {
    if (!latestActivity) return "";
    if (activities.length === 1) return latestActivity.message;
    return `${latestActivity.message} ${activities.length} tasks running.`;
  }, [activities.length, latestActivity]);

  if (!latestActivity) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[9999] grid place-items-center px-4"
      role="status"
    >
      <div className="w-[min(24rem,100%)] overflow-hidden rounded-3xl border border-line bg-white/95 shadow-surface backdrop-blur">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
            <LoaderCircle aria-hidden="true" className="animate-spin" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-5 text-ink">{statusMessage}</p>
            <p className="mt-1 text-xs font-medium text-muted">You can keep using CivicShield.</p>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden bg-brand-soft">
          <div className="global-activity-loader-bar h-full w-2/5 bg-brand" />
        </div>
      </div>
    </div>
  );
}
