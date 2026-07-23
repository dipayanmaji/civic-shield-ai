import { NextResponse } from "next/server";

import { getInstagramConnectionStatus } from "@/lib/instagram/integration";
import { hasModeratorSession } from "@/lib/moderator/auth";

export async function GET(request: Request) {
  if (!hasModeratorSession(request.headers.get("cookie"))) return NextResponse.json({ error: "Moderator sign-in required." }, { status: 401 });
  try {
    return NextResponse.json(await getInstagramConnectionStatus());
  } catch {
    return NextResponse.json({ connected: false, source: null, pageName: null, username: null, connectedAt: null, lastValidatedAt: null, lastError: "Instagram connection storage is not ready. Run the latest Supabase SQL setup." });
  }
}
