const API_BASE = import.meta.env.VITE_API_URL || "";

export interface AuthSession {
  access_token: string;
  auth_kind: string;
  role: string;
  shell: string;
  unit_id: number | null;
  duty_post_id: number | null;
  display_name: string;
}

export interface DutyContact {
  id: number;
  unit_id: number;
  unit_name?: string | null;
  duty_post_id?: number | null;
  post_type?: string | null;
  rank?: string | null;
  full_name?: string | null;
  post_name: string;
  phone: string;
  room: string | null;
  note: string | null;
}

export interface DutyPost {
  id: number;
  unit_id: number;
  post_type: string;
  name: string;
  login_name: string | null;
  is_active: boolean;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("session");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    let message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ")
          : res.statusText;
    if (res.status === 404 && (message === "Not Found" || message === "not found")) {
      message = `Сервис не найден (${path}). Перезапустите backend: docker compose restart backend`;
    }
    throw new Error(message || "Ошибка запроса");
  }
  if (res.headers.get("content-type")?.includes("application/json")) {
    return res.json();
  }
  return res.text() as unknown as T;
}

export const authApi = {
  login: (username: string, password: string) =>
    api<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  dutyLogin: (login_name: string, password: string) =>
    api<AuthSession>("/api/auth/duty-login", {
      method: "POST",
      body: JSON.stringify({ login_name, password }),
    }),
  me: () => api<AuthSession>("/api/auth/me"),
};

export type ReportStatus = "draft" | "submitted" | "approved" | "rejected";

export interface AttendanceAggregate {
  total_list: number;
  present: number;
  duty: number;
  trip: number;
  leave: number;
  sick: number;
  dismissal: number;
  away_dorm: number;
  other: number;
}

export interface AbsenceEntry {
  id: number;
  unit_id: number;
  status_date: string;
  category_code: string;
  rank: string;
  last_name: string;
  note: string | null;
  editable: boolean;
}

export interface AttendanceSnapshot {
  unit_id: number;
  unit_name: string;
  report_date: string;
  aggregate: AttendanceAggregate;
  total_list: number;
  absences: AbsenceEntry[];
  report_status: ReportStatus | null;
  editable: boolean;
  changes_pending_dpf?: boolean;
  changes_pending_dpa?: boolean;
  is_editing?: boolean;
}

export interface AbsenceCategoryOption {
  code: string;
  label: string;
  detail_required?: boolean;
}

export interface CourseStroevkaSummary {
  course_id: number;
  course_name: string;
  report_status: ReportStatus | null;
  changes_pending_dpf: boolean;
  changes_pending_dpa: boolean;
  aggregate: AttendanceAggregate;
  absences: AbsenceEntry[];
}

export interface FacultyStroevkaBundle {
  faculty_id: number;
  faculty_name: string;
  officers: AttendanceSnapshot;
  courses: CourseStroevkaSummary[];
  has_pending_for_dpf: boolean;
  has_pending_for_dpa: boolean;
  faculty_report_status?: ReportStatus | null;
  is_editing?: boolean;
  submit_blockers?: string[];
}

export interface ChessboardRow {
  faculty_id: number;
  faculty_name: string;
  course_id: number | null;
  course_name: string | null;
  is_officers: boolean;
  location_id?: number | null;
  location_name?: string | null;
  row_kind?: string;
  changes_pending_dpf?: boolean;
  changes_pending_dpa?: boolean;
  total_list: number;
  present: number;
  duty: number;
  trip: number;
  leave: number;
  sick: number;
  dismissal: number;
  away_dorm: number;
  other: number;
  status: ReportStatus;
}

export interface ChessboardSickEntry {
  id: number;
  unit_id: number;
  unit_name: string;
  faculty_id?: number | null;
  faculty_name?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  rank: string;
  last_name: string;
  note: string | null;
  status_date: string;
}

export interface ChessboardSickByLocation {
  location_id: number;
  location_name: string;
  count: number;
}

export interface ChessboardSickSummary {
  total: number;
  by_location: ChessboardSickByLocation[];
  officers_count: number;
  entries: ChessboardSickEntry[];
}

export interface ChessboardResponse {
  report_date: string;
  view: string;
  rows: ChessboardRow[];
  sick_summary: ChessboardSickSummary;
}

export interface OverviewUnitBreakdown {
  unit_id: number;
  unit_name: string;
  aggregate: AttendanceAggregate;
}

export interface OverviewDelta {
  present: number;
  sick: number;
  trip: number;
  leave: number;
  dismissal: number;
}

export interface ReadinessSummary {
  courses_total: number;
  courses_submitted: number;
  faculties_total: number;
  faculties_submitted: number;
}

export interface OverviewResponse {
  report_date: string;
  academy: AttendanceAggregate;
  present_percent: number;
  delta_vs_yesterday: OverviewDelta | null;
  faculties: OverviewUnitBreakdown[];
  locations: OverviewUnitBreakdown[];
  sick_summary: ChessboardSickSummary;
  readiness: ReadinessSummary;
}

export interface TrendDayPoint {
  date: string;
  total_list: number;
  present: number;
  sick: number;
  trip: number;
  leave: number;
  dismissal: number;
  duty: number;
  away_dorm: number;
}

export interface FacultyTodayBreakdown {
  faculty_id: number;
  faculty_name: string;
  sick: number;
  trip: number;
  leave: number;
  dismissal: number;
}

export interface TrendsResponse {
  from_date: string;
  to_date: string;
  days: TrendDayPoint[];
  faculties_today: FacultyTodayBreakdown[];
}

export interface ChatMessage {
  id: number;
  sender_kind?: string;
  sender_id?: number;
  sender_name: string;
  body: string;
  created_at: string;
  faculty_id?: number | null;
}

export interface UnitRead {
  id: number;
  parent_id: number | null;
  type: string;
  name: string;
  is_active: boolean;
}

export interface UnitNode {
  id: number;
  parent_id: number | null;
  type: string;
  name: string;
  is_active: boolean;
  location_id?: number | null;
  location_name?: string | null;
  children?: UnitNode[];
}

export interface AuditEntry {
  id: number;
  actor_name: string;
  action: string;
  details: string | null;
  created_at: string;
}
