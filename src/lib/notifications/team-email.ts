import { getOwnerGmailAccessToken } from "@/lib/gmail/access-token";

const defaultRecipients = ["thedipayanmaji@gmail.com", "kushalkg0000@gmail.com"];

export function getTeamNotificationRecipients() {
  const configured = (process.env.TEAM_NOTIFICATION_EMAILS ?? process.env.CIVIC_SENSE_MODERATOR_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter((email) => /^\S+@\S+\.\S+$/.test(email));

  return [...new Set([...defaultRecipients, ...configured])];
}

export async function sendTeamNotification(input: { subject: string; body: string }) {
  const token = await getOwnerGmailAccessToken();
  if (!token) throw new Error("Team email delivery is not configured. Add GMAIL_REFRESH_TOKEN.");

  const raw = Buffer.from([
    `To: ${getTeamNotificationRecipients().join(", ")}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ].join("\r\n")).toString("base64url");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const result = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(result?.error?.message ?? "Gmail send failed.");
  return result?.id ?? null;
}
