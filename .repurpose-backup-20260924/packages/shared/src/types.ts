// Core domain types shared across backend, frontend, and the MCP server.
// These mirror the SQLite schema in apps/backend/src/db/schema.sql.

export type Id = number;
export type ISODateTime = string; // e.g. "2026-09-22T14:30:00.000Z"
export type ISODate = string; // e.g. "2026-09-22"

export type ScheduledWorkoutStatus = "planned" | "completed" | "skipped";

/** Arbitrary metric values that don't have a dedicated column (RPE, incline, tempo, etc.). */
export type ExtraMetrics = Record<string, string | number | boolean>;

export interface Plan {
  id: Id;
  name: string;
  description: string | null;
  /** Workout family: "upper" | "legs" | null. Drives leg-only features like knee checks. */
  kind: string | null;
  createdAt: ISODateTime;
}

export interface PlanItem {
  id: Id;
  planId: Id;
  name: string;
  orderIndex: number;
  notes: string | null;
}

export interface PlanItemSet {
  id: Id;
  planItemId: Id;
  setNumber: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
  targetExtra: ExtraMetrics | null;
}

/** A plan with its items and per-set targets nested, for GET /plans/:id. */
export interface PlanDetail extends Plan {
  items: (PlanItem & { sets: PlanItemSet[] })[];
}

export interface ScheduledWorkout {
  id: Id;
  planId: Id | null;
  scheduledDate: ISODate;
  status: ScheduledWorkoutStatus;
  notes: string | null;
  createdAt: ISODateTime;
}

export interface Session {
  id: Id;
  scheduledWorkoutId: Id | null;
  /** Plan this session was started from (null for ad-hoc). */
  planId: Id | null;
  /** Denormalized for list views: plan name / kind via plan or scheduled workout. */
  planName: string | null;
  planKind: string | null;
  date: ISODate;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  notes: string | null;
  /** Knee pain 0-10 (leg days): during, after, next morning. */
  painDuring: number | null;
  painAfter: number | null;
  painNextMorning: number | null;
}

export interface SessionItem {
  id: Id;
  sessionId: Id;
  name: string;
  orderIndex: number;
  notes: string | null;
}

export interface SessionItemSet {
  id: Id;
  sessionItemId: Id;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  extra: ExtraMetrics | null;
  completedAt: ISODateTime | null;
  /** Target snapshot copied from the plan when the session was started (null for ad-hoc sets). */
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  targetDistanceMeters: number | null;
}

/** A session with its items and sets nested, for GET /sessions/:id. */
export interface SessionDetail extends Session {
  items: (SessionItem & { sets: SessionItemSet[] })[];
}

// ---- API request bodies ----

export interface CreatePlanItemSetInput {
  setNumber: number;
  targetReps?: number | null;
  targetWeight?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  targetExtra?: ExtraMetrics | null;
}

export interface CreatePlanItemInput {
  name: string;
  orderIndex: number;
  notes?: string | null;
  sets: CreatePlanItemSetInput[];
}

export interface CreatePlanRequest {
  name: string;
  description?: string | null;
  kind?: string | null;
  items?: CreatePlanItemInput[];
}

export type UpdatePlanRequest = Partial<
  Pick<CreatePlanRequest, "name" | "description" | "kind">
>;

export interface CreateScheduledWorkoutRequest {
  planId?: Id | null;
  scheduledDate: ISODate;
  notes?: string | null;
}

export interface UpdateScheduledWorkoutRequest {
  scheduledDate?: ISODate;
  status?: ScheduledWorkoutStatus;
  notes?: string | null;
}

export interface CreateSessionRequest {
  scheduledWorkoutId?: Id | null;
  planId?: Id | null; // if set (and no scheduledWorkoutId), pre-populate items from this plan
  date: ISODate;
  notes?: string | null;
  painDuring?: number | null;
  painAfter?: number | null;
  painNextMorning?: number | null;
}

export interface UpdateSessionRequest {
  notes?: string | null;
  completedAt?: ISODateTime | null;
  painDuring?: number | null;
  painAfter?: number | null;
  painNextMorning?: number | null;
}

export interface CreateSessionItemRequest {
  name: string;
  orderIndex: number;
  notes?: string | null;
}

export interface CreateSessionItemSetRequest {
  setNumber: number;
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  extra?: ExtraMetrics | null;
}

export type UpdateSessionItemSetRequest = Partial<CreateSessionItemSetRequest>;

export interface LoginRequest {
  password: string;
}

export interface ApiErrorBody {
  error: string;
}
