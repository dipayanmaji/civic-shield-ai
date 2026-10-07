"use client";
/* eslint-disable @next/next/no-img-element */

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Info, LoaderCircle, ShieldCheck, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LocationPicker } from "@/components/report/location-picker";
import { LiveCapture } from "@/components/report/live-capture";
import { saveLocalAttachments } from "@/lib/storage/attachments";
import { getLocalReportsSnapshot, saveLocalReport, subscribeToLocalReports } from "@/lib/storage/reports";
import type { CivicAttachment, IncidentLocation } from "@/types/report";

const reportSchema = z.object({
  description: z.string().trim().min(20, "Describe the problem in at least 20 characters.").max(900, "Keep the description under 900 characters for now."),
  location: z.string().trim().min(6, "Confirm a useful location or landmark.").max(180),
  duration: z.string().trim().min(1, "Select when this issue was noticed.").max(120).refine(isAllowedIncidentDateTime, "Select a time within the last month and not in the future."),
  affectedPeople: z.string().trim().refine((value) => !value || /^[1-9]\d*$/.test(value), "Enter a whole number greater than zero, or leave this blank.").optional(),
  extraDetails: z.string().trim().max(360).optional(),
});

type ReportFormValues = z.infer<typeof reportSchema>;
type MediaPreview = { file: File; url: string; kind: "image" | "video" };

const defaultValues: ReportFormValues = { description: "", location: "", duration: "", affectedPeople: "", extraDetails: "" };

export function CivicReportForm() {
  const router = useRouter();
  const [selectedLocation, setSelectedLocation] = useState<IncidentLocation | undefined>();
  const [media, setMedia] = useState<MediaPreview[]>([]);
  const [submissionError, setSubmissionError] = useState("");
  const reportsSnapshot = useSyncExternalStore(subscribeToLocalReports, getLocalReportsSnapshot, () => "[]");
  const savedReportsCount = parseSavedReportsCount(reportsSnapshot);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ReportFormValues>({ resolver: zodResolver(reportSchema), defaultValues });
  const durationValue = useWatch({ control, name: "duration" });

  useEffect(() => () => media.forEach((item) => URL.revokeObjectURL(item.url)), [media]);

  function updateLocation(location: IncidentLocation) {
    setSelectedLocation(location);
    setValue("location", location.label, { shouldValidate: true });
  }

  function addMedia(files: FileList | File[] | null) {
    if (!files) return;
    const nextMedia = Array.from(files)
      .filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"))
      .slice(0, 4)
      .map((file) => ({ file, url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" as const : "image" as const }));
    setMedia((current) => [...current, ...nextMedia].slice(0, 4));
  }

  function addCapturedMedia(file: File) { addMedia([file]); }

  function removeMedia(url: string) {
    setMedia((current) => {
      const removed = current.find((item) => item.url === url);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((item) => item.url !== url);
    });
  }

  async function onSubmit(values: ReportFormValues) {
    if (!selectedLocation) {
      setError("location", { message: "Search, use current location, or pin the incident on the map before continuing." });
      return;
    }
    setSubmissionError("");
    const attachments: CivicAttachment[] = media.map(({ file, kind }, index) => ({
      id: `ATT-${Date.now()}-${index}`,
      name: file.name,
      type: file.type,
      size: file.size,
      kind,
    }));
    let reportId: string;
    let writeToken: string | undefined;
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: { ...values, incidentLocation: selectedLocation, attachments } }),
      });
      const result = await response.json() as { reportId?: string; writeToken?: string; error?: string };
      if (!response.ok || !result.reportId) throw new Error(result.error ?? "The report could not be saved.");
      reportId = result.reportId;
      writeToken = result.writeToken;
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "The report could not be saved. Please try again.");
      return;
    }
    const report = saveLocalReport({ ...values, id: reportId, incidentLocation: selectedLocation, attachments, writeToken });
    try {
      await saveLocalAttachments(report.id, media.map(({ file }) => file), attachments);
    } catch {
      // The report remains usable even where IndexedDB is not available.
    }
    router.push(`/analysis/${report.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_23rem] lg:items-start">
      <Card className="overflow-hidden rounded-3xl">
        <CardHeader className="border-b border-line bg-[#fbfdfc] p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Civic issue reporter</p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Tell us what happened.</h1>
              <p className="mt-3 max-w-2xl leading-7 text-muted">Describe the issue, confirm the exact place, and add evidence before CivicShield prepares the next steps.</p>
            </div>
            <Badge tone="safe" className="w-fit gap-1.5"><ShieldCheck aria-hidden="true" size={14} /> Local-first MVP</Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <FormField error={errors.description?.message} helper="Example: The road near Central Market is waterlogged and an exposed wire is lying beside the footpath." label="What happened? Describe the problem in your own words.">
              <textarea className="min-h-40 w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 text-base leading-7 text-ink shadow-sm transition focus:border-brand focus:outline-none" placeholder="Describe the issue, visible risk, and anything people nearby should know." {...register("description")} />
            </FormField>

            <LocationPicker error={errors.location?.message} value={selectedLocation} onChange={updateLocation} />

            <div className="grid gap-5 md:grid-cols-2">
              <FormField error={errors.duration?.message} helper="Use the calendar picker to select when the issue was noticed." icon={<Clock3 aria-hidden="true" size={16} />} label="Date and time noticed">
                <DateTimePicker value={durationValue} onChange={(value) => setValue("duration", value, { shouldDirty: true, shouldValidate: true })} />
                <input type="hidden" {...register("duration")} />
              </FormField>
              <FormField error={errors.affectedPeople?.message} helper="Optional. We include this in the department email only when a number is provided." label="Number of people affected">
                <input className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink shadow-sm transition focus:border-brand focus:outline-none" inputMode="numeric" min="1" placeholder="Example: 25" type="number" {...register("affectedPeople")} />
              </FormField>
            </div>

            <section className="rounded-2xl border border-line bg-[#fbfdfc] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Attach visual evidence</p>
                  <p className="mt-1 text-xs leading-5 text-muted">Add up to four images or videos. On supported phones, capture media live from the camera.</p>
                </div>
                <span className="text-xs font-semibold text-muted">{media.length}/4 selected</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand">
                  <Upload aria-hidden="true" size={16} /> Choose image or video
                  <input className="sr-only" type="file" accept="image/*,video/*" multiple onChange={(event) => addMedia(event.target.files)} />
                </label>
                <LiveCapture onCapture={addCapturedMedia} />
              </div>
              {media.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {media.map((item) => <div key={item.url} className="group relative overflow-hidden rounded-xl border border-line bg-white">
                  {item.kind === "image" ? <img src={item.url} alt={item.file.name} className="aspect-square w-full object-cover" /> : <video src={item.url} className="aspect-square w-full object-cover" controls preload="metadata" />}
                  <button className="absolute right-1 top-1 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100" type="button" onClick={() => removeMedia(item.url)}>Remove</button>
                  <p className="truncate px-2 py-1.5 text-xs text-muted">{item.file.name}</p>
                </div>)}
              </div> : null}
            </section>

            <FormField error={errors.extraDetails?.message} label="Extra details">
              <textarea className="min-h-28 w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 text-sm leading-6 text-ink shadow-sm transition focus:border-brand focus:outline-none" placeholder="Add nearby hazards, access notes, or repeated history. Avoid private personal details." {...register("extraDetails")} />
            </FormField>

            <div className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex gap-2 text-sm leading-6 text-muted"><Info aria-hidden="true" className="mt-1 shrink-0 text-brand" size={16} /> The report is saved for public status tracking; evidence stays on this device for now. Do not include private IDs or personal contact details.</p>
              <Button className="shrink-0" disabled={isSubmitting} size="lg" type="submit">{isSubmitting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <FileText aria-hidden="true" size={18} />} {isSubmitting ? "Saving your report…" : "Analyze and prepare report"}</Button>
            </div>
            {submissionError ? <p className="rounded-xl border border-[#efbdb6] bg-[#fff4f1] px-4 py-3 text-sm font-medium text-danger" role="alert">{submissionError}</p> : null}
          </form>
        </CardContent>
      </Card>

      <aside className="space-y-5">
        <Card className="rounded-3xl"><CardContent className="p-6"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Saved locally</p><p className="mt-2 font-display text-3xl font-bold">{savedReportsCount}</p></div><span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand"><FileText aria-hidden="true" size={21} /></span></div><p className="mt-4 text-sm leading-6 text-muted">Your report is stored in this browser before an AI result is generated.</p></CardContent></Card>
        <Card className="rounded-3xl border-[#ead9b8] bg-[#fffaf0]"><CardContent className="p-6"><Badge tone="caution" className="gap-1.5"><AlertTriangle aria-hidden="true" size={14} /> Safety note</Badge><h2 className="mt-4 font-display text-xl font-bold tracking-tight">Immediate danger needs a call first.</h2><p className="mt-3 text-sm leading-6 text-[#725019]">If there is fire, injury, collapse, or a live electrical danger, use emergency help and call 112—do not wait for this form.</p></CardContent></Card>
      </aside>
    </div>
  );
}

function parseSavedReportsCount(snapshot: string) {
  try { const reports = JSON.parse(snapshot); return Array.isArray(reports) ? reports.length : 0; } catch { return 0; }
}

function DateTimePicker({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const selected = parseLocalDateTime(value);
  const today = new Date();
  const minimum = getMinimumIncidentDate();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected ?? today));
  const [open, setOpen] = useState(false);

  const days = getCalendarDays(visibleMonth);
  const selectedDateKey = selected ? toDateKey(selected) : "";
  const canGoPrevious = startOfMonth(addMonths(visibleMonth, -1)) >= startOfMonth(minimum);
  const canGoNext = startOfMonth(addMonths(visibleMonth, 1)) <= startOfMonth(today);

  function pickDate(day: Date) {
    if (isDateDisabled(day, minimum, today)) return;
    const base = selected ?? new Date();
    const hour = selected ? base.getHours() : isSameDate(day, today) ? today.getHours() : 9;
    const minute = selected ? base.getMinutes() : isSameDate(day, today) ? roundDownToFive(today.getMinutes()) : 0;
    const next = clampIncidentDateTime(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute), minimum, today);
    onChange(toLocalDateTimeValue(next));
  }

  function updateTime(part: "hour" | "minute", nextValue: string) {
    const base = selected ?? today;
    const next = new Date(base);
    if (part === "hour") next.setHours(Number(nextValue));
    if (part === "minute") next.setMinutes(Number(nextValue));
    next.setSeconds(0, 0);
    onChange(toLocalDateTimeValue(clampIncidentDateTime(next, minimum, today)));
  }

  return (
    <div className="relative">
      <button
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 text-left text-sm font-semibold text-ink shadow-sm transition hover:border-brand focus:border-brand focus:outline-none"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="text-brand" size={17} />
          {selected ? formatIncidentDate(selected) : "Select date and time"}
        </span>
        <span className="text-xs font-bold text-muted">Last 30 days</span>
      </button>

      {open ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default bg-black/20 sm:hidden" type="button" aria-label="Close calendar" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 bottom-3 z-50 rounded-3xl border border-line bg-white p-4 shadow-surface sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:z-30 sm:mt-2 sm:w-[24rem] sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Incident date</p>
                <p className="mt-1 text-sm font-semibold text-muted">Only last 30 days are available.</p>
              </div>
              <button className="rounded-xl border border-line bg-[#fbfdfc] px-3 py-2 text-xs font-bold text-muted" type="button" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-[#fbfdfc] p-3">
              <div className="flex items-center justify-between">
                <button className="grid size-9 place-items-center rounded-xl border border-line bg-white text-brand disabled:opacity-40" disabled={!canGoPrevious} onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} type="button">
                  <ChevronLeft aria-hidden="true" size={17} />
                </button>
                <p className="font-display text-sm font-bold">{visibleMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                <button className="grid size-9 place-items-center rounded-xl border border-line bg-white text-brand disabled:opacity-40" disabled={!canGoNext} onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} type="button">
                  <ChevronRight aria-hidden="true" size={17} />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                  if (!day) return <span key={`blank-${index}`} className="aspect-square" />;
                  const disabled = isDateDisabled(day, minimum, today);
                  const active = toDateKey(day) === selectedDateKey;
                  return (
                    <button
                      className={`aspect-square rounded-xl text-sm font-bold transition ${
                        active ? "bg-brand text-white" : disabled ? "cursor-not-allowed bg-transparent text-[#b8c2bf]" : "bg-white text-ink hover:bg-brand-soft hover:text-brand"
                      }`}
                      disabled={disabled}
                      key={toDateKey(day)}
                      onClick={() => pickDate(day)}
                      type="button"
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Hour</span>
                <select className="mt-1 h-11 w-full rounded-xl border border-line bg-[#fbfdfc] px-3 text-sm font-semibold text-ink outline-none focus:border-brand" value={selected?.getHours() ?? ""} onChange={(event) => updateTime("hour", event.target.value)}>
                  <option value="" disabled>HH</option>
                  {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Minute</span>
                <select className="mt-1 h-11 w-full rounded-xl border border-line bg-[#fbfdfc] px-3 text-sm font-semibold text-ink outline-none focus:border-brand" value={selected?.getMinutes() ?? ""} onChange={(event) => updateTime("minute", event.target.value)}>
                  <option value="" disabled>MM</option>
                  {Array.from({ length: 12 }, (_, index) => index * 5).map((minute) => <option key={minute} value={minute}>{String(minute).padStart(2, "0")}</option>)}
                </select>
              </label>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FormField({ children, error, helper, icon, label }: { children: React.ReactNode; error?: string; helper?: string; icon?: React.ReactNode; label: string }) {
  return <div className="block"><span className="flex items-center gap-2 text-sm font-bold text-ink">{icon}{label}</span><span className="mt-2 block">{children}</span>{helper ? <span className="mt-2 block text-xs leading-5 text-muted">{helper}</span> : null}{error ? <span className="mt-2 block text-xs font-semibold text-danger">{error}</span> : null}</div>;
}

function isAllowedIncidentDateTime(value: string) {
  const date = parseLocalDateTime(value);
  if (!date) return false;
  const now = new Date();
  return date >= getMinimumIncidentDate() && date <= now;
}

function getMinimumIncidentDate() {
  const minimum = new Date();
  minimum.setMonth(minimum.getMonth() - 1);
  minimum.setSeconds(0, 0);
  return minimum;
}

function parseLocalDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function getCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return days;
}

function isDateDisabled(day: Date, minimum: Date, maximum: Date) {
  const current = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const min = new Date(minimum.getFullYear(), minimum.getMonth(), minimum.getDate());
  const max = new Date(maximum.getFullYear(), maximum.getMonth(), maximum.getDate());
  return current < min || current > max;
}

function clampIncidentDateTime(date: Date, minimum: Date, maximum: Date) {
  if (date < minimum) return minimum;
  if (date > maximum) return maximum;
  return date;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isSameDate(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function roundDownToFive(minute: number) {
  return Math.floor(minute / 5) * 5;
}

function formatIncidentDate(date: Date) {
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
