import { NextResponse } from "next/server";

import { hasValidReportWriteToken } from "@/lib/security/report-token";
import { savePersistentAnalysis } from "@/lib/supabase/reports";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { SafetyAnalysis } from "@/types/report";

const MAX_ANALYSIS_BYTES = 50_000;
const urgencies = ["low", "medium", "high", "critical"];

// The public report page renders these fields directly, so a malformed value would break it.
function isValidAnalysis(value: unknown): value is SafetyAnalysis {
  if (!value || typeof value !== "object") return false;
  const analysis = value as Partial<SafetyAnalysis>;
  return typeof analysis.category === "string"
    && urgencies.includes(analysis.urgency as string)
    && typeof analysis.riskSummary === "string"
    && typeof analysis.publicAlert === "string"
    && Array.isArray(analysis.immediateActions) && analysis.immediateActions.every((action) => typeof action === "string")
    && typeof analysis.route?.name === "string"
    && JSON.stringify(analysis).length <= MAX_ANALYSIS_BYTES;
}

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Persistent reporting is not configured." }, { status: 503 });
  const { reportId } = await params;
  if (!hasValidReportWriteToken(request, reportId)) return NextResponse.json({ error: "This report can only be updated from the browser that created it." }, { status: 403 });
  const body = await request.json().catch(() => null) as { analysis?: unknown } | null;
  if (!isValidAnalysis(body?.analysis)) return NextResponse.json({ error: "A valid analysis is required." }, { status: 400 });
  try {
    await savePersistentAnalysis(reportId, body.analysis);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis could not be saved." }, { status: 500 });
  }
}
