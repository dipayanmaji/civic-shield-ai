// Query-string and form values arrive as string | null, JSON bodies as number | null. Number(null)
// and Number("") are both 0, which is a valid coordinate, so a missing value must be rejected
// before converting.
function parseBounded(value: unknown, max: number) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= max ? parsed : null;
}

export function parseLatitude(value: unknown) {
  return parseBounded(value, 90);
}

export function parseLongitude(value: unknown) {
  return parseBounded(value, 180);
}

// A search radius in km; missing, non-positive or non-numeric values use the default, large ones are capped.
export function parseRadiusKm(value: string | null, fallback: number, max = 100) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}
