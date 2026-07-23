import { NextResponse } from "next/server";

import { getInstagramRedirectUri, saveInstagramIntegration } from "@/lib/instagram/integration";

const INSTAGRAM_STATE_COOKIE = "civicshield_instagram_oauth_state";

type TokenResponse = { access_token?: string; error?: { message?: string } };
type Page = { id: string; name?: string; access_token?: string };
type PagesResponse = { data?: Page[]; error?: { message?: string } };
type InstagramAccountResponse = { instagram_business_account?: { id?: string; username?: string }; error?: { message?: string } };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const cookieState = request.headers.get("cookie")?.match(new RegExp(`${INSTAGRAM_STATE_COOKIE}=([^;]+)`))?.[1];
  const code = url.searchParams.get("code");
  if (!code || !state || state !== cookieState) return redirect(request, "connection-failed");

  try {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) throw new Error("Meta app configuration is missing.");
    const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
    const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", getInstagramRedirectUri(request));
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl);
    const tokenPayload = await tokenResponse.json() as TokenResponse;
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error?.message ?? "Could not exchange the Meta connection code.");

    const pagesUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,access_token");
    pagesUrl.searchParams.set("access_token", tokenPayload.access_token);
    const pagesResponse = await fetch(pagesUrl);
    const pagesPayload = await pagesResponse.json() as PagesResponse;
    if (!pagesResponse.ok || !pagesPayload.data?.length) throw new Error(pagesPayload.error?.message ?? "No Facebook Page was available for this Meta account.");

    for (const page of pagesPayload.data) {
      if (!page.access_token) continue;
      const accountUrl = new URL(`https://graph.facebook.com/${version}/${page.id}`);
      accountUrl.searchParams.set("fields", "instagram_business_account{id,username}");
      accountUrl.searchParams.set("access_token", page.access_token);
      const accountResponse = await fetch(accountUrl);
      const accountPayload = await accountResponse.json() as InstagramAccountResponse;
      const instagram = accountPayload.instagram_business_account;
      if (!accountResponse.ok || !instagram?.id) continue;
      await saveInstagramIntegration({ pageId: page.id, pageName: page.name ?? null, igUserId: instagram.id, username: instagram.username ?? null, pageAccessToken: page.access_token });
      const response = redirect(request, "connected");
      response.cookies.delete(INSTAGRAM_STATE_COOKIE);
      return response;
    }
    throw new Error("No Instagram professional account was connected to the available Facebook Page.");
  } catch {
    return redirect(request, "connection-failed");
  }
}

function redirect(request: Request, result: string) {
  return NextResponse.redirect(new URL(`/moderator?instagram=${result}`, request.url));
}
