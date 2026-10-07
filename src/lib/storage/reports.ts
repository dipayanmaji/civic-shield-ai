"use client";

import type { CivicReport, CivicReportInput, EmailDelivery } from "@/types/report";

const STORAGE_KEY = "civicshield.localReports";
const REPORTS_CHANGED_EVENT = "civicshield:reports-changed";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredReports(): CivicReport[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawReports = window.localStorage.getItem(STORAGE_KEY);
    if (!rawReports) {
      return [];
    }

    const parsedReports = JSON.parse(rawReports);
    return Array.isArray(parsedReports) ? parsedReports : [];
  } catch {
    return [];
  }
}

function writeStoredReports(reports: CivicReport[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  window.dispatchEvent(new Event(REPORTS_CHANGED_EVENT));
}

function createReportId(reports: CivicReport[]) {
  const year = new Date().getFullYear();
  const nextNumber =
    reports
      .map((report) => report.id)
      .map((id) => Number(id.match(/^CS-\d{4}-(\d{4})$/)?.[1] ?? 0))
      .reduce((highest, current) => Math.max(highest, current), 0) + 1;

  return `CS-${year}-${String(nextNumber).padStart(4, "0")}`;
}

export function getLocalReports() {
  return readStoredReports();
}

export function getLocalReportsSnapshot() {
  if (!canUseStorage()) {
    return "[]";
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
}

export function subscribeToLocalReports(onStoreChange: () => void) {
  if (!canUseStorage()) {
    return () => undefined;
  }

  window.addEventListener(REPORTS_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(REPORTS_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function saveLocalReport(input: CivicReportInput) {
  const existingReports = readStoredReports();
  const now = new Date().toISOString();
  const report: CivicReport = {
    id: input.id ?? createReportId(existingReports),
    description: input.description.trim(),
    location: input.location.trim(),
    incidentLocation: input.incidentLocation,
    duration: input.duration.trim(),
    affectedPeople: input.affectedPeople?.trim() || undefined,
    extraDetails: input.extraDetails?.trim() || undefined,
    attachments: input.attachments,
    writeToken: input.writeToken,
    status: "ready-to-analyze",
    createdAt: now,
    updatedAt: now,
  };

  writeStoredReports([report, ...existingReports]);
  return report;
}

export function saveReportAnalysis(reportId: string, analysis: CivicReport["analysis"]) {
  const reports = readStoredReports();
  const updatedReports = reports.map((report) =>
    report.id === reportId
      ? { ...report, analysis, updatedAt: new Date().toISOString() }
      : report,
  );
  writeStoredReports(updatedReports);
  return updatedReports.find((report) => report.id === reportId) ?? null;
}

export function markReportEmailSent(reportId: string, delivery: Omit<EmailDelivery, "sentAt">) {
  const reports = readStoredReports();
  const now = new Date().toISOString();
  const updatedReports = reports.map((report) =>
    report.id === reportId ? { ...report, status: "delivery-confirmed" as const, emailDelivery: { ...delivery, sentAt: now }, updatedAt: now } : report,
  );
  writeStoredReports(updatedReports);
  return updatedReports.find((report) => report.id === reportId) ?? null;
}

export function getLocalReport(reportId: string) {
  return readStoredReports().find((report) => report.id === reportId) ?? null;
}
