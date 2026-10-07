"use client";

import dynamic from "next/dynamic";
import { Crosshair, LoaderCircle, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { IncidentLocation } from "@/types/report";

const LocationMap = dynamic(() => import("./location-map").then((module) => module.LocationMap), {
  ssr: false,
  loading: () => <div className="grid h-64 place-items-center bg-[#edf5f2] text-sm text-muted">Loading map…</div>,
});

const DEFAULT_LOCATION: IncidentLocation = {
  label: "Select a precise location on the map",
  latitude: 22.5726,
  longitude: 88.3639,
  source: "manual",
};

type LocationSuggestion = { label: string; latitude: number; longitude: number };

export function LocationPicker({
  error,
  onChange,
  value,
}: {
  error?: string;
  onChange: (location: IncidentLocation) => void;
  value?: IncidentLocation;
}) {
  const [location, setLocation] = useState<IncidentLocation>(value ?? DEFAULT_LOCATION);
  const [query, setQuery] = useState(value?.label ?? "");
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);

  useEffect(() => {
    if (selectionConfirmed) {
      return;
    }
    if (query.trim().length < 3) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSuggesting(true);
      void fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`)
        .then((response) => response.json())
        .then((result: { results?: LocationSuggestion[] }) => { if (active) setSuggestions(uniqueSuggestions(result.results ?? [])); })
        .catch(() => { if (active) setSuggestions([]); })
        .finally(() => { if (active) setSuggesting(false); });
    }, 450);
    return () => { active = false; window.clearTimeout(timer); setSuggesting(false); };
  }, [query, selectionConfirmed]);

  function confirmLocation(next: IncidentLocation) {
    setSelectionConfirmed(true);
    setLocation(next);
    setQuery(next.label);
    setSuggestions([]);
    onChange(next);
    setNotice("Location selected. Please confirm it is accurate before continuing.");
  }

  async function searchLocation() {
    if (query.trim().length < 3) {
      setNotice("Type at least 3 characters to search a location.");
      return;
    }
    setSearching(true);
    setNotice("");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const result = (await response.json()) as { results?: LocationSuggestion[] };
      const firstResult = result.results?.[0];
      if (!response.ok || !firstResult) throw new Error("not found");
      confirmLocation({ label: firstResult.label, latitude: firstResult.latitude, longitude: firstResult.longitude, source: "search" });
    } catch {
      setNotice("We could not find that place. Select the point directly on the map instead.");
    } finally {
      setSearching(false);
    }
  }

  async function resolveCoordinates(latitude: number, longitude: number, source: IncidentLocation["source"]) {
    setSearching(true);
    setNotice("Finding the locality and street name for this pin…");
    const coordinateLabel = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    try {
      const response = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`);
      const result = (await response.json()) as { label?: string };
      confirmLocation({
        label: result.label ?? `Pinned location near ${coordinateLabel}`,
        latitude,
        longitude,
        source,
      });
    } catch {
      confirmLocation({ label: `Pinned location near ${coordinateLabel}`, latitude, longitude, source });
      setNotice("The pin is saved. A readable locality name could not be fetched right now.");
    } finally {
      setSearching(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setNotice("Current-location access is not supported in this browser. Select the location on the map instead.");
      return;
    }
    setSearching(true);
    setNotice("Requesting your current location…");
    navigator.geolocation.getCurrentPosition(
      (position) => void resolveCoordinates(position.coords.latitude, position.coords.longitude, "current-location"),
      () => {
        setNotice("Location permission was unavailable. Search or tap the map to choose a place.");
        setSearching(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <section className="isolate overflow-visible rounded-2xl border border-line bg-[#fbfdfc] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-ink"><MapPin aria-hidden="true" size={16} /> Confirm incident location</p>
          <p className="mt-1 text-xs leading-5 text-muted">Search, use your current position, or tap the map pin.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={useCurrentLocation} disabled={searching}>
          <Crosshair aria-hidden="true" size={15} /> Use current location
        </Button>
      </div>
      <div className="relative z-[1100] mt-4">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="location-search">Search an address or landmark</label>
          <input
            id="location-search"
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-sm focus:border-brand focus:outline-none"
            value={query}
            onChange={(event) => {
              setSelectionConfirmed(false);
              setSuggestions([]);
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void searchLocation(); }
            }}
            placeholder="Start typing a street, area, landmark, or city"
            autoComplete="street-address"
          />
          </div>
          <Button type="button" size="sm" disabled={searching} onClick={() => void searchLocation()}>
            {searching ? <LoaderCircle className="animate-spin" aria-hidden="true" size={15} /> : <Search aria-hidden="true" size={15} />}
            Search
          </Button>
        </div>
        {query.trim().length >= 3 && !selectionConfirmed && suggesting && !suggestions.length ? <div className="absolute inset-x-0 top-full z-[1100] mt-2 space-y-1 rounded-xl border border-line bg-white p-2 shadow-surface" role="status" aria-busy="true">
          <span className="sr-only">Searching locations</span>
          {[0, 1, 2].map((item) => <Skeleton className={`h-9 ${item === 0 ? "w-11/12" : item === 1 ? "w-3/4" : "w-5/6"}`} key={item} />)}
        </div> : null}
        {query.trim().length >= 3 && suggestions.length ? <div className="absolute inset-x-0 top-full z-[1100] mt-2 max-h-60 overflow-auto rounded-xl border border-line bg-white p-1 shadow-surface" role="listbox" aria-label="Location suggestions">
        {suggestions.map((suggestion) => <button key={`${suggestion.latitude}-${suggestion.longitude}-${suggestion.label}`} type="button" role="option" aria-selected={false} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm leading-5 text-ink transition hover:bg-brand-soft focus:bg-brand-soft focus:outline-none" onClick={() => confirmLocation({ ...suggestion, source: "search" })}>{suggestion.label}</button>)}
        </div> : null}
      </div>
      <div className="relative z-0 mt-4 overflow-hidden rounded-xl border border-line">
        <LocationMap
          coordinates={{ latitude: location.latitude, longitude: location.longitude }}
          onSelect={({ latitude, longitude }) => void resolveCoordinates(latitude, longitude, "map-pin")}
        />
      </div>
      <div className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-xs leading-5 text-[#31544b]">
        <strong>Selected:</strong> {location.label}
        <span className="mt-0.5 block"><strong>Coordinates:</strong> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span>
      </div>
      {notice ? <p className="mt-2 text-xs font-medium text-muted" role="status">{notice}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-danger">{error}</p> : null}
    </section>
  );
}

function uniqueSuggestions(suggestions: LocationSuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.latitude.toFixed(6)}:${suggestion.longitude.toFixed(6)}:${suggestion.label.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
