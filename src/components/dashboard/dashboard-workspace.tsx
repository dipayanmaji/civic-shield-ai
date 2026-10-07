"use client";

import { Activity, ArrowLeft, CircleCheck, Clock3, Crosshair, MapPin, Radar, ShieldCheck, Sparkles, Venus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { LocationSafetySnapshot } from "@/components/landing/location-safety-snapshot";
import type { PublicCivicReport, ReportStatus } from "@/types/report";

type Coordinates = { latitude: number; longitude: number };

export function DashboardWorkspace() {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [reports, setReports] = useState<PublicCivicReport[]>([]);
  const [status, setStatus] = useState<"requesting" | "loading" | "ready" | "blocked" | "error">("requesting");
  const [message, setMessage] = useState("");
  const [locationLabel, setLocationLabel] = useState("");

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    if (!coordinates) return;
    const currentCoordinates = coordinates;
    const controller = new AbortController();

    async function loadReports() {
      setStatus("loading");
      try {
        const response = await fetch(`/api/public-reports?lat=${currentCoordinates.latitude}&lon=${currentCoordinates.longitude}&radiusKm=10`, { signal: controller.signal });
        const payload = await response.json() as { reports?: PublicCivicReport[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Reports could not be loaded.");
        setReports(payload.reports ?? []);
        setStatus("ready");
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Reports could not be loaded.");
          setStatus("error");
        }
      }
    }

    loadReports();
    return () => controller.abort();
  }, [coordinates]);

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
      }
    }

    loadLocationName();
    return () => controller.abort();
  }, [coordinates]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setStatus("blocked");
      setMessage("This browser does not support current location. Public dashboard needs location to show nearby complaints.");
      return;
    }

    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        setStatus("blocked");
        setMessage("Allow location permission to see complaints lodged around your area.");
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-5 py-8 text-ink sm:py-10 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-brand" href="/">
          <ArrowLeft aria-hidden="true" size={16} /> Back to home
        </Link>
        <div className="mt-7 grid gap-5 rounded-3xl border border-line bg-[#fbfdfc] p-5 shadow-sm lg:grid-cols-[1.15fr_0.85fr] lg:p-7">
          <div>
            <Badge tone="safe" className="gap-1.5"><Sparkles aria-hidden="true" size={13} /> Location safety intelligence</Badge>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">Know the area before you move through it.</h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              CivicShield combines nearby civic complaints, lodged emergencies, women-safety signals, and verified workflow status into one local safety view.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button asChild><Link href="/report"><ShieldCheck aria-hidden="true" size={17} /> Report an issue</Link></Button>
              <Link className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#f0c6d8] bg-[#fff7fb] px-4 py-2 text-sm font-bold text-[#9b2755] transition hover:bg-[#ffeaf3]" href="/emergency?type=women">
                <Venus aria-hidden="true" size={16} /> Women safety help
              </Link>
            </div>
          </div>
          <div className="relative min-h-56 overflow-hidden rounded-3xl border border-[#cfe6dd] bg-[#effaf5]">
            <div className="absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/20" />
            <div className="absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/25" />
            <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/35 bg-white" />
            <div className="absolute left-[18%] top-[24%] rounded-2xl bg-white px-3 py-2 text-xs font-bold text-danger shadow-sm">Women alert</div>
            <div className="absolute bottom-[18%] right-[12%] rounded-2xl bg-white px-3 py-2 text-xs font-bold text-brand shadow-sm">Civic report</div>
            <div className="absolute bottom-[22%] left-[12%] rounded-2xl bg-white px-3 py-2 text-xs font-bold text-warning shadow-sm">Road risk</div>
            <div className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-brand text-white shadow-surface">
              <Radar aria-hidden="true" size={24} />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <LocationSafetySnapshot compact />
        </div>

        {coordinates ? (
          <div className="mt-5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-muted">
            Showing reports near {locationLabel || "your current location"}
          </div>
        ) : null}

        {status === "blocked" ? (
          <EmptyState title="Location needed" detail={message} action={<Button onClick={requestLocation}><Crosshair aria-hidden="true" size={16} /> Use current location</Button>} />
        ) : status === "requesting" || status === "loading" ? (
          <DashboardSkeleton waitingForLocation={status === "requesting"} />
        ) : status === "error" ? (
          <EmptyState title="Dashboard unavailable" detail={message} />
        ) : reports.length === 0 ? (
          <EmptyState title="No nearby public complaints" detail="No public reports were found within 10 km of your current location." />
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Metric icon={<Activity aria-hidden="true" size={18} />} label="Nearby reports" value={String(reports.length)} />
              <Metric icon={<Clock3 aria-hidden="true" size={18} />} label="Awaiting action" value={String(reports.filter((report) => !["department-resolved", "verified-resolved"].includes(report.status)).length)} />
              <Metric icon={<CircleCheck aria-hidden="true" size={18} />} label="Community verified" value={String(reports.filter((report) => report.status === "verified-resolved").length)} />
            </div>
            <section className="mt-7 overflow-hidden rounded-3xl border border-line bg-surface">
              <div className="border-b border-line px-5 py-4 sm:px-6"><h2 className="font-display text-xl font-bold">Latest nearby complaints</h2></div>
              <div className="divide-y divide-line">{reports.map((report) => <ReportRow key={report.id} report={report} />)}</div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

// Same shape as the loaded dashboard (three metrics, then the list) so nothing jumps when data arrives.
function DashboardSkeleton({ waitingForLocation }: { waitingForLocation: boolean }) {
  return (
    <SkeletonGroup className="mt-8" label={waitingForLocation ? "Waiting for location permission" : "Loading nearby complaints"}>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Card className="rounded-2xl" key={item}>
            <CardContent className="flex items-center gap-3 p-5">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-6 w-12" /></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <section className="mt-7 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4 sm:px-6"><Skeleton className="h-6 w-56" /></div>
        <div className="divide-y divide-line">
          {[0, 1, 2, 3].map((item) => (
            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6" key={item}>
              <div className="space-y-3">
                <div className="flex gap-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-5 w-20 rounded-full" /></div>
                <Skeleton className="h-6 w-48 max-w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-28" /></div>
            </div>
          ))}
        </div>
      </section>
      {waitingForLocation ? <p className="mt-4 text-center text-xs font-medium text-muted">Waiting for location permission. CivicShield uses your location only to scope this public dashboard.</p> : null}
    </SkeletonGroup>
  );
}

function ReportRow({ report }: { report: PublicCivicReport }) {
  return (
    <Link className="grid gap-4 p-5 transition hover:bg-[#f7fbfa] sm:grid-cols-[1fr_auto] sm:items-center sm:px-6" href={`/dashboard/${report.id}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs font-bold text-brand">{report.id}</p>
          <StatusBadge status={report.status} />
          {typeof report.distanceMeters === "number" ? <Badge>{formatDistance(report.distanceMeters)}</Badge> : null}
        </div>
        <h2 className="mt-2 font-display text-lg font-bold">{report.category ?? "Civic issue"}</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm leading-6 text-muted"><MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={15} />{report.locationLabel}</p>
      </div>
      <div className="text-sm text-muted sm:text-right">
        <p className="font-semibold text-ink">Lodged {formatDateTime(report.createdAt)}</p>
        <p className="mt-1 text-xs">Updated {formatDateTime(report.updatedAt)}</p>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const tone = status === "verified-resolved" ? "safe" : status === "overdue" || status === "disputed" ? "urgent" : "caution";
  return <Badge tone={tone}>{status.replaceAll("-", " ")}</Badge>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-5"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</span><div><p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p></div></CardContent></Card>;
}

function EmptyState({ action, title, detail }: { action?: React.ReactNode; title: string; detail: string }) {
  return <Card className="mt-8 rounded-3xl"><CardContent className="p-8 text-center"><Activity className="mx-auto text-brand" size={28} /><h2 className="mt-4 font-display text-xl font-bold">{title}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">{detail}</p>{action ? <div className="mt-5">{action}</div> : null}</CardContent></Card>;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) return `${distanceMeters} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}
