from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import (
    AbsenceCategoryCode,
    Composition,
    DutyPostType,
    ReportStatus,
    UnitType,
    UserRole,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth ---


class LoginRequest(BaseModel):
    username: str
    password: str


class DutyLoginRequest(BaseModel):
    login_name: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    auth_kind: str
    role: str
    shell: str
    unit_id: int | None = None
    duty_post_id: int | None = None
    display_name: str


class AuthUser(BaseModel):
    auth_kind: str
    role: str
    shell: str
    user_id: int | None = None
    duty_post_id: int | None = None
    unit_id: int | None = None
    display_name: str
    post_type: str | None = None


# --- Units ---


class FacultyCreate(BaseModel):
    faculty_number: int = Field(ge=1, le=99, description="Номер факультета (= id)")
    name: str | None = None


class CourseCreate(BaseModel):
    faculty_number: int = Field(ge=1, le=99, description="Номер факультета")
    course_number: int = Field(ge=1, le=5, description="Год обучения 1–5")
    location_id: int = Field(description="id расположения: 1001 Академия, 1002 Пушкин, 1003 Лехтуси")


class CourseMove(BaseModel):
    location_id: int = Field(description="id расположения")


class UnitCreate(BaseModel):
    parent_id: int | None = None
    type: UnitType
    name: str
    is_active: bool = True


class UnitUpdate(BaseModel):
    parent_id: int | None = None
    type: UnitType | None = None
    name: str | None = None
    is_active: bool | None = None


class UnitRead(ORMModel):
    id: int
    parent_id: int | None
    type: UnitType
    name: str
    is_active: bool


class CourseBulkCreate(BaseModel):
    faculty_number: int = Field(ge=1, le=99, description="Номер факультета")
    location_id: int = Field(description="id расположения")


class CourseBulkSkippedItem(BaseModel):
    id: int
    name: str


class CourseBulkResult(BaseModel):
    created: list[UnitRead]
    skipped: list[CourseBulkSkippedItem]


class UnitTree(UnitRead):
    children: list["UnitTree"] = []


# --- People ---


class PersonCreate(BaseModel):
    unit_id: int
    rank: str
    last_name: str
    first_name: str
    middle_name: str | None = None
    composition: Composition
    position: str | None = None
    is_active: bool = True


class PersonUpdate(BaseModel):
    unit_id: int | None = None
    rank: str | None = None
    last_name: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    composition: Composition | None = None
    position: str | None = None
    is_active: bool | None = None


class PersonRead(ORMModel):
    id: int
    unit_id: int
    rank: str
    last_name: str
    first_name: str
    middle_name: str | None
    composition: Composition
    position: str | None
    is_active: bool
    full_name: str = ""


# --- Absence ---


class AbsenceReasonCreate(BaseModel):
    category_id: int
    name: str


class AbsenceReasonRead(ORMModel):
    id: int
    category_id: int
    name: str
    is_active: bool


class AbsenceCategoryRead(ORMModel):
    id: int
    code: AbsenceCategoryCode
    label: str
    sort_order: int
    reasons: list[AbsenceReasonRead] = []


class PersonStatusUpdate(BaseModel):
    person_id: int
    reason_id: int | None = None
    note: str | None = None


class AbsenceEntryCreate(BaseModel):
    category_code: AbsenceCategoryCode
    rank: str = Field(min_length=1, max_length=64)
    last_name: str = Field(min_length=1, max_length=128)
    note: str | None = None


class AbsenceEntryRead(BaseModel):
    id: int
    unit_id: int
    status_date: date
    category_code: AbsenceCategoryCode
    rank: str
    last_name: str
    note: str | None = None
    editable: bool = True


class StrengthUpdate(BaseModel):
    total_list: int = Field(ge=0)


class AttendanceAggregate(BaseModel):
    total_list: int
    present: int
    duty: int
    trip: int
    leave: int
    sick: int
    dismissal: int
    away_dorm: int
    other: int

    @model_validator(mode="after")
    def validate_totals(self) -> "AttendanceAggregate":
        total_absent = (
            self.duty
            + self.trip
            + self.leave
            + self.sick
            + self.dismissal
            + self.away_dorm
            + self.other
        )
        if self.total_list != self.present + total_absent:
            raise ValueError(
                f"Сходимость нарушена: по списку {self.total_list}, "
                f"налицо {self.present} + отсутствующие {total_absent}"
            )
        return self


class PersonAttendanceRow(BaseModel):
    person: PersonRead
    reason_id: int | None
    reason_name: str | None
    category_code: AbsenceCategoryCode | None
    note: str | None
    editable: bool = True


class AttendanceSnapshot(BaseModel):
    unit_id: int
    unit_name: str
    report_date: date
    aggregate: AttendanceAggregate
    total_list: int = 0
    absences: list[AbsenceEntryRead] = []
    people: list[PersonAttendanceRow] = []
    report_status: ReportStatus | None = None
    editable: bool = True
    changes_pending_dpf: bool = False
    changes_pending_dpa: bool = False
    is_editing: bool = False
    report_date: date | None = None


class CourseStroevkaSummary(BaseModel):
    course_id: int
    course_name: str
    report_status: ReportStatus | None
    changes_pending_dpf: bool = False
    changes_pending_dpa: bool = False
    aggregate: AttendanceAggregate
    absences: list[AbsenceEntryRead] = []


class FacultyStroevkaBundle(BaseModel):
    faculty_id: int
    faculty_name: str
    officers: AttendanceSnapshot
    courses: list[CourseStroevkaSummary]
    has_pending_for_dpf: bool = False
    has_pending_for_dpa: bool = False
    faculty_report_status: ReportStatus | None = None
    is_editing: bool = False
    submit_blockers: list[str] = []


# --- Reports ---


class RejectRequest(BaseModel):
    comment: str = Field(min_length=1)


class CourseReportRead(ORMModel):
    id: int
    course_id: int
    report_date: date
    status: ReportStatus
    reject_comment: str | None


class FacultyReportRead(ORMModel):
    id: int
    faculty_id: int
    report_date: date
    status: ReportStatus
    reject_comment: str | None


class ChessboardRow(BaseModel):
    faculty_id: int
    faculty_name: str
    course_id: int | None
    course_name: str | None
    is_officers: bool = False
    location_id: int | None = None
    location_name: str | None = None
    row_kind: str = "course"
    changes_pending_dpf: bool = False
    changes_pending_dpa: bool = False
    total_list: int
    present: int
    duty: int
    trip: int
    leave: int
    sick: int
    dismissal: int
    away_dorm: int
    other: int
    status: ReportStatus


class ChessboardSickEntry(BaseModel):
    id: int
    unit_id: int
    unit_name: str
    faculty_id: int | None = None
    faculty_name: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    rank: str
    last_name: str
    note: str | None = None
    status_date: date


class ChessboardSickByLocation(BaseModel):
    location_id: int
    location_name: str
    count: int


class ChessboardSickSummary(BaseModel):
    total: int
    by_location: list[ChessboardSickByLocation]
    officers_count: int = 0
    entries: list[ChessboardSickEntry]


class ChessboardResponse(BaseModel):
    report_date: date
    view: str = "faculty"
    rows: list[ChessboardRow]
    sick_summary: ChessboardSickSummary


# --- Chief overview / trends ---


class OverviewUnitBreakdown(BaseModel):
    unit_id: int
    unit_name: str
    aggregate: AttendanceAggregate


class OverviewDelta(BaseModel):
    present: int
    sick: int
    trip: int
    leave: int
    dismissal: int


class ReadinessSummary(BaseModel):
    courses_total: int
    courses_submitted: int
    faculties_total: int
    faculties_submitted: int


class OverviewResponse(BaseModel):
    report_date: date
    academy: AttendanceAggregate
    present_percent: float
    delta_vs_yesterday: OverviewDelta | None = None
    faculties: list[OverviewUnitBreakdown]
    locations: list[OverviewUnitBreakdown]
    sick_summary: ChessboardSickSummary
    readiness: ReadinessSummary


class TrendDayPoint(BaseModel):
    date: date
    total_list: int
    present: int
    sick: int
    trip: int
    leave: int
    dismissal: int
    duty: int
    away_dorm: int


class FacultyTodayBreakdown(BaseModel):
    faculty_id: int
    faculty_name: str
    sick: int
    trip: int
    leave: int
    dismissal: int


class TrendsResponse(BaseModel):
    from_date: date
    to_date: date
    days: list[TrendDayPoint]
    faculties_today: list[FacultyTodayBreakdown]


# --- Chat ---


class ChatMessageCreate(BaseModel):
    recipient_kind: str
    recipient_id: int
    body: str = Field(min_length=1)


class ChatMessageRead(ORMModel):
    id: int
    sender_kind: str
    sender_id: int
    sender_name: str
    recipient_kind: str
    recipient_id: int
    faculty_id: int | None
    body: str
    created_at: datetime


# --- Duty ---


class DutySelfRegister(BaseModel):
    rank: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=64)


class DutyContactStatus(BaseModel):
    registered: bool
    contact: "DutyContactRead | None" = None


class DutyContactUpsert(BaseModel):
    unit_id: int
    post_name: str
    phone: str
    room: str | None = None
    note: str | None = None
    contact_date: date | None = None


class DutyContactRead(ORMModel):
    id: int
    contact_date: date
    unit_id: int
    unit_name: str | None = None
    duty_post_id: int | None = None
    post_type: str | None = None
    rank: str | None = None
    full_name: str | None = None
    post_name: str
    phone: str
    room: str | None
    note: str | None


class RotateKeyResponse(BaseModel):
    plain_key: str
    rotated_at: datetime
    message: str


class DutyPostRead(ORMModel):
    id: int
    unit_id: int
    post_type: DutyPostType
    name: str
    login_name: str | None = None
    is_active: bool


class DutyPostPasswordSet(BaseModel):
    password: str = Field(min_length=4, max_length=128)


class DutyPostPasswordSetResult(BaseModel):
    login_name: str
    message: str


class DutyPostClearRegistrationResult(BaseModel):
    cleared: bool
    message: str


# --- Audit ---


class AuditLogRead(ORMModel):
    id: int
    actor_kind: str
    actor_id: int
    actor_name: str
    action: str
    entity_type: str | None
    entity_id: int | None
    details: str | None
    created_at: datetime


# --- Users ---


class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.ADMIN
    unit_id: int | None = None
    full_name: str


class UserRead(ORMModel):
    id: int
    username: str
    role: UserRole
    unit_id: int | None
    full_name: str
    is_active: bool


class WSEvent(BaseModel):
    type: str
    payload: dict[str, Any] = {}
