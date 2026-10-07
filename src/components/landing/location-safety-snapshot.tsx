"use client";

import { AlertTriangle, BellRing, Clock3, MapPin, Sparkles, Venus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import type { EmergencyReport, PublicCivicReport } from "@/types/report";

type Coordinates = { latitude: number; longitude: number };
// locating: waiting for the browser's location answer; loading: fetching what is nearby;
// unavailable: no location (denied / unsupported); error: nearby data could not be fetched.
type Phase = "locating" | "loading" | "ready" | "unavailable" | "error";

const VISIT_STORAGE_KEY = "civicshield:visited-places";

export function LocationSafetySnapshot({ compact = false }: { compact?: boolean }) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [visitCount, setVisitCount] = useState(0);
  const [civicReports, setCivicReports] = useState<PublicCivicReport[]>([]);
  const [emergencyReports, setEmergencyReports] = useState<EmergencyReport[]>([]);
  const [phase, setPhase] = useState<Phase>("locating");
  const [labelSettled, setLabelSettled] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      queueMicrotask(() => setPhase("unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoordinates(nextCoordinates);
        setVisitCount(trackVisit(nextCoordinates));
        setPhase("loading");
      },
      () => setPhase("unavailable"),
      { enableHighAccuracy: true, maximumAge: 120000, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (!coordinates) return;
    const currentCoordinates = coordinates;
    const controller = new AbortController();

    async function loadLocationName() {
      try {
        const response = await fetch(`/api/geocode?lat=${currentCoordinates.latitude}&lon=${currentCoordinates.longitude}`, { signal: controller.signal });
        const payload = await response.json() as { label?: string };
        if (response.ok && payload.label) setLocationLabel(payload.label);
      } catch {
        setLocationLabel("");
      } finally {
        if (!controller.signal.aborted) setLabelSettled(true);
      }
    }

    loadLocationName();
    return () => controller.abort();
  }, [coordinates]);

  useEffect(() => {
    if (!coordinates) return;
    const currentCoordinates = coordinates;
    const controller = new AbortController();

    async function loadNearbySignals() {
      try {
        const [civicResponse, emergencyResponse] = await Promise.all([
          fetch(`/api/public-reports?lat=${currentCoordinates.latitude}&lon=${currentCoordinates.longitude}&radiusKm=5`, { signal: controller.signal }),
          fetch(`/api/emergency-reports?lat=${currentCoordinates.latitude}&lon=${currentCoordinates.longitude}&radiusKm=5`, { signal: controller.signal }),
        ]);
        if (!civicResponse.ok || !emergencyResponse.ok) throw new Error("Nearby signals could not be loaded.");
        const civicPayload = await civicResponse.json() as { reports?: PublicCivicReport[] };
        const emergencyPayload = await emergencyResponse.json() as { reports?: EmergencyReport[] };
        setCivicReports(filterLast24Hours(civicPayload.reports ?? []));
        setEmergencyReports(filterLast24Hours(emergencyPayload.reports ?? []));
        setPhase("ready");
      } catch {
        // A failed lookup must not read as "all clear".
        if (!controller.signal.aborted) setPhase("error");
      }
    }

    loadNearbySignals();
    return () => controller.abort();
  }, [coordinates]);

  const totalSignals = civicReports.length + emergencyReports.length;
  const loadingSignals = phase === "locating" || phase === "loading";
  const labelPending = phase === "locating" || (Boolean(coordinates) && !labelSettled);
  const locationName = locationLabel || (coordinates ? "Current detected location" : "Location check needed");
  const womenSignals = emergencyReports.filter((report) => report.type.toLowerCase().includes("women"));
  const safetyTone = totalSignals > 0 ? "caution" : "safe";

  return (
    <section className={`relative overflow-hidden rounded-[1.75rem] border bg-white shadow-surface ${compact ? "border-line p-5" : "border-white/80"}`}>
      <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-[#ddf5ed]" />
      <div className={compact ? "" : "border-b border-line bg-[#fbfdfc] px-6 py-5"}>
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Live place safety</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">CivicShield around you</h2>
          </div>
          {loadingSignals ? <Skeleton className="h-7 w-20 rounded-full" /> : phase === "ready" ? <Badge tone={safetyTone}>{totalSignals ? `${totalSignals} recent` : "Clear"}</Badge> : <Badge>{phase === "unavailable" ? "Location off" : "Unavailable"}</Badge>}
        </div>
        <div className="relative mt-4 rounded-2xl border border-line bg-white p-4">
          {labelPending ? (
            <SkeletonGroup label="Finding your area"><Skeleton className="my-1 h-4 w-3/4" /></SkeletonGroup>
          ) : (
            <p className="flex items-start gap-2 text-sm font-bold leading-6 text-ink">
              <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-brand" size={16} />
              {locationName}
            </p>
          )}
          {coordinates ? (
            <p className="mt-1 text-xs text-muted">{visitCount > 1 ? `Visited ${visitCount} times from this browser` : "First detected visit from this browser"}</p>
          ) : null}
        </div>
      </div>

      <div className={compact ? "relative mt-5 space-y-4" : "relative space-y-5 p-6"}>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <SignalTile icon={<AlertTriangle aria-hidden="true" size={16} />} label="Civic complaints" loading={loadingSignals} value={phase === "ready" ? civicReports.length : null} />
          <SignalTile icon={<BellRing aria-hidden="true" size={16} />} label="Emergencies" loading={loadingSignals} value={phase === "ready" ? emergencyReports.length : null} />
          <SignalTile icon={<Venus aria-hidden="true" size={16} />} label="Women safety" loading={loadingSignals} value={phase === "ready" ? womenSignals.length : null} />
        </div>

        {loadingSignals ? (
          <SkeletonGroup className="space-y-3" label="Checking what has been reported nearby">
            {[0, 1].map((item) => <SignalRowSkeleton key={item} />)}
          </SkeletonGroup>
        ) : phase === "unavailable" ? (
          <div className="rounded-2xl border border-line bg-[#fbfdfc] p-4 text-sm leading-6 text-muted">
            <p className="font-bold text-ink">Turn on location to see your area.</p>
            <p className="mt-1">Allow location in your browser to see what has been reported near you. You can still report an issue or get emergency help below.</p>
          </div>
        ) : phase === "error" ? (
          <div className="rounded-2xl border border-[#ead9b8] bg-[#fffaf0] p-4 text-sm leading-6 text-[#725019]">
            <p className="font-bold">Nearby reports could not be loaded.</p>
            <p className="mt-1">This is not an all-clear. Please try again in a moment, and call 112 if you are in danger.</p>
          </div>
        ) : totalSignals ? (
          <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
            {emergencyReports.slice(0, 3).map((report) => <SignalRow key={report.id} title={report.type} detail={report.locationLabel} time={report.createdAt} tone="danger" />)}
            {civicReports.slice(0, 3).map((report) => <SignalRow key={report.id} title={report.category ?? "Civic complaint"} detail={report.locationLabel} time={report.createdAt} tone="brand" />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#cbe8dd] bg-[#f7fcfa] p-4 text-sm leading-6 text-[#31544b]">
            <p className="font-bold">You are good to go.</p>
            <p className="mt-1">Stay aware, keep location sharing handy, and use women safety help if the surroundings feel unsafe.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2 sm:gap-3">
          <Button asChild className="min-w-0 px-3 text-sm">
            <Link href="/dashboard"><Sparkles aria-hidden="true" size={16} /> Open safety dashboard</Link>
          </Button>
          <Button asChild className="min-w-0 px-3 text-sm bg-[#a22a58] hover:bg-[#872047]">
            <Link href="/emergency?type=women"><Venus aria-hidden="true" size={16} /> Women safety</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SignalTile({ icon, label, loading, value }: { icon: React.ReactNode; label: string; loading: boolean; value: number | null }) {
  return (
    <div className="rounded-xl border border-line bg-[#fbfdfc] p-2.5 sm:rounded-2xl sm:p-3">
      <div className="flex items-start gap-1.5 text-brand sm:gap-2">{icon}<p className="min-h-8 text-[0.58rem] font-bold uppercase leading-4 tracking-[0.08em] text-muted sm:text-[0.65rem] sm:tracking-[0.1em]">{label}</p></div>
      {loading ? <Skeleton className="mt-2 h-7 w-9 sm:mt-2.5" /> : <p className="mt-1.5 font-display text-xl font-bold sm:mt-2 sm:text-2xl">{value ?? "–"}</p>}
    </div>
  );
}

function SignalRowSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-[#fbfdfc] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <Skeleton className="h-6 w-9 rounded-full" />
      </div>
    </div>
  );
}

function SignalRow({ title, detail, time, tone }: { title: string; detail: string; time: string; tone: "danger" | "brand" }) {
  return (
    <article className="rounded-2xl border border-line bg-[#fbfdfc] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-bold ${tone === "danger" ? "text-danger" : "text-brand"}`}>{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{detail}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[0.68rem] font-bold text-muted">{formatRelative(time)}</span>
      </div>
    </article>
  );
}

function filterLast24Hours<T extends { createdAt: string }>(items: T[]) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return items.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
}

function trackVisit(coordinates: Coordinates) {
  const key = `${coordinates.latitude.toFixed(2)},${coordinates.longitude.toFixed(2)}`;
  try {
    const visits = JSON.parse(localStorage.getItem(VISIT_STORAGE_KEY) ?? "{}") as Record<string, number>;
    const nextCount = (visits[key] ?? 0) + 1;
    localStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify({ ...visits, [key]: nextCount }));
    return nextCount;
  } catch {
    return 1;
  }
}

function formatRelative(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return <Clock3 aria-hidden="true" size={12} />;
}
