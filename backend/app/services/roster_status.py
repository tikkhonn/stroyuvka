"""Готовность списков подразделений для админки. Только чтение."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UnitType
from app.models import Person, Unit
from app.schemas import RosterStatusFaculty, RosterStatusUnit
from app.services.unit_ids import is_named_unit_id, parse_course_id
from app.services.unit_labels import OFFICERS_SHORT_LABEL


async def _people_counts(session: AsyncSession) -> dict[int, int]:
    result = await session.execute(
        select(Person.unit_id, func.count())
        .where(Person.is_active.is_(True))
        .group_by(Person.unit_id)
    )
    return {int(unit_id): int(n) for unit_id, n in result.all()}


def _courses_by_faculty(courses: list[Unit]) -> dict[int, list[Unit]]:
    grouped: dict[int, list[Unit]] = {}
    for course in courses:
        try:
            faculty_id, _ = parse_course_id(course.id)
        except ValueError:
            continue
        grouped.setdefault(faculty_id, []).append(course)
    for items in grouped.values():
        items.sort(key=lambda c: c.id)
    return grouped


def _status_unit(unit_id: int, name: str, kind: str, people_count: int) -> RosterStatusUnit:
    return RosterStatusUnit(
        unit_id=unit_id,
        name=name,
        kind=kind,
        people_count=people_count,
        loaded=people_count > 0,
    )


async def list_roster_status(session: AsyncSession) -> list[RosterStatusFaculty]:
    fac_result = await session.execute(
        select(Unit)
        .where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
        .order_by(Unit.id)
    )
    faculties = list(fac_result.scalars().all())

    course_result = await session.execute(
        select(Unit).where(Unit.type == UnitType.COURSE, Unit.is_active.is_(True))
    )
    courses_by_faculty = _courses_by_faculty(list(course_result.scalars().all()))
    counts = await _people_counts(session)

    rows: list[RosterStatusFaculty] = []
    for faculty in faculties:
        units = [
            _status_unit(
                faculty.id,
                OFFICERS_SHORT_LABEL,
                "officers",
                counts.get(faculty.id, 0),
            )
        ]
        for course in courses_by_faculty.get(faculty.id, []):
            units.append(
                _status_unit(course.id, course.name, "course", counts.get(course.id, 0))
            )
        loaded_count = sum(1 for unit in units if unit.loaded)
        total_count = len(units)
        loaded_percent = round(loaded_count / total_count * 100) if total_count else 0
        rows.append(
            RosterStatusFaculty(
                faculty_id=faculty.id,
                name=faculty.name,
                is_named=is_named_unit_id(faculty.id),
                loaded_count=loaded_count,
                total_count=total_count,
                loaded_percent=loaded_percent,
                units=units,
            )
        )
    return rows
