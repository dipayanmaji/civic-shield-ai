import { NextResponse } from "next/server";

import { hasModeratorSession } from "@/lib/moderator/auth";
import { getInstagramPublishingCredentials, validateInstagramPublishingCredentials } from "@/lib/instagram/integration";
import { getCivicSenseSubmission, markCivicSensePosted, purgeCivicSenseSubmissionMedia, updateCivicSenseStatus } from "@/lib/supabase/civic-sense";
import { isSupabaseConfigured } from "@/lib/supabase/server";

// A carousel can contain two videos, each of which must finish Meta processing
// before the parent carousel container can be published.
export const maxDuration = 120;

type InstagramContainerResponse = { id?: string; error?: { message?: string } };
type InstagramPublishResponse = { id?: string; error?: { message?: string } };
type InstagramStatusResponse = { status_code?: string; status?: string; error?: { message?: string } };
type InstagramMediaTarget = { kind: "image" | "video"; url: string; mediaType: string };

class MediaValidationError extends Error {}

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
    const publishTargets = buildPublishTargets(submission.mediaUrls, submission.mediaTypes);
    if (!publishTargets.length) return NextResponse.json({ error: "This submission has no public photo or video, so it cannot be published to Instagram." }, { status: 422 });
    if (publishTargets.length > 2) return NextResponse.json({ error: "Civic Sense supports up to two media files per Instagram post." }, { status: 422 });

    const containerId = await createInstagramPost({
      accessToken: credentials.accessToken,
      caption,
      igUserId: credentials.igUserId,
      targets: publishTargets,
    });
    const instagramMediaId = await publishInstagramContainer({ accessToken: credentials.accessToken, containerId, igUserId: credentials.igUserId });
    // The publish response only contains Meta's media ID. Ask for the canonical
    // permalink so moderators open the actual CivicShield post, not the
    // contributor's Instagram profile.
    const postUrl = await getInstagramPermalink({ accessToken: credentials.accessToken, instagramMediaId });
    await markCivicSensePosted(submissionId, { instagramMediaId, instagramPostUrl: postUrl });

    // A cleanup issue must not turn a successful Instagram post into a failed
    // request, otherwise a moderator could accidentally publish it twice.
    const cleanupWarning = await purgeCivicSenseSubmissionMedia(submissionId)
      .then(() => null)
      .catch((cleanupError) => cleanupError instanceof Error ? cleanupError.message : "Source media cleanup needs attention.");
    return NextResponse.json({ instagramMediaId, postUrl, sourceMediaCleaned: !cleanupWarning, cleanupWarning });
  } catch (error) {
    if (error instanceof MediaValidationError) return NextResponse.json({ error: error.message }, { status: 422 });
    await updateCivicSenseStatus(submissionId, "approved").catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Instagram publish failed." }, { status: 500 });
  }
}

async function getInstagramPermalink({ accessToken, instagramMediaId }: { accessToken: string; instagramMediaId: string }) {
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  const params = new URLSearchParams({ fields: "permalink", access_token: accessToken });
  const response = await fetch(`https://graph.facebook.com/${version}/${instagramMediaId}?${params.toString()}`, { cache: "no-store" });
  const payload = await response.json() as { permalink?: string };
  // Publishing succeeded already, so a transient permalink lookup failure
  // should never make the moderator retry and create a duplicate post.
  return response.ok && payload.permalink ? payload.permalink : null;
}

async function createInstagramPost({ accessToken, caption, igUserId, targets }: { accessToken: string; caption: string; igUserId: string; targets: InstagramMediaTarget[] }) {
  if (targets.length === 1) {
    const target = targets[0];
    const containerId = await createInstagramContainer({ accessToken, caption, igUserId, target });
    if (target.kind === "video") await waitForInstagramContainer({ accessToken, containerId });
    return containerId;
  }

  const childContainerIds = await Promise.all(targets.map((target) => createInstagramContainer({
    accessToken,
    caption: "",
    igUserId,
    target,
    isCarouselItem: true,
  })));
  await Promise.all(targets.map((target, index) => target.kind === "video"
    ? waitForInstagramContainer({ accessToken, containerId: childContainerIds[index] })
    : Promise.resolve()));
  // Meta creates a separate parent container for the carousel. Even when every
  // child is ready, that parent needs its own processing window before it has a
  // publishable media ID. Publishing it immediately intermittently returns
  // "Media ID is not available" for mixed image/video submissions.
  const carouselContainerId = await createInstagramCarouselContainer({ accessToken, caption, igUserId, childContainerIds });
  await waitForInstagramContainer({ accessToken, containerId: carouselContainerId });
  return carouselContainerId;
}

async function createInstagramContainer({ accessToken, caption, igUserId, isCarouselItem = false, target }: { accessToken: string; caption: string; igUserId: string; isCarouselItem?: boolean; target: InstagramMediaTarget }) {
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  const params = new URLSearchParams({ access_token: accessToken });
  if (caption) params.set("caption", caption);
  if (isCarouselItem) params.set("is_carousel_item", "true");
  if (target.kind === "video") {
    // Meta uses VIDEO for a carousel child. A one-item video remains a Reel.
    params.set("media_type", isCarouselItem ? "VIDEO" : "REELS");
    params.set("video_url", target.url);
    if (!isCarouselItem) params.set("share_to_feed", "true");
  } else {
    params.set("image_url", target.url);
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${igUserId}/media?${params.toString()}`, { method: "POST" });
  const payload = await response.json() as InstagramContainerResponse;
  if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? "Instagram media container could not be created.");
  return payload.id;
}

async function createInstagramCarouselContainer({ accessToken, caption, childContainerIds, igUserId }: { accessToken: string; caption: string; childContainerIds: string[]; igUserId: string }) {
  const version = process.env.INSTAGRAM_API_VERSION ?? "v23.0";
  const params = new URLSearchParams({
    access_token: accessToken,
    caption,
    children: childContainerIds.join(","),
    media_type: "CAROUSEL",
  });
  const response = await fetch(`https://graph.facebook.com/${version}/${igUserId}/media?${params.toString()}`, { method: "POST" });
  const payload = await response.json() as InstagramContainerResponse;
  if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? "Instagram carousel container could not be created.");
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

function buildPublishTargets(mediaUrls: string[], mediaTypes: string[]) {
  const targets: InstagramMediaTarget[] = [];
  for (const [index, url] of mediaUrls.entries()) {
    const mediaType = baseMediaMimeType(mediaTypes[index] ?? "");
    if (!isPublicRemoteUrl(url)) throw new MediaValidationError(`Media file ${index + 1} is not publicly reachable, so Instagram cannot fetch it.`);
    if (mediaType.startsWith("image/")) {
      targets.push({ kind: "image", url, mediaType });
      continue;
    }
    if (mediaType.startsWith("video/")) {
      if (!isInstagramCompatibleVideo(mediaType)) throw new MediaValidationError(`Media file ${index + 1} is ${mediaType || "an unsupported format"}. Instagram needs a public MP4 or MOV video.`);
      targets.push({ kind: "video", url, mediaType });
      continue;
    }
    throw new MediaValidationError(`Media file ${index + 1} is not a supported image or video.`);
  }
  return targets;
}
