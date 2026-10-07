const buckets = new Map<string, { count: number; resetAt: number }>();
const PRUNE_THRESHOLD = 5000;

// Buckets are only replaced when the same client returns, so drop expired ones once the map
// grows, otherwise a stream of distinct client keys would keep it growing for the process lifetime.
function pruneExpired(now: number) {
  if (buckets.size < PRUNE_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function allowRequest(request: Request, scope: string, limit = 12, windowMs = 60_000) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${scope}:${forwarded || "local"}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    pruneExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
}
