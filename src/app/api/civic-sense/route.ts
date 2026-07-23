import { NextResponse } from "next/server";

import { getOwnerGmailAccessToken } from "@/lib/gmail/access-token";
import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";
import { createCivicSenseSubmission, updateCivicSenseMediaUrls, uploadCivicSenseMedia } from "@/lib/supabase/civic-sense";
import { isSupabaseConfigured } from "@/lib/supabase/server";

type CivicSenseAi = {
  caption: string;
  category: string;
  hashtags: string[];
  safetyNote: string;
};

export async function POST(request: Request) {
  const rate = allowRequest(request, "civic-sense-submit", 5);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Civic Sense queue is not configured." }, { status: 503 });

  try {
    const formData = await request.formData();
    const experience = formData.get("experience")?.toString().trim() ?? "";
    const locationLabel = formData.get("locationLabel")?.toString().trim() || null;
    const latitude = Number(formData.get("latitude"));
    const longitude = Number(formData.get("longitude"));
    const media = formData.getAll("media").filter((value): value is File => value instanceof File).slice(0, 2);
    if (experience.length < 10 && media.length === 0) {
      return NextResponse.json({ error: "Add a short description or a media recording." }, { status: 400 });
    }

    const ai = await generateCivicSenseCaption({ experience, locationLabel, mediaTypes: media.map((file) => file.type) });
    const instagramHandle = process.env.CIVIC_SENSE_INSTAGRAM_HANDLE ?? "civicshield ai";
    const submissionId = await createCivicSenseSubmission({
      experience: experience || "Media-only Civic Sense submission.",
      locationLabel,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      mediaTypes: media.map((file) => file.type || "application/octet-stream"),
      mediaUrls: [],
      aiCaption: ai.caption,
      aiCategory: ai.category,
      aiHashtags: ai.hashtags,
      aiSafetyNote: ai.safetyNote,
      instagramHandle,
    });
    const mediaUrls = await uploadCivicSenseMedia(submissionId, media);
    if (mediaUrls.length) await updateCivicSenseMediaUrls(submissionId, mediaUrls);

    const moderatorEmailId = await sendModeratorEmail({ submissionId, experience, locationLabel, latitude, longitude, ai, media });
    return NextResponse.json({ submissionId, caption: ai.caption, hashtags: ai.hashtags, instagramHandle, moderatorEmailId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Civic Sense submission could not be saved.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function generateCivicSenseCaption({ experience, locationLabel, mediaTypes }: { experience: string; locationLabel: string | null; mediaTypes: string[] }): Promise<CivicSenseAi> {
  const fallback = createFallbackCaption(experience);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: `Create an Instagram-ready civic awareness caption from a user-submitted civic sense moment. Return only JSON with {"caption":"string","category":"string","hashtags":["string"],"safetyNote":"string"}. Keep it calm, non-shaming, India-relevant, under 80 words, no accusations, no personal identification, no faces/minors/plates mentioned. Experience: ${JSON.stringify(experience)} Location: ${JSON.stringify(locationLabel)} Media types: ${JSON.stringify(mediaTypes)}`
        }],
      }),
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as Partial<CivicSenseAi>;
    if (!parsed.caption || !parsed.category || !Array.isArray(parsed.hashtags)) return fallback;
    return {
      caption: parsed.caption,
      category: parsed.category,
      hashtags: parsed.hashtags.slice(0, 8),
      safetyNote: parsed.safetyNote || "Review media for privacy before posting.",
    };
  } catch {
    return fallback;
  }
}

function createFallbackCaption(experience: string): CivicSenseAi {
  const clean = experience.trim() || "A public civic sense moment was submitted for review.";
  return {
    caption: `${clean.slice(0, 160)}${clean.length > 160 ? "..." : ""}\n\nSmall civic habits shape safer public spaces. Let us do better, together.`,
    category: "Civic awareness",
    hashtags: ["#CivicShieldAI", "#CivicSense", "#PublicAwareness", "#SafeCities", "#India"],
    safetyNote: "Moderator must check for faces, minors, license plates, abuse, and private information before posting.",
  };
}

async function sendModeratorEmail({
  submissionId,
  experience,
  locationLabel,
  latitude,
  longitude,
  ai,
  media,
}: {
  submissionId: string;
  experience: string;
  locationLabel: string | null;
  latitude: number;
  longitude: number;
  ai: CivicSenseAi;
  media: File[];
}) {
  const token = await getOwnerGmailAccessToken();
  const to = process.env.CIVIC_SENSE_MODERATOR_EMAIL?.trim();
  if (!to) throw new Error("CIVIC_SENSE_MODERATOR_EMAIL is not configured.");
  if (!token) throw new Error("Civic Sense moderator email delivery is not configured. Add a Gmail refresh token.");
  const mapLine = Number.isFinite(latitude) && Number.isFinite(longitude) ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : "Location coordinates not available";
  const body = [
    `New Civic Sense submission: ${submissionId}`,
    "",
    `Location: ${locationLabel ?? "Not provided"}`,
    `Map: ${mapLine}`,
    `Media files: ${media.length}`,
    "",
    "User experience:",
    experience || "Media-only submission.",
    "",
    "AI category:",
    ai.category,
    "",
    "AI caption:",
    ai.caption,
    "",
    "Hashtags:",
    ai.hashtags.join(" "),
    "",
    "Safety note:",
    ai.safetyNote,
  ].join("\r\n");
  const raw = await encodeEmail({ to, subject: `Civic Sense submission ${submissionId}`, body, attachments: media });
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const result = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(result?.error?.message ?? "Gmail send failed.");
  }
  return result?.id ?? null;
}

async function encodeEmail({ to, subject, body, attachments }: { to: string; subject: string; body: string; attachments: File[] }) {
  if (!attachments.length) {
    return Buffer.from([`To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n")).toString("base64url");
  }
  const boundary = `civic_sense_${crypto.randomUUID()}`;
  const parts = [`To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", body];
  for (const attachment of attachments) {
    const encoded = Buffer.from(await attachment.arrayBuffer()).toString("base64");
    const safeName = attachment.name.replace(/["\\\r\n]/g, "_");
    parts.push(`--${boundary}`, `Content-Type: ${attachment.type || "application/octet-stream"}; name="${safeName}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${safeName}"`, "", encoded);
  }
  parts.push(`--${boundary}--`, "");
  return Buffer.from(parts.join("\r\n")).toString("base64url");
}
