from datetime import date

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    ABSENCE_CATEGORY_DEFS,
    DETAIL_REQUIRED_CODES,
    AbsenceCategoryCode,
    ReportStatus,
    UnitType,
)
from app.models import AbsenceEntry, CourseReport, FacultyReport, Person, Unit
from app.schemas import (
    AbsenceEntryCreate,
    AbsenceEntryRead,
    AttendanceAggregate,
    AttendanceSnapshot,
    DepartmentStroevkaSummary,
    PersonAttendanceRow,
)
from app.services.people import (
    count_active_people,
    department_display_name,
    display_last_name,
    format_rank,
    list_people,
    person_to_read,
)

ABSENT_CODES = tuple(
    AbsenceCategoryCode(code) for code, _label, _req in ABSENCE_CATEGORY_DEFS
)

# Категории с датой начала отсутствия: действуют до явного удаления.
PERSISTENT_ABSENCE_CODES = frozenset(
    {
        AbsenceCategoryCode.SICK,
        AbsenceCategoryCode.TRIP,
        AbsenceCategoryCode.LEAVE,
        AbsenceCategoryCode.SICK_MED,
        AbsenceCategoryCode.SICK_HOSP,
    }
)


def empty_aggregate() -> AttendanceAggregate:
    return AttendanceAggregate(
        total_list=0,
        present=0,
        duty=0,
        trip=0,
        leave=0,
        sick=0,
        dismissal=0,
        away_dorm=0,
        other=0,
    )


def sum_aggregates(parts: list[AttendanceAggregate]) -> AttendanceAggregate:
    if not parts:
        return empty_aggregate()
    total_list = sum(p.total_list for p in parts)
    duty = sum(p.duty for p in parts)
    trip = sum(p.trip for p in parts)
    leave = sum(p.leave for p in parts)
    sick = sum(p.sick for p in parts)
    dismissal = sum(p.dismissal for p in parts)
    away_dorm = sum(p.away_dorm for p in parts)
    other = sum(p.other for p in parts)
    total_absent = duty + trip + leave + sick + dismissal + away_dorm + other
    return AttendanceAggregate(
        total_list=total_list,
        present=max(0, total_list - total_absent),
        duty=duty,
        trip=trip,
        leave=leave,
        sick=sick,
        dismissal=dismissal,
        away_dorm=away_dorm,
        other=other,
    )


def _normalize_code(raw) -> AbsenceCategoryCode:
    if isinstance(raw, AbsenceCategoryCode):
        code = raw
    else:
        code = AbsenceCategoryCode(getattr(raw, "value", raw))
    # legacy → new
    if code == AbsenceCategoryCode.SICK_MED or code == AbsenceCategoryCode.SICK_HOSP:
        return AbsenceCategoryCode.SICK
    if code == AbsenceCategoryCode.AWOL_OTHER:
        return AbsenceCategoryCode.OTHER
    return code


def aggregate_from_entries(
    total_list: int, entries: list[AbsenceEntry]
) -> AttendanceAggregate:
    counts = {code: 0 for code in ABSENT_CODES}
    for e in entries:
        code = _normalize_code(e.category_code)
        if code in counts:
            counts[code] += 1
        elif code == AbsenceCategoryCode.OTHER:
            counts[AbsenceCategoryCode.OTHER] += 1

    absent = sum(counts.values())
    return AttendanceAggregate(
        total_list=total_list,
        present=max(0, total_list - absent),
        duty=counts[AbsenceCategoryCode.DUTY],
        trip=counts[AbsenceCategoryCode.TRIP],
        leave=counts[AbsenceCategoryCode.LEAVE],
        sick=counts[AbsenceCategoryCode.SICK],
        dismissal=counts[AbsenceCategoryCode.DISMISSAL],
        away_dorm=counts[AbsenceCategoryCode.AWAY_DORM],
        other=counts[AbsenceCategoryCode.OTHER],
    )


async def ensure_schema_patches(session: AsyncSession) -> None:
    """Добавить новые колонки на уже существующей БД (create_all их не добавляет)."""
    await session.execute(
        text(
            "ALTER TABLE course_reports "
            "ADD COLUMN IF NOT EXISTS changes_pending_dpf BOOLEAN DEFAULT FALSE"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE course_reports "
            "ADD COLUMN IF NOT EXISTS changes_pending_dpa BOOLEAN DEFAULT FALSE"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE course_reports "
            "ADD COLUMN IF NOT EXISTS is_editing BOOLEAN DEFAULT FALSE"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE faculty_reports "
            "ADD COLUMN IF NOT EXISTS is_editing BOOLEAN DEFAULT FALSE"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE absence_entries "
            "ADD COLUMN IF NOT EXISTS rank VARCHAR(64) DEFAULT ''"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE absence_entries "
            "ADD COLUMN IF NOT EXISTS person_id INTEGER REFERENCES people(id)"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE people "
            "ADD COLUMN IF NOT EXISTS department_code VARCHAR(32)"
        )
    )
    await session.flush()


async def get_unit_strength(session: AsyncSession, unit_id: int) -> int:
    return await count_active_people(session, unit_id)


async def list_absence_entries(
    session: AsyncSession, unit_id: int, report_date: date
) -> list[AbsenceEntry]:
    """Строки расхода на дату: дневные — только за report_date, длительные — с даты начала."""
    result = await session.execute(
        select(AbsenceEntry)
        .where(AbsenceEntry.unit_id == unit_id)
        .order_by(AbsenceEntry.status_date, AbsenceEntry.id)
    )
    rows = list(result.scalars().all())
    visible: list[AbsenceEntry] = []
    for entry in rows:
        code = _normalize_code(entry.category_code)
        if code in PERSISTENT_ABSENCE_CODES:
            if entry.status_date <= report_date:
                visible.append(entry)
        elif entry.status_date == report_date:
            visible.append(entry)
    return visible


def _entry_visible_on_date(entry: AbsenceEntry, report_date: date) -> bool:
    code = _normalize_code(entry.category_code)
    if code in PERSISTENT_ABSENCE_CODES:
        return entry.status_date <= report_date
    return entry.status_date == report_date


async def _get_or_create_course_report(
    session: AsyncSession, course_id: int, report_date: date
) -> CourseReport:
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
        await session.flush()
    return report


async def mark_course_changed_if_submitted(
    session: AsyncSession, unit: Unit, report_date: date
) -> bool:
    """Если строевка уже отправлена — флаг для ДПФ. Возвращает True если уведомить ДПФ."""
    if unit.type != UnitType.COURSE:
        return False
    report = await _get_or_create_course_report(session, unit.id, report_date)
    if report.is_editing:
        return False
    if report.status in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
        report.changes_pending_dpf = True
        await session.flush()
        return True
    return False


async def add_absence_entry(
    session: AsyncSession,
    unit_id: int,
    report_date: date,
    body: AbsenceEntryCreate,
) -> tuple[list[AbsenceEntry], bool]:
    unit = await session.get(Unit, unit_id)
    if not unit or not unit.is_active:
        raise ValueError("Подразделение не найдено")

    code = body.category_code
    if isinstance(code, str):
        code = AbsenceCategoryCode(code)
    if code not in ABSENT_CODES:
        raise ValueError("Некорректная категория отсутствия")

    detail = (body.note or "").strip()
    if code.value in DETAIL_REQUIRED_CODES and not detail:
        label = next(l for c, l, _ in ABSENCE_CATEGORY_DEFS if c == code.value)
        raise ValueError(f"Для категории «{label}» укажите уточнение")

    entries = await list_absence_entries(session, unit_id, report_date)
    total = await get_unit_strength(session, unit_id)

    if body.person_ids:
        created = await _add_absences_for_people(
            session, unit, report_date, code, detail or None, body.person_ids, entries, total
        )
        notify = await mark_course_changed_if_submitted(session, unit, report_date)
        return created, notify

    last_name = body.last_name.strip()
    rank = format_rank(body.rank)
    if not last_name:
        raise ValueError("Укажите фамилию")
    if not rank:
        raise ValueError("Укажите звание")

    if len(entries) + 1 > total:
        raise ValueError(
            f"Нельзя добавить: отсутствующих станет {len(entries) + 1}, по списку {total}"
        )

    if code in PERSISTENT_ABSENCE_CODES:
        key = (last_name.lower(), rank.lower(), code)
        for e in entries:
            if (
                e.last_name.strip().lower(),
                (e.rank or "").strip().lower(),
                _normalize_code(e.category_code),
            ) == key:
                raise ValueError("Этот человек уже отмечен в данной категории")

    entry = AbsenceEntry(
        unit_id=unit_id,
        status_date=report_date,
        category_code=code,
        rank=rank,
        last_name=last_name,
        note=detail or None,
    )
    session.add(entry)
    await session.flush()
    notify = await mark_course_changed_if_submitted(session, unit, report_date)
    return [entry], notify


async def _add_absences_for_people(
    session: AsyncSession,
    unit: Unit,
    report_date: date,
    code: AbsenceCategoryCode,
    note: str | None,
    person_ids: list[int],
    entries: list[AbsenceEntry],
    total: int,
) -> list[AbsenceEntry]:
    unique_ids = list(dict.fromkeys(person_ids))
    if not unique_ids:
        raise ValueError("Выберите людей из списка")
    taken = {e.person_id for e in entries if e.person_id}
    if len(entries) + len(unique_ids) > total:
        raise ValueError(
            f"Нельзя добавить: отсутствующих станет {len(entries) + len(unique_ids)}, по списку {total}"
        )
    created: list[AbsenceEntry] = []
    for person_id in unique_ids:
        if person_id in taken:
            raise ValueError("Один из выбранных уже отмечен отсутствующим")
        person = await session.get(Person, person_id)
        if not person or person.unit_id != unit.id or not person.is_active:
            raise ValueError("Человек не найден в списке подразделения")
        entry = AbsenceEntry(
            unit_id=unit.id,
            person_id=person.id,
            status_date=report_date,
            category_code=code,
            rank=format_rank(person.rank),
            last_name=display_last_name(person),
            note=note,
        )
        session.add(entry)
        created.append(entry)
        taken.add(person.id)
    await session.flush()
    return created


async def delete_absence_entry(
    session: AsyncSession, entry_id: int, unit_id: int, report_date: date
) -> bool:
    entry = await session.get(AbsenceEntry, entry_id)
    if not entry or entry.unit_id != unit_id:
        raise ValueError("Запись не найдена")
    if not _entry_visible_on_date(entry, report_date):
        raise ValueError("Запись не найдена")
    unit = await session.get(Unit, unit_id)
    await session.delete(entry)
    await session.flush()
    if unit:
        return await mark_course_changed_if_submitted(session, unit, report_date)
    return False


async def compute_aggregate_for_unit(
    session: AsyncSession,
    unit_id: int,
    report_date: date,
) -> AttendanceAggregate:
    total = await get_unit_strength(session, unit_id)
    entries = await list_absence_entries(session, unit_id, report_date)
    return aggregate_from_entries(total, entries)


async def compute_location_aggregate(
    session: AsyncSession, location_id: int, report_date: date
) -> AttendanceAggregate:
    from app.services.org import get_courses_for_location

    courses = await get_courses_for_location(session, location_id)
    return sum_aggregates(
        [await compute_aggregate_for_unit(session, c.id, report_date) for c in courses]
    )


async def compute_faculty_aggregate(
    session: AsyncSession, faculty_unit_id: int, report_date: date
) -> AttendanceAggregate:
    from app.services.org import get_courses_for_faculty

    courses = await get_courses_for_faculty(session, faculty_unit_id)
    parts = [
        await compute_aggregate_for_unit(session, c.id, report_date) for c in courses
    ]
    parts.append(await compute_aggregate_for_unit(session, faculty_unit_id, report_date))
    return sum_aggregates(parts)


async def compute_academy_aggregate(
    session: AsyncSession, report_date: date
) -> AttendanceAggregate:
    courses_result = await session.execute(
        select(Unit).where(Unit.type == UnitType.COURSE, Unit.is_active.is_(True))
    )
    parts = [
        await compute_aggregate_for_unit(session, c.id, report_date)
        for c in courses_result.scalars().all()
    ]
    fac_result = await session.execute(
        select(Unit).where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
    )
    for fac in fac_result.scalars().all():
        parts.append(await compute_aggregate_for_unit(session, fac.id, report_date))
    return sum_aggregates(parts)


def _department_sort_key(code: str | None) -> tuple[int, int, str]:
    if code is None:
        return (1, 0, "")
    try:
        return (0, int(code), code)
    except ValueError:
        return (0, 999_999, code)


def _entries_to_reads(entries: list[AbsenceEntry], editable: bool) -> list[AbsenceEntryRead]:
    return [
        AbsenceEntryRead(
            id=e.id,
            unit_id=e.unit_id,
            person_id=e.person_id,
            status_date=e.status_date,
            category_code=_normalize_code(e.category_code),
            rank=format_rank(e.rank or ""),
            last_name=e.last_name,
            note=e.note,
            editable=editable,
        )
        for e in entries
    ]


async def compute_department_breakdown(
    session: AsyncSession,
    unit_id: int,
    entries: list[AbsenceEntry],
    editable: bool,
) -> list[DepartmentStroevkaSummary]:
    people = await list_people(session, unit_id, include_inactive=False)
    person_dept = {p.id: p.department_code for p in people}

    dept_counts: dict[str | None, int] = {}
    for person in people:
        code = person.department_code
        dept_counts[code] = dept_counts.get(code, 0) + 1

    dept_entries: dict[str | None, list[AbsenceEntry]] = {}
    for entry in entries:
        if entry.person_id and entry.person_id in person_dept:
            code = person_dept[entry.person_id]
        else:
            code = None
        dept_entries.setdefault(code, []).append(entry)

    all_codes = set(dept_counts) | set(dept_entries)
    summaries: list[DepartmentStroevkaSummary] = []
    for code in sorted(all_codes, key=_department_sort_key):
        total = dept_counts.get(code, 0)
        group_entries = dept_entries.get(code, [])
        summaries.append(
            DepartmentStroevkaSummary(
                code=code,
                name=department_display_name(code),
                aggregate=aggregate_from_entries(total, group_entries),
                absences=_entries_to_reads(group_entries, editable),
            )
        )
    return summaries


async def get_attendance_snapshot(
    session: AsyncSession,
    unit_id: int,
    report_date: date,
    editable: bool = True,
) -> AttendanceSnapshot:
    unit = await session.get(Unit, unit_id)
    if not unit:
        raise ValueError("Подразделение не найдено")

    total = await get_unit_strength(session, unit_id)
    entries = await list_absence_entries(session, unit_id, report_date)
    aggregate = aggregate_from_entries(total, entries)

    report_status = None
    changes_pending_dpf = False
    changes_pending_dpa = False
    is_editing = False
    if unit.type == UnitType.COURSE:
        report = await _get_or_create_course_report(session, unit_id, report_date)
        report_status = report.status
        changes_pending_dpf = bool(report.changes_pending_dpf)
        changes_pending_dpa = bool(report.changes_pending_dpa)
        is_editing = bool(report.is_editing)
    elif unit.type == UnitType.FACULTY:
        fac_report = await _get_faculty_report(session, unit_id, report_date)
        if fac_report:
            report_status = fac_report.status
            is_editing = bool(fac_report.is_editing)

    by_person = {e.person_id: e for e in entries if e.person_id}
    people_rows: list[PersonAttendanceRow] = []
    for person in await list_people(session, unit_id, include_inactive=False):
        linked = by_person.get(person.id)
        people_rows.append(
            PersonAttendanceRow(
                person=person_to_read(person),
                absence_id=linked.id if linked else None,
                category_code=_normalize_code(linked.category_code) if linked else None,
                note=linked.note if linked else None,
                editable=editable,
            )
        )

    entry_reads = _entries_to_reads(entries, editable)

    departments: list[DepartmentStroevkaSummary] = []
    if unit.type == UnitType.FACULTY:
        departments = await compute_department_breakdown(
            session, unit_id, entries, editable
        )

    return AttendanceSnapshot(
        unit_id=unit_id,
        unit_name=unit.name,
        report_date=report_date,
        aggregate=aggregate,
        total_list=total,
        absences=entry_reads,
        people=people_rows,
        departments=departments,
        report_status=report_status,
        editable=editable,
        changes_pending_dpf=changes_pending_dpf,
        changes_pending_dpa=changes_pending_dpa,
        is_editing=is_editing,
    )


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
