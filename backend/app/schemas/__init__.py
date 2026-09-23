from datetime import date, datetime

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
    location_id: int = Field(
        description="id расположения: 1001 Академия, 1002 ВГ №6 (Пушкин), 1003 ВГ №61 (Лехтуси)"
    )


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


# --- People ---


class PersonRosterWrite(BaseModel):
    rank: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=256, description="Фамилия и инициалы, напр. Иванов И.И.")
    department_code: str | None = None


class PersonRosterPatch(BaseModel):
    rank: str | None = None
    full_name: str | None = None
    department_code: str | None = None
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
    department_code: str | None = None
    is_active: bool
    full_name: str = ""
    display_name: str = ""


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


class HospitalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sort_order: int = 0


class HospitalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = None
    is_active: bool | None = None


class HospitalRead(ORMModel):
    id: int
    name: str
    sort_order: int
    is_active: bool


class AbsencePersonItem(BaseModel):
    person_id: int
    hospital_id: int | None = None
    note: str | None = None


class AbsenceEntryCreate(BaseModel):
    category_code: AbsenceCategoryCode
    rank: str = ""
    last_name: str = ""
    note: str | None = None
    hospital_id: int | None = None
    person_ids: list[int] = Field(default_factory=list)
    people: list[AbsencePersonItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_identity(self) -> "AbsenceEntryCreate":
        if self.people or self.person_ids:
            return self
        if not self.rank.strip() or not self.last_name.strip():
            raise ValueError("Укажите воинское звание и фамилию или выберите людей из списка")
        return self


class AbsenceEntryPatch(BaseModel):
    hospital_id: int | None = None
    note: str | None = None


class AbsenceEntryRead(BaseModel):
    id: int
    unit_id: int
    person_id: int | None = None
    status_date: date
    category_code: AbsenceCategoryCode
    rank: str
    last_name: str
    note: str | None = None
    hospital_id: int | None = None
    hospital_name: str | None = None
    editable: bool = True


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
    arrest: int = 0

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
            + self.arrest
        )
        if self.present != max(0, self.total_list - total_absent):
            raise ValueError(
                f"Сходимость нарушена: по списку {self.total_list}, "
                f"налицо {self.present} + отсутствующие {total_absent}"
            )
        return self


class PersonAttendanceRow(BaseModel):
    person: PersonRead
    absence_id: int | None = None
    reason_id: int | None = None
    reason_name: str | None = None
    category_code: AbsenceCategoryCode | None = None
    note: str | None = None
    editable: bool = True


class DepartmentStroevkaSummary(BaseModel):
    code: str | None = None
    name: str
    aggregate: AttendanceAggregate
    absences: list[AbsenceEntryRead] = []


class AttendanceSnapshot(BaseModel):
    unit_id: int
    unit_name: str
    report_date: date
    aggregate: AttendanceAggregate
    total_list: int = 0
    absences: list[AbsenceEntryRead] = []
    people: list[PersonAttendanceRow] = []
    departments: list[DepartmentStroevkaSummary] = []
    report_status: ReportStatus | None = None
    report_submitted_at: datetime | None = None
    editable: bool = True
    changes_pending_dpf: bool = False
    changes_pending_dpa: bool = False
    is_editing: bool = False
    dpf_landline: str | None = None
    dpa_landline: str | None = None
    faculty_chief_landline: str | None = None


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
    faculty_report_submitted_at: datetime | None = None
    is_editing: bool = False
    submit_blockers: list[str] = []


class AttendanceUnitOption(BaseModel):
    id: int
    name: str
    type: UnitType
    kind: str


class RosterParseRow(BaseModel):
    row_number: int
    rank: str
    full_name: str
    last_name: str = ""
    first_name: str = ""
    middle_name: str = ""
    department_code: str | None = None
    source: str = ""
    action: str | None = None
    person_id: int | None = None
    warnings: list[str] = []


class RosterParseError(BaseModel):
    row_number: int | None = None
    message: str


class RosterImportPreview(BaseModel):
    rows: list[RosterParseRow] = []
    errors: list[RosterParseError] = []
    to_add: int = 0
    to_update: int = 0
    to_restore: int = 0
    to_deactivate: int = 0
    can_apply: bool = False


class RosterImportResult(BaseModel):
    added: int = 0
    updated: int = 0
    restored: int = 0
    deactivated: int = 0
    total_list: int


class RejectRequest(BaseModel):
    comment: str = Field(min_length=1)


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
    arrest: int = 0
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
    hospital_id: int | None = None
    hospital_name: str | None = None
    status_date: date


class ChessboardSickByLocation(BaseModel):
    location_id: int
    location_name: str
    count: int


class ChessboardSickByHospital(BaseModel):
    hospital_id: int | None = None
    hospital_name: str
    count: int


class ChessboardSickSummary(BaseModel):
    total: int
    by_location: list[ChessboardSickByLocation]
    by_hospital: list[ChessboardSickByHospital] = []
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
    duty: int


class TrendsResponse(BaseModel):
    from_date: date
    to_date: date
    days: list[TrendDayPoint]
    faculties_today: list[FacultyTodayBreakdown]


# --- Chat ---


class ChatAttachmentRead(ORMModel):
    id: int
    original_filename: str
    content_type: str
    size_bytes: int


class ChatPendingUploadRead(BaseModel):
    id: int
    filename: str
    content_type: str
    size_bytes: int


class ChatMessageCreate(BaseModel):
    recipient_kind: str
    recipient_id: int
    body: str = ""
    upload_ids: list[int] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def require_body_or_uploads(self) -> "ChatMessageCreate":
        if not self.body.strip() and not self.upload_ids:
            raise ValueError("Укажите текст или прикрепите файл")
        return self


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
    attachments: list[ChatAttachmentRead] = Field(default_factory=list)


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


class LandlinePhoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone: str = Field(default="", max_length=64)
    sort_order: int = 0
    duty_scope: str | None = Field(default=None, pattern="^(dpa|dpf|faculty_chief)$")
    faculty_id: int | None = None


class LandlinePhoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    sort_order: int | None = None
    is_active: bool | None = None
    duty_scope: str | None = Field(default=None, pattern="^(dpa|dpf|faculty_chief)$")
    faculty_id: int | None = None


class LandlinePhoneRead(ORMModel):
    id: int
    name: str
    phone: str
    sort_order: int
    is_active: bool
    duty_scope: str | None = None
    faculty_id: int | None = None


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
