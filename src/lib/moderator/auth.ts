import { createHash, createHmac, timingSafeEqual } from "crypto";

export const MODERATOR_COOKIE = "civicshield_moderator";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret() { return process.env.MODERATOR_SESSION_SECRET; }
function sign(value: string) { return createHmac("sha256", secret()!).update(value).digest("base64url"); }

// timingSafeEqual throws when the two buffers differ in byte length, and a string's .length counts
// characters, not bytes. Hashing both sides first gives equal-length buffers whatever the input,
// so a wrong or oddly-encoded value is just "not equal" and its length is not revealed.
function safeEqual(a: string, b: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

// Exact cookie-name match (a regex on "name=" would also match "other-name=").
function readCookie(cookieHeader: string | null, name: string) {
  for (const part of cookieHeader?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

export function moderatorAuthConfigured() { return Boolean(process.env.MODERATOR_ACCESS_KEY && secret()); }

export function validModeratorAccessKey(value: string) {
  const expected = process.env.MODERATOR_ACCESS_KEY;
  if (!expected) return false;
  return safeEqual(value, expected);
}

export function createModeratorSession() {
  const expiry = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return `${expiry}.${sign(String(expiry))}`;
}

export function hasModeratorSession(cookieHeader: string | null) {
  if (!secret()) return false;
  const value = readCookie(cookieHeader, MODERATOR_COOKIE);
  if (!value) return false;
  const [expiry, signature] = value.split(".");
  if (!expiry || !signature || !/^\d+$/.test(expiry) || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(expiry));
}
