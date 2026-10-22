"""Сводка и отсутствующие среди адъюнктов (офицеры номерных факультетов с is_adjunct)."""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AbsenceCategoryCode, UnitType
from app.models import Unit
from app.schemas import (
    AbsenceEntryRead,
    AttendanceAggregate,
    ChessboardAdjunctEntry,
    ChessboardAdjunctSummary,
)
from app.services.attendance import (
    aggregate_from_entries,
    empty_aggregate,
    list_absence_entries,
    sum_aggregates,
    _entries_to_reads,
)
from app.services.people import list_people
from app.services.unit_ids import is_named_unit_id

_CATEGORY_LABELS = {
    AbsenceCategoryCode.DUTY.value: "Наряд",
    AbsenceCategoryCode.TRIP.value: "Командировка",
    AbsenceCategoryCode.LEAVE.value: "Отпуск",
    AbsenceCategoryCode.SICK.value: "Болен",
    AbsenceCategoryCode.DISMISSAL.value: "Увольнение",
    AbsenceCategoryCode.AWAY_DORM.value: "Вне общежития",
    AbsenceCategoryCode.OTHER.value: "Прочее",
    AbsenceCategoryCode.ARREST.value: "Арест",
}


def absence_reason_label(entry: AbsenceEntryRead) -> str:
    code = entry.category_code
    code_str = code.value if hasattr(code, "value") else str(code)
    label = _CATEGORY_LABELS.get(code_str, code_str)
    if code_str in ("sick", "sick_med", "sick_hosp"):
        if entry.hospital_name:
            return f"{label} ({entry.hospital_name})"
        return label
    if entry.note:
        return f"{label} ({entry.note})"
    return label


@dataclass(frozen=True)
class AdjunctRollUp:
    aggregate: AttendanceAggregate
    print_absences: list[tuple[str, AbsenceEntryRead]]
    chess_entries: list[ChessboardAdjunctEntry]


async def _faculty_adjunct_chunk(
    session: AsyncSession,
    faculty: Unit,
    report_date: date,
) -> tuple[AttendanceAggregate, list[tuple[str, AbsenceEntryRead]], list[ChessboardAdjunctEntry]]:
    if is_named_unit_id(faculty.id):
        return empty_aggregate(), [], []

    people = await list_people(session, faculty.id, include_inactive=False)
    adjunct_ids = {p.id for p in people if p.is_adjunct}
    total = len(adjunct_ids)
    raw_entries = await list_absence_entries(session, faculty.id, report_date)
    adjunct_entries = [e for e in raw_entries if e.person_id and e.person_id in adjunct_ids]
    agg = aggregate_from_entries(total, adjunct_entries)
    reads = _entries_to_reads(adjunct_entries, editable=False)
    print_absences = [(faculty.name, entry) for entry in reads]
    chess_entries: list[ChessboardAdjunctEntry] = []
    for entry in reads:
        code = entry.category_code
        code_str = code.value if hasattr(code, "value") else str(code)
        chess_entries.append(
            ChessboardAdjunctEntry(
                id=entry.id,
                faculty_id=faculty.id,
                faculty_name=faculty.name,
                rank=entry.rank or "",
                last_name=entry.last_name,
                category_code=code_str,
                reason=absence_reason_label(entry),
                note=entry.note,
                status_date=entry.status_date,
            )
        )
    return agg, print_absences, chess_entries


async def build_adjunct_roll_up(
    session: AsyncSession,
    report_date: date,
    faculties: list[Unit] | None = None,
) -> AdjunctRollUp:
    if faculties is None:
        result = await session.execute(
            select(Unit)
            .where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
            .order_by(Unit.id)
        )
        faculties = list(result.scalars().all())

    aggs: list[AttendanceAggregate] = []
    print_absences: list[tuple[str, AbsenceEntryRead]] = []
    chess_entries: list[ChessboardAdjunctEntry] = []

    for faculty in faculties:
        agg, absences, entries = await _faculty_adjunct_chunk(session, faculty, report_date)
        if agg.total_list == 0 and not entries:
            continue
        aggs.append(agg)
        print_absences.extend(absences)
        chess_entries.extend(entries)

    aggregate = sum_aggregates(aggs) if aggs else empty_aggregate()
    print_absences.sort(key=lambda x: (x[0], x[1].last_name, x[1].id))
    chess_entries.sort(
        key=lambda row: (row.faculty_name, row.last_name, row.id),
    )
    return AdjunctRollUp(
        aggregate=aggregate,
        print_absences=print_absences,
        chess_entries=chess_entries,
    )


async def build_chessboard_adjunct_summary(
    session: AsyncSession,
    report_date: date,
) -> ChessboardAdjunctSummary:
    rollup = await build_adjunct_roll_up(session, report_date)
    return ChessboardAdjunctSummary(
        aggregate=rollup.aggregate,
        entries=rollup.chess_entries,
    )
