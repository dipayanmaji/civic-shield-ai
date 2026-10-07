import { NextResponse } from "next/server";

import { createFallbackAnalysis, createStructuredEmailDraft } from "@/lib/ai/fallback-analysis";
import { allowRequest, rateLimitedResponse } from "@/lib/security/rate-limit";
import type { CivicReport, SafetyAnalysis } from "@/types/report";

// A real report is a few KB (the form caps each field); this only stops oversized prompts.
const MAX_REPORT_CHARS = 10_000;

export async function POST(request: Request) {
  // Each call can spend Groq quota. A citizen needs one analysis plus a few regenerations.
  const rate = allowRequest(request, "analyze", 15, 10 * 60_000);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);

  const body = await request.json().catch(() => null) as { report?: CivicReport; variation?: number } | null;
  if (!body?.report) {
    return NextResponse.json({ error: "A report is required." }, { status: 400 });
  }
  if (JSON.stringify(body.report).length > MAX_REPORT_CHARS) {
    return NextResponse.json({ error: "This report is too long to analyze." }, { status: 413 });
  }

  const fallback = createFallbackAnalysis(body.report, body.variation);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json(fallback);

  try {
    const prompt = `You are CivicShield AI, a public-safety reporting assistant. Return only valid JSON with this exact schema: ${JSON.stringify({
      category: "string",
      urgency: "low | medium | high | critical",
      riskSummary: "string",
      immediateActions: ["string"],
      publicAlert: "string",
      formalComplaint: "string",
      emailSubject: "string",
      emailBody: "string",
    })}. Do not claim to contact authorities, do not give medical/legal advice, and say call 112 only if there is immediate danger. Rewrite informal, misspelled, or fragmented user wording into neutral professional English without changing factual meaning or adding facts. Never invent an affected-person count or write "unknown number of people"; omit that sentence when no positive count was supplied. Never use placeholders such as "[Your Name]"; use "A concerned citizen via CivicShield" instead. The emailBody and formalComplaint must faithfully include the issue description, confirmed location name, latitude/longitude coordinates rounded to five decimal places, duration, positive number of people affected if supplied, extra details if supplied, and attached evidence count if supplied. Use this preselected route without changing it: ${JSON.stringify(fallback.route)}. Citizen report: ${JSON.stringify(body.report)}.`;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error("Groq request failed");
    const payload = await response.json();
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as Partial<SafetyAnalysis>;
    if (!parsed.category || !parsed.urgency || !parsed.emailBody || !Array.isArray(parsed.immediateActions)) throw new Error("Invalid AI response");
    return NextResponse.json({ ...fallback, ...parsed, emailBody: createStructuredEmailDraft(body.report, fallback.route.name), route: fallback.route, generatedBy: "groq" });
  } catch {
    return NextResponse.json(fallback);
  }
}
