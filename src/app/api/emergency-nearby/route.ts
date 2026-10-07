import { NextResponse } from "next/server";

import { parseLatitude, parseLongitude } from "@/lib/geo/coordinates";
import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";

type NearbyKind = "police" | "hospital" | "ambulance" | "fire" | "safe-place";

type NearbyPlace = {
  name: string;
  address: string;
  phone?: string;
  distanceMeters?: number;
  mapsUrl?: string;
  source: "google" | "openstreetmap";
};

const googleQueries: Record<NearbyKind, string> = {
  police: "police station",
  hospital: "emergency hospital",
  ambulance: "ambulance service",
  fire: "fire station",
  "safe-place": "busy public place shopping mall metro station market",
};

const overpassQueries: Record<NearbyKind, string[]> = {
  police: ['node["amenity"="police"]', 'way["amenity"="police"]'],
  hospital: ['node["amenity"="hospital"]', 'way["amenity"="hospital"]'],
  ambulance: ['node["emergency"="ambulance_station"]', 'way["emergency"="ambulance_station"]'],
  fire: ['node["amenity"="fire_station"]', 'way["amenity"="fire_station"]'],
  "safe-place": [
    'node["shop"="mall"]',
    'way["shop"="mall"]',
    'node["railway"="station"]',
    'node["public_transport"="station"]',
    'node["amenity"="marketplace"]',
    'way["amenity"="marketplace"]',
  ],
};

// Own-property check: `"constructor" in googleQueries` is true and would pass a plain `in` test.
function isNearbyKind(value: string | null): value is NearbyKind {
  return value !== null && Object.hasOwn(googleQueries, value);
}

export async function GET(request: Request) {
  // Each call can reach Google Places (billed) and Overpass. The emergency page makes one call per
  // kind (5) on load, so this allows several page loads a minute.
  const rate = allowRequest(request, "emergency-nearby", 30);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);

  const url = new URL(request.url);
  const lat = parseLatitude(url.searchParams.get("lat"));
  const lon = parseLongitude(url.searchParams.get("lon"));
  const kind = url.searchParams.get("kind");

  if (lat === null || lon === null || !isNearbyKind(kind)) {
    return NextResponse.json({ error: "Valid latitude, longitude, and nearby kind are required." }, { status: 400 });
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  let googleStatus = googleKey ? "configured" : "missing-key";
  if (googleKey) {
    const googleResult = await fetchGooglePlaces({ kind, lat, lon, googleKey });
    googleStatus = googleResult.status;
    if (googleResult.places.length) return NextResponse.json({ places: googleResult.places, provider: "google", googleStatus });
  }

  const openStreetMapPlaces = await fetchOpenStreetMapPlaces({ kind, lat, lon });
  return NextResponse.json({ places: openStreetMapPlaces, provider: "openstreetmap", googleStatus });
}

async function fetchGooglePlaces({
  kind,
  lat,
  lon,
  googleKey,
}: {
  kind: NearbyKind;
  lat: number;
  lon: number;
  googleKey: string;
}): Promise<{ places: NearbyPlace[]; status: string }> {
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask": "places.id,places.name,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.googleMapsUri,places.location",
      },
      body: JSON.stringify({
        textQuery: `${googleQueries[kind]} near ${lat},${lon}`,
        maxResultCount: 5,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius: kind === "safe-place" ? 5000 : 15000,
          },
        },
      }),
      next: { revalidate: 300 },
    });

    if (!response.ok) return { places: [], status: `google-http-${response.status}` };
    const payload = await response.json() as {
      error?: { message?: string; status?: string };
      places?: Array<{
        id?: string;
        name?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        nationalPhoneNumber?: string;
        internationalPhoneNumber?: string;
        googleMapsUri?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };

    if (payload.error?.status) return { places: [], status: payload.error.status };

    const places = await Promise.all((payload.places ?? []).map(async (place) => {
      const details = place.nationalPhoneNumber || place.internationalPhoneNumber
        ? null
        : await fetchGooglePlaceDetails({ placeResource: place.name, placeId: place.id, googleKey });
      const detailLocation = details?.location;
      const placeLatitude = place.location?.latitude ?? detailLocation?.latitude;
      const placeLongitude = place.location?.longitude ?? detailLocation?.longitude;

      return {
        name: place.displayName?.text ?? details?.displayName?.text ?? "Nearby place",
        address: place.formattedAddress ?? details?.formattedAddress ?? "Address not available",
        phone: normalisePhone(place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? details?.nationalPhoneNumber ?? details?.internationalPhoneNumber),
        mapsUrl: place.googleMapsUri ?? details?.googleMapsUri,
        distanceMeters: typeof placeLatitude === "number" && typeof placeLongitude === "number" ? getDistanceMeters(lat, lon, placeLatitude, placeLongitude) : undefined,
        source: "google" as const,
      };
    }));

    return { places, status: "ok" };
  } catch {
    return { places: [], status: "google-request-failed" };
  }
}

async function fetchGooglePlaceDetails({
  placeResource,
  placeId,
  googleKey,
}: {
  placeResource?: string;
  placeId?: string;
  googleKey: string;
}) {
  const resource = placeResource ?? (placeId ? `places/${placeId}` : "");
  if (!resource) return null;

  try {
    const response = await fetch(`https://places.googleapis.com/v1/${resource}`, {
      headers: {
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask": "displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,googleMapsUri,location",
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return await response.json() as {
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      googleMapsUri?: string;
      location?: { latitude?: number; longitude?: number };
    };
  } catch {
    return null;
  }
}

async function fetchOpenStreetMapPlaces({ kind, lat, lon }: { kind: NearbyKind; lat: number; lon: number }): Promise<NearbyPlace[]> {
  const radius = kind === "safe-place" ? 5000 : 15000;
  const selectors = overpassQueries[kind].map((selector) => `${selector}(around:${radius},${lat},${lon});`).join("");
  const query = `[out:json][timeout:8];(${selectors});out center tags 8;`;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CivicShieldAI-Hackathon/0.1",
      },
      body: new URLSearchParams({ data: query }),
      next: { revalidate: 300 },
    });

    if (!response.ok) return [];
    const payload = await response.json() as {
      elements?: Array<{
        lat?: number;
        lon?: number;
        center?: { lat?: number; lon?: number };
        tags?: Record<string, string>;
      }>;
    };

    return (payload.elements ?? [])
      .map((element) => {
        const placeLat = element.lat ?? element.center?.lat;
        const placeLon = element.lon ?? element.center?.lon;
        return {
          name: element.tags?.name ?? readableKind(kind),
          address: buildOsmAddress(element.tags),
          phone: element.tags?.phone ?? element.tags?.["contact:phone"],
          mapsUrl: typeof placeLat === "number" && typeof placeLon === "number" ? `https://www.google.com/maps/search/?api=1&query=${placeLat},${placeLon}` : undefined,
          distanceMeters: typeof placeLat === "number" && typeof placeLon === "number" ? getDistanceMeters(lat, lon, placeLat, placeLon) : undefined,
          source: "openstreetmap" as const,
        };
      })
      .sort((first, second) => (first.distanceMeters ?? 999999) - (second.distanceMeters ?? 999999))
      .slice(0, 5);
  } catch {
    return [];
  }
}

function readableKind(kind: NearbyKind) {
  const labels: Record<NearbyKind, string> = {
    police: "Nearby police station",
    hospital: "Nearby hospital",
    ambulance: "Nearby ambulance service",
    fire: "Nearby fire station",
    "safe-place": "Nearby safer public place",
  };
  return labels[kind];
}

function buildOsmAddress(tags?: Record<string, string>) {
  if (!tags) return "Address not available";
  return [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:city"]].filter(Boolean).join(", ") || "Address not available";
}

function normalisePhone(phone?: string) {
  return phone?.replace(/\s+/g, " ").trim();
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}
