import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getInstagramRedirectUri } from "@/lib/instagram/integration";
import { hasModeratorSession } from "@/lib/moderator/auth";

const INSTAGRAM_STATE_COOKIE = "civicshield_instagram_oauth_state";

export async function GET(request: Request) {
  if (!hasModeratorSession(request.headers.get("cookie"))) return NextResponse.redirect(new URL("/moderator?instagram=sign-in-required", request.url));
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return NextResponse.redirect(new URL("/moderator?instagram=configuration-error", request.url));

  const state = randomBytes(24).toString("hex");
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  const authorizationUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  authorizationUrl.searchParams.set("client_id", appId);
  authorizationUrl.searchParams.set("redirect_uri", getInstagramRedirectUri(request));
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management");
  authorizationUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(INSTAGRAM_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return response;
}
