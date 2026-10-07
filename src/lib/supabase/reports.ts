import { getSupabaseAdmin } from "@/lib/supabase/server";
import { publicAlertText, publicCoordinate, publicLocationLabel } from "@/lib/privacy/public-report";
import type { CivicReport, PublicCivicReport, PublicCivicReportDetail, PublicStatusEvent, ReportStatus, SafetyAnalysis } from "@/types/report";

type DbReport = {
  report_id: string;
  category: string | null;
  urgency: PublicCivicReport["urgency"];
  status: ReportStatus;
  location_label: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
};

type DbReportDetail = DbReport & {
  description: string;
  duration: string;
  affected_people: number | null;
  extra_details: string | null;
  attachment_count: number;
  route_name: string | null;
  analysis: SafetyAnalysis | null;
};

type DbStatusEvent = {
  status: ReportStatus;
  note: string;
  created_at: string;
};

export type ModeratorReport = PublicCivicReportDetail & { emailRecipient: string | null; gmailMessageId: string | null };

export async function createPersistentReport(input: Omit<CivicReport, "id" | "createdAt" | "updatedAt" | "status">) {
  const supabase = getSupabaseAdmin();
  const reportId = `CS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { error } = await supabase.from("civic_reports").insert({
    report_id: reportId,
    description: input.description,
    location_label: input.incidentLocation?.label ?? input.location,
    latitude: input.incidentLocation?.latitude ?? null,
    longitude: input.incidentLocation?.longitude ?? null,
    duration: input.duration,
    affected_people: Number(input.affectedPeople) || null,
    extra_details: input.extraDetails ?? null,
    attachment_count: input.attachments?.length ?? 0,
    status: "ready-to-analyze",
    public_visible: true,
  });
  if (error) throw new Error(error.message);
  await addStatusEvent(reportId, "ready-to-analyze", "Report created and queued for analysis.");
  return reportId;
}

export async function savePersistentAnalysis(reportId: string, analysis: SafetyAnalysis) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_reports").update({
    category: analysis.category,
    urgency: analysis.urgency,
    route_name: analysis.route.name,
    analysis: analysis,
    updated_at: new Date().toISOString(),
  }).eq("report_id", reportId);
  if (error) throw new Error(error.message);
}

export async function markPersistentDelivery(reportId: string, recipient: string, messageId?: string) {
  const supabase = getSupabaseAdmin();
  const sentAt = new Date().toISOString();
  const { error } = await supabase.from("civic_reports").update({
    email_recipient: recipient,
    gmail_message_id: messageId ?? null,
    email_sent_at: sentAt,
    updated_at: sentAt,
  }).eq("report_id", reportId);
  if (error) throw new Error(error.message);

  // Only advance reports that have not been picked up yet. A moderator-set status
  // (acknowledged, in-progress, resolved, ...) must not be rolled back by a later send.
  const { data: advanced, error: statusError } = await supabase.from("civic_reports")
    .update({ status: "delivery-confirmed" })
    .eq("report_id", reportId)
    .in("status", ["draft", "ready-to-analyze", "submitted"])
    .select("report_id");
  if (statusError) throw new Error(statusError.message);
  if (advanced?.length) await addStatusEvent(reportId, "delivery-confirmed", "Email accepted by Gmail for delivery.");
}

export async function getPublicReports(limit = 30): Promise<PublicCivicReport[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("civic_reports")
    .select("report_id, category, urgency, status, location_label, latitude, longitude, created_at, updated_at")
    .eq("public_visible", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbReport[]).map((report) => ({
    id: report.report_id,
    category: report.category,
    urgency: report.urgency,
    status: report.status,
    locationLabel: publicLocationLabel(report.location_label),
    latitude: publicCoordinate(report.latitude),
    longitude: publicCoordinate(report.longitude),
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  }));
}

export async function getNearbyPublicReports(latitude: number, longitude: number, radiusKm = 10, limit = 50): Promise<PublicCivicReport[]> {
  const reports = await getPublicReports(100);
  return reports
    .map((report) => ({
      ...report,
      distanceMeters: report.latitude !== null && report.longitude !== null ? getDistanceMeters(latitude, longitude, report.latitude, report.longitude) : undefined,
    }))
    .filter((report) => typeof report.distanceMeters === "number" && report.distanceMeters <= radiusKm * 1000)
    .sort((first, second) => {
      if (typeof first.distanceMeters === "number" && typeof second.distanceMeters === "number") return first.distanceMeters - second.distanceMeters;
      return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
    })
    .slice(0, limit);
}

export async function getPublicReportDetail(reportId: string): Promise<PublicCivicReportDetail | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("civic_reports")
    .select("report_id, description, location_label, latitude, longitude, duration, affected_people, extra_details, attachment_count, category, urgency, route_name, analysis, status, created_at, updated_at")
    .eq("public_visible", true)
    .eq("report_id", reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: events, error: eventsError } = await supabase.from("report_status_events")
    .select("status, note, created_at")
    .eq("report_id", reportId)
    .eq("public_visible", true)
    .order("created_at", { ascending: true });
  if (eventsError) throw new Error(eventsError.message);

  const report = data as DbReportDetail;
  const locationLabel = publicLocationLabel(report.location_label);
  return {
    id: report.report_id,
    description: report.analysis?.riskSummary ?? "A civic report is under review.",
    category: report.category,
    urgency: report.urgency,
    status: report.status,
    locationLabel,
    latitude: publicCoordinate(report.latitude),
    longitude: publicCoordinate(report.longitude),
    duration: report.duration,
    affectedPeople: report.affected_people,
    extraDetails: null,
    attachmentCount: report.attachment_count,
    routeName: report.route_name,
    analysis: report.analysis ? {
      riskSummary: report.analysis.riskSummary,
      immediateActions: Array.isArray(report.analysis.immediateActions) ? report.analysis.immediateActions : [],
      publicAlert: publicAlertText(report.category, locationLabel),
    } : null,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    statusEvents: ((events ?? []) as DbStatusEvent[]).map((event): PublicStatusEvent => ({
      status: event.status,
      note: event.note,
      createdAt: event.created_at,
    })),
  };
}

export async function addCommunityVerification(reportId: string, clientToken: string, verdict: "verified" | "disputed") {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("community_verifications").upsert({ report_id: reportId, client_token: clientToken, verdict }, { onConflict: "report_id,client_token" });
  if (error) throw new Error(error.message);
}

export async function updateReportStatus(reportId: string, status: ReportStatus, note: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_reports").update({ status, updated_at: new Date().toISOString() }).eq("report_id", reportId);
  if (error) throw new Error(error.message);
  await addStatusEvent(reportId, status, note);
}

export async function getModeratorReports(limit = 100): Promise<ModeratorReport[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("civic_reports")
    .select("report_id, description, location_label, latitude, longitude, duration, affected_people, extra_details, attachment_count, category, urgency, route_name, analysis, status, email_recipient, gmail_message_id, created_at, updated_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<DbReportDetail & { email_recipient: string | null; gmail_message_id: string | null }>).map((report) => ({
    id: report.report_id, description: report.description, category: report.category, urgency: report.urgency, status: report.status,
    locationLabel: report.location_label, latitude: report.latitude, longitude: report.longitude, duration: report.duration,
    affectedPeople: report.affected_people, extraDetails: report.extra_details, attachmentCount: report.attachment_count,
    routeName: report.route_name, analysis: report.analysis, createdAt: report.created_at, updatedAt: report.updated_at,
    statusEvents: [], emailRecipient: report.email_recipient, gmailMessageId: report.gmail_message_id,
  }));
}

export async function deleteModeratorReport(reportId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_reports").delete().eq("report_id", reportId);
  if (error) throw new Error(error.message);
}

async function addStatusEvent(reportId: string, status: ReportStatus, note: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("report_status_events").insert({ report_id: reportId, status, note, public_visible: true });
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
