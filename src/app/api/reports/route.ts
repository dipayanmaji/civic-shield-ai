import { NextResponse } from "next/server";

import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";
import { sendTeamNotification } from "@/lib/notifications/team-email";
import { createPersistentReport } from "@/lib/supabase/reports";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { CivicReportInput } from "@/types/report";

export async function POST(request: Request) {
  const rate = allowRequest(request, "report-create", 6);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Persistent reporting is not configured." }, { status: 503 });
  const body = (await request.json()) as { report?: CivicReportInput };
  const report = body.report;
  if (!report?.description || !report.location || !report.duration || !report.incidentLocation) {
    return NextResponse.json({ error: "A complete report and confirmed location are required." }, { status: 400 });
  }
  try {
    const reportId = await createPersistentReport({ ...report, attachments: report.attachments ?? [] });
    const coordinates = report.incidentLocation?.latitude != null && report.incidentLocation?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${report.incidentLocation.latitude},${report.incidentLocation.longitude}`
      : "Not available";
    await sendTeamNotification({
      subject: `New CivicShield civic report ${reportId}`,
      body: [
        `Report reference: ${reportId}`,
        `Issue: ${report.description}`,
        `Location: ${report.incidentLocation?.label ?? report.location}`,
        `Map: ${coordinates}`,
        `Duration: ${report.duration}`,
        `People affected: ${report.affectedPeople || "Not provided"}`,
        `Extra details: ${report.extraDetails || "Not provided"}`,
        `Evidence files: ${report.attachments?.length ?? 0}`,
      ].join("\r\n"),
    }).catch((error) => console.error("Civic report team notification failed:", error));
    return NextResponse.json({ reportId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Report could not be saved." }, { status: 500 });
  }
}
