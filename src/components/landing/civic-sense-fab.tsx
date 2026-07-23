"use client";

import { Mic, Pause, Play, Send, Sparkles, Trash2, Upload, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Coordinates = { latitude: number; longitude: number };
type RecordingMode = "audio" | "video" | null;
type CameraFacing = "environment" | "user";

const maxMediaFiles = 2;
const maxRecordingMs = 30000;

export function CivicSenseFab() {
  const [open, setOpen] = useState(false);
  const [experience, setExperience] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [media, setMedia] = useState<File[]>([]);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("environment");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRecordingRef = useRef(true);

  useEffect(() => {
    if (!open || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setStatus("Location permission was skipped. You can still submit."),
      { enableHighAccuracy: true, maximumAge: 120000, timeout: 8000 },
    );
  }, [open]);

  useEffect(() => {
    if (!location) return;
    const controller = new AbortController();
    fetch(`/api/geocode?lat=${location.latitude}&lon=${location.longitude}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { label?: string }) => setLocationLabel(payload.label ?? ""))
      .catch(() => setLocationLabel(""));
    return () => controller.abort();
  }, [location]);

  useEffect(() => {
    if (!videoPreviewRef.current) return;
    videoPreviewRef.current.srcObject = recordingMode === "video" ? streamRef.current : null;
  }, [recordingMode]);

  useEffect(() => () => cleanupRecording(false), []);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) continue;
      if (file.type.startsWith("video/")) {
        const duration = await getVideoDuration(file).catch(() => null);
        if (duration && duration > 30.5) {
          setStatus(`${file.name} is longer than 30 seconds. Please upload a shorter video.`);
          continue;
        }
      }
      next.push(file);
    }
    setMedia((current) => [...current, ...next].slice(0, maxMediaFiles));
  }

  function removeMedia(index: number) {
    setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function cleanupRecording(saveRecording: boolean) {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    saveRecordingRef.current = saveRecording;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    setRecordingMode(null);
  }

  function stopRecording() {
    cleanupRecording(true);
  }

  function closeDialog() {
    cleanupRecording(false);
    setExperience("");
    setInstagramUsername("");
    setMedia([]);
    setLocation(null);
    setLocationLabel("");
    setStatus("");
    setSubmitting(false);
    setSuccess(null);
    setConsent(false);
    setCameraFacing("environment");
    setOpen(false);
  }

  async function startRecording(mode: Exclude<RecordingMode, null>) {
    if (recordingMode) {
      stopRecording();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(mode === "video" ? {
        audio: true,
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 9 / 16 },
        },
      } : { audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recordingMimeType = getPreferredRecordingMimeType(mode);
      const recorder = recordingMimeType ? new MediaRecorder(stream, { mimeType: recordingMimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (!saveRecordingRef.current) {
          chunksRef.current = [];
          return;
        }
        const type = baseMediaMimeType(recorder.mimeType || recordingMimeType || (mode === "video" ? "video/webm" : "audio/webm"));
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size > 0) {
          const prefix = mode === "video" ? "video" : "voice";
          const extension = type.includes("mp4") ? "mp4" : type.includes("quicktime") ? "mov" : "webm";
          setMedia((current) => [new File([blob], `civic-sense-${prefix}-${Date.now()}.${extension}`, { type }), ...current].slice(0, maxMediaFiles));
        }
      };
      saveRecordingRef.current = true;
      recorder.start();
      setRecordingMode(mode);
      stopTimerRef.current = setTimeout(() => {
        setStatus("Recording stopped at the 30 second limit.");
        stopRecording();
      }, maxRecordingMs);
    } catch {
      setStatus(mode === "video" ? "Camera recording is unavailable in this browser." : "Audio recording is unavailable in this browser.");
    }
  }

  async function submit() {
    if (!consent) {
      setStatus("Please confirm the review and privacy consent before sending.");
      return;
    }
    stopRecording();
    setSubmitting(true);
    setStatus("Preparing your Civic Sense post...");
    try {
      const formData = new FormData();
      formData.set("experience", experience);
      formData.set("instagramUsername", instagramUsername);
      formData.set("locationLabel", locationLabel);
      if (location) {
        formData.set("latitude", String(location.latitude));
        formData.set("longitude", String(location.longitude));
      }
      media.forEach((file) => formData.append("media", file));
      const response = await fetch("/api/civic-sense", { method: "POST", body: formData });
      const payload = await response.json() as { submissionId?: string; instagramHandle?: string; error?: string };
      if (!response.ok || !payload.submissionId) throw new Error(payload.error ?? "Submission failed.");
      setSuccess({ id: payload.submissionId });
      setExperience("");
      setInstagramUsername("");
      setMedia([]);
      setConsent(false);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = consent && !submitting && (experience.trim().length > 0 || media.length > 0);

  return (
    <>
      <button
        className="group fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-white shadow-[0_18px_40px_rgb(19_36_33_/_25%)] transition duration-300 hover:-translate-y-1 hover:bg-brand"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-brand/25 opacity-60" />
        <span className="absolute inset-0 -z-10 rounded-full bg-ink transition group-hover:bg-brand" />
        <Sparkles aria-hidden="true" className="animate-pulse" size={18} /> Zero Civic Sense
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-ink/55 p-3 sm:place-items-center sm:p-5">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-surface">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white p-5">
              <div>
                <p className="eyebrow">Civic Sense Check</p>
                <h2 className="mt-2 font-display text-2xl font-bold">Share a Zero Civic Sense moment</h2>
                <p className="mt-2 text-sm leading-6 text-muted">Record, upload, or describe what you saw. CivicShield will review it before posting.</p>
              </div>
              <button className="grid size-10 place-items-center rounded-xl border border-line" onClick={closeDialog} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {success ? (
                <div className="rounded-3xl border border-[#cbe8dd] bg-[#effaf5] p-6 text-[#31544b]">
                  <p className="font-display text-2xl font-bold">CivicShield team received your post.</p>
                  <p className="mt-3 leading-7">It may take up to 24 hours to verify and post your Zero Civic Sense report to our Instagram. Your reference is <strong>{success.id}</strong>.</p>
                  <p className="mt-3 leading-7">Meanwhile, check out CivicShield on <a className="font-bold text-brand underline underline-offset-4" href="https://www.instagram.com/civicshieldai/" rel="noreferrer" target="_blank">Instagram</a> and <a className="font-bold text-brand underline underline-offset-4" href="https://www.facebook.com/civicshieldai/" rel="noreferrer" target="_blank">Facebook</a>.</p>
                  <Button className="mt-5" onClick={closeDialog}>Done</Button>
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="text-sm font-bold text-ink">Describe the moment</span>
                    <textarea className="mt-2 min-h-32 w-full rounded-2xl border border-line p-4 text-sm leading-6 outline-none focus:border-brand" value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="Example: People kept throwing plastic cups from a bus stop even though a bin was nearby." />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-ink">Your Instagram username <span className="font-medium text-muted">(optional)</span></span>
                    <input className="mt-2 w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none focus:border-brand" value={instagramUsername} onChange={(event) => setInstagramUsername(event.target.value)} maxLength={31} placeholder="username (we will credit you only if approved)" autoCapitalize="none" autoCorrect="off" />
                    <span className="mt-1 block text-xs leading-5 text-muted">If this post is approved, we will add @{instagramUsername.trim().replace(/^@+/, "") || "yourusername"} to the caption.</span>
                  </label>

                  {recordingMode === "video" ? (
                    <div className="overflow-hidden rounded-3xl border border-[#d7e6e1] bg-[#0f1d1a]">
                      <video ref={videoPreviewRef} className="mx-auto aspect-[9/16] max-h-[58vh] w-full max-w-sm object-cover" autoPlay muted playsInline />
                      <div className="flex items-center justify-between gap-3 p-3 text-white">
                        <span className="text-sm font-bold">Recording video · auto-stops at 30 sec</span>
                        <Button variant="danger" size="sm" onClick={stopRecording}><Pause size={16} /> Stop</Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-[#fbfdfc] p-3">
                    <div>
                      <p className="text-sm font-bold text-ink">Video camera</p>
                      <p className="text-xs text-muted">Choose front or back camera before recording.</p>
                    </div>
                    <div className="flex rounded-xl bg-white p-1">
                      <button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${cameraFacing === "environment" ? "bg-brand text-white" : "text-muted"}`} type="button" onClick={() => setCameraFacing("environment")}>Back</button>
                      <button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${cameraFacing === "user" ? "bg-brand text-white" : "text-muted"}`} type="button" onClick={() => setCameraFacing("user")}>Front</button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <button className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold ${recordingMode === "video" ? "bg-danger text-white" : "border border-line bg-[#fbfdfc]"}`} type="button" onClick={() => void startRecording("video")}>
                      <Video size={16} /> {recordingMode === "video" ? "Stop video" : "Record video"}
                    </button>
                    <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-[#fbfdfc] text-sm font-bold">
                      <Upload size={16} /> Upload media
                      <input className="sr-only" type="file" accept="video/*,audio/*" multiple onChange={(event) => void addFiles(event.target.files)} />
                    </label>
                    <button className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-bold ${recordingMode === "audio" ? "bg-danger text-white" : "border border-line bg-[#fbfdfc]"}`} type="button" onClick={() => void startRecording("audio")}>
                      {recordingMode === "audio" ? <Pause size={16} /> : <Mic size={16} />} {recordingMode === "audio" ? "Stop voice" : "Record voice"}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-line bg-[#fbfdfc] p-4 text-sm leading-6 text-muted">
                    <p><strong className="text-ink">Location:</strong> {locationLabel || (location ? "Location captured" : "Requesting location...")}</p>
                    <p className="mt-1"><strong className="text-ink">Media:</strong> max {maxMediaFiles} files · 30 sec recommended · for Instagram video, upload MP4 or MOV.</p>
                    {media.length ? <div className="mt-3 space-y-2">{media.map((file, index) => <MediaPreview file={file} index={index} key={`${file.name}-${file.lastModified}-${index}`} onRemove={() => removeMedia(index)} />)}</div> : <p className="mt-2 text-xs">No media selected yet.</p>}
                  </div>

                  <label className="flex gap-3 rounded-2xl border border-[#ead9b8] bg-[#fffaf0] p-4 text-sm leading-6 text-[#725019]">
                    <input className="mt-1 size-4 accent-brand" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    I understand CivicShield will review this before posting and I should not include private faces, minors, license plates, or personal attacks.
                  </label>

                  <Button className="w-full" disabled={!canSubmit} onClick={() => void submit()} size="lg">
                    <Send size={18} /> {submitting ? "Submitting..." : "Submit to CivicShield team"}
                  </Button>
                  {status ? <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${status.includes("failed") || status.includes("could not") || status.includes("Please") ? "border-[#efc7bf] bg-[#fff8f6] text-danger" : "border-[#cbe8dd] bg-brand-soft text-brand"}`} role="status">{status}</p> : null}
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function MediaPreview({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setUrl(objectUrl);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const isVideo = file.type.startsWith("video/");
  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink">{index + 1}. {file.name}</p>
          <p className="mt-0.5 text-xs text-muted">{file.type || "media file"}</p>
        </div>
        <button className="grid size-8 shrink-0 place-items-center rounded-xl border border-[#f0c5bd] text-danger" type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>
          <Trash2 size={15} />
        </button>
      </div>
      {url ? (
        isVideo ? <video className="mt-3 max-h-[28rem] w-full rounded-xl bg-[#101a18] object-contain" controls src={url} /> : <audio className="mt-3 w-full" controls src={url}><Play size={14} /></audio>
      ) : null}
    </div>
  );
}

function getVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

function getPreferredRecordingMimeType(mode: Exclude<RecordingMode, null>) {
  const candidates = mode === "video"
    ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function baseMediaMimeType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
}
