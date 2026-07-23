import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const INTEGRATION_KEY = "civicshield";

type IntegrationRow = {
  page_id: string;
  page_name: string | null;
  ig_user_id: string;
  instagram_username: string | null;
  page_access_token: string;
  connected_at: string;
  last_validated_at: string | null;
  last_error: string | null;
};

export type InstagramPublishingCredentials = {
  accessToken: string;
  igUserId: string;
  pageName: string | null;
  username: string | null;
  source: "oauth" | "environment";
};

export type InstagramConnectionStatus = {
  connected: boolean;
  source: "oauth" | "environment" | null;
  pageName: string | null;
  username: string | null;
  connectedAt: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
};

export function getInstagramRedirectUri(request: Request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return `${siteUrl.replace(/\/$/, "")}/api/auth/instagram/callback`;
}

export async function saveInstagramIntegration(input: {
  pageId: string;
  pageName: string | null;
  igUserId: string;
  username: string | null;
  pageAccessToken: string;
}) {
  if (!isSupabaseConfigured()) throw new Error("Supabase server configuration is missing.");
  const { error } = await getSupabaseAdmin().from("instagram_integrations").upsert({
    integration_key: INTEGRATION_KEY,
    page_id: input.pageId,
    page_name: input.pageName,
    ig_user_id: input.igUserId,
    instagram_username: input.username,
    page_access_token: input.pageAccessToken,
    connected_at: new Date().toISOString(),
    last_validated_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "integration_key" });
  if (error) throw new Error(error.message.includes("instagram_integrations") ? "Instagram connection storage is not ready. Run the latest Supabase SQL setup first." : error.message);
}

export async function getInstagramConnectionStatus(): Promise<InstagramConnectionStatus> {
  const integration = await getStoredIntegration();
  if (integration) {
    return {
      connected: true,
      source: "oauth",
      pageName: integration.page_name,
      username: integration.instagram_username,
      connectedAt: integration.connected_at,
      lastValidatedAt: integration.last_validated_at,
      lastError: integration.last_error,
    };
  }
  const hasEnvironmentFallback = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_IG_USER_ID);
  return {
    connected: hasEnvironmentFallback,
    source: hasEnvironmentFallback ? "environment" : null,
    pageName: null,
    username: process.env.CIVIC_SENSE_INSTAGRAM_HANDLE ?? null,
    connectedAt: null,
    lastValidatedAt: null,
    lastError: null,
  };
}

export async function getInstagramPublishingCredentials(): Promise<InstagramPublishingCredentials | null> {
  const integration = await getStoredIntegration();
  if (integration) {
    return {
      accessToken: integration.page_access_token,
      igUserId: integration.ig_user_id,
      pageName: integration.page_name,
      username: integration.instagram_username,
      source: "oauth",
    };
  }
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_IG_USER_ID;
  if (!accessToken || !igUserId) return null;
  return { accessToken, igUserId, pageName: null, username: process.env.CIVIC_SENSE_INSTAGRAM_HANDLE ?? null, source: "environment" };
}

export async function validateInstagramPublishingCredentials(credentials: InstagramPublishingCredentials) {
  if (credentials.source !== "oauth") return;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return;
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  const url = new URL(`https://graph.facebook.com/${version}/debug_token`);
  url.searchParams.set("input_token", credentials.accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await fetch(url);
  const payload = await response.json() as { data?: { is_valid?: boolean }; error?: { message?: string } };
  if (!response.ok || !payload.data?.is_valid) {
    await updateIntegrationValidation(payload.error?.message ?? "The saved Instagram connection is no longer valid.");
    throw new Error("The Instagram connection has expired or was removed. Reconnect it from Moderator controls.");
  }
  await updateIntegrationValidation(null);
}

async function getStoredIntegration() {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin().from("instagram_integrations")
    .select("page_id,page_name,ig_user_id,instagram_username,page_access_token,connected_at,last_validated_at,last_error")
    .eq("integration_key", INTEGRATION_KEY)
    .maybeSingle<IntegrationRow>();
  if (error) {
    if (error.message.includes("instagram_integrations")) return null;
    throw new Error(error.message);
  }
  return data;
}

async function updateIntegrationValidation(lastError: string | null) {
  if (!isSupabaseConfigured()) return;
  await getSupabaseAdmin().from("instagram_integrations").update({
    last_validated_at: new Date().toISOString(),
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }).eq("integration_key", INTEGRATION_KEY);
}
