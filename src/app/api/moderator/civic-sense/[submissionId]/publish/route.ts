import { NextResponse } from "next/server";

import { hasModeratorSession } from "@/lib/moderator/auth";
import { getInstagramPublishingCredentials, validateInstagramPublishingCredentials } from "@/lib/instagram/integration";
import { getCivicSenseSubmission, markCivicSensePosted, updateCivicSenseStatus } from "@/lib/supabase/civic-sense";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const maxDuration = 60;

type InstagramContainerResponse = { id?: string; error?: { message?: string } };
type InstagramPublishResponse = { id?: string; error?: { message?: string } };
type InstagramStatusResponse = { status_code?: string; status?: string; error?: { message?: string } };

export async function POST(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  if (!hasModeratorSession(request.headers.get("cookie"))) return NextResponse.json({ error: "Moderator sign-in required." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Civic Sense queue is not configured." }, { status: 503 });

  const credentials = await getInstagramPublishingCredentials();
  if (!credentials) {
    return NextResponse.json({ error: "Instagram publishing is not connected. Connect the CivicShield Instagram account from Moderator controls." }, { status: 503 });
  }

  const { submissionId } = await params;
  try {
    await validateInstagramPublishingCredentials(credentials);
    const submission = await getCivicSenseSubmission(submissionId);
    if (!submission) return NextResponse.json({ error: "Civic Sense submission was not found." }, { status: 404 });
    if (submission.status === "rejected") return NextResponse.json({ error: "Rejected submissions cannot be posted." }, { status: 400 });

    const caption = [submission.aiCaption, normalizeHashtags(submission.aiHashtags).join(" ")].filter(Boolean).join("\n\n");
    const videoIndex = submission.mediaTypes.findIndex((mediaType, index) => mediaType.startsWith("video/") && isPublicRemoteUrl(submission.mediaUrls[index] ?? ""));
    const videoUrl = videoIndex >= 0 ? submission.mediaUrls[videoIndex] : undefined;
    const videoType = videoIndex >= 0 ? baseMediaMimeType(submission.mediaTypes[videoIndex] ?? "") : "";
    if (videoUrl && !isInstagramCompatibleVideo(videoType)) {
      return NextResponse.json({ error: `This recorded video is ${videoType || "an unsupported format"}. Instagram Reels need a public MP4 or MOV video. Upload an MP4/MOV file, then approve it again.` }, { status: 422 });
    }
    const defaultImageUrl = getDefaultImageUrl();
    const publishTarget = videoUrl ? { kind: "video" as const, url: videoUrl } : { kind: "image" as const, url: defaultImageUrl };
    if (!publishTarget.url || !isPublicRemoteUrl(publishTarget.url)) {
      return NextResponse.json({ error: "A public image/video URL is required before Instagram can publish. Configure CIVIC_SENSE_DEFAULT_IMAGE_URL or deploy NEXT_PUBLIC_SITE_URL." }, { status: 503 });
    }

    const containerId = await createInstagramContainer({ accessToken: credentials.accessToken, caption, igUserId: credentials.igUserId, target: publishTarget });
    if (publishTarget.kind === "video") await waitForInstagramContainer({ accessToken: credentials.accessToken, containerId });
    const instagramMediaId = await publishInstagramContainer({ accessToken: credentials.accessToken, containerId, igUserId: credentials.igUserId });
    const postUrl = submission.instagramHandle ? `https://www.instagram.com/${submission.instagramHandle.replace(/^@/, "")}/` : null;
    await markCivicSensePosted(submissionId, { instagramMediaId, instagramPostUrl: postUrl });
    return NextResponse.json({ instagramMediaId, postUrl });
  } catch (error) {
    await updateCivicSenseStatus(submissionId, "approved").catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Instagram publish failed." }, { status: 500 });
  }
}

async function createInstagramContainer({ accessToken, caption, igUserId, target }: { accessToken: string; caption: string; igUserId: string; target: { kind: "image" | "video"; url: string } }) {
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  const params = new URLSearchParams({ access_token: accessToken, caption });
  if (target.kind === "video") {
    params.set("media_type", "REELS");
    params.set("video_url", target.url);
    params.set("share_to_feed", "true");
  } else {
    params.set("image_url", target.url);
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${igUserId}/media?${params.toString()}`, { method: "POST" });
  const payload = await response.json() as InstagramContainerResponse;
  if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? "Instagram media container could not be created.");
  return payload.id;
}

async function waitForInstagramContainer({ accessToken, containerId }: { accessToken: string; containerId: string }) {
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const response = await fetch(`https://graph.facebook.com/${version}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`);
    const payload = await response.json() as InstagramStatusResponse;
    if (!response.ok) throw new Error(payload.error?.message ?? "Instagram video status check failed.");
    if (payload.status_code === "FINISHED") return;
    if (payload.status_code === "ERROR") throw new Error(payload.status ?? "Instagram could not process the video.");
  }
  throw new Error("Instagram is still processing this Reel. Please wait a moment and try the moderator upload again.");
}

async function publishInstagramContainer({ accessToken, containerId, igUserId }: { accessToken: string; containerId: string; igUserId: string }) {
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  const params = new URLSearchParams({ access_token: accessToken, creation_id: containerId });
  const response = await fetch(`https://graph.facebook.com/${version}/${igUserId}/media_publish?${params.toString()}`, { method: "POST" });
  const payload = await response.json() as InstagramPublishResponse;
  if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? "Instagram media could not be published.");
  return payload.id;
}

function getDefaultImageUrl() {
  if (process.env.CIVIC_SENSE_DEFAULT_IMAGE_URL) return process.env.CIVIC_SENSE_DEFAULT_IMAGE_URL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return "";
  return `${siteUrl.replace(/\/$/, "")}/icons/civicshield-logo.png`;
}

function isPublicRemoteUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function normalizeHashtags(values: string[]) {
  return [...new Set(values
    .map((value) => value.trim().replace(/^#+/, "").replace(/[^a-zA-Z0-9_]/g, ""))
    .filter(Boolean)
    .map((value) => `#${value}`))];
}

function isInstagramCompatibleVideo(mediaType: string) {
  return ["video/mp4", "video/quicktime", "video/x-m4v"].includes(mediaType.toLowerCase());
}

function baseMediaMimeType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase();
}
