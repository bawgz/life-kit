import type {
  CreatePlanRequest,
  CreateScheduledWorkoutRequest,
  CreateSessionItemRequest,
  CreateSessionItemSetRequest,
  CreateSessionRequest,
  Plan,
  PlanDetail,
  ScheduledWorkout,
  Session,
  SessionDetail,
  UpdateScheduledWorkoutRequest,
  UpdateSessionItemSetRequest,
  UpdateSessionRequest,
} from "@life-kit/shared";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { ApiError };

export const api = {
  login: (password: string) => request<{ ok: true }>("POST", "/auth/login", { password }),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),
  me: () => request<{ ok: true }>("GET", "/auth/me"),

  listPlans: () => request<Plan[]>("GET", "/plans"),
  getPlan: (id: number) => request<PlanDetail>("GET", `/plans/${id}`),
  createPlan: (body: CreatePlanRequest) => request<PlanDetail>("POST", "/plans", body),

  listScheduledWorkouts: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request<ScheduledWorkout[]>("GET", `/scheduled-workouts${qs ? `?${qs}` : ""}`);
  },
  createScheduledWorkout: (body: CreateScheduledWorkoutRequest) =>
    request<ScheduledWorkout>("POST", "/scheduled-workouts", body),
  updateScheduledWorkout: (id: number, body: UpdateScheduledWorkoutRequest) =>
    request<ScheduledWorkout>("PATCH", `/scheduled-workouts/${id}`, body),

  listSessions: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request<Session[]>("GET", `/sessions${qs ? `?${qs}` : ""}`);
  },
  getSession: (id: number) => request<SessionDetail>("GET", `/sessions/${id}`),
  createSession: (body: CreateSessionRequest) =>
    request<SessionDetail>("POST", "/sessions", body),
  updateSession: (id: number, body: UpdateSessionRequest) =>
    request<SessionDetail>("PATCH", `/sessions/${id}`, body),
  deleteSession: (id: number) =>
    request<void>("DELETE", `/sessions/${id}`),
  addSessionItem: (sessionId: number, body: CreateSessionItemRequest) =>
    request<SessionDetail>("POST", `/sessions/${sessionId}/items`, body),
  deleteSessionItem: (sessionId: number, itemId: number) =>
    request<SessionDetail>("DELETE", `/sessions/${sessionId}/items/${itemId}`),
  logSet: (sessionId: number, sessionItemId: number, body: CreateSessionItemSetRequest) =>
    request<SessionDetail>(
      "POST",
      `/sessions/${sessionId}/items/${sessionItemId}/sets`,
      body
    ),
  updateSet: (
    sessionId: number,
    sessionItemId: number,
    setId: number,
    body: UpdateSessionItemSetRequest
  ) =>
    request<SessionDetail>(
      "PATCH",
      `/sessions/${sessionId}/items/${sessionItemId}/sets/${setId}`,
      body
    ),
  deleteSet: (sessionId: number, sessionItemId: number, setId: number) =>
    request<void>(
      "DELETE",
      `/sessions/${sessionId}/items/${sessionItemId}/sets/${setId}`
    ),
};
