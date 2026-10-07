import { NextResponse } from "next/server";

import { headerValue, quotedParameter } from "@/lib/email/mime";
import { GMAIL_TOKEN_COOKIE } from "@/lib/gmail/config";
import { getOwnerGmailAccessToken } from "@/lib/gmail/access-token";
import { getTeamNotificationRecipients } from "@/lib/notifications/team-email";
import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
// Multipart framing and the text fields add a little on top of the attachments.
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 256 * 1024;
const MAX_SUBJECT_LENGTH = 300;
const MAX_BODY_LENGTH = 20_000;

type MailAttachment = { file: File; mimeType: string };

async function encodeMessage({ to, subject, body, attachments }: { to: string; subject: string; body: string; attachments: MailAttachment[] }) {
  if (!attachments.length) {
    const message = [`To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n");
    return Buffer.from(message).toString("base64url");
  }
  const boundary = `civicshield_${crypto.randomUUID()}`;
  const parts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ];
  for (const { file, mimeType } of attachments) {
    const encoded = Buffer.from(await file.arrayBuffer()).toString("base64");
    const safeName = quotedParameter(file.name) || "evidence";
    parts.push(`--${boundary}`, `Content-Type: ${mimeType}; name="${safeName}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${safeName}"`, "", encoded);
  }
  parts.push(`--${boundary}--`, "");
  const message = parts.join("\r\n");
  return Buffer.from(message).toString("base64url");
}

// Evidence is photos and videos only. Reduce the type to its bare "type/subtype" so that
// codec parameters (video/webm;codecs=vp9) are dropped and nothing odd reaches a header.
function evidenceMimeType(file: File) {
  const mimeType = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return /^(image|video)\/[a-z0-9.+-]+$/.test(mimeType) ? mimeType : null;
}

export async function POST(request: Request) {
  // This route is public by design (citizens send their report to the team inbox), so it is
  // limited per client and bounded in size before any Gmail token or upload work happens.
  const rate = allowRequest(request, "send-email", 6, 10 * 60_000);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "The report and its evidence are too large to send together." }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Provide a valid team inbox, subject, and message." }, { status: 400 });
  const recipients = getTeamNotificationRecipients();
  const subject = headerValue(formData.get("subject")?.toString() ?? "");
  const body = formData.get("body")?.toString() ?? "";
  if (!recipients.length || !subject || !body.trim()) return NextResponse.json({ error: "Provide a valid team inbox, subject, and message." }, { status: 400 });
  if (subject.length > MAX_SUBJECT_LENGTH || body.length > MAX_BODY_LENGTH) return NextResponse.json({ error: "The subject or message is too long." }, { status: 400 });

  const attachments: MailAttachment[] = [];
  for (const value of formData.getAll("attachments").slice(0, MAX_ATTACHMENTS)) {
    if (!(value instanceof File)) continue;
    const mimeType = evidenceMimeType(value);
    if (!mimeType) return NextResponse.json({ error: `${headerValue(value.name) || "A file"} is not a photo or video.` }, { status: 400 });
    attachments.push({ file: value, mimeType });
  }
  if (attachments.reduce((total, { file }) => total + file.size, 0) > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "The evidence files are too large to email. Remove a video and try again." }, { status: 413 });
  }

  const ownerToken = await getOwnerGmailAccessToken();
  const connectedUserToken = request.headers.get("cookie")?.match(new RegExp(`${GMAIL_TOKEN_COOKIE}=([^;]+)`))?.[1];
  const token = ownerToken ?? connectedUserToken;
  if (!token) return NextResponse.json({ error: "The CivicShield Gmail sender is not configured." }, { status: 401 });

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: await encodeMessage({ to: recipients.join(", "), subject, body, attachments }) }),
  });
  const data = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok) return NextResponse.json({ error: data.error?.message ?? "Gmail could not send this message." }, { status: response.status });
  return NextResponse.json({ id: data.id, deliveredTo: "CivicShield inbox" });
}
