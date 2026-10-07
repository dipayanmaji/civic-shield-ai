"use client";

import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, ClipboardCheck, Copy, FileText, Home, LoaderCircle, Mail, MapPin, Phone, RefreshCw, Send, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { REPORT_TOKEN_HEADER } from "@/lib/security/report-token-header";
import { getLocalAttachmentFiles } from "@/lib/storage/attachments";
import { getLocalReport, markReportEmailSent, saveReportAnalysis } from "@/lib/storage/reports";
import type { CivicReport, SafetyAnalysis } from "@/types/report";

type SuggestedDepartment = {
  name: string;
  address: string;
  phone?: string;
  distanceMeters?: number;
  mapsUrl?: string;
};

export function AnalysisWorkspace({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<CivicReport | null>(null);
  const [analysis, setAnalysis] = useState<SafetyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState("");

  async function generateReport(nextReport: CivicReport, variation = 0) {
    const isDraftRegeneration = variation !== 0;
    if (isDraftRegeneration) setIsRegenerating(true);
    else {
      setLoading(true);
      setError("");
    }
    try {
      // The write token only authorises saving to our own API; keep it out of the AI request.
      const { writeToken, ...reportForAnalysis } = nextReport;
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: reportForAnalysis, variation }) });
      if (!response.ok) throw new Error("Analysis could not be prepared.");
      const result = (await response.json()) as SafetyAnalysis;
      const updated = saveReportAnalysis(nextReport.id, result);
      setAnalysis(result);
      if (updated) setReport(updated);
      if (writeToken) {
        void fetch(`/api/reports/${encodeURIComponent(nextReport.id)}/analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json", [REPORT_TOKEN_HEADER]: writeToken },
          body: JSON.stringify({ analysis: result }),
        });
      }
    } catch {
      if (!isDraftRegeneration) setError("CivicShield could not prepare this analysis. Please try again.");
    } finally {
      if (isDraftRegeneration) setIsRegenerating(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      const saved = getLocalReport(reportId);
      if (!active) return;
      if (!saved) {
        setError("This local report was not found in this browser.");
        setLoading(false);
        return;
      }
      setReport(saved);
      if (saved.analysis) {
        setAnalysis(saved.analysis);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [reportId]);

  useEffect(() => {
    if (!report || analysis) return;
    const reportToAnalyze = report;
    async function loadAnalysis() { await generateReport(reportToAnalyze); }
    void loadAnalysis();
  }, [report, analysis]);

  if (loading) return <LoadingState />;
  if (error || !report || !analysis) return <MissingState message={error || "This report could not be opened."} />;

  const isEmergency = analysis.urgency === "critical";
  const immediateActions = analysis.immediateActions.filter((action) => action.trim().length > 0);
  return (
    <main className="min-h-screen bg-canvas px-5 py-8 text-ink sm:py-10 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-brand" href="/report"><ArrowLeft aria-hidden="true" size={16} /> Back to reporter</Link>
        {isEmergency ? <section className="mt-6 rounded-3xl border border-[#efbdb6] bg-[#fff4f1] p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><Badge tone="urgent" className="gap-1.5"><ShieldAlert aria-hidden="true" size={14} /> Possible immediate danger</Badge><h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Move to safety. Do not wait for a report.</h1><p className="mt-2 max-w-2xl leading-7 text-[#7e342d]">This analysis suggests an immediate safety risk. Call emergency services first, then return only when it is safe.</p></div><Button asChild variant="danger" size="lg"><a href="tel:112">Call 112 now</a></Button></div></section> : null}
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_25rem]">
          <div className="space-y-6">
            <Card className="overflow-hidden rounded-3xl"><CardHeader className="border-b border-line bg-[#fbfdfc] p-6 sm:p-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">AI-assisted safety brief</p><h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">{analysis.category}</h1><p className="mt-3 max-w-2xl leading-7 text-muted">{analysis.riskSummary}</p></div><UrgencyBadge urgency={analysis.urgency} /></div></CardHeader><CardContent className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8"><InfoBlock icon={<MapPin aria-hidden="true" size={18} />} label="Confirmed location" value={report.incidentLocation?.label ?? report.location} /><InfoBlock icon={<ClipboardCheck aria-hidden="true" size={18} />} label="Department type" value={analysis.route.name} /><InfoBlock icon={<FileText aria-hidden="true" size={18} />} label="Attachments saved locally" value={`${report.attachments?.length ?? 0} file(s) on this device`} /><InfoBlock icon={<Sparkles aria-hidden="true" size={18} />} label="Analysis source" value={analysis.generatedBy === "groq" ? "Groq free-tier AI" : "Local safety fallback"} /></CardContent></Card>

            {immediateActions.length > 0 ? <Card className="rounded-3xl"><CardContent className="p-6 sm:p-8"><p className="eyebrow">What to do now</p><div className="mt-5 space-y-3">{immediateActions.map((action) => <div key={action} className="flex gap-3 rounded-2xl border border-line bg-[#fbfdfc] p-4 text-sm leading-6"><CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-brand" size={17} />{action}</div>)}</div></CardContent></Card> : null}

            <Card className="rounded-3xl"><CardHeader className="p-6 pb-0 sm:p-8 sm:pb-0"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Formal complaint</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Ready for review</h2></div><CopyButton text={analysis.formalComplaint} /></div></CardHeader><CardContent className="p-6 sm:p-8"><pre className="whitespace-pre-wrap rounded-2xl border border-line bg-[#fbfdfc] p-4 font-sans text-sm leading-6 text-[#426058]">{analysis.formalComplaint}</pre></CardContent></Card>

            <MailComposer key={analysis.emailBody} analysis={analysis} report={report} reportId={report.id} isRegenerating={isRegenerating} onRegenerate={() => void generateReport(report, Date.now())} />
          </div>
          <aside className="space-y-5"><Card className="rounded-3xl"><CardContent className="p-6"><p className="eyebrow">Report reference</p><p className="mt-2 font-display text-2xl font-bold">{report.id}</p><p className="mt-4 text-sm leading-6 text-muted">Saved locally on {new Date(report.createdAt).toLocaleString()}.</p></CardContent></Card><Card className="rounded-3xl border-[#ead9b8] bg-[#fffaf0]"><CardContent className="p-6"><Badge tone="caution" className="gap-1.5"><AlertTriangle aria-hidden="true" size={14} /> Honest routing</Badge><p className="mt-4 text-sm leading-6 text-[#725019]">CivicShield shows a dynamic nearby department suggestion for context. In hackathon mode, the actual email goes to the configured CivicShield inbox, and a sent email is not proof that any authority has acted.</p></CardContent></Card></aside>
        </div>
      </div>
    </main>
  );
}

function MailComposer({ analysis, isRegenerating, onRegenerate, report, reportId }: { analysis: SafetyAnalysis; isRegenerating: boolean; onRegenerate: () => void; report: CivicReport; reportId: string }) {
  const [departments, setDepartments] = useState<SuggestedDepartment[]>([]);
  const [departmentStatus, setDepartmentStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [subject, setSubject] = useState(analysis.emailSubject);
  const [body, setBody] = useState(analysis.emailBody);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [ownerConfigured, setOwnerConfigured] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [delivery, setDelivery] = useState<{ id?: string; recipient?: string; sentAt?: string } | null>(() => report.emailDelivery ? { id: report.emailDelivery.messageId, recipient: report.emailDelivery.recipient, sentAt: report.emailDelivery.sentAt } : report.status === "delivery-confirmed" ? {} : null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/gmail/status")
      .then((response) => response.json())
      .then((data: { connected?: boolean; ownerConfigured?: boolean }) => { if (active) { setOwnerConfigured(Boolean(data.ownerConfigured)); setGmailStatus(data.connected || data.ownerConfigured ? "connected" : "disconnected"); } })
      .catch(() => { if (active) setGmailStatus("disconnected"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const location = report.incidentLocation;
    if (!location) return;
    const controller = new AbortController();
    // Defer the loading update so this effect only starts the external request.
    // React's hook lint rule correctly avoids a synchronous render cascade here.
    queueMicrotask(() => {
      if (!controller.signal.aborted) setDepartmentStatus("loading");
    });
    void fetch(`/api/department-nearby?lat=${location.latitude}&lon=${location.longitude}&category=${encodeURIComponent(analysis.route.category)}&route=${encodeURIComponent(analysis.route.name)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { departments?: SuggestedDepartment[] }) => setDepartments(data.departments ?? []))
      .catch(() => setDepartments([]))
      .finally(() => setDepartmentStatus("ready"));
    return () => controller.abort();
  }, [analysis.route.category, analysis.route.name, report.incidentLocation]);

  async function copyDraft() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
  }

  async function sendWithGmail() {
    if (!confirmed) return;
    setSendStatus("Sending to the CivicShield inbox…");
    setIsSending(true);
    try {
      const formData = new FormData();
      formData.set("subject", subject);
      formData.set("body", body);
      const attachments = await getLocalAttachmentFiles(reportId);
      attachments.forEach((attachment) => formData.append("attachments", attachment));
      const response = await fetch("/api/send-email", { method: "POST", body: formData });
      const result = await response.json() as { id?: string; deliveredTo?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Email could not be sent.");
      const deliveryRecipient = result.deliveredTo ?? "CivicShield inbox";
      const savedDelivery = markReportEmailSent(reportId, { messageId: result.id, recipient: deliveryRecipient });
      if (report.writeToken) {
        void fetch(`/api/reports/${encodeURIComponent(reportId)}/delivery`, {
          method: "POST",
          headers: { "Content-Type": "application/json", [REPORT_TOKEN_HEADER]: report.writeToken },
          body: JSON.stringify({ messageId: result.id, recipient: deliveryRecipient }),
        });
      }
      setDelivery({ id: result.id, recipient: deliveryRecipient, sentAt: savedDelivery?.emailDelivery?.sentAt });
      setSendStatus("");
    } catch (error) {
      setSendStatus(error instanceof Error ? error.message : "Email could not be sent.");
    } finally {
      setIsSending(false);
    }
  }

  const disabled = !confirmed || isSending;
  if (delivery) {
    return <Card className="rounded-3xl border-[#c7e7dc] bg-[#fbfefc]">
      <CardContent className="p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"><CheckCircle2 aria-hidden="true" size={25} /></span>
        <p className="mt-5 eyebrow">Delivery recorded</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Your report email has been handed to Gmail.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{delivery.recipient ? <>CivicShield sent the confirmed email to the <strong className="text-ink">{delivery.recipient}</strong> and marked this report as </> : <>CivicShield found a previously recorded successful send and marked this report as </>}<strong className="text-ink">delivery confirmed</strong> on this device.</p>
        <div className="mt-5 rounded-2xl border border-[#c7e7dc] bg-white p-4 text-sm leading-6 text-muted">
          <p><strong className="text-ink">What this confirms:</strong> Gmail accepted the message for delivery.</p>
          <p className="mt-2"><strong className="text-ink">What it does not confirm:</strong> that the department has inspected, acted on, or resolved the issue. Keep the report reference and follow up if no acknowledgement arrives.</p>
          {delivery.id ? <p className="mt-2 font-mono text-xs text-[#426058]">Gmail message ID: {delivery.id}</p> : null}
          {delivery.sentAt ? <p className="mt-2 text-xs text-[#426058]">Recorded on this device: {new Date(delivery.sentAt).toLocaleString()}</p> : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild><Link href="/"><Home aria-hidden="true" size={16} /> Return home</Link></Button>
          <Button asChild variant="outline"><Link href="/report"><FileText aria-hidden="true" size={16} /> Report another issue</Link></Button>
        </div>
      </CardContent>
    </Card>;
  }
  return (
    <Card className="rounded-3xl border-[#c7e7dc]">
      <CardHeader className="p-6 pb-0 sm:p-8 sm:pb-0">
        <p className="eyebrow">Dynamic routing preview</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Nearest relevant department</h2>
        <p className="mt-2 text-sm leading-6 text-muted">CivicShield uses the AI category and selected incident location to find a nearby relevant office. For the hackathon demo, the final email is delivered to the CivicShield inbox in the background.</p>
      </CardHeader>
      <CardContent className="space-y-4 p-6 sm:p-8">
        <DepartmentSuggestion departments={departments} status={departmentStatus} fallbackName={analysis.route.name} />
        {isRegenerating ? <DraftFieldsSkeleton /> : <><label className="block text-sm font-bold text-ink">Subject<input className="mt-2 h-12 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal focus:border-brand focus:outline-none" value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="block text-sm font-bold text-ink">Message<textarea className="mt-2 min-h-64 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm font-normal leading-6 focus:border-brand focus:outline-none" value={body} onChange={(event) => setBody(event.target.value)} /></label></>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={isRegenerating} onClick={onRegenerate}>{isRegenerating ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <RefreshCw aria-hidden="true" size={16} />}{isRegenerating ? "Creating another draft…" : "Generate another draft"}</Button><Button type="button" variant="outline" disabled={isRegenerating} onClick={copyDraft}><Copy aria-hidden="true" size={16} /> {copied ? "Copied" : "Copy draft"}</Button></div>
        <label className="flex gap-3 rounded-2xl border border-line bg-[#fbfdfc] p-4 text-sm leading-6 text-muted"><input className="mt-1 size-4 accent-[#076b5a]" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I have checked the final message. I authorize CivicShield to send this report to the configured inbox for demo review.</label>
        <div className="pt-2">
          {gmailStatus === "connected" ? <Button className="w-full sm:w-auto" type="button" size="lg" disabled={disabled} onClick={() => void sendWithGmail()}><Send aria-hidden="true" size={18} /> {isSending ? "Sending report…" : ownerConfigured ? "Send to CivicShield inbox" : "Send to CivicShield inbox"}</Button> : <Button asChild className="w-full sm:w-auto" size="lg" disabled={gmailStatus === "checking"}><Link href={`/api/auth/gmail/connect?returnTo=${encodeURIComponent(`/analysis/${reportId}`)}`}><Mail aria-hidden="true" size={18} /> {gmailStatus === "checking" ? "Checking Gmail…" : "Connect Gmail sender"}</Link></Button>}
        </div>
        {sendStatus ? <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm font-medium text-brand" role="status">{sendStatus}</p> : null}
        <p className="text-xs leading-5 text-muted">{ownerConfigured ? "This email and its locally saved evidence files will be sent from the CivicShield Gmail account ." : "Connect Gmail to send the message and its locally saved evidence files to the ."}</p>
      </CardContent>
    </Card>
  );
}

function DepartmentSuggestion({ departments, fallbackName, status }: { departments: SuggestedDepartment[]; fallbackName: string; status: "idle" | "loading" | "ready" }) {
  const firstDepartment = departments[0];
  if (status === "loading") {
    // Same shape as the loaded card (icon, name, address, chips) so the layout does not jump.
    return (
      <SkeletonGroup label="Finding the nearest relevant department">
        <div className="rounded-2xl border border-line bg-[#fbfdfc] p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2 pt-1"><Skeleton className="h-6 w-16 rounded-full" /><Skeleton className="h-6 w-28 rounded-full" /></div>
            </div>
          </div>
        </div>
      </SkeletonGroup>
    );
  }
  if (!firstDepartment) {
    return <div className="rounded-2xl border border-[#ead9b8] bg-[#fffaf0] p-4 text-sm leading-6 text-[#725019]"><p className="font-bold">Your message will be sent to the {fallbackName}.</p><p className="mt-1">Your complaint is first received in the CivicShield inbox. After verification, it will be forwarded to the department.</p></div>;
  }
  return (
    <div className="rounded-2xl border border-[#c7e7dc] bg-brand-soft p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand"><Building2 aria-hidden="true" size={18} /></span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand">Nearest dynamic match</p>
          <h3 className="mt-1 font-display text-lg font-bold text-ink">{firstDepartment.name}</h3>
          <p className="mt-1 text-sm leading-6 text-[#31544b]">{firstDepartment.address}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {typeof firstDepartment.distanceMeters === "number" ? <Badge tone="safe">{formatDistance(firstDepartment.distanceMeters)}</Badge> : null}
            {firstDepartment.phone ? <a className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand" href={`tel:${firstDepartment.phone.replace(/[^\d+]/g, "")}`}><Phone aria-hidden="true" size={13} /> {firstDepartment.phone}</a> : null}
            {firstDepartment.mapsUrl ? <a className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand underline" href={firstDepartment.mapsUrl} rel="noreferrer" target="_blank"><MapPin aria-hidden="true" size={13} /> Open map</a> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftFieldsSkeleton() {
  return <div className="space-y-5" aria-live="polite" aria-label="Creating another email draft">
    <div><div className="h-4 w-16 animate-pulse rounded bg-brand-soft" /><div className="mt-2 h-12 w-full animate-pulse rounded-xl border border-line bg-[#f5faf8]" /></div>
    <div><div className="h-4 w-20 animate-pulse rounded bg-brand-soft" /><div className="mt-2 min-h-64 w-full animate-pulse rounded-xl border border-line bg-[#f5faf8] p-4"><div className="h-3 w-11/12 rounded bg-[#e1f1eb]" /><div className="mt-3 h-3 w-4/5 rounded bg-[#e1f1eb]" /><div className="mt-3 h-3 w-3/5 rounded bg-[#e1f1eb]" /></div></div>
    <p className="-mt-2 text-xs font-medium text-brand">AI is preparing a fresh version of your email draft…</p>
  </div>;
}
function UrgencyBadge({ urgency }: { urgency: SafetyAnalysis["urgency"] }) { const tone = urgency === "critical" || urgency === "high" ? "urgent" : urgency === "medium" ? "caution" : "safe"; return <Badge tone={tone}>{urgency} urgency</Badge>; }
function InfoBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex gap-3"><span className="mt-0.5 text-brand">{icon}</span><div><p className="text-xs font-bold uppercase tracking-[0.11em] text-muted">{label}</p><p className="mt-1 text-sm font-semibold leading-6 text-ink">{value}</p></div></div>; }
function formatDistance(distanceMeters: number) { return distanceMeters < 1000 ? `${distanceMeters} m away` : `${(distanceMeters / 1000).toFixed(1)} km away`; }
function CopyButton({ text }: { text: string }) { const [copied, setCopied] = useState(false); return <Button type="button" size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? "Copied" : <><Copy aria-hidden="true" size={14} /> Copy</>}</Button>; }
function LoadingState() {
  return <main className="min-h-screen bg-canvas px-5 py-8 text-ink sm:px-8 sm:py-10">
    <div className="mx-auto flex min-h-[72vh] max-w-4xl items-center">
      <section className="relative w-full overflow-hidden rounded-[2rem] border border-white bg-white p-6 shadow-surface sm:p-10" aria-live="polite">
        <div className="absolute -right-20 -top-20 size-64 rounded-full bg-brand-soft" />
        <div className="absolute -bottom-24 -left-20 size-56 rounded-full bg-[#fff0ed]" />
        <div className="relative mx-auto max-w-2xl text-center">
          <div className="relative mx-auto grid size-20 place-items-center rounded-[1.6rem] bg-brand-soft text-brand">
            <span className="absolute inset-0 animate-ping rounded-[1.6rem] bg-brand/15" />
            <LoaderCircle aria-hidden="true" className="relative animate-spin" size={34} />
          </div>
          <p className="mt-7 eyebrow">CivicShield AI at work</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Preparing your report draft</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">We are organising the issue details, location, and evidence into a clear civic brief. This usually takes a few seconds.</p>

          <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            <LoadingStep icon={<FileText aria-hidden="true" size={18} />} label="Reading report" detail="Issue, location, and evidence" active />
            <LoadingStep icon={<Sparkles aria-hidden="true" size={18} />} label="Drafting clearly" detail="AI-assisted formal wording" />
            <LoadingStep icon={<Building2 aria-hidden="true" size={18} />} label="Routing preview" detail="Relevant department type" />
          </div>
          <div className="mx-auto mt-7 h-1.5 max-w-md overflow-hidden rounded-full bg-brand-soft"><span className="block h-full w-2/3 animate-pulse rounded-full bg-brand" /></div>
          <p className="mt-3 text-xs font-medium text-muted">Uses Groq when configured, with a local safety fallback.</p>
        </div>
      </section>
    </div>
  </main>;
}
function LoadingStep({ icon, label, detail, active = false }: { icon: React.ReactNode; label: string; detail: string; active?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${active ? "border-[#b8dfd3] bg-brand-soft" : "border-line bg-[#fbfdfc]"}`}><span className={`grid size-9 place-items-center rounded-xl ${active ? "bg-brand text-white" : "bg-white text-brand"}`}>{icon}</span><p className="mt-3 text-sm font-bold">{label}</p><p className="mt-1 text-xs leading-5 text-muted">{detail}</p></div>;
}
function MissingState({ message }: { message: string }) { return <main className="grid min-h-screen place-items-center bg-canvas p-6"><Card className="max-w-lg rounded-3xl"><CardContent className="p-8"><AlertTriangle className="text-danger" size={28} /><h1 className="mt-4 font-display text-2xl font-bold">Report unavailable</h1><p className="mt-3 leading-7 text-muted">{message}</p><Button asChild className="mt-6"><Link href="/report">Create a report</Link></Button></CardContent></Card></main>; }
