import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { EmergencyReport } from "@/types/report";

type DbEmergencyReport = {
  emergency_id: string;
  emergency_type: string;
  location_label: string;
  latitude: number | null;
  longitude: number | null;
  details: string | null;
  is_safe: boolean;
  created_at: string;
};

export async function createEmergencyReport(input: {
  type: string;
  locationLabel: string;
  latitude?: number | null;
  longitude?: number | null;
  details?: string | null;
  isSafe: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const emergencyId = `EM-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { error } = await supabase.from("emergency_reports").insert({
    emergency_id: emergencyId,
    emergency_type: input.type,
    location_label: input.locationLabel,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    details: input.details ?? null,
    is_safe: input.isSafe,
    public_visible: true,
  });
  if (error) throw new Error(error.message);
  return emergencyId;
}

export async function getEmergencyReports(options: { latitude?: number; longitude?: number; radiusKm?: number; limit?: number }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("emergency_reports")
    .select("emergency_id, emergency_type, location_label, latitude, longitude, details, is_safe, created_at")
    .eq("public_visible", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const reports = ((data ?? []) as DbEmergencyReport[]).map((report): EmergencyReport => ({
    id: report.emergency_id,
    type: report.emergency_type,
    locationLabel: report.location_label,
    latitude: report.latitude,
    longitude: report.longitude,
    details: report.details,
    isSafe: report.is_safe,
    createdAt: report.created_at,
    distanceMeters: options.latitude !== undefined && options.longitude !== undefined && report.latitude !== null && report.longitude !== null
      ? getDistanceMeters(options.latitude, options.longitude, report.latitude, report.longitude)
      : undefined,
  })).filter((report) => isWithinLast24Hours(report.createdAt));

  if (typeof options.latitude === "number" && typeof options.longitude === "number") {
    const radiusMeters = (options.radiusKm ?? 5) * 1000;
    return reports
      .filter((report) => typeof report.distanceMeters === "number" && report.distanceMeters <= radiusMeters)
      .sort((first, second) => (first.distanceMeters ?? 999999) - (second.distanceMeters ?? 999999))
      .slice(0, options.limit ?? 12);
  }

  return reports.slice(0, options.limit ?? 12);
}

export async function getModeratorEmergencyReports(limit = 100) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("emergency_reports")
    .select("emergency_id, emergency_type, location_label, latitude, longitude, details, is_safe, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return ((data ?? []) as DbEmergencyReport[]).map((report): EmergencyReport => ({
    id: report.emergency_id,
    type: report.emergency_type,
    locationLabel: report.location_label,
    latitude: report.latitude,
    longitude: report.longitude,
    details: report.details,
    isSafe: report.is_safe,
    createdAt: report.created_at,
  }));
}

export async function deleteModeratorEmergencyReport(reportId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("emergency_reports").delete().eq("emergency_id", reportId);
  if (error) throw new Error(error.message);
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

function isWithinLast24Hours(value: string) {
  return new Date(value).getTime() >= Date.now() - 24 * 60 * 60 * 1000;
}
