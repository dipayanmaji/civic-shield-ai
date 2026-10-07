"use client";

import { CheckCircle2, Flag, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CommunityVerification({ reportId }: { reportId: string }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  async function submit(verdict: "verified" | "disputed") {
    setSending(true); setMessage("");
    try { const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/verification`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict }) }); const payload = await response.json() as { error?: string; message?: string }; if (!response.ok) throw new Error(payload.error ?? "Could not record verification."); setMessage(payload.message ?? "Recorded for moderator review."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not record verification."); }
    finally { setSending(false); }
  }
  return <section className="mt-6 rounded-3xl border border-line bg-surface p-6 sm:p-7"><p className="eyebrow">Community check</p><h2 className="mt-2 font-display text-xl font-bold">Is this update true on the ground?</h2><p className="mt-2 text-sm leading-6 text-muted">Your response is a moderation signal; it does not directly change the public case status.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button disabled={sending} onClick={() => void submit("verified")}><CheckCircle2 size={16} /> Looks resolved</Button><Button disabled={sending} variant="outline" onClick={() => void submit("disputed")}><Flag size={16} /> Still a problem</Button>{sending ? <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> Recording your response…</span> : null}</div>{message ? <p className="mt-3 text-sm font-medium text-brand" role="status">{message}</p> : null}</section>;
}
