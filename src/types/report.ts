export type UrgencyLevel = "low" | "medium" | "high" | "critical";

export type ReportStatus =
  | "draft"
  | "ready-to-analyze"
  | "submitted"
  | "delivery-confirmed"
  | "acknowledged"
  | "assigned"
  | "in-progress"
  | "department-resolved"
  | "verification-pending"
  | "verified-resolved"
  | "disputed"
  | "reopened"
  | "overdue";

export interface IncidentLocation {
  label: string;
  latitude: number;
  longitude: number;
  source: "search" | "current-location" | "map-pin" | "manual";
}

export interface CivicAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "video";
}

export interface EmailDelivery {
  recipient: string;
  messageId?: string;
  sentAt: string;
}

export interface DepartmentRoute {
  name: string;
  category: string;
  rationale: string;
}

export interface SafetyAnalysis {
  category: string;
  urgency: UrgencyLevel;
  riskSummary: string;
  immediateActions: string[];
  publicAlert: string;
  formalComplaint: string;
  emailSubject: string;
  emailBody: string;
  route: DepartmentRoute;
  generatedBy: "groq" | "local-fallback";
}

export interface CivicReport {
  id: string;
  description: string;
  location: string;
  incidentLocation?: IncidentLocation;
  duration: string;
  affectedPeople?: string;
  extraDetails?: string;
  attachments?: CivicAttachment[];
  // Issued by the server when the report is saved; authorises later updates to it.
  // Never include it in anything sent to AI providers or shown publicly.
  writeToken?: string;
  emailDelivery?: EmailDelivery;
  analysis?: SafetyAnalysis;
  category?: string;
  urgency?: UrgencyLevel;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CivicReportInput {
  id?: string;
  description: string;
  location: string;
  duration: string;
  incidentLocation?: IncidentLocation;
  affectedPeople?: string;
  extraDetails?: string;
  attachments?: CivicAttachment[];
  writeToken?: string;
}

export interface PublicCivicReport {
  id: string;
  category: string | null;
  urgency: UrgencyLevel | null;
  status: ReportStatus;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  distanceMeters?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStatusEvent {
  status: ReportStatus;
  note: string;
  createdAt: string;
}

// The only parts of an analysis that are safe to show publicly. The full analysis (email draft,
// formal complaint) contains the exact address and coordinates and stays moderator-only.
export type PublicAnalysis = Pick<SafetyAnalysis, "riskSummary" | "immediateActions" | "publicAlert">;

export interface PublicCivicReportDetail extends PublicCivicReport {
  description: string;
  duration: string;
  affectedPeople: number | null;
  extraDetails: string | null;
  attachmentCount: number;
  routeName: string | null;
  analysis: PublicAnalysis | null;
  statusEvents: PublicStatusEvent[];
}

export interface EmergencyReport {
  id: string;
  type: string;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  details: string | null;
  isSafe: boolean;
  createdAt: string;
  distanceMeters?: number;
  priority?: UrgencyLevel;
  priorityReason?: string;
}

export type CivicSenseStatus = "needs-review" | "approved" | "posted" | "rejected";

export interface CivicSenseSubmission {
  id: string;
  experience: string;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  mediaCount: number;
  mediaTypes: string[];
  mediaUrls: string[];
  aiCaption: string;
  aiCategory: string;
  aiHashtags: string[];
  aiSafetyNote: string;
  status: CivicSenseStatus;
  instagramHandle: string | null;
  instagramMediaId: string | null;
  instagramPostUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
