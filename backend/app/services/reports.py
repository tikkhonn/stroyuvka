from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AbsenceCategoryCode, ReportStatus, UnitType
from app.models import AbsenceEntry, CourseReport, FacultyReport, OfficerReport, Unit
from app.schemas import (
    AttendanceAggregate,
    ChessboardResponse,
    ChessboardRow,
    ChessboardSickByHospital,
    ChessboardSickByLocation,
    ChessboardSickEntry,
    ChessboardSickSummary,
)
from app.services.attendance import (
    assert_unit_sick_have_hospitals,
    compute_academy_aggregate,
    compute_aggregate_for_unit,
    list_absence_entries,
    sick_without_hospital_message,
    sum_aggregates,
    _normalize_code,
)
from app.services.org import (
    get_courses_for_faculty,
    get_courses_for_location,
    get_faculty_for_unit,
)
from app.services.unit_ids import LOCATION_NAMES
from app.services.people import format_rank


async def _get_or_create_officer_report(
    session: AsyncSession, faculty_id: int, report_date: date
) -> OfficerReport:
    result = await session.execute(
        select(OfficerReport).where(
            OfficerReport.faculty_id == faculty_id,
            OfficerReport.report_date == report_date,
        )
    )
    report = result.scalar_one_or_none()
    if report is None:
        report = OfficerReport(faculty_id=faculty_id, report_date=report_date)
        session.add(report)
        await session.flush()
    return report


async def _get_or_create_faculty_report(
    session: AsyncSession, faculty_id: int, report_date: date
) -> FacultyReport:
    result = await session.execute(
        select(FacultyReport).where(
            FacultyReport.faculty_id == faculty_id,
            FacultyReport.report_date == report_date,
        )
    )
    report = result.scalar_one_or_none()
    if report is None:
        report = FacultyReport(faculty_id=faculty_id, report_date=report_date)
        session.add(report)
        await session.flush()
    return report


async def start_course_editing(
    session: AsyncSession, course_id: int, report_date: date
) -> CourseReport:
    result = await session.execute(
        select(CourseReport).where(
            CourseReport.course_id == course_id,
            CourseReport.report_date == report_date,
        )
    )
    report = result.scalar_one_or_none()
    if not report or report.status not in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
        raise ValueError("Сначала отправьте строевую записку")
    report.is_editing = True
    await session.flush()
    return report


async def submit_course_report(
    session: AsyncSession, course_id: int, report_date: date
) -> tuple[CourseReport, bool]:
    from app.services.attendance import get_unit_strength

    total = await get_unit_strength(session, course_id)
    if total < 1:
        raise ValueError("Загрузите список личного состава перед отправкой")

    try:
        aggregate = await compute_aggregate_for_unit(session, course_id, report_date)
        AttendanceAggregate.model_validate(aggregate.model_dump())
    except Exception as e:
        raise ValueError(f"Строевая записка не сходится: {e}") from e

    await assert_unit_sick_have_hospitals(session, course_id, report_date)

    result = await session.execute(
        select(CourseReport).where(
            CourseReport.course_id == course_id,
            CourseReport.report_date == report_date,
        )
    )
    report = result.scalar_one_or_none()
    if report is None:
        report = CourseReport(course_id=course_id, report_date=report_date)
        session.add(report)

    is_resubmit = report.status in (ReportStatus.SUBMITTED, ReportStatus.APPROVED)
    if is_resubmit:
        if not report.is_editing:
            raise ValueError("Нажмите «Редактировать строевую записку» для внесения правок")
        report.is_editing = False
        report.changes_pending_dpf = True

    report.status = ReportStatus.SUBMITTED
    report.submitted_at = datetime.now(UTC)
    report.reject_comment = None
    await session.flush()
    return report, is_resubmit


async def reject_course_report(
    session: AsyncSession, course_id: int, report_date: date, comment: str
) -> CourseReport:
    result = await session.execute(
        select(CourseReport).where(
            CourseReport.course_id == course_id,
            CourseReport.report_date == report_date,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise ValueError("Строевая записка не найдена")
    report.status = ReportStatus.DRAFT
    report.is_editing = False
    report.reject_comment = comment
    await session.flush()
    return report


async def _get_faculty_report(
    session: AsyncSession, faculty_id: int, report_date: date
) -> FacultyReport | None:
    result = await session.execute(
        select(FacultyReport).where(
            FacultyReport.faculty_id == faculty_id,
            FacultyReport.report_date == report_date,
        )
    )
    return result.scalar_one_or_none()


async def faculty_submit_blockers(
    session: AsyncSession, faculty_id: int, report_date: date
) -> list[str]:
    blockers: list[str] = []
    courses = await get_courses_for_faculty(session, faculty_id)
    for course in courses:
        result = await session.execute(
            select(CourseReport).where(
                CourseReport.course_id == course.id,
                CourseReport.report_date == report_date,
            )
        )
        cr = result.scalar_one_or_none()
        if not cr or cr.status not in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
            blockers.append(f"{course.name} не отправил строевую записку")
        hospital_msg = await sick_without_hospital_message(session, course.id, report_date)
        if hospital_msg:
            blockers.append(f"{course.name}: {hospital_msg}")
    hospital_msg = await sick_without_hospital_message(session, faculty_id, report_date)
    if hospital_msg:
        blockers.append(f"Офицеры: {hospital_msg}")
    return blockers


async def start_faculty_editing(
    session: AsyncSession, faculty_id: int, report_date: date
) -> FacultyReport:
    faculty_report = await _get_or_create_faculty_report(session, faculty_id, report_date)
    if faculty_report.status not in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
        raise ValueError("Сначала отправьте строевую записку факультета")
    faculty_report.is_editing = True
    await session.flush()
    return faculty_report


async def submit_faculty_report(
    session: AsyncSession, faculty_id: int, report_date: date
) -> tuple[FacultyReport, bool]:
    """ДПФ отправляет строевку факультета ДПА. Возвращает (report, is_resubmit)."""
    blockers = await faculty_submit_blockers(session, faculty_id, report_date)
    if blockers:
        raise ValueError(blockers[0])

    await assert_unit_sick_have_hospitals(session, faculty_id, report_date)
    courses = await get_courses_for_faculty(session, faculty_id)
    for course in courses:
        await assert_unit_sick_have_hospitals(session, course.id, report_date)

    officer_report = await _get_or_create_officer_report(session, faculty_id, report_date)
    officer_report.status = ReportStatus.SUBMITTED

    faculty_report = await _get_or_create_faculty_report(session, faculty_id, report_date)
    is_resubmit = faculty_report.status in (ReportStatus.SUBMITTED, ReportStatus.APPROVED)
    if is_resubmit:
        if not faculty_report.is_editing:
            raise ValueError("Нажмите «Редактировать строевую записку» для внесения правок")
        faculty_report.is_editing = False
    else:
        if faculty_report.status == ReportStatus.SUBMITTED:
            raise ValueError("Строевая записка факультета уже отправлена")

    faculty_report.status = ReportStatus.APPROVED
    faculty_report.approved_at = datetime.now(UTC)
    faculty_report.reject_comment = None

    for course in courses:
        result = await session.execute(
            select(CourseReport).where(
                CourseReport.course_id == course.id,
                CourseReport.report_date == report_date,
            )
        )
        cr = result.scalar_one()
        cr.status = ReportStatus.APPROVED

    await session.flush()
    return faculty_report, is_resubmit


async def reject_faculty_report(
    session: AsyncSession, faculty_id: int, report_date: date, comment: str
) -> FacultyReport:
    faculty_report = await _get_or_create_faculty_report(session, faculty_id, report_date)
    faculty_report.status = ReportStatus.REJECTED
    faculty_report.reject_comment = comment
    faculty_report.is_editing = False
    await session.flush()
    return faculty_report


def _row_from_agg(
    *,
    faculty_id: int,
    faculty_name: str,
    course_id: int | None,
    course_name: str | None,
    agg: AttendanceAggregate,
    status: ReportStatus,
    is_officers: bool = False,
    location_id: int | None = None,
    location_name: str | None = None,
    row_kind: str = "course",
    changes_pending_dpf: bool = False,
    changes_pending_dpa: bool = False,
) -> ChessboardRow:
    return ChessboardRow(
        faculty_id=faculty_id,
        faculty_name=faculty_name,
        course_id=course_id,
        course_name=course_name,
        is_officers=is_officers,
        location_id=location_id,
        location_name=location_name,
        row_kind=row_kind,
        changes_pending_dpf=changes_pending_dpf,
        changes_pending_dpa=changes_pending_dpa,
        total_list=agg.total_list,
        present=agg.present,
        duty=agg.duty,
        trip=agg.trip,
        leave=agg.leave,
        sick=agg.sick,
        dismissal=agg.dismissal,
        away_dorm=agg.away_dorm,
        other=agg.other,
        arrest=agg.arrest,
        status=status,
    )


async def _course_report(
    session: AsyncSession, course_id: int, report_date: date
) -> CourseReport | None:
    cr_result = await session.execute(
        select(CourseReport).where(
            CourseReport.course_id == course_id,
            CourseReport.report_date == report_date,
        )
    )
    return cr_result.scalar_one_or_none()


async def ack_course_changes_dpf(
    session: AsyncSession, course_id: int, report_date: date, faculty_id: int
) -> CourseReport:
    from app.services.org import get_faculty_for_unit

    fac = await get_faculty_for_unit(session, course_id)
    if not fac or fac.id != faculty_id:
        raise ValueError("Курс не принадлежит вашему факультету")
    report = await _course_report(session, course_id, report_date)
    if not report:
        raise ValueError("Строевая записка не найдена")
    if not report.changes_pending_dpf:
        raise ValueError("Нет ожидающих подтверждения изменений")
    report.changes_pending_dpf = False
    report.changes_pending_dpa = True
    await session.flush()
    return report


async def ack_course_changes_dpa(
    session: AsyncSession, course_id: int, report_date: date
) -> CourseReport:
    report = await _course_report(session, course_id, report_date)
    if not report:
        raise ValueError("Строевая записка не найдена")
    if not report.changes_pending_dpa:
        raise ValueError("Нет ожидающих подтверждения изменений")
    report.changes_pending_dpa = False
    await session.flush()
    return report


async def build_faculty_stroevka_bundle(
    session: AsyncSession, faculty_id: int, report_date: date
):
    from app.schemas import CourseStroevkaSummary, FacultyStroevkaBundle
    from app.services.attendance import get_attendance_snapshot

    faculty = await session.get(Unit, faculty_id)
    if not faculty or faculty.type != UnitType.FACULTY:
        raise ValueError("Факультет не найден")

    officers = await get_attendance_snapshot(
        session, faculty_id, report_date, editable=True
    )
    courses = await get_courses_for_faculty(session, faculty_id)
    course_rows: list[CourseStroevkaSummary] = []
    has_dpf = False
    has_dpa = False
    for course in courses:
        snap = await get_attendance_snapshot(
            session, course.id, report_date, editable=False
        )
        has_dpf = has_dpf or snap.changes_pending_dpf
        has_dpa = has_dpa or snap.changes_pending_dpa
        course_rows.append(
            CourseStroevkaSummary(
                course_id=course.id,
                course_name=course.name,
                report_status=snap.report_status,
                changes_pending_dpf=snap.changes_pending_dpf,
                changes_pending_dpa=snap.changes_pending_dpa,
                aggregate=snap.aggregate,
                absences=snap.absences,
            )
        )
    faculty_report = await _get_faculty_report(session, faculty_id, report_date)
    submit_blockers = await faculty_submit_blockers(session, faculty_id, report_date)
    return FacultyStroevkaBundle(
        faculty_id=faculty.id,
        faculty_name=faculty.name,
        officers=officers,
        courses=course_rows,
        has_pending_for_dpf=has_dpf,
        has_pending_for_dpa=has_dpa,
        faculty_report_status=faculty_report.status if faculty_report else None,
        faculty_report_submitted_at=(
            faculty_report.approved_at if faculty_report else None
        ),
        is_editing=bool(faculty_report.is_editing) if faculty_report else False,
        submit_blockers=submit_blockers,
    )


async def build_all_faculty_stroevka_bundles(session: AsyncSession, report_date: date):
    result = await session.execute(
        select(Unit).where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True)).order_by(Unit.id)
    )
    bundles = []
    for fac in result.scalars().all():
        bundles.append(await build_faculty_stroevka_bundle(session, fac.id, report_date))
    return bundles


async def build_chessboard_faculty(
    session: AsyncSession, report_date: date
) -> list[ChessboardRow]:
    faculties_result = await session.execute(
        select(Unit).where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
    )
    faculties = list(faculties_result.scalars().all())
    locations = {
        u.id: u
        for u in (
            await session.execute(
                select(Unit).where(Unit.type == UnitType.LOCATION, Unit.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    }
    rows: list[ChessboardRow] = []

    for faculty in sorted(faculties, key=lambda f: f.id):
        officer_agg = await compute_aggregate_for_unit(session, faculty.id, report_date)
        fr_result = await session.execute(
            select(FacultyReport).where(
                FacultyReport.faculty_id == faculty.id,
                FacultyReport.report_date == report_date,
            )
        )
        fr = fr_result.scalar_one_or_none()
        or_result = await session.execute(
            select(OfficerReport).where(
                OfficerReport.faculty_id == faculty.id,
                OfficerReport.report_date == report_date,
            )
        )
        officer_report = or_result.scalar_one_or_none()
        officer_status = (
            fr.status
            if fr
            else (officer_report.status if officer_report else ReportStatus.DRAFT)
        )
        rows.append(
            _row_from_agg(
                faculty_id=faculty.id,
                faculty_name=faculty.name,
                course_id=None,
                course_name="Офицеры",
                agg=officer_agg,
                status=officer_status,
                is_officers=True,
                row_kind="officers",
            )
        )

        courses = await get_courses_for_faculty(session, faculty.id)
        for course in courses:
            agg = await compute_aggregate_for_unit(session, course.id, report_date)
            loc = locations.get(course.parent_id) if course.parent_id else None
            cr = await _course_report(session, course.id, report_date)
            rows.append(
                _row_from_agg(
                    faculty_id=faculty.id,
                    faculty_name=faculty.name,
                    course_id=course.id,
                    course_name=course.name,
                    agg=agg,
                    status=cr.status if cr else ReportStatus.DRAFT,
                    location_id=course.parent_id,
                    location_name=loc.name if loc else None,
                    row_kind="course",
                    changes_pending_dpf=bool(cr.changes_pending_dpf) if cr else False,
                    changes_pending_dpa=bool(cr.changes_pending_dpa) if cr else False,
                )
            )

    return rows


async def build_chessboard_location(
    session: AsyncSession, report_date: date
) -> list[ChessboardRow]:
    locs_result = await session.execute(
        select(Unit)
        .where(Unit.type == UnitType.LOCATION, Unit.is_active.is_(True))
        .order_by(Unit.id)
    )
    locations = list(locs_result.scalars().all())
    rows: list[ChessboardRow] = []
    location_parts: list[AttendanceAggregate] = []

    for loc in locations:
        courses = await get_courses_for_location(session, loc.id)
        by_faculty: dict[int, list[Unit]] = {}
        faculty_map: dict[int, Unit] = {}
        for course in courses:
            fac = await get_faculty_for_unit(session, course.id)
            fid = fac.id if fac else 0
            by_faculty.setdefault(fid, []).append(course)
            if fac:
                faculty_map[fid] = fac

        # Офицеры факультета не привязаны к расположению и не входят в его итог,
        # поэтому в этом разрезе выводятся только курсы.
        course_aggs: list[AttendanceAggregate] = []
        for fid in sorted(by_faculty.keys()):
            for course in sorted(by_faculty[fid], key=lambda c: c.id):
                fac = faculty_map.get(fid)
                agg = await compute_aggregate_for_unit(session, course.id, report_date)
                course_aggs.append(agg)
                cr = await _course_report(session, course.id, report_date)
                rows.append(
                    _row_from_agg(
                        faculty_id=fac.id if fac else 0,
                        faculty_name=fac.name if fac else "—",
                        course_id=course.id,
                        course_name=course.name,
                        agg=agg,
                        status=cr.status if cr else ReportStatus.DRAFT,
                        location_id=loc.id,
                        location_name=loc.name,
                        row_kind="course",
                        changes_pending_dpf=bool(cr.changes_pending_dpf) if cr else False,
                        changes_pending_dpa=bool(cr.changes_pending_dpa) if cr else False,
                    )
                )
        loc_total = sum_aggregates(course_aggs)
        location_parts.append(loc_total)
        rows.append(
            _row_from_agg(
                faculty_id=0,
                faculty_name=loc.name,
                course_id=None,
                course_name=f"Итого: {loc.name}",
                agg=loc_total,
                status=ReportStatus.DRAFT,
                location_id=loc.id,
                location_name=loc.name,
                row_kind="location_total",
            )
        )

    academy = await compute_academy_aggregate(session, report_date)
    rows.append(
        _row_from_agg(
            faculty_id=0,
            faculty_name="Вся академия",
            course_id=None,
            course_name="Вся академия (курсы + офицеры)",
            agg=academy,
            status=ReportStatus.DRAFT,
            row_kind="academy_total",
        )
    )
    return rows


def _sick_hospital_name(entry: AbsenceEntry) -> str:
    if entry.hospital:
        return entry.hospital.name
    return "Не указано"


async def build_chessboard_sick_summary(
    session: AsyncSession, report_date: date
) -> ChessboardSickSummary:
    locations = {
        u.id: u.name
        for u in (
            await session.execute(
                select(Unit).where(Unit.type == UnitType.LOCATION, Unit.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    }
    courses = list(
        (
            await session.execute(
                select(Unit).where(Unit.type == UnitType.COURSE, Unit.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    faculties = list(
        (
            await session.execute(
                select(Unit).where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )

    by_loc: dict[int, int] = {loc_id: 0 for loc_id in LOCATION_NAMES}
    officers_count = 0
    entries: list[ChessboardSickEntry] = []

    for course in courses:
        fac = await get_faculty_for_unit(session, course.id)
        loc_id = course.parent_id
        loc_name = locations.get(loc_id) if loc_id else None
        for entry in await list_absence_entries(session, course.id, report_date):
            if _normalize_code(entry.category_code) != AbsenceCategoryCode.SICK:
                continue
            entries.append(
                ChessboardSickEntry(
                    id=entry.id,
                    unit_id=course.id,
                    unit_name=course.name,
                    faculty_id=fac.id if fac else None,
                    faculty_name=fac.name if fac else None,
                    location_id=loc_id,
                    location_name=loc_name,
                    rank=format_rank(entry.rank or ""),
                    last_name=entry.last_name,
                    note=entry.note,
                    hospital_id=entry.hospital_id,
                    hospital_name=_sick_hospital_name(entry),
                    status_date=entry.status_date,
                )
            )
            if loc_id in by_loc:
                by_loc[loc_id] += 1

    for faculty in faculties:
        for entry in await list_absence_entries(session, faculty.id, report_date):
            if _normalize_code(entry.category_code) != AbsenceCategoryCode.SICK:
                continue
            entries.append(
                ChessboardSickEntry(
                    id=entry.id,
                    unit_id=faculty.id,
                    unit_name=f"Офицеры ({faculty.name})",
                    faculty_id=faculty.id,
                    faculty_name=faculty.name,
                    location_id=None,
                    location_name="Офицеры",
                    rank=format_rank(entry.rank or ""),
                    last_name=entry.last_name,
                    note=entry.note,
                    hospital_id=entry.hospital_id,
                    hospital_name=_sick_hospital_name(entry),
                    status_date=entry.status_date,
                )
            )
            officers_count += 1

    entries.sort(
        key=lambda row: (
            row.location_id if row.location_id is not None else 9999,
            row.faculty_name or "",
            row.unit_name,
            row.last_name,
            row.id,
        )
    )

    by_location = [
        ChessboardSickByLocation(
            location_id=loc_id,
            location_name=LOCATION_NAMES.get(loc_id, locations.get(loc_id, str(loc_id))),
            count=by_loc[loc_id],
        )
        for loc_id in sorted(LOCATION_NAMES)
    ]

    hospital_counts: dict[tuple[int | None, str], int] = {}
    for row in entries:
        key = (row.hospital_id, row.hospital_name or "Не указано")
        hospital_counts[key] = hospital_counts.get(key, 0) + 1
    by_hospital = [
        ChessboardSickByHospital(
            hospital_id=hospital_id,
            hospital_name=name,
            count=count,
        )
        for (hospital_id, name), count in sorted(
            hospital_counts.items(),
            key=lambda item: (item[0][0] is None, (item[0][1] or "").lower()),
        )
    ]

    return ChessboardSickSummary(
        total=len(entries),
        by_location=by_location,
        by_hospital=by_hospital,
        officers_count=officers_count,
        entries=entries,
    )


async def build_chessboard(
    session: AsyncSession, report_date: date, view: str = "faculty"
) -> ChessboardResponse:
    if view == "location":
        rows = await build_chessboard_location(session, report_date)
    else:
        rows = await build_chessboard_faculty(session, report_date)
    sick_summary = await build_chessboard_sick_summary(session, report_date)
    return ChessboardResponse(
        report_date=report_date,
        view=view,
        rows=rows,
        sick_summary=sick_summary,
    )


async def get_faculty_id_for_course(session: AsyncSession, course_id: int) -> int | None:
    faculty = await get_faculty_for_unit(session, course_id)
    return faculty.id if faculty else None
