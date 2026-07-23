"use client";

import { MapPin, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function QuickIncidentRecord() {
  const [type, setType] = useState("Unsafe area");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [isSafe, setIsSafe] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"loading" | "ready" | "blocked">("loading");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationWasEdited = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      queueMicrotask(() => setLocationStatus("blocked"));
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      if (locationWasEdited.current) return;
      setCoordinates({ latitude, longitude });
      try {
        const response = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`);
        const payload = await response.json() as { label?: string };
        if (!locationWasEdited.current) setLocation(payload.label || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      } catch {
        if (!locationWasEdited.current) setLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      } finally { setLocationStatus("ready"); }
    }, () => setLocationStatus("blocked"), { enableHighAccuracy: true, maximumAge: 120000, timeout: 10000 });
  }, []);

  async function save() {
    if (!location.trim()) return setStatus("Current location is still being captured. Please allow location access before saving.");
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/emergency-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: { type, locationLabel: location.trim(), latitude: coordinates?.latitude, longitude: coordinates?.longitude, details: details.trim() || null, isSafe } }) });
      const result = await response.json() as { emergencyId?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "The incident record could not be saved.");
      setStatus(`Incident record saved: ${result.emergencyId ?? "recorded"}`);
      setDetails("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The incident record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-3xl border border-[#efc7bf] bg-white p-5 shadow-surface sm:p-6">
    <p className="eyebrow text-danger">Emergency note</p>
    <h2 className="mt-2 font-display text-xl font-bold tracking-tight">Raise a quick incident record</h2>
    <p className="mt-2 text-sm leading-6 text-muted">This creates a CivicShield record. For immediate danger, call 112 first.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-[0.75fr_1.25fr]">
      <select className="h-12 rounded-xl border border-line bg-[#fbfdfc] px-3 text-sm font-semibold outline-none transition hover:border-danger/50 focus:border-danger focus:ring-4 focus:ring-danger/10" value={type} onChange={(event) => setType(event.target.value)}><option>Unsafe area</option><option>Women safety</option><option>Accident</option><option>Fire</option><option>Medical</option><option>Live wire</option></select>
      <label className="flex rounded-xl border border-line bg-[#f3f7f5] text-muted"><span className="flex min-w-0 flex-1 items-center gap-2 px-3"><MapPin className="shrink-0 text-muted" size={16} /><input className="h-12 min-w-0 flex-1 cursor-default bg-transparent text-sm outline-none" value={location} readOnly placeholder={locationStatus === "loading" ? "Detecting your current location..." : "Captured location"} /></span></label>
    </div>
    <input className="mt-3 h-12 w-full rounded-xl border border-line bg-[#fbfdfc] px-3 text-sm outline-none transition hover:border-danger/50 focus:border-danger focus:ring-4 focus:ring-danger/10" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="One short detail (optional)" />
    <div className="mt-4 flex flex-col gap-3 border-t border-[#f4e0dc] pt-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs font-semibold text-muted"><input checked={isSafe} className="size-4 rounded accent-[#be3b31]" onChange={(event) => setIsSafe(event.target.checked)} type="checkbox" /> I am away from immediate danger</label><Button className="w-full sm:w-auto" type="button" variant="danger" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : <><ShieldAlert size={16} /> Save record</>}</Button></div>
    {status ? <p className={`mt-3 text-sm font-semibold ${status.startsWith("Incident") ? "text-brand" : "text-danger"}`} role="status">{status}</p> : null}
  </section>;
}
