from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UnitType
from app.models import Unit
from app.services.unit_ids import is_named_unit_id, parse_course_id


def _course_belongs_to_faculty(course_unit_id: int, faculty_unit_id: int) -> bool:
    try:
        fn, _cn = parse_course_id(course_unit_id)
    except ValueError:
        return False
    return fn == faculty_unit_id


async def get_unit_descendant_ids(session: AsyncSession, root_id: int) -> set[int]:
    result = await session.execute(select(Unit))
    units = {u.id: u for u in result.scalars().all()}
    if root_id not in units:
        return set()

    descendants: set[int] = {root_id}
    root = units[root_id]

    def collect(pid: int) -> None:
        for uid, unit in units.items():
            if unit.parent_id == pid and uid not in descendants:
                descendants.add(uid)
                collect(uid)

    collect(root_id)

    # Курсы привязаны к расположению, но принадлежат факультету по id
    if root.type == UnitType.FACULTY:
        for uid, unit in units.items():
            if (
                unit.is_active
                and unit.type == UnitType.COURSE
                and _course_belongs_to_faculty(uid, root_id)
            ):
                descendants.add(uid)

    return descendants


async def get_faculty_for_unit(session: AsyncSession, unit_id: int) -> Unit | None:
    unit = await session.get(Unit, unit_id)
    if not unit:
        return None

    if unit.type == UnitType.COURSE:
        try:
            faculty_number, _ = parse_course_id(unit_id)
        except ValueError:
            return None
        fac = await session.get(Unit, faculty_number)
        if fac and fac.is_active and fac.type == UnitType.FACULTY:
            return fac
        return None

    while unit:
        if unit.type == UnitType.FACULTY:
            return unit
        if unit.parent_id is None:
            break
        unit = await session.get(Unit, unit.parent_id)
    return None


async def get_courses_for_faculty(session: AsyncSession, faculty_unit_id: int) -> list[Unit]:
    result = await session.execute(
        select(Unit).where(
            Unit.type == UnitType.COURSE,
            Unit.is_active.is_(True),
        )
    )
    courses = [
        u
        for u in result.scalars().all()
        if _course_belongs_to_faculty(u.id, faculty_unit_id)
    ]
    return sorted(courses, key=lambda c: c.id)


async def get_courses_for_location(session: AsyncSession, location_id: int) -> list[Unit]:
    result = await session.execute(
        select(Unit).where(
            Unit.parent_id == location_id,
            Unit.type == UnitType.COURSE,
            Unit.is_active.is_(True),
        ).order_by(Unit.id)
    )
    return list(result.scalars().all())


def _unit_node(u: Unit, children: list[dict] | None = None) -> dict:
    return {
        "id": u.id,
        "parent_id": u.parent_id,
        "type": u.type,
        "name": u.name,
        "is_active": u.is_active,
        "children": children or [],
    }


def _sort_key(node: dict) -> tuple:
    type_order = {
        UnitType.LOCATION.value: 0,
        UnitType.FACULTY.value: 1,
        UnitType.COURSE.value: 2,
        UnitType.DEPARTMENT.value: 3,
        UnitType.OTHER.value: 4,
    }
    t = node["type"].value if hasattr(node["type"], "value") else str(node["type"])
    return (type_order.get(t, 99), node["id"])


async def build_unit_tree(session: AsyncSession, root_id: int | None = None) -> list[dict]:
    """Совместимость: дерево по parent_id (расположения→курсы, факультеты→кафедры)."""
    result = await session.execute(select(Unit).where(Unit.is_active.is_(True)))
    units = list(result.scalars().all())
    by_parent: dict[int | None, list[Unit]] = {}
    for u in units:
        by_parent.setdefault(u.parent_id, []).append(u)

    def node(u: Unit) -> dict:
        children = [node(c) for c in by_parent.get(u.id, [])]
        children.sort(key=_sort_key)
        return _unit_node(u, children)

    roots = by_parent.get(root_id, []) if root_id else by_parent.get(None, [])
    return sorted([node(r) for r in roots], key=_sort_key)


async def build_location_tree(session: AsyncSession) -> list[dict]:
    """Расположения → курсы в них."""
    result = await session.execute(select(Unit).where(Unit.is_active.is_(True)))
    units = list(result.scalars().all())
    locations = [u for u in units if u.type == UnitType.LOCATION]
    courses = [u for u in units if u.type == UnitType.COURSE]
    by_loc: dict[int, list[Unit]] = {}
    for c in courses:
        if c.parent_id is not None:
            by_loc.setdefault(c.parent_id, []).append(c)

    tree: list[dict] = []
    for loc in sorted(locations, key=lambda x: x.id):
        children = [
            _unit_node(c)
            for c in sorted(by_loc.get(loc.id, []), key=lambda x: x.id)
        ]
        tree.append(_unit_node(loc, children))
    return tree


async def build_faculty_tree(session: AsyncSession) -> list[dict]:
    """Факультеты → курсы (по id) + кафедры."""
    result = await session.execute(select(Unit).where(Unit.is_active.is_(True)))
    units = list(result.scalars().all())
    faculties = [u for u in units if u.type == UnitType.FACULTY]
    departments = [u for u in units if u.type == UnitType.DEPARTMENT]
    courses = [u for u in units if u.type == UnitType.COURSE]
    locations = {u.id: u for u in units if u.type == UnitType.LOCATION}

    tree: list[dict] = []
    for fac in sorted(faculties, key=lambda x: x.id):
        fac_courses = [
            c for c in courses if _course_belongs_to_faculty(c.id, fac.id)
        ]
        fac_depts = [d for d in departments if d.parent_id == fac.id]
        children: list[dict] = []
        for c in sorted(fac_courses, key=lambda x: x.id):
            n = _unit_node(c)
            loc = locations.get(c.parent_id) if c.parent_id else None
            n["location_id"] = c.parent_id
            n["location_name"] = loc.name if loc else None
            children.append(n)
        for d in sorted(fac_depts, key=lambda x: x.id):
            children.append(_unit_node(d))
        node = _unit_node(fac, children)
        if is_named_unit_id(fac.id):
            node["is_named"] = True
            node["composition"] = "permanent"
        tree.append(node)
    return tree
