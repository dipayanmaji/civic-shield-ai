"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Flame,
  HeartPulse,
  Loader2,
  MapPin,
  Phone,
  PhoneCall,
  ShieldAlert,
  Siren,
  Users,
  Venus,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type EmergencyKind = "fire" | "medical" | "electrical" | "accident" | "unsafe" | "women";
type NearbyKind = "police" | "hospital" | "ambulance" | "fire" | "safe-place";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type NearbyPlace = {
  name: string;
  address: string;
  phone?: string;
  distanceMeters?: number;
  mapsUrl?: string;
  source: "google" | "openstreetmap";
};

const emergencyTypes: Array<{
  id: EmergencyKind;
  label: string;
  icon: LucideIcon;
  nearbyKinds: NearbyKind[];
  steps: string[];
}> = [
  {
    id: "women",
    label: "Women safety",
    icon: Venus,
    nearbyKinds: ["police", "safe-place"],
    steps: [
      "Move toward a visible, crowded, well-lit place if you can.",
      "Call 112 or share your live location with a trusted contact.",
      "Avoid isolated shortcuts and keep the phone line active.",
    ],
  },
  {
    id: "fire",
    label: "Fire",
    icon: Flame,
    nearbyKinds: ["fire"],
    steps: ["Move away from smoke or flames.", "Do not use lifts.", "Warn nearby people without entering danger."],
  },
  {
    id: "medical",
    label: "Medical",
    icon: HeartPulse,
    nearbyKinds: ["hospital", "ambulance"],
    steps: ["Keep the person still and calm.", "Share age, symptoms, and exact location on the call.", "Do not give food or drink if they are unconscious."],
  },
  {
    id: "electrical",
    label: "Live wire",
    icon: Zap,
    nearbyKinds: ["police", "fire"],
    steps: ["Stay away from water and exposed wires.", "Keep others at least several metres away.", "Do not touch the wire, pole, or nearby metal objects."],
  },
  {
    id: "accident",
    label: "Accident",
    icon: AlertTriangle,
    nearbyKinds: ["hospital", "ambulance", "police"],
    steps: ["Move to a safe edge of the road if possible.", "Do not move an injured person unless danger continues.", "Use lights or people nearby to slow traffic safely."],
  },
  {
    id: "unsafe",
    label: "Unsafe area",
    icon: ShieldAlert,
    nearbyKinds: ["police", "safe-place"],
    steps: ["Leave the area if you can do so safely.", "Stay near visible, populated places.", "Share your live location with someone you trust."],
  },
];

const nearbyLabels: Record<NearbyKind, { title: string; empty: string }> = {
  police: { title: "Nearby police stations", empty: "No nearby police station was returned for this location." },
  hospital: { title: "Nearby hospitals", empty: "No nearby hospital was returned for this location." },
  ambulance: { title: "Ambulance services", empty: "No nearby ambulance service was returned for this location." },
  fire: { title: "Nearby fire stations", empty: "No nearby fire station was returned for this location." },
  "safe-place": { title: "Safer public places", empty: "No nearby crowded public place was returned for this location." },
};

export function EmergencyAssistance() {
  const [selectedType, setSelectedType] = useState<EmergencyKind>("women");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [isSafe, setIsSafe] = useState(false);
  const [savedReference, setSavedReference] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<"checking" | "ready" | "blocked" | "unsupported">("checking");
  const [locationLabel, setLocationLabel] = useState("");
  const [nearbyPlaces, setNearbyPlaces] = useState<Record<NearbyKind, NearbyPlace[]>>({ police: [], hospital: [], ambulance: [], fire: [], "safe-place": [] });
  const [nearbyStatus, setNearbyStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!navigator.geolocation) {
      const timer = window.setTimeout(() => setLocationStatus("unsupported"), 0);
      return () => window.clearTimeout(timer);
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoordinates(currentCoordinates);
        setLocationStatus("ready");
        setLocation(`${currentCoordinates.latitude.toFixed(5)}, ${currentCoordinates.longitude.toFixed(5)}`);
      },
      () => setLocationStatus("blocked"),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!coordinates) return;
    const currentCoordinates = coordinates;
    const controller = new AbortController();

    async function reverseGeocode() {
      try {
        const response = await fetch(`/api/geocode?lat=${currentCoordinates.latitude}&lon=${currentCoordinates.longitude}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json() as { label?: string };
        if (payload.label) {
          setLocationLabel(payload.label);
          setLocation(payload.label);
        }
      } catch {
        // Coordinates remain useful even if reverse geocoding fails.
      }
    }

    reverseGeocode();
    return () => controller.abort();
  }, [coordinates]);

  const activeEmergency = emergencyTypes.find((type) => type.id === selectedType) ?? emergencyTypes[0];
  const ActiveIcon = activeEmergency.icon;

  useEffect(() => {
    if (!coordinates) return;
    const currentCoordinates = coordinates;
    const controller = new AbortController();

    async function loadNearbyPlaces() {
      setNearbyStatus("loading");
      try {
        const responses = await Promise.all(
          activeEmergency.nearbyKinds.map(async (kind) => {
            const response = await fetch(`/api/emergency-nearby?kind=${kind}&lat=${currentCoordinates.latitude}&lon=${currentCoordinates.longitude}`, { signal: controller.signal });
            if (!response.ok) return [kind, [] as NearbyPlace[]] as const;
            const payload = await response.json() as { places?: NearbyPlace[] };
            return [kind, payload.places ?? [] as NearbyPlace[]] as const;
          }),
        );

        setNearbyPlaces((current) => {
          const next = { ...current };
          responses.forEach(([kind, places]) => {
            next[kind] = places;
          });
          return next;
        });
        setNearbyStatus("ready");
      } catch {
        if (!controller.signal.aborted) setNearbyStatus("error");
      }
    }

    loadNearbyPlaces();
    return () => controller.abort();
  }, [activeEmergency.nearbyKinds, coordinates]);

  const checklist = useMemo(() => {
    const departmentStep = activeEmergency.nearbyKinds.length
      ? `Use the nearby ${activeEmergency.nearbyKinds.map((kind) => nearbyLabels[kind].title.toLowerCase()).join(" / ")} shown here if calling 112 is delayed.`
      : "Call 112 and state the location clearly.";
    return [...activeEmergency.steps, departmentStep];
  }, [activeEmergency]);

  async function saveEmergencyNote() {
    const now = new Date();
    const reference = `EM-${now.getFullYear()}-${String(now.getTime()).slice(-6)}`;
    const note = {
      reference,
      type: activeEmergency.label,
      location: location.trim(),
      details: details.trim(),
      isSafe,
      coordinates,
      createdAt: now.toISOString(),
    };

    try {
      const existing = JSON.parse(localStorage.getItem("civicshield:emergency-notes") ?? "[]") as unknown[];
      localStorage.setItem("civicshield:emergency-notes", JSON.stringify([note, ...existing].slice(0, 10)));
      setSavedReference(reference);
    } catch {
      setSavedReference(reference);
    }

    try {
      const response = await fetch("/api/emergency-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: {
            type: activeEmergency.label,
            locationLabel: location.trim() || locationLabel || "Current location",
            latitude: coordinates?.latitude,
            longitude: coordinates?.longitude,
            details: details.trim() || null,
            isSafe,
          },
        }),
      });
      const result = await response.json() as { emergencyId?: string };
      if (response.ok && result.emergencyId) {
        setSavedReference(result.emergencyId);
        window.dispatchEvent(new CustomEvent("civicshield:emergency-created", {
          detail: {
            emergencyId: result.emergencyId,
            type: activeEmergency.label,
            latitude: coordinates?.latitude,
            longitude: coordinates?.longitude,
          },
        }));
      }
    } catch {
      // Local emergency note is still saved when server persistence is unavailable.
    }
  }

  return (
    <main className="min-h-screen bg-[#fff8f6] text-ink">
      <div className="border-b border-[#f0cfc8] bg-[#fff1ed] px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.08em] text-[#913129] sm:text-sm">
        CivicShield does not contact emergency services automatically. Call 112 first.
      </div>

      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-danger" href="/">
          <ArrowLeft aria-hidden="true" size={16} /> Back to home
        </Link>

        <section className="pb-12 pt-6 lg:pb-16 lg:pt-10">
          <Card className="rounded-[1.75rem] border-[#efc7bf] bg-white shadow-surface">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-3 border-b border-[#f3ddd8] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="eyebrow text-danger">Emergency note</p><h1 className="mt-2 font-display text-2xl font-bold tracking-tight">Raise a quick incident record</h1><p className="mt-2 text-sm leading-6 text-muted">Record the situation after moving to safety. For immediate danger, call 112 first.</p></div>
                <Badge tone="urgent">{activeEmergency.label} alert</Badge>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <label className="block"><span className="text-sm font-bold text-[#344540]">Captured location</span><span className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-[#f3f7f5] px-3 text-muted"><MapPin aria-hidden="true" className="text-muted" size={17} /><input className="h-12 min-w-0 flex-1 cursor-default bg-transparent text-sm outline-none placeholder:text-[#8b9995]" placeholder={locationStatus === "checking" ? "Capturing your current location..." : "Location will appear here"} readOnly value={location} /></span></label>
                <label className="block"><span className="text-sm font-bold text-[#344540]">Short detail</span><input className="mt-2 h-12 w-full rounded-xl border border-line bg-[#fbfdfc] px-3 text-sm outline-none placeholder:text-[#8b9995] transition focus:border-danger focus:ring-4 focus:ring-danger/10" onChange={(event) => setDetails(event.target.value)} placeholder="One line is enough." value={details} /></label>
                <Button className="h-12 w-full lg:w-auto" onClick={() => void saveEmergencyNote()} variant="danger"><ShieldAlert aria-hidden="true" size={18} /> Lodge alert</Button>
              </div>
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-[#f0d0c9] bg-[#fff8f6] p-3 text-sm font-semibold text-[#4c3834]"><input checked={isSafe} className="mt-1 size-4 accent-[#be3b31]" onChange={(event) => setIsSafe(event.target.checked)} type="checkbox" /> I am currently away from immediate danger.</label>
              {savedReference ? <div className="mt-4 rounded-xl border border-[#cfe6dd] bg-[#f4fbf8] p-4 text-sm text-[#31544b]"><p className="font-bold">Record saved: {savedReference}</p><p className="mt-1 leading-6">This is a CivicShield incident note, not an emergency dispatch confirmation.</p></div> : null}
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.78fr_1.22fr] xl:items-start">
            <Card className="rounded-[1.75rem] border-[#efc7bf] bg-white shadow-surface"><CardContent className="p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#ffe4df] text-danger"><ActiveIcon aria-hidden={true} size={22} /></span><div><p className="eyebrow text-danger">What is happening?</p><h2 className="mt-1 font-display text-xl font-bold">Select one emergency type</h2><p className="mt-2 text-sm leading-6 text-muted">This changes the nearby help and safety guidance beside you.</p></div></div><div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">{emergencyTypes.map((type) => { const TypeIcon = type.icon; const active = type.id === selectedType; return <button className={`flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-center text-sm font-bold transition ${active ? "border-danger bg-[#fff0ed] text-danger shadow-sm" : "border-[#f0d0c9] bg-[#fffaf8] text-[#4d5d59] hover:bg-white"}`} key={type.id} onClick={() => setSelectedType(type.id)} type="button"><TypeIcon aria-hidden={true} size={21} /><span>{type.label}</span></button>; })}</div></CardContent></Card>
            <div className="space-y-6"><NearbyHelpPanel activeEmergency={activeEmergency} coordinates={coordinates} nearbyPlaces={nearbyPlaces} nearbyStatus={nearbyStatus} /><Card className="rounded-[1.75rem] border-[#efc7bf] bg-white"><CardContent className="p-5 sm:p-6"><p className="eyebrow text-danger">Safety checklist</p><h2 className="mt-2 font-display text-xl font-bold">{activeEmergency.label} guidance</h2><ul className="mt-5 space-y-3">{checklist.map((step) => <li className="flex gap-3 text-sm leading-6 text-[#475854]" key={step}><CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-danger" size={17} /><span>{step}</span></li>)}</ul></CardContent></Card></div>
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-[#efc7bf] bg-white p-5 shadow-surface sm:p-7"><div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center"><div><Badge tone="urgent" className="gap-1.5"><Siren aria-hidden="true" size={13} /> Quick response</Badge><h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#251918] sm:text-4xl">Get help first.</h2><p className="mt-3 max-w-xl leading-7 text-muted">If there is immediate danger, call 112 now. Your live location is shown below for sharing with responders or trusted contacts.</p><a className="mt-5 flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-danger px-6 py-4 text-lg font-bold text-white shadow-[0_18px_40px_rgb(190_59_49_/_24%)] transition hover:bg-[#a53129]" href="tel:112"><PhoneCall aria-hidden="true" size={23} /> Call 112 Now</a></div><div><LocationPanel coordinates={coordinates} locationLabel={locationLabel} locationStatus={locationStatus} /><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><QuickFact label="1" value="Move safe" /><QuickFact label="2" value="Call 112" /><QuickFact label="3" value="Use nearby help" /></div></div></div></div>
        </section>
      </div>
    </main>
  );
}

function LocationPanel({
  coordinates,
  locationLabel,
  locationStatus,
}: {
  coordinates: Coordinates | null;
  locationLabel: string;
  locationStatus: "checking" | "ready" | "blocked" | "unsupported";
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[#f0d0c9] bg-[#fff8f6] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-danger">
          {locationStatus === "checking" ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : <MapPin aria-hidden="true" size={18} />}
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9b5048]">Live location</p>
          <p className="mt-1 text-sm font-semibold text-[#2c201f]">
            {locationStatus === "checking" && "Requesting location permission..."}
            {locationStatus === "ready" && (locationLabel || "Location captured")}
            {locationStatus === "blocked" && "Location blocked. Allow browser location for nearby help."}
            {locationStatus === "unsupported" && "This browser does not support live location."}
          </p>
          {coordinates ? (
            <p className="mt-1 text-xs text-muted">
              {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NearbyHelpPanel({
  activeEmergency,
  coordinates,
  nearbyPlaces,
  nearbyStatus,
}: {
  activeEmergency: { nearbyKinds: NearbyKind[]; id: EmergencyKind };
  coordinates: Coordinates | null;
  nearbyPlaces: Record<NearbyKind, NearbyPlace[]>;
  nearbyStatus: "idle" | "loading" | "ready" | "error";
}) {
  return (
    <Card className="rounded-[1.75rem] border-[#efc7bf] bg-white shadow-surface">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow text-danger">Relevant places near you</p>
            <h2 className="mt-2 font-display text-2xl font-bold">
              {activeEmergency.id === "women" ? "Police and safer public places" : "Nearest help for this emergency"}
            </h2>
          </div>
          <Badge tone="urgent">{activeEmergency.nearbyKinds.length} live lookup{activeEmergency.nearbyKinds.length === 1 ? "" : "s"}</Badge>
        </div>
        {!coordinates ? (
          <p className="mt-4 rounded-2xl border border-[#f0d0c9] bg-[#fff8f6] p-4 text-sm leading-6 text-muted">
            Allow location access to load nearby stations, hospitals, fire services, ambulance services, and safer public places.
          </p>
        ) : nearbyStatus === "loading" ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line p-4 text-sm font-semibold text-muted">
            <Loader2 aria-hidden="true" className="animate-spin text-danger" size={18} /> Finding nearby help...
          </div>
        ) : nearbyStatus === "error" ? (
          <p className="mt-4 rounded-2xl border border-[#f0d0c9] bg-[#fff8f6] p-4 text-sm leading-6 text-muted">
            Nearby lookup is temporarily unavailable. Call 112 and share your location verbally.
          </p>
        ) : (
          <div className="mt-4 max-h-[33rem] space-y-5 overflow-y-auto pr-1">
            {activeEmergency.nearbyKinds.map((kind) => (
              <NearbyGroup coordinates={coordinates} kind={kind} key={kind} places={nearbyPlaces[kind]} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NearbyGroup({ coordinates, kind, places }: { coordinates: Coordinates; kind: NearbyKind; places: NearbyPlace[] }) {
  const Icon = kind === "safe-place" ? Users : kind === "hospital" || kind === "ambulance" ? HeartPulse : kind === "fire" ? Flame : Building2;
  const googleSearchUrl = `https://www.google.com/maps/search/${encodeURIComponent(nearbySearchLabel(kind))}/@${coordinates.latitude},${coordinates.longitude},15z`;

  return (
    <section>
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="text-danger" size={17} />
        <h3 className="text-sm font-bold text-[#344540]">{nearbyLabels[kind].title}</h3>
      </div>
      {places.length ? (
        <div className="mt-2 space-y-2">
          {places.map((place) => (
            <article className="rounded-2xl border border-line bg-[#fbfdfc] p-3" key={`${place.name}-${place.address}`}>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-5 text-[#24332f]">{place.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{place.address}</p>
                  {place.phone ? (
                    <a className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fff0ed] px-2.5 py-1 text-xs font-bold text-danger" href={`tel:${toTelHref(place.phone)}`}>
                      <Phone aria-hidden="true" size={13} /> {place.phone}
                    </a>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-muted">Phone number not listed by map provider</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#60706c]">
                    {place.distanceMeters ? <span>{formatDistance(place.distanceMeters)}</span> : null}
                    <span>{place.source === "google" ? "Google Places" : "OpenStreetMap"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 sm:flex-col">
                  {place.phone ? (
                    <a className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-danger px-3 text-xs font-bold text-white" href={`tel:${toTelHref(place.phone)}`} aria-label={`Call ${place.name}`}>
                      <Phone aria-hidden="true" size={14} /> Call
                    </a>
                  ) : null}
                  {place.mapsUrl ? (
                    <a className="grid size-9 place-items-center rounded-xl border border-line bg-white text-danger" href={place.mapsUrl} target="_blank" rel="noreferrer" aria-label={`Open ${place.name} on map`}>
                      <MapPin aria-hidden="true" size={16} />
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-2xl border border-line bg-[#fbfdfc] p-3 text-xs leading-5 text-muted">
          <p>{nearbyLabels[kind].empty}</p>
          <a className="mt-2 inline-flex font-bold text-danger underline underline-offset-4" href={googleSearchUrl} target="_blank" rel="noreferrer">
            Search this near me on Google Maps
          </a>
        </div>
      )}
    </section>
  );
}

function QuickFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#f0d0c9] bg-[#fff8f6] p-3">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#9b5048]">{label}</p>
      <p className="mt-1 font-display text-base font-bold text-[#2c201f]">{value}</p>
    </div>
  );
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) return `${distanceMeters} m away`;
  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

function toTelHref(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function nearbySearchLabel(kind: NearbyKind) {
  const labels: Record<NearbyKind, string> = {
    police: "police station",
    hospital: "hospital emergency",
    ambulance: "ambulance service",
    fire: "fire station",
    "safe-place": "crowded public place",
  };
  return labels[kind];
}
