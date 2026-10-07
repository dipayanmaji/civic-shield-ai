"use client";

import { Camera, FlipHorizontal, Send, Sparkles, Trash2, Upload, Video, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";

type Coordinates = { latitude: number; longitude: number };
type CameraFacing = "environment" | "user";
type CameraMode = "photo" | "video" | null;
type ZoomRange = { min: number; max: number; step: number };
type CameraCapabilities = { zoom?: ZoomRange };
type Notice = { text: string; tone: "info" | "error" } | null;
type SubmitResult = { status: number; payload: { submissionId?: string; error?: string } | null };

const maxMediaFiles = 2;
const maxRecordingMs = 30000;
const maxExperienceLength = 500;
const maxFileBytes = 50 * 1024 * 1024;
const uploadTimeoutMs = 5 * 60 * 1000;
const portraitRecordingWidth = 720;
const portraitRecordingHeight = 1280;
const portraitRecordingFrameRate = 30;
// Without an explicit rate, browsers pick their own and phones can produce very large files.
// ~2.5 Mbps keeps a 30 second 720x1280 clip around 9 MB, which uploads reasonably on mobile data.
const recordingVideoBitsPerSecond = 2_500_000;
const recordingAudioBitsPerSecond = 96_000;

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/x-m4v"];
const extensionTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v" };
const unsupportedMediaMessage = "Use a JPG, PNG or WebP photo, or an MP4 / MOV video (Instagram does not accept other formats).";

class UploadError extends Error {
  constructor(readonly reason: "network" | "timeout" | "aborted") {
    super(reason);
  }
}

export function CivicSenseFab() {
  const [open, setOpen] = useState(false);
  const [experience, setExperience] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [media, setMedia] = useState<File[]>([]);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [cameraNotice, setCameraNotice] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationSkipped, setLocationSkipped] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [status, setStatus] = useState<Notice>(null);
  const [processingVideo, setProcessingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [success, setSuccess] = useState<{ id: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("environment");
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const cameraDialogRef = useRef<HTMLElement | null>(null);
  const videoCaptureRef = useRef<HTMLInputElement | null>(null);
  const photoCaptureRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingClockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveRecordingRef = useRef(true);
  const portraitRecordingStreamRef = useRef<MediaStream | null>(null);
  const portraitRenderFrameRef = useRef<number | null>(null);

  const showError = useCallback((text: string) => setStatus({ text, tone: "error" }), []);
  const showInfo = useCallback((text: string) => setStatus({ text, tone: "info" }), []);

  const stopPortraitFrameRenderer = useCallback(() => {
    if (portraitRenderFrameRef.current !== null) {
      cancelAnimationFrame(portraitRenderFrameRef.current);
      portraitRenderFrameRef.current = null;
    }
  }, []);

  const stopPortraitRecordingPipeline = useCallback(() => {
    stopPortraitFrameRenderer();
    portraitRecordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    portraitRecordingStreamRef.current = null;
  }, [stopPortraitFrameRenderer]);

  const cleanupCamera = useCallback((saveRecording: boolean) => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (recordingClockRef.current) clearInterval(recordingClockRef.current);
    recordingClockRef.current = null;
    saveRecordingRef.current = saveRecording;
    const recorder = recorderRef.current;
    const recorderIsActive = recorder?.state === "recording";
    if (recorderIsActive) recorder.stop();
    recorderRef.current = null;
    stopPortraitFrameRenderer();
    if (!recorderIsActive) stopPortraitRecordingPipeline();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (cameraPreviewRef.current) cameraPreviewRef.current.srcObject = null;
    setCameraStream(null);
    setCameraMode(null);
    setCameraReady(false);
    setCameraNotice("");
    setIsRecording(false);
    setRecordingElapsedSeconds(0);
    setZoomRange(null);
    setZoom(1);
  }, [stopPortraitFrameRenderer, stopPortraitRecordingPipeline]);

  const stopRecording = useCallback(() => cleanupCamera(true), [cleanupCamera]);

  // Closing keeps the draft (text and media) so an accidental tap does not lose a recorded clip.
  const closeDialog = useCallback(() => {
    cleanupCamera(false);
    uploadRef.current?.abort();
    setOpen(false);
    setSuccess(null);
    setStatus(null);
  }, [cleanupCamera]);

  const closeCamera = useCallback(() => cleanupCamera(false), [cleanupCamera]);

  useModalFocus(open, dialogRef, closeDialog, fabRef);
  useModalFocus(cameraMode !== null, cameraDialogRef, closeCamera, dialogRef);

  useEffect(() => {
    if (!open || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationSkipped(false);
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => setLocationSkipped(true),
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

  // Keep the page behind the dialogs from scrolling while either is open.
  useEffect(() => {
    if (!open && !cameraMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open, cameraMode]);

  // The portrait recorder is driven by animation frames, which browsers stop when the page is hidden
  // (app switch, screen lock). Stop and keep what was captured instead of saving a frozen clip.
  useEffect(() => {
    if (!isRecording) return;
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      showInfo("Recording stopped because you left the page.");
      stopRecording();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isRecording, showInfo, stopRecording]);

  useEffect(() => () => {
    cleanupCamera(false);
    uploadRef.current?.abort();
  }, [cleanupCamera]);

  async function addFiles(files: File[]) {
    if (!files.length) return;
    const room = maxMediaFiles - media.length;
    if (room <= 0) {
      showError(`You can add up to ${maxMediaFiles} files. Remove one to add another.`);
      return;
    }
    const next: File[] = [];
    let problem = "";
    for (const original of files) {
      const type = resolveMediaType(original);
      const isImage = allowedImageTypes.includes(type);
      const isVideo = allowedVideoTypes.includes(type);
      if (!isImage && !isVideo) {
        problem = `${original.name} is not supported. ${unsupportedMediaMessage}`;
        continue;
      }
      if (original.size > maxFileBytes) {
        problem = `${original.name} is larger than 50 MB. Please choose a shorter or smaller file.`;
        continue;
      }
      const file = type === original.type ? original : new File([original], original.name, { type, lastModified: original.lastModified });
      if (isVideo) {
        const metadata = await getVideoMetadata(file).catch(() => null);
        if (metadata && Number.isFinite(metadata.duration) && metadata.duration > 30.5) {
          problem = `${file.name} is longer than 30 seconds. Please upload a shorter video.`;
          continue;
        }
        if (metadata && !isVerticalVideo(metadata.width, metadata.height)) {
          problem = `${file.name} must be a vertical 9:16 video for Instagram. Please record or upload a portrait video.`;
          continue;
        }
      }
      next.push(file);
    }
    const accepted = next.slice(0, room);
    if (accepted.length) setMedia((current) => [...current, ...accepted].slice(0, maxMediaFiles));
    if (problem) showError(problem);
    else if (next.length > room) showInfo(`Only ${maxMediaFiles} files can be added, so the extra file was skipped.`);
    else setStatus(null);
  }

  function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    // Copy first: clearing the input empties the live FileList. Clearing lets the same file be
    // picked again after removing it (otherwise mobile browsers do not fire change).
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void addFiles(files);
  }

  function removeMedia(index: number) {
    setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function createPortraitRecordingStream(sourceStream: MediaStream, preview: HTMLVideoElement) {
    if (typeof HTMLCanvasElement === "undefined") return null;
    const canvas = document.createElement("canvas");
    if (typeof canvas.captureStream !== "function") return null;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;

    stopPortraitRecordingPipeline();
    canvas.width = portraitRecordingWidth;
    canvas.height = portraitRecordingHeight;

    const renderFrame = () => {
      if (preview.videoWidth && preview.videoHeight && preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        drawVideoToPortraitFrame(context, preview, canvas.width, canvas.height);
      }
      portraitRenderFrameRef.current = requestAnimationFrame(renderFrame);
    };
    renderFrame();

    const recordingStream = canvas.captureStream(portraitRecordingFrameRate);
    sourceStream.getAudioTracks().forEach((track) => recordingStream.addTrack(track));
    portraitRecordingStreamRef.current = recordingStream;
    return recordingStream;
  }

  async function startCamera(mode: Exclude<CameraMode, null>, facing: CameraFacing): Promise<{ ok: true } | { ok: false; error: unknown }> {
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
      setCameraReady(false);
      setCameraStream(stream);
      const capabilities = getCameraCapabilities(stream.getVideoTracks()[0]);
      setZoomRange(capabilities?.zoom ? { min: capabilities.zoom.min, max: capabilities.zoom.max, step: capabilities.zoom.step || 0.1 } : null);
      setZoom(capabilities?.zoom?.min ?? 1);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function openCamera(mode: Exclude<CameraMode, null>) {
    if (openingCamera) return;
    if (media.length >= maxMediaFiles) {
      showError(`You can add up to ${maxMediaFiles} files. Remove one to add another.`);
      return;
    }
    // Where the in-page camera cannot work (no camera API on an insecure page, or a browser that cannot
    // record MP4, e.g. Firefox), hand over to the phone's own camera app instead of a dead end.
    const supported = mode === "photo" ? hasCameraApi() : canRecordInApp();
    if (!supported) {
      (mode === "video" ? videoCaptureRef : photoCaptureRef).current?.click();
      return;
    }
    setStatus(null);
    setOpeningCamera(true);
    const result = await startCamera(mode, cameraFacing);
    setOpeningCamera(false);
    if (!result.ok) showError(describeCameraError(result.error, mode));
  }

  async function switchCamera() {
    if (!cameraMode || isRecording || openingCamera) return;
    const mode = cameraMode;
    const previous = cameraFacing;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    setCameraReady(false);
    setCameraNotice("");
    setOpeningCamera(true);
    const result = await startCamera(mode, previous === "environment" ? "user" : "environment");
    if (!result.ok) {
      const restored = await startCamera(mode, previous);
      setCameraNotice(restored.ok ? "This device could not switch cameras." : describeCameraError(restored.error, mode));
    }
    setOpeningCamera(false);
  }

  async function updateZoom(nextZoom: number) {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomRange) return;
    const clampedZoom = Math.min(zoomRange.max, Math.max(zoomRange.min, nextZoom));
    try {
      await track.applyConstraints({ advanced: [{ zoom: clampedZoom } as MediaTrackConstraintSet] });
      setZoom(clampedZoom);
    } catch {
      setCameraNotice("Camera zoom is not available on this device.");
    }
  }

  function capturePhoto() {
    const preview = cameraPreviewRef.current;
    if (!preview?.videoWidth || !preview.videoHeight) {
      setCameraNotice("The camera is still starting. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    canvas.getContext("2d")?.drawImage(preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return setCameraNotice("Photo capture failed. Please try again.");
      setMedia((current) => [new File([blob], `civic-sense-photo-${Date.now()}.jpg`, { type: "image/jpeg" }), ...current].slice(0, maxMediaFiles));
      setStatus(null);
      cleanupCamera(false);
    }, "image/jpeg", 0.92);
  }

  function startVideoRecording() {
    const stream = streamRef.current;
    const preview = cameraPreviewRef.current;
    if (!stream || !preview || isRecording) return;
    if (!preview.videoWidth || !preview.videoHeight) {
      setCameraNotice("The camera is still starting. Try again in a moment.");
      return;
    }

    const portraitStream = createPortraitRecordingStream(stream, preview);
    if (!portraitStream) {
      setCameraNotice("This browser cannot create an Instagram-ready recording. Close the camera and upload a vertical MP4 or MOV instead.");
      return;
    }

    chunksRef.current = [];
    const recordingMimeType = getPreferredRecordingMimeType();
    if (!recordingMimeType) {
      stopPortraitRecordingPipeline();
      setCameraNotice("This browser cannot record an Instagram-ready MP4. Close the camera and upload a vertical MP4 or MOV instead.");
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(portraitStream, { mimeType: recordingMimeType, videoBitsPerSecond: recordingVideoBitsPerSecond, audioBitsPerSecond: recordingAudioBitsPerSecond });
    } catch {
      stopPortraitRecordingPipeline();
      setCameraNotice("This browser cannot record an Instagram-ready MP4. Close the camera and upload a vertical MP4 or MOV instead.");
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onerror = () => {
      showError("The recording stopped unexpectedly. Please try again.");
      cleanupCamera(false);
    };
    recorder.onstop = () => {
      const shouldSaveRecording = saveRecordingRef.current;
      const type = baseMediaMimeType(recorder.mimeType || recordingMimeType || "video/mp4");
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      stopPortraitRecordingPipeline();
      if (!shouldSaveRecording || !blob.size) return;
      const extension = type.includes("mp4") ? "mp4" : type.includes("quicktime") ? "mov" : "webm";
      const file = new File([blob], `civic-sense-video-${Date.now()}.${extension}`, { type });
      setProcessingVideo(true);
      void getVideoMetadata(file).then((metadata) => {
        // MediaRecorder output can report an unknown (infinite) duration; the 30 second timer already caps it.
        if (Number.isFinite(metadata.duration) && metadata.duration > 30.5) {
          showError("This recording is longer than 30 seconds. Please record a shorter video.");
          return;
        }
        if (!isVerticalVideo(metadata.width, metadata.height)) {
          showError("We could not prepare a portrait video from this camera. Please try recording again.");
          return;
        }
        setMedia((current) => [file, ...current].slice(0, maxMediaFiles));
      }).catch(() => showError("We could not verify this video. Please try recording again."))
        .finally(() => setProcessingVideo(false));
    };
    saveRecordingRef.current = true;
    recorder.start();
    const recordingStartedAt = Date.now();
    setRecordingElapsedSeconds(0);
    setCameraNotice("");
    recordingClockRef.current = setInterval(() => {
      setRecordingElapsedSeconds(Math.min(maxRecordingMs / 1000, Math.floor((Date.now() - recordingStartedAt) / 1000)));
    }, 250);
    setIsRecording(true);
    stopTimerRef.current = setTimeout(() => {
      showInfo("Recording stopped at the 30 second limit.");
      stopRecording();
    }, maxRecordingMs);
  }

  async function submit() {
    if (!media.length) {
      showError("Please add at least one photo or vertical video before submitting.");
      return;
    }
    if (!consent) {
      showError("Please confirm the review and privacy consent before sending.");
      return;
    }
    setSubmitting(true);
    setUploadProgress(0);
    setStatus(null);
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
      const { status: httpStatus, payload } = await sendSubmission(formData, uploadRef, setUploadProgress);
      if (httpStatus < 200 || httpStatus >= 300 || !payload?.submissionId) {
        if (httpStatus === 413) throw new Error("Your files are too large to upload. Try a shorter or smaller video.");
        throw new Error(payload?.error ?? `The submission could not be saved (error ${httpStatus}). Please try again.`);
      }
      setSuccess({ id: payload.submissionId });
      setExperience("");
      setInstagramUsername("");
      setMedia([]);
      setConsent(false);
      setStatus(null);
    } catch (error) {
      if (error instanceof UploadError) {
        if (error.reason === "network") showError("Network problem while uploading. Check your connection and try again.");
        else if (error.reason === "timeout") showError("The upload took too long. Try again on a stronger connection, or use a shorter video.");
      } else {
        showError(error instanceof Error ? error.message : "Submission failed. Please try again.");
      }
    } finally {
      uploadRef.current = null;
      setSubmitting(false);
    }
  }

  const canSubmit = consent && !submitting && !processingVideo && media.length > 0;
  const submitHint = media.length === 0 ? "Add a photo or video to continue." : !consent ? "Tick the box above to continue." : "";
  const locationText = locationLabel || (location ? "Location captured" : locationSkipped || typeof navigator === "undefined" || !navigator.geolocation ? "Not shared (optional)" : "Requesting location...");

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-white shadow-[0_18px_40px_rgb(19_36_33_/_25%)] transition duration-300 hover:-translate-y-1 hover:bg-brand sm:bottom-5 sm:right-5 sm:h-14 sm:px-5"
        onClick={() => setOpen(true)}
        ref={fabRef}
        type="button"
      >
        <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-brand/25 opacity-60 motion-reduce:animate-none" />
        <span className="absolute inset-0 -z-10 rounded-full bg-ink transition group-hover:bg-brand" />
        <Sparkles aria-hidden="true" className="animate-pulse motion-reduce:animate-none" size={18} /> Zero Civic Sense
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 sm:items-center sm:p-5">
          <section
            aria-labelledby="civic-sense-title"
            aria-modal="true"
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-surface outline-none sm:rounded-3xl landscape-short:max-h-dvh landscape-short:max-w-none landscape-short:rounded-none"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4 landscape-short:py-1.5">
              <div className="min-w-0">
                <p className="eyebrow landscape-short:hidden">Civic Sense Check</p>
                <h2 className="mt-1 font-display text-xl font-bold leading-tight sm:text-2xl landscape-short:mt-0 landscape-short:text-lg" id="civic-sense-title">Share a Zero Civic Sense moment</h2>
              </div>
              <button className="grid size-11 shrink-0 place-items-center rounded-xl border border-line" onClick={closeDialog} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {success ? (
                <div className="rounded-3xl border border-[#cbe8dd] bg-[#effaf5] p-6 text-[#31544b]">
                  <p className="font-display text-2xl font-bold">CivicShield team received your post.</p>
                  <p className="mt-3 leading-7">It may take up to 24 hours to verify and post your Zero Civic Sense report to our Instagram. Your reference is <strong>{success.id}</strong>.</p>
                  <p className="mt-3 leading-7">Meanwhile, check out CivicShield on <a className="font-bold text-brand underline underline-offset-4" href="https://www.instagram.com/civicshieldai/" rel="noreferrer" target="_blank">Instagram</a> and <a className="font-bold text-brand underline underline-offset-4" href="https://www.facebook.com/civicshieldai/" rel="noreferrer" target="_blank">Facebook</a>.</p>
                  <Button className="mt-5" onClick={closeDialog}>Done</Button>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-6 text-muted">Share an everyday public-behaviour problem through a photo or short vertical video, such as littering, unsafe behaviour, or damage to shared spaces. The CivicShield team will review it and, if approved, post it on <a className="font-semibold text-brand underline underline-offset-4" href="https://www.instagram.com/civicshieldai/" rel="noreferrer" target="_blank">Instagram</a> and <a className="font-semibold text-brand underline underline-offset-4" href="https://www.facebook.com/civicshieldai/" rel="noreferrer" target="_blank">Facebook</a> with credit to you. <span className="font-semibold text-brand">Small Acts, Safer Spaces.</span></p>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-[#fbfdfc] text-sm font-bold disabled:opacity-50" disabled={openingCamera} type="button" onClick={() => void openCamera("video")}>
                      <Video size={16} /> Record video
                    </button>
                    <button className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-[#fbfdfc] text-sm font-bold disabled:opacity-50" disabled={openingCamera} type="button" onClick={() => void openCamera("photo")}>
                      <Camera size={16} /> Take photo
                    </button>
                    <label className="col-span-2 inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-[#fbfdfc] text-sm font-bold focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-brand/35 sm:col-span-1">
                      <Upload size={16} /> Upload photo / video
                      <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/x-m4v" multiple onChange={onFilesSelected} />
                    </label>
                    <input ref={videoCaptureRef} className="hidden" type="file" accept="video/*" capture="environment" onChange={onFilesSelected} />
                    <input ref={photoCaptureRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={onFilesSelected} />
                  </div>

                  <div className="rounded-2xl border border-line bg-[#fbfdfc] p-4 text-sm leading-6 text-muted">
                    <p><strong className="text-ink">Media required:</strong> max {maxMediaFiles} files · photos or vertical 9:16 videos up to 30 sec · Instagram video publishing requires MP4 or MOV.</p>
                    {processingVideo ? <p className="mt-2 text-xs font-semibold text-brand" role="status">Preparing your video...</p> : null}
                    {media.length ? <div className="mt-3 space-y-2">{media.map((file, index) => <MediaPreview file={file} index={index} key={`${file.name}-${file.lastModified}-${index}`} onRemove={() => removeMedia(index)} />)}</div> : <p className="mt-2 text-xs">No photo or video added yet.</p>}
                  </div>

                  <label className="block">
                    <span className="text-sm font-bold text-ink">Describe the moment <span className="font-medium text-muted">(optional)</span></span>
                    <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-line p-4 text-base leading-6 outline-none focus:border-brand sm:min-h-32 sm:text-sm" maxLength={maxExperienceLength} value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="Example: People kept throwing plastic cups from a bus stop even though a bin was nearby." />
                    <span className="mt-1 block text-right text-xs text-muted">{experience.length}/{maxExperienceLength}</span>
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-ink">Your Instagram username <span className="font-medium text-muted">(optional)</span></span>
                    <input className="mt-2 w-full rounded-2xl border border-line px-4 py-3 text-base outline-none focus:border-brand sm:text-sm" value={instagramUsername} onChange={(event) => setInstagramUsername(event.target.value)} maxLength={31} placeholder="username (we will credit you only if approved)" autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} />
                    <span className="mt-1 block text-xs leading-5 text-muted">If this post is approved, we will add @{instagramUsername.trim().replace(/^@+/, "") || "yourusername"} to the caption.</span>
                  </label>

                  <p className="text-sm leading-6 text-muted"><strong className="text-ink">Location:</strong> {locationText}</p>

                  <label className="flex gap-3 rounded-2xl border border-[#ead9b8] bg-[#fffaf0] p-4 text-sm leading-6 text-[#725019]">
                    <input className="mt-0.5 size-5 shrink-0 accent-brand" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    I understand CivicShield will review this before posting and I should not include private faces, minors, license plates, or personal attacks.
                  </label>
                </>
              )}
            </div>

            {success ? null : (
              <div className="shrink-0 space-y-2 border-t border-line bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
                {status ? <p className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold leading-5 ${status.tone === "error" ? "border-[#efc7bf] bg-[#fff8f6] text-danger" : "border-[#cbe8dd] bg-brand-soft text-brand"}`} role={status.tone === "error" ? "alert" : "status"}>{status.text}</p> : null}
                {!canSubmit && !submitting && submitHint ? <p className="text-center text-xs text-muted landscape-short:hidden">{submitHint}</p> : null}
                <Button className="w-full" disabled={!canSubmit} onClick={() => void submit()} size="lg">
                  <Send size={18} /> {submitting ? (uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : "Finishing up...") : "Submit to CivicShield team"}
                </Button>
                {submitting ? <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-brand-soft"><div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} /></div> : null}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {cameraMode ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#07110f]/90 sm:p-6">
          <section
            aria-label={cameraMode === "video" ? "Record a video" : "Capture a photo"}
            aria-modal="true"
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#0d1c18] text-white shadow-2xl outline-none sm:h-[min(92dvh,56rem)] sm:max-w-md sm:rounded-[2rem] landscape-short:h-dvh landscape-short:max-w-none landscape-short:rounded-none"
            ref={cameraDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 landscape-short:absolute landscape-short:right-0 landscape-short:top-0 landscape-short:z-10 landscape-short:w-32 landscape-short:justify-end landscape-short:border-b-0 landscape-short:p-2">
              <div className="min-w-0 landscape-short:hidden">
                <p className="truncate text-sm font-bold">{cameraMode === "video" ? "Record a vertical video" : "Capture a photo"}</p>
                <p className="truncate text-xs text-white/65">Recorded in an Instagram-ready 9:16 frame</p>
              </div>
              <button className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 text-white" type="button" onClick={closeCamera} aria-label="Close camera"><X size={18} /></button>
            </div>

            <div className="camera-stage flex min-h-0 flex-1 items-center justify-center bg-black landscape-short:absolute landscape-short:inset-y-0 landscape-short:left-0 landscape-short:right-32">
              <div className="camera-frame relative overflow-hidden bg-black">
                <video ref={cameraPreviewRef} className={`size-full object-cover ${cameraFacing === "user" ? "-scale-x-100" : ""}`} autoPlay muted playsInline onPlaying={() => setCameraReady(true)} />
                {isRecording ? <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-white/25"><div className="h-full bg-danger transition-[width] duration-300" style={{ width: `${(recordingElapsedSeconds / (maxRecordingMs / 1000)) * 100}%` }} /></div> : null}
                <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
                  <span className="whitespace-nowrap rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white">{isRecording ? `● ${formatRecordingTime(recordingElapsedSeconds)} / 00:30` : cameraFacing === "environment" ? "Back camera" : "Front camera"}</span>
                  <button className="grid size-11 place-items-center rounded-full bg-black/55 text-white disabled:opacity-40" disabled={isRecording || openingCamera} type="button" onClick={() => void switchCamera()} aria-label="Switch camera" title={isRecording ? "Stop recording before switching cameras" : "Switch camera"}><FlipHorizontal size={19} /></button>
                </div>
                {!cameraReady ? <p className="absolute inset-0 grid place-items-center text-sm font-semibold text-white/80" role="status">Starting camera...</p> : null}
                {cameraNotice ? <p className="absolute inset-x-3 bottom-20 rounded-2xl bg-black/75 px-4 py-2.5 text-center text-xs font-semibold leading-5 text-white" role="alert">{cameraNotice}</p> : null}
                {zoomRange ? <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10"><button className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white" type="button" onClick={() => void updateZoom(zoom - zoomRange.step)} aria-label="Zoom out"><ZoomOut size={17} /></button><input className="h-6 min-w-0 flex-1 accent-white" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom} onChange={(event) => void updateZoom(Number(event.target.value))} aria-label="Camera zoom" /><button className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white" type="button" onClick={() => void updateZoom(zoom + zoomRange.step)} aria-label="Zoom in"><ZoomIn size={17} /></button></div> : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-center gap-1.5 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 landscape-short:absolute landscape-short:inset-y-0 landscape-short:right-0 landscape-short:w-32 landscape-short:justify-center landscape-short:px-2 landscape-short:py-0">
              <button
                aria-label={cameraMode === "photo" ? "Take photo" : isRecording ? "Stop recording" : "Start recording"}
                className="grid size-[72px] place-items-center rounded-full border-4 border-white disabled:opacity-40"
                disabled={!cameraReady}
                onClick={cameraMode === "photo" ? capturePhoto : isRecording ? stopRecording : startVideoRecording}
                type="button"
              >
                {cameraMode === "photo" ? <span className="size-[52px] rounded-full bg-white" /> : isRecording ? <span className="size-7 rounded-md bg-danger" /> : <span className="size-[52px] rounded-full bg-danger" />}
              </button>
              <p className="text-center text-xs text-white/70">{cameraMode === "photo" ? "Tap to take the photo" : isRecording ? "Tap to stop" : "Tap to start recording (up to 30 sec)"}</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

// Moves focus into a dialog when it opens, keeps Tab inside it, closes on Escape, and returns focus
// to whatever opened it. `onEscape` is read through a ref so a new callback does not re-run the effect.
function useModalFocus(isOpen: boolean, ref: RefObject<HTMLElement | null>, onEscape: () => void, fallback: RefObject<HTMLElement | null>) {
  const escapeRef = useRef(onEscape);
  useEffect(() => { escapeRef.current = onEscape; });

  useEffect(() => {
    const element = ref.current;
    if (!isOpen || !element) return;
    const fallbackElement = fallback.current;
    const trigger = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : fallbackElement;
    element.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (!element) return;
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(element.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])")).filter((item) => item.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === element)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    element.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
      trigger?.focus({ preventScroll: true });
    };
  }, [isOpen, ref, fallback]);
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
  const preview = !url ? null : isVideo ? (
    <video className="mt-3 max-h-[24rem] w-full rounded-xl bg-[#101a18] object-contain" controls playsInline src={url} />
  ) : isImage ? (
    // A local blob: URL preview, which next/image cannot optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={`Selected ${file.name}`} className="mt-3 max-h-[24rem] w-full rounded-xl bg-[#f4f8f6] object-contain" src={url} />
  ) : null;
  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink">{index + 1}. {file.name}</p>
          <p className="mt-0.5 text-xs text-muted">{file.type || "media file"} · {formatFileSize(file.size)}</p>
        </div>
        <button className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#f0c5bd] text-danger" type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>
          <Trash2 size={16} />
        </button>
      </div>
      {preview}
    </div>
  );
}

// XMLHttpRequest rather than fetch so large videos report real upload progress. It also keeps this
// one long upload out of the site-wide activity overlay, which only tracks fetch.
function sendSubmission(formData: FormData, requestRef: RefObject<XMLHttpRequest | null>, onProgress: (percent: number) => void) {
  return new Promise<SubmitResult>((resolve, reject) => {
    const request = new XMLHttpRequest();
    requestRef.current = request;
    request.open("POST", "/api/civic-sense");
    request.timeout = uploadTimeoutMs;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      let payload: SubmitResult["payload"] = null;
      try { payload = JSON.parse(request.responseText) as SubmitResult["payload"]; } catch { /* a proxy or platform error page is not JSON */ }
      resolve({ status: request.status, payload });
    };
    request.onerror = () => reject(new UploadError("network"));
    request.ontimeout = () => reject(new UploadError("timeout"));
    request.onabort = () => reject(new UploadError("aborted"));
    request.send(formData);
  });
}

function hasCameraApi() {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

function canRecordInApp() {
  return hasCameraApi() && typeof MediaRecorder !== "undefined" && Boolean(getPreferredRecordingMimeType());
}

function describeCameraError(error: unknown, mode: Exclude<CameraMode, null>) {
  const name = error instanceof DOMException ? error.name : "";
  const alternative = mode === "video" ? "upload a video" : "upload a photo";
  if (name === "NotAllowedError" || name === "SecurityError") return `${mode === "video" ? "Camera or microphone" : "Camera"} access is blocked. Allow it in your browser settings and try again, or ${alternative} instead.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No camera was found on this device. You can ${alternative} instead.`;
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app. Close it and try again.";
  return `The camera could not be started. You can ${alternative} instead.`;
}

// Some pickers (notably on Android) leave File.type empty, so fall back to the extension.
function resolveMediaType(file: File) {
  const declared = file.type ? baseMediaMimeType(file.type) : "";
  if (declared && declared !== "application/octet-stream") return declared;
  return extensionTypes[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? declared;
}

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
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

function drawVideoToPortraitFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  context.fillStyle = "#000";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    video,
    (targetWidth - drawWidth) / 2,
    (targetHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function getCameraCapabilities(track: MediaStreamTrack | undefined) {
  const getCapabilities = (track as unknown as { getCapabilities?: () => CameraCapabilities } | undefined)?.getCapabilities;
  return track && getCapabilities ? getCapabilities.call(track) : undefined;
}

function getPreferredRecordingMimeType() {
  const candidates = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];
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
