import { NextResponse } from "next/server";

import { createModeratorSession, MODERATOR_COOKIE, moderatorAuthConfigured, validModeratorAccessKey } from "@/lib/moderator/auth";
import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";

const MAX_ACCESS_KEY_LENGTH = 256;

export async function POST(request: Request) {
  const rate = allowRequest(request, "moderator-login", 5);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
  if (!moderatorAuthConfigured()) return NextResponse.json({ error: "Moderator access is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as { accessKey?: unknown } | null;
  const accessKey = body?.accessKey;
  if (typeof accessKey !== "string" || !accessKey || accessKey.length > MAX_ACCESS_KEY_LENGTH || !validModeratorAccessKey(accessKey)) {
    return NextResponse.json({ error: "Invalid moderator access key." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(MODERATOR_COOKIE, createModeratorSession(), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
  return response;
}
