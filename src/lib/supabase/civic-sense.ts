import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { CivicSenseStatus, CivicSenseSubmission } from "@/types/report";

type DbCivicSenseSubmission = {
  submission_id: string;
  experience: string;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  media_count: number;
  media_types: string[];
  media_urls: string[] | null;
  ai_caption: string;
  ai_category: string;
  ai_hashtags: string[];
  ai_safety_note: string;
  status: CivicSenseStatus;
  instagram_handle: string | null;
  instagram_media_id: string | null;
  instagram_post_url: string | null;
  created_at: string;
  updated_at: string;
};

export async function createCivicSenseSubmission(input: {
  experience: string;
  locationLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mediaTypes: string[];
  mediaUrls?: string[];
  aiCaption: string;
  aiCategory: string;
  aiHashtags: string[];
  aiSafetyNote: string;
  instagramHandle?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const submissionId = `CSS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { error } = await supabase.from("civic_sense_submissions").insert({
    submission_id: submissionId,
    experience: input.experience,
    location_label: input.locationLabel ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    media_count: input.mediaTypes.length,
    media_types: input.mediaTypes,
    media_urls: input.mediaUrls ?? [],
    ai_caption: input.aiCaption,
    ai_category: input.aiCategory,
    ai_hashtags: input.aiHashtags,
    ai_safety_note: input.aiSafetyNote,
    instagram_handle: input.instagramHandle ?? null,
  });
  if (error) throw new Error(error.message);
  return submissionId;
}

export async function getModeratorCivicSenseSubmissions(limit = 100): Promise<CivicSenseSubmission[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("civic_sense_submissions")
    .select("submission_id, experience, location_label, latitude, longitude, media_count, media_types, media_urls, ai_caption, ai_category, ai_hashtags, ai_safety_note, status, instagram_handle, instagram_media_id, instagram_post_url, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbCivicSenseSubmission[]).map(mapSubmission);
}

export async function getCivicSenseSubmission(submissionId: string): Promise<CivicSenseSubmission | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("civic_sense_submissions")
    .select("submission_id, experience, location_label, latitude, longitude, media_count, media_types, media_urls, ai_caption, ai_category, ai_hashtags, ai_safety_note, status, instagram_handle, instagram_media_id, instagram_post_url, created_at, updated_at")
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSubmission(data as DbCivicSenseSubmission) : null;
}

export async function updateCivicSenseStatus(submissionId: string, status: CivicSenseStatus) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_sense_submissions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("submission_id", submissionId);
  if (error) throw new Error(error.message);
}

export async function deleteCivicSenseSubmission(submissionId: string) {
  const submission = await getCivicSenseSubmission(submissionId);
  if (submission?.mediaUrls.length) await removeCivicSenseMedia(submissionId);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_sense_submissions").delete().eq("submission_id", submissionId);
  if (error) throw new Error(error.message);
}

// Keep the published post's audit trail, but remove the original citizen media
// from both Storage and the database once Instagram has accepted the post.
export async function purgeCivicSenseSubmissionMedia(submissionId: string) {
  const submission = await getCivicSenseSubmission(submissionId);
  if (!submission) throw new Error("Civic Sense submission was not found.");

  if (submission.mediaUrls.length) await removeCivicSenseMedia(submissionId);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_sense_submissions")
    .update({ media_count: 0, media_types: [], media_urls: [], updated_at: new Date().toISOString() })
    .eq("submission_id", submissionId);
  if (error) throw new Error(error.message);
}

export async function updateCivicSenseMediaUrls(submissionId: string, mediaUrls: string[]) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_sense_submissions")
    .update({ media_urls: mediaUrls, updated_at: new Date().toISOString() })
    .eq("submission_id", submissionId);
  if (error) throw new Error(error.message);
}

export async function markCivicSensePosted(submissionId: string, input: { instagramMediaId: string; instagramPostUrl?: string | null }) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("civic_sense_submissions")
    .update({ status: "posted", instagram_media_id: input.instagramMediaId, instagram_post_url: input.instagramPostUrl ?? null, updated_at: new Date().toISOString() })
    .eq("submission_id", submissionId);
  if (error) throw new Error(error.message);
}

export async function uploadCivicSenseMedia(submissionId: string, media: File[]) {
  if (!media.length) return [];
  const supabase = getSupabaseAdmin();
  const bucket = process.env.CIVIC_SENSE_MEDIA_BUCKET ?? "civic-sense-media";
  await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 50 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/webm", "video/mp4", "video/quicktime", "video/x-m4v"] }).catch(() => null);
  const urls: string[] = [];
  for (const [index, file] of media.entries()) {
    const extension = extensionFor(file);
    const path = `${submissionId}/${Date.now()}-${index}.${extension}`;
    const { error } = await supabase.storage.from(bucket).upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

async function removeCivicSenseMedia(submissionId: string) {
  const supabase = getSupabaseAdmin();
  const bucket = process.env.CIVIC_SENSE_MEDIA_BUCKET ?? "civic-sense-media";
  const { data, error } = await supabase.storage.from(bucket).list(submissionId, { limit: 100 });
  if (error) throw new Error(`Civic Sense media could not be listed for cleanup: ${error.message}`);

  const paths = (data ?? [])
    .filter((item) => item.name && item.name !== ".emptyFolderPlaceholder")
    .map((item) => `${submissionId}/${item.name}`);
  if (!paths.length) return;

  const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
  if (removeError) throw new Error(`Civic Sense media could not be removed: ${removeError.message}`);
}

function mapSubmission(row: DbCivicSenseSubmission): CivicSenseSubmission {
  return {
    id: row.submission_id,
    experience: row.experience,
    locationLabel: row.location_label,
    latitude: row.latitude,
    longitude: row.longitude,
    mediaCount: row.media_count,
    mediaTypes: row.media_types,
    mediaUrls: row.media_urls ?? [],
    aiCaption: row.ai_caption,
    aiCategory: row.ai_category,
    aiHashtags: row.ai_hashtags,
    aiSafetyNote: row.ai_safety_note,
    status: row.status,
    instagramHandle: row.instagram_handle,
    instagramMediaId: row.instagram_media_id,
    instagramPostUrl: row.instagram_post_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function extensionFor(file: File) {
  if (file.type.includes("jpeg")) return "jpg";
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("mp4")) return "mp4";
  if (file.type.includes("quicktime")) return "mov";
  if (file.type.includes("m4v")) return "m4v";
  return "webm";
}
