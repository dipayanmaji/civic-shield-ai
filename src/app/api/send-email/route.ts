import { NextResponse } from "next/server";

import { GMAIL_TOKEN_COOKIE } from "@/lib/gmail/config";
import { getOwnerGmailAccessToken } from "@/lib/gmail/access-token";
import { getTeamNotificationRecipients } from "@/lib/notifications/team-email";

async function encodeMessage({ to, subject, body, attachments }: { to: string; subject: string; body: string; attachments: File[] }) {
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
  for (const attachment of attachments.slice(0, 4)) {
    const encoded = Buffer.from(await attachment.arrayBuffer()).toString("base64");
    const safeName = attachment.name.replace(/["\\\r\n]/g, "_");
    parts.push(`--${boundary}`, `Content-Type: ${attachment.type || "application/octet-stream"}; name="${safeName}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${safeName}"`, "", encoded);
  }
  parts.push(`--${boundary}--`, "");
  const message = parts.join("\r\n");
  return Buffer.from(message).toString("base64url");
}

export async function POST(request: Request) {
  const ownerToken = await getOwnerGmailAccessToken();
  const connectedUserToken = request.headers.get("cookie")?.match(new RegExp(`${GMAIL_TOKEN_COOKIE}=([^;]+)`))?.[1];
  const token = ownerToken ?? connectedUserToken;
  if (!token) return NextResponse.json({ error: "The CivicShield Gmail sender is not configured." }, { status: 401 });
  const formData = await request.formData();
  const to = getTeamNotificationRecipients().join(", ");
  const subject = formData.get("subject")?.toString();
  const body = formData.get("body")?.toString();
  const attachments = formData.getAll("attachments").filter((value): value is File => value instanceof File);
  if (!getTeamNotificationRecipients().length || !subject || !body) return NextResponse.json({ error: "Provide a valid team inbox, subject, and message." }, { status: 400 });

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: await encodeMessage({ to, subject, body, attachments }) }),
  });
  const data = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok) return NextResponse.json({ error: data.error?.message ?? "Gmail could not send this message." }, { status: response.status });
  return NextResponse.json({ id: data.id, deliveredTo: "CivicShield inbox" });
}
