"use client";

import { Camera, Circle, FlipHorizontal, Pause, Send, Sparkles, Trash2, Upload, Video, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Coordinates = { latitude: number; longitude: number };
type CameraFacing = "environment" | "user";
type CameraMode = "photo" | "video" | null;
type ZoomRange = { min: number; max: number; step: number };
type CameraCapabilities = { zoom?: ZoomRange };

const maxMediaFiles = 2;
const maxRecordingMs = 30000;

export function CivicSenseFab() {
  const [open, setOpen] = useState(false);
  const [experience, setExperience] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [media, setMedia] = useState<File[]>([]);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
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
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingClockRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    if (!cameraPreviewRef.current) return;
    cameraPreviewRef.current.srcObject = cameraStream;
    if (cameraStream) void cameraPreviewRef.current.play().catch(() => undefined);
  }, [cameraStream, cameraMode]);

  useEffect(() => {
    if (!cameraMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [cameraMode]);

  useEffect(() => () => cleanupCamera(false), []);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
        setStatus(`${file.name} is not a supported photo or video.`);
        continue;
      }
      if (file.type.startsWith("video/")) {
        const metadata = await getVideoMetadata(file).catch(() => null);
        if (metadata?.duration && metadata.duration > 30.5) {
          setStatus(`${file.name} is longer than 30 seconds. Please upload a shorter video.`);
          continue;
        }
        if (metadata && !isVerticalVideo(metadata.width, metadata.height)) {
          setStatus(`${file.name} must be a vertical 9:16 video for Instagram. Please record or upload a portrait video.`);
          continue;
        }
      }
      next.push(file);
    }
    if (next.length) {
      setStatus("");
      setMedia((current) => [...current, ...next].slice(0, maxMediaFiles));
    }
  }

  function removeMedia(index: number) {
    setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function cleanupCamera(saveRecording: boolean) {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (recordingClockRef.current) clearInterval(recordingClockRef.current);
    recordingClockRef.current = null;
    saveRecordingRef.current = saveRecording;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (cameraPreviewRef.current) cameraPreviewRef.current.srcObject = null;
    setCameraStream(null);
    setCameraMode(null);
    setIsRecording(false);
    setRecordingElapsedSeconds(0);
    setZoomRange(null);
    setZoom(1);
  }

  function stopRecording() {
    cleanupCamera(true);
  }

  function closeDialog() {
    cleanupCamera(false);
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

  async function openCamera(mode: Exclude<CameraMode, null>, facing = cameraFacing) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: mode === "video",
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 9 / 16 },
        },
      });
      streamRef.current = stream;
      setCameraFacing(facing);
      setCameraMode(mode);
      setCameraStream(stream);
      const capabilities = getCameraCapabilities(stream.getVideoTracks()[0]);
      setZoomRange(capabilities?.zoom ? { min: capabilities.zoom.min, max: capabilities.zoom.max, step: capabilities.zoom.step || 0.1 } : null);
      setZoom(capabilities?.zoom?.min ?? 1);
    } catch {
      setStatus("Camera access is unavailable in this browser. Check permission and try again.");
    }
  }

  async function switchCamera() {
    if (!cameraMode || isRecording) return;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    await openCamera(cameraMode, cameraFacing === "environment" ? "user" : "environment");
  }

  async function updateZoom(nextZoom: number) {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomRange) return;
    const clampedZoom = Math.min(zoomRange.max, Math.max(zoomRange.min, nextZoom));
    try {
      await track.applyConstraints({ advanced: [{ zoom: clampedZoom } as MediaTrackConstraintSet] });
      setZoom(clampedZoom);
    } catch {
      setStatus("Camera zoom is not available on this device.");
    }
  }

  function capturePhoto() {
    const preview = cameraPreviewRef.current;
    if (!preview?.videoWidth || !preview.videoHeight) {
      setStatus("The camera is still starting. Please try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    canvas.getContext("2d")?.drawImage(preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return setStatus("Photo capture failed. Please try again.");
      setMedia((current) => [new File([blob], `civic-sense-photo-${Date.now()}.jpg`, { type: "image/jpeg" }), ...current].slice(0, maxMediaFiles));
      cleanupCamera(false);
    }, "image/jpeg", 0.92);
  }

  function startVideoRecording() {
    const stream = streamRef.current;
    if (!stream || isRecording) return;
    chunksRef.current = [];
    const recordingMimeType = getPreferredRecordingMimeType();
    const recorder = recordingMimeType ? new MediaRecorder(stream, { mimeType: recordingMimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      if (!saveRecordingRef.current) { chunksRef.current = []; return; }
      const type = baseMediaMimeType(recorder.mimeType || recordingMimeType || "video/webm");
      const blob = new Blob(chunksRef.current, { type });
      if (!blob.size) return;
      const extension = type.includes("mp4") ? "mp4" : type.includes("quicktime") ? "mov" : "webm";
      const file = new File([blob], `civic-sense-video-${Date.now()}.${extension}`, { type });
      void getVideoMetadata(file).then((metadata) => {
        if (!isVerticalVideo(metadata.width, metadata.height)) {
          setStatus("Your camera did not provide a vertical video. Rotate the phone upright and record again for Instagram.");
          return;
        }
        setMedia((current) => [file, ...current].slice(0, maxMediaFiles));
      }).catch(() => setStatus("We could not verify this video. Please record again or upload a vertical MP4/MOV video."));
    };
    saveRecordingRef.current = true;
    recorder.start();
    const recordingStartedAt = Date.now();
    setRecordingElapsedSeconds(0);
    recordingClockRef.current = setInterval(() => {
      setRecordingElapsedSeconds(Math.min(maxRecordingMs / 1000, Math.floor((Date.now() - recordingStartedAt) / 1000)));
    }, 250);
    setIsRecording(true);
    stopTimerRef.current = setTimeout(() => {
      setStatus("Recording stopped at the 30 second limit.");
      stopRecording();
    }, maxRecordingMs);
  }

  async function submit() {
    if (!media.length) {
      setStatus("Please add at least one photo or vertical video before submitting.");
      return;
    }
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

  const canSubmit = consent && !submitting && media.length > 0;
  const isErrorStatus = /failed|could not|please|must|unsupported|longer than|unavailable/i.test(status);

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
                <p className="mt-2 text-sm leading-6 text-muted">Share an everyday public-behaviour problem through a photo or short vertical video, such as littering, unsafe behaviour, or damage to shared spaces. The CivicShield team will review it and, if approved, post it on <a className="font-semibold text-brand underline underline-offset-4" href="https://www.instagram.com/civicshieldai/" rel="noreferrer" target="_blank">Instagram</a> and <a className="font-semibold text-brand underline underline-offset-4" href="https://www.facebook.com/civicshieldai/" rel="noreferrer" target="_blank">Facebook</a> with credit to you. <span className="font-semibold text-brand">Small acts, safer spaces.</span></p>
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
                    <span className="text-sm font-bold text-ink">Describe the moment <span className="font-medium text-muted">(optional)</span></span>
                    <textarea className="mt-2 min-h-32 w-full rounded-2xl border border-line p-4 text-sm leading-6 outline-none focus:border-brand" value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="Example: People kept throwing plastic cups from a bus stop even though a bin was nearby." />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-ink">Your Instagram username <span className="font-medium text-muted">(optional)</span></span>
                    <input className="mt-2 w-full rounded-2xl border border-line px-4 py-3 text-sm outline-none focus:border-brand" value={instagramUsername} onChange={(event) => setInstagramUsername(event.target.value)} maxLength={31} placeholder="username (we will credit you only if approved)" autoCapitalize="none" autoCorrect="off" />
                    <span className="mt-1 block text-xs leading-5 text-muted">If this post is approved, we will add @{instagramUsername.trim().replace(/^@+/, "") || "yourusername"} to the caption.</span>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-[#fbfdfc] text-sm font-bold" type="button" onClick={() => void openCamera("video")}>
                      <Video size={16} /> Record video
                    </button>
                    <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-[#fbfdfc] text-sm font-bold">
                      <Upload size={16} /> Upload photo / video
                      <input className="sr-only" type="file" accept="image/*,video/*" multiple onChange={(event) => void addFiles(event.target.files)} />
                    </label>
                    <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-[#fbfdfc] text-sm font-bold" type="button" onClick={() => void openCamera("photo")}>
                      <Camera size={16} /> Capture photo
                    </button>
                  </div>

                  <div className="rounded-2xl border border-line bg-[#fbfdfc] p-4 text-sm leading-6 text-muted">
                    <p><strong className="text-ink">Location:</strong> {locationLabel || (location ? "Location captured" : "Requesting location...")}</p>
                    <p className="mt-1"><strong className="text-ink">Media required:</strong> max {maxMediaFiles} files · photos or vertical 9:16 videos up to 30 sec · Instagram video publishing requires MP4 or MOV.</p>
                    {media.length ? <div className="mt-3 space-y-2">{media.map((file, index) => <MediaPreview file={file} index={index} key={`${file.name}-${file.lastModified}-${index}`} onRemove={() => removeMedia(index)} />)}</div> : <p className="mt-2 text-xs">Add a photo or short vertical video to continue.</p>}
                  </div>

                  <label className="flex gap-3 rounded-2xl border border-[#ead9b8] bg-[#fffaf0] p-4 text-sm leading-6 text-[#725019]">
                    <input className="mt-1 size-4 accent-brand" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    I understand CivicShield will review this before posting and I should not include private faces, minors, license plates, or personal attacks.
                  </label>

                  <Button className="w-full" disabled={!canSubmit} onClick={() => void submit()} size="lg">
                    <Send size={18} /> {submitting ? "Submitting..." : "Submit to CivicShield team"}
                  </Button>
                  {status ? <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${isErrorStatus ? "border-[#efc7bf] bg-[#fff8f6] text-danger" : "border-[#cbe8dd] bg-brand-soft text-brand"}`} role="status">{status}</p> : null}
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {cameraMode ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#07110f]/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={cameraMode === "video" ? "Record a video" : "Capture a photo"}>
          <section className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-[#0d1c18] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
              <div>
                <p className="text-sm font-bold">{cameraMode === "video" ? "Record a vertical video" : "Capture a photo"}</p>
                <p className="mt-1 text-xs text-white/65">Hold your phone upright for Instagram-ready 9:16 media.</p>
              </div>
              <button className="grid size-10 place-items-center rounded-xl border border-white/15 text-white" type="button" onClick={() => cleanupCamera(false)} aria-label="Close camera"><X size={18} /></button>
            </div>

            <div className="relative mx-auto aspect-[9/16] w-full max-h-[68vh] bg-black">
              <video ref={cameraPreviewRef} className="size-full object-cover" autoPlay muted playsInline />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white">{isRecording ? `Recording · ${formatRecordingTime(recordingElapsedSeconds)} / 00:30` : cameraFacing === "environment" ? "Back camera" : "Front camera"}</span>
                <button className="grid size-10 place-items-center rounded-full bg-black/55 text-white disabled:opacity-40" disabled={isRecording} type="button" onClick={() => void switchCamera()} aria-label="Switch camera" title={isRecording ? "Stop recording before switching cameras" : "Switch camera"}><FlipHorizontal size={19} /></button>
              </div>
              {zoomRange ? <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-5 pb-5 pt-12"><button className="grid size-9 place-items-center rounded-full bg-white/15 text-white" type="button" onClick={() => void updateZoom(zoom - zoomRange.step)} aria-label="Zoom out"><ZoomOut size={17} /></button><input className="h-1 flex-1 accent-white" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom} onChange={(event) => void updateZoom(Number(event.target.value))} aria-label="Camera zoom" /><button className="grid size-9 place-items-center rounded-full bg-white/15 text-white" type="button" onClick={() => void updateZoom(zoom + zoomRange.step)} aria-label="Zoom in"><ZoomIn size={17} /></button></div> : null}
            </div>

            <div className="flex items-center justify-center gap-4 px-5 py-5 text-white">
              {cameraMode === "photo" ? <button className="grid size-16 place-items-center rounded-full border-4 border-white bg-transparent" type="button" onClick={capturePhoto} aria-label="Take photo"><span className="size-11 rounded-full bg-white" /></button> : isRecording ? <button className="inline-flex h-12 items-center gap-2 rounded-2xl bg-danger px-5 text-sm font-bold" type="button" onClick={stopRecording}><Pause size={17} /> Stop recording</button> : <button className="inline-flex h-12 items-center gap-2 rounded-2xl bg-danger px-5 text-sm font-bold" type="button" onClick={startVideoRecording}><Circle fill="currentColor" size={16} /> Start recording</button>}
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
  const isImage = file.type.startsWith("image/");
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
        isVideo ? <video className="mt-3 aspect-[9/16] max-h-[28rem] w-full rounded-xl bg-[#101a18] object-contain" controls src={url} /> : isImage ? <img alt={`Selected ${file.name}`} className="mt-3 max-h-[28rem] w-full rounded-xl bg-[#f4f8f6] object-contain" src={url} /> : null
      ) : null}
    </div>
  );
}

function getVideoMetadata(file: File) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

function isVerticalVideo(width: number, height: number) {
  if (!width || !height || height <= width) return false;
  const ratio = width / height;
  return ratio >= 0.5 && ratio <= 0.65;
}

function getCameraCapabilities(track: MediaStreamTrack | undefined) {
  const getCapabilities = (track as unknown as { getCapabilities?: () => CameraCapabilities } | undefined)?.getCapabilities;
  return track && getCapabilities ? getCapabilities.call(track) : undefined;
}

function getPreferredRecordingMimeType() {
  const candidates = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function baseMediaMimeType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
}

function formatRecordingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
