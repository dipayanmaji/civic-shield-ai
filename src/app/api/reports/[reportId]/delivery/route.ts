import { NextResponse } from "next/server";

import { hasValidReportWriteToken } from "@/lib/security/report-token";
import { markPersistentDelivery } from "@/lib/supabase/reports";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Persistent reporting is not configured." }, { status: 503 });
  const { reportId } = await params;
  if (!hasValidReportWriteToken(request, reportId)) return NextResponse.json({ error: "This report can only be updated from the browser that created it." }, { status: 403 });
  const body = await request.json().catch(() => null) as { recipient?: unknown; messageId?: unknown } | null;
  const recipient = typeof body?.recipient === "string" ? body.recipient.trim() : "";
  const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : undefined;
  if (!recipient || recipient.length > 200 || (messageId && messageId.length > 200)) return NextResponse.json({ error: "A valid recipient is required." }, { status: 400 });
  try {
    await markPersistentDelivery(reportId, recipient, messageId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delivery status could not be saved." }, { status: 500 });
  }
}
