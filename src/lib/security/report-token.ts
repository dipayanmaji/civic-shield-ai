import { createHmac, timingSafeEqual } from "crypto";

import { REPORT_TOKEN_HEADER } from "@/lib/security/report-token-header";

// Report IDs are public (they appear in the dashboard and in /api/public-reports), so they
// cannot authorise writes. The creator receives this token when the report is saved and
// sends it back on later updates. It is derived from a server-only secret, so no extra
// storage or configuration is needed.
function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createReportWriteToken(reportId: string) {
  const key = secret();
  if (!key) throw new Error("Report write tokens are not configured.");
  return createHmac("sha256", key).update(`civicshield:report-write:${reportId}`).digest("base64url");
}

export function hasValidReportWriteToken(request: Request, reportId: string) {
  const provided = request.headers.get(REPORT_TOKEN_HEADER);
  if (!provided || !secret()) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(createReportWriteToken(reportId));
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}
