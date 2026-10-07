export function publicLocationLabel(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 2 ? parts.slice(1, Math.min(parts.length, 4)).join(", ") : value;
}

// The public report page shows this instead of the stored analysis text. The stored alert (and the
// email draft / formal complaint beside it) carries the full address and 5-decimal coordinates, so
// the public copy is rebuilt from the already-trimmed location label.
export function publicAlertText(category: string | null, publicLabel: string) {
  return `Civic alert: ${category ?? "Civic issue"} reported near ${publicLabel}. Please use caution and avoid the affected area if it appears unsafe.`;
}

export function publicCoordinate(value: number | null) {
  return typeof value === "number" ? Number(value.toFixed(2)) : null;
}
