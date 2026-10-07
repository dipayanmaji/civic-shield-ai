import { NextResponse } from "next/server";

import { parseLatitude, parseLongitude } from "@/lib/geo/coordinates";
import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";

const MAX_QUERY_LENGTH = 200;

type Coordinates = { latitude: number; longitude: number };

type LocationResult = {
  label: string;
  latitude: number;
  longitude: number;
};

export async function GET(request: Request) {
  // Every call can reach Google (billed) or Nominatim (which bans heavy shared-IP use). The
  // location search is debounced to under two requests a second, so this leaves normal typing alone.
  const rate = allowRequest(request, "geocode", 60);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const latitude = parseLatitude(url.searchParams.get("lat"));
  const longitude = parseLongitude(url.searchParams.get("lon"));
  const coordinates = latitude !== null && longitude !== null ? { latitude, longitude } : null;
  if (!coordinates && (!query || query.length < 3 || query.length > MAX_QUERY_LENGTH)) return NextResponse.json({ error: "Enter a location search or valid coordinates." }, { status: 400 });

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleKey) {
    const googleResult = coordinates
      ? await reverseGeocodeWithGoogle({ ...coordinates, googleKey })
      : await searchWithGoogle({ query: query ?? "", googleKey });
    if (googleResult) return NextResponse.json(googleResult);
  }

  try {
    const endpoint = coordinates
      ? `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${coordinates.latitude}&lon=${coordinates.longitude}`
      : `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query ?? "")}`;
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "CivicShieldAI-Hackathon/0.1 (contact: project-demo)" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("Geocoder request failed");
    const payload = await response.json() as { display_name?: string; lat?: string; lon?: string } | Array<{ display_name: string; lat: string; lon: string }>;
    if (Array.isArray(payload)) {
      const results = payload.map((result) => ({ label: result.display_name, latitude: Number(result.lat), longitude: Number(result.lon) }));
      if (!results.length) return NextResponse.json({ error: "Location not found." }, { status: 404 });
      return NextResponse.json({ results });
    }
    const result = payload;
    if (!result) return NextResponse.json({ error: "Location not found." }, { status: 404 });
    return NextResponse.json({ label: result.display_name, latitude: Number(result.lat), longitude: Number(result.lon) });
  } catch {
    return NextResponse.json({ error: "Location search is temporarily unavailable." }, { status: 503 });
  }
}

async function searchWithGoogle({ query, googleKey }: { query: string; googleKey: string }) {
  try {
    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.searchParams.set("address", query);
    endpoint.searchParams.set("key", googleKey);
    endpoint.searchParams.set("region", "in");

    const response = await fetch(endpoint, { next: { revalidate: 86400 } });
    if (!response.ok) return null;
    const payload = await response.json() as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    if (payload.status !== "OK") return null;

    const results = (payload.results ?? [])
      .map((result): LocationResult | null => {
        const latitude = result.geometry?.location?.lat;
        const longitude = result.geometry?.location?.lng;
        if (!result.formatted_address || typeof latitude !== "number" || typeof longitude !== "number") return null;
        return { label: result.formatted_address, latitude, longitude };
      })
      .filter((result): result is LocationResult => Boolean(result))
      .slice(0, 5);

    return results.length ? { results } : null;
  } catch {
    return null;
  }
}

async function reverseGeocodeWithGoogle({
  latitude,
  longitude,
  googleKey,
}: Coordinates & {
  googleKey: string;
}) {
  try {
    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.searchParams.set("latlng", `${latitude},${longitude}`);
    endpoint.searchParams.set("key", googleKey);
    endpoint.searchParams.set("result_type", "street_address|premise|route|neighborhood|sublocality|locality");

    const response = await fetch(endpoint, { next: { revalidate: 86400 } });
    if (!response.ok) return null;
    const payload = await response.json() as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    const firstResult = payload.results?.[0];
    const resultLatitude = firstResult?.geometry?.location?.lat;
    const resultLongitude = firstResult?.geometry?.location?.lng;
    if (payload.status !== "OK" || !firstResult?.formatted_address || typeof resultLatitude !== "number" || typeof resultLongitude !== "number") return null;

    return {
      label: firstResult.formatted_address,
      latitude: resultLatitude,
      longitude: resultLongitude,
    };
  } catch {
    return null;
  }
}
