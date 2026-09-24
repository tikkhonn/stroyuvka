"""Именованные подразделения постоянного состава (офицеры)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UnitType
from app.models import Unit
from app.services.unit_ids import is_named_unit_id, parse_course_id

MAX_OFFICER_GROUPS_PER_FACULTY = 99


def is_named_officer_org(unit: Unit | None) -> bool:
    if not unit or not unit.is_active:
        return False
    return unit.type == UnitType.FACULTY and is_named_unit_id(unit.id)


def officer_group_id(faculty_unit_id: int, group_index: int) -> int:
    return faculty_unit_id * 10 + group_index


def faculty_id_for_officer_group(group_unit_id: int) -> int | None:
    try:
        faculty_number, _course = parse_course_id(group_unit_id)
    except ValueError:
        return None
    if not is_named_unit_id(faculty_number):
        return None
    return faculty_number


async def allocate_officer_group_id(
    session: AsyncSession, faculty_unit_id: int
) -> int:
    for index in range(1, MAX_OFFICER_GROUPS_PER_FACULTY + 1):
        gid = officer_group_id(faculty_unit_id, index)
        existing = await session.get(Unit, gid)
        if existing is None or not existing.is_active:
            return gid
    raise ValueError(
        f"Достигнут лимит групп ({MAX_OFFICER_GROUPS_PER_FACULTY}) "
        f"для подразделения id={faculty_unit_id}"
    )


async def assert_officer_group(session: AsyncSession, group_unit_id: int) -> Unit:
    unit = await session.get(Unit, group_unit_id)
    if not unit or not unit.is_active or unit.type != UnitType.COURSE:
        raise ValueError("Группа не найдена")
    faculty_id = faculty_id_for_officer_group(group_unit_id)
    if faculty_id is None:
        raise ValueError("Подразделение не является группой офицеров")
    parent = await session.get(Unit, faculty_id)
    if not is_named_officer_org(parent):
        raise ValueError("Подразделение не является группой офицеров")
    return unit
