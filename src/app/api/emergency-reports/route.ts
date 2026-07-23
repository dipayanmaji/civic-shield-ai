import { NextResponse } from "next/server";

import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";
import { sendTeamNotification } from "@/lib/notifications/team-email";
import { createEmergencyReport, getEmergencyReports } from "@/lib/supabase/emergency";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { EmergencyReport, UrgencyLevel } from "@/types/report";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ reports: [] });

  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? 5);

  try {
    const reports = await getEmergencyReports({
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
      radiusKm: Number.isFinite(radiusKm) ? radiusKm : 5,
      limit: 30,
    });
    return NextResponse.json({ reports: await prioritizeEmergencyReports(reports) });
  } catch {
    return NextResponse.json({ reports: [] });
  }
}

export async function POST(request: Request) {
  const rate = allowRequest(request, "emergency-create", 4);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Emergency reporting is not configured." }, { status: 503 });

  const body = await request.json() as {
    report?: {
      type?: string;
      locationLabel?: string;
      latitude?: number | null;
      longitude?: number | null;
      details?: string | null;
      isSafe?: boolean;
    };
  };
  const report = body.report;
  if (!report?.type || !report.locationLabel) {
    return NextResponse.json({ error: "Emergency type and location are required." }, { status: 400 });
  }

  try {
    const emergencyId = await createEmergencyReport({
      type: report.type,
      locationLabel: report.locationLabel,
      latitude: report.latitude,
      longitude: report.longitude,
      details: report.details,
      isSafe: Boolean(report.isSafe),
    });
    const mapUrl = report.latitude != null && report.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`
      : "Not available";
    await sendTeamNotification({
      subject: `New CivicShield emergency alert ${emergencyId}`,
      body: [
        `Emergency reference: ${emergencyId}`,
        `Type: ${report.type}`,
        `Location: ${report.locationLabel}`,
        `Map: ${mapUrl}`,
        `Details: ${report.details?.trim() || "Not provided"}`,
        `User marked safe: ${report.isSafe ? "Yes" : "No"}`,
        "",
        "This is a CivicShield incident record. In immediate danger, call 112.",
      ].join("\r\n"),
    }).catch((error) => console.error("Emergency team notification failed:", error));
    return NextResponse.json({ emergencyId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Emergency report could not be saved." }, { status: 500 });
  }
}

async function prioritizeEmergencyReports(reports: EmergencyReport[]) {
  const fallback = reports.map((report) => ({
    ...report,
    priority: inferPriority(report),
    priorityReason: getFallbackReason(report),
  })).sort(comparePriority).slice(0, 12);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || reports.length === 0) return fallback;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: `Prioritize emergency alerts for a public safety marquee. Return only JSON: {"items":[{"id":"string","priority":"critical|high|medium|low","reason":"short plain-language reason"}]}. Prioritize immediate danger, women safety, unsafe/not-safe reports, medical/accident/fire/live wire, recency, and proximity. Do not invent facts. Alerts: ${JSON.stringify(reports.map((report) => ({ id: report.id, type: report.type, details: report.details, isSafe: report.isSafe, createdAt: report.createdAt, distanceMeters: report.distanceMeters })))}`
        }],
      }),
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as { items?: Array<{ id?: string; priority?: UrgencyLevel; reason?: string }> };
    const byId = new Map((parsed.items ?? []).map((item) => [item.id, item]));
    return reports.map((report) => {
      const item = byId.get(report.id);
      return {
        ...report,
        priority: isUrgency(item?.priority) ? item.priority : inferPriority(report),
        priorityReason: item?.reason || getFallbackReason(report),
      };
    }).sort(comparePriority).slice(0, 12);
  } catch {
    return fallback;
  }
}

function inferPriority(report: EmergencyReport): UrgencyLevel {
  const text = `${report.type} ${report.details ?? ""}`.toLowerCase();
  if (!report.isSafe || /fire|live wire|accident|medical|injury|violence|stalking|harassment|women/.test(text)) return "critical";
  if (/unsafe|panic|threat|collapse|electric/.test(text)) return "high";
  return "medium";
}

function getFallbackReason(report: EmergencyReport) {
  if (!report.isSafe) return "User has not confirmed they are safe.";
  if (report.type.toLowerCase().includes("women")) return "Women-safety alert near this location.";
  return "Recent emergency lodged near this location.";
}

function comparePriority(first: EmergencyReport, second: EmergencyReport) {
  const score: Record<UrgencyLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const priorityDiff = score[second.priority ?? "medium"] - score[first.priority ?? "medium"];
  if (priorityDiff !== 0) return priorityDiff;
  return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
}

function isUrgency(value: unknown): value is UrgencyLevel {
  return value === "critical" || value === "high" || value === "medium" || value === "low";
}
