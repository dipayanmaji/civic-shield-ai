import { parseLatitude, parseLongitude } from "@/lib/geo/coordinates";

// The emergency page sends the type as its display label. Only these are accepted, so the
// value that reaches the database, the public alert ticker and the team email is one we chose.
export const EMERGENCY_TYPES = ["Women safety", "Fire", "Medical", "Live wire", "Accident", "Unsafe area"] as const;

const MAX_LOCATION_LENGTH = 300;
// Someone in an emergency may type a lot. Keep the start of it rather than refusing the alert.
const MAX_DETAILS_LENGTH = 500;

export type EmergencyReportInput = {
  type: string;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  details: string | null;
  isSafe: boolean;
};

export function parseEmergencyReportInput(value: unknown): { ok: true; report: EmergencyReportInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Emergency type and location are required." };
  const input = value as Record<string, unknown>;

  const type = typeof input.type === "string" ? EMERGENCY_TYPES.find((allowed) => allowed === input.type) : undefined;
  if (!type) return { ok: false, error: "Choose a valid emergency type." };

  const locationLabel = typeof input.locationLabel === "string" ? input.locationLabel.trim().slice(0, MAX_LOCATION_LENGTH) : "";
  if (!locationLabel) return { ok: false, error: "Emergency type and location are required." };

  // Coordinates are optional, but if one is sent it must be a real one, and they come as a pair.
  const hasLatitude = input.latitude !== undefined && input.latitude !== null;
  const hasLongitude = input.longitude !== undefined && input.longitude !== null;
  const latitude = parseLatitude(input.latitude);
  const longitude = parseLongitude(input.longitude);
  if (hasLatitude !== hasLongitude || (hasLatitude && (latitude === null || longitude === null))) {
    return { ok: false, error: "Location coordinates are not valid." };
  }

  if (input.details !== undefined && input.details !== null && typeof input.details !== "string") return { ok: false, error: "Details must be text." };
  const details = typeof input.details === "string" ? input.details.trim().slice(0, MAX_DETAILS_LENGTH) || null : null;
  if (input.isSafe !== undefined && typeof input.isSafe !== "boolean") return { ok: false, error: "Safety status must be true or false." };

  return { ok: true, report: { type, locationLabel, latitude, longitude, details, isSafe: input.isSafe === true } };
}
