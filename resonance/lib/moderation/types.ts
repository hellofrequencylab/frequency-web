/** Moderation & safety types (reports and blocks). */

export type ReportStatus = "open" | "reviewed" | "dismissed";

/** A filed report, as stored. */
export interface Report {
  id: string;
  worldId: string;
  reporterUserId: string;
  subjectUserId: string | null;
  venueId: string | null;
  reason: string;
  detail: string | null;
  status: ReportStatus;
  createdAt: string;
}

/** The fields a caller supplies when filing a report. */
export interface ReportInput {
  subjectUserId?: string | null;
  venueId?: string | null;
  reason: string;
  detail?: string | null;
}

/** One block: who the blocker has hidden, and when. */
export interface BlockEntry {
  blockerUserId: string;
  blockedUserId: string;
  worldId: string;
  createdAt: string;
}
