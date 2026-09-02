from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DutyPostType, UnitType
from app.models import DutyPost, Unit
from app.services.duty_auth import (
    default_duty_password,
    duty_login_name,
    hash_duty_password,
)
from app.services.org import get_courses_for_faculty
from app.services.unit_ids import (
    COURSES_PER_FACULTY,
    DEFAULT_COURSE_LOCATION_ID,
    MAX_COURSE_YEAR,
    course_display_name,
    course_id,
    department_id,
    faculty_id,
    parse_course_id,
)


async def _get_location(session: AsyncSession, location_id: int) -> Unit:
    loc = await session.get(Unit, location_id)
    if not loc or loc.type != UnitType.LOCATION or not loc.is_active:
        raise ValueError("Расположение не найдено")
    return loc


async def ensure_faculty(
    session: AsyncSession,
    faculty_number: int,
    name: str | None = None,
    create_duty_posts: bool = True,
) -> Unit:
    """Факультет без расположения (parent_id=None). Создаёт кафедру и ДПФ при необходимости."""
    if faculty_number < 1:
        raise ValueError("Номер факультета должен быть >= 1")

    fid = faculty_id(faculty_number)
    fac_name = name or f"{faculty_number}-й факультет"
    existing = await session.get(Unit, fid)

    if existing and existing.is_active and existing.type == UnitType.FACULTY:
        faculty = existing
    elif existing and existing.is_active and existing.type == UnitType.LOCATION:
        raise ValueError(f"id={fid} занят расположением — конфликт схемы ID")
    elif existing:
        existing.parent_id = None
        existing.type = UnitType.FACULTY
        existing.name = fac_name
        existing.is_active = True
        faculty = existing
    else:
        faculty = Unit(
            id=fid,
            parent_id=None,
            type=UnitType.FACULTY,
            name=fac_name,
        )
        session.add(faculty)

    await session.flush()

    did = department_id(faculty_number)
    dept = await session.get(Unit, did)
    dname = f"Кафедра {fac_name}"
    if dept:
        dept.parent_id = fid
        dept.type = UnitType.DEPARTMENT
        dept.name = dname
        dept.is_active = True
    else:
        session.add(
            Unit(
                id=did,
                parent_id=fid,
                type=UnitType.DEPARTMENT,
                name=dname,
            )
        )

    if create_duty_posts:
        dpf = await session.execute(
            select(DutyPost).where(
                DutyPost.unit_id == fid,
                DutyPost.post_type == DutyPostType.DPF,
            )
        )
        dpf_post = dpf.scalar_one_or_none()
        if not dpf_post:
            session.add(
                DutyPost(
                    unit_id=fid,
                    post_type=DutyPostType.DPF,
                    name=f"ДПФ — {fac_name}",
                    login_name=duty_login_name(DutyPostType.DPF, fid),
                    key_hash=hash_duty_password(
                        default_duty_password(DutyPostType.DPF, fid)
                    ),
                    credentials_version=1,
                )
            )
        else:
            dpf_post.is_active = True
            dpf_post.name = f"ДПФ — {fac_name}"
            if not dpf_post.login_name:
                dpf_post.login_name = duty_login_name(DutyPostType.DPF, fid)

    await session.flush()
    return faculty


async def create_faculty(
    session: AsyncSession,
    faculty_number: int,
    name: str | None = None,
    create_duty_posts: bool = True,
    with_courses: bool = False,
    courses_location_id: int | None = None,
) -> Unit:
    """Создать факультет. Курсы — только если with_courses=True (rebuild/seed)."""
    existing = await session.get(Unit, faculty_id(faculty_number))
    if existing and existing.is_active and existing.type == UnitType.FACULTY:
        raise ValueError(f"Факультет №{faculty_number} уже существует (id={existing.id})")

    faculty = await ensure_faculty(
        session, faculty_number, name=name, create_duty_posts=create_duty_posts
    )

    if with_courses:
        loc_id = courses_location_id or DEFAULT_COURSE_LOCATION_ID
        await _get_location(session, loc_id)
        for cn in range(1, COURSES_PER_FACULTY + 1):
            await create_course(
                session,
                faculty_number,
                cn,
                loc_id,
                create_duty_post=create_duty_posts,
                ensure_faculty_exists=False,
            )

    return faculty


async def delete_faculty(session: AsyncSession, faculty_number: int) -> None:
    fid = faculty_id(faculty_number)
    faculty = await session.get(Unit, fid)
    if not faculty or not faculty.is_active:
        raise ValueError(f"Факультет №{faculty_number} не найден")

    ids_to_deactivate = {fid, department_id(faculty_number)}
    for course in await get_courses_for_faculty(session, fid):
        ids_to_deactivate.add(course.id)

    for uid in ids_to_deactivate:
        unit = await session.get(Unit, uid)
        if unit:
            unit.is_active = False

    posts = await session.execute(
        select(DutyPost).where(DutyPost.unit_id.in_(ids_to_deactivate))
    )
    for post in posts.scalars().all():
        post.is_active = False

    await session.flush()


async def create_course(
    session: AsyncSession,
    faculty_number: int,
    course_number: int,
    location_id: int,
    create_duty_post: bool = True,
    ensure_faculty_exists: bool = True,
) -> Unit:
    if faculty_number < 1:
        raise ValueError("Номер факультета должен быть >= 1")

    await _get_location(session, location_id)
    cid = course_id(faculty_number, course_number)

    if ensure_faculty_exists:
        await ensure_faculty(session, faculty_number, create_duty_posts=True)

    cname = course_display_name(faculty_number, course_number)
    course = await session.get(Unit, cid)
    if course and course.is_active and course.type == UnitType.COURSE:
        raise ValueError(f"Курс уже существует (id={cid})")

    if course:
        course.parent_id = location_id
        course.type = UnitType.COURSE
        course.name = cname
        course.is_active = True
    else:
        course = Unit(
            id=cid,
            parent_id=location_id,
            type=UnitType.COURSE,
            name=cname,
        )
        session.add(course)

    await session.flush()

    if create_duty_post:
        dpk = await session.execute(
            select(DutyPost).where(
                DutyPost.unit_id == cid,
                DutyPost.post_type == DutyPostType.DPK,
            )
        )
        dpk_post = dpk.scalar_one_or_none()
        if not dpk_post:
            session.add(
                DutyPost(
                    unit_id=cid,
                    post_type=DutyPostType.DPK,
                    name=f"ДПК — {cname}",
                    login_name=duty_login_name(DutyPostType.DPK, cid),
                    key_hash=hash_duty_password(
                        default_duty_password(DutyPostType.DPK, cid)
                    ),
                    credentials_version=1,
                )
            )
        else:
            dpk_post.is_active = True
            dpk_post.name = f"ДПК — {cname}"
            if not dpk_post.login_name:
                dpk_post.login_name = duty_login_name(DutyPostType.DPK, cid)

    await session.flush()
    return course


async def create_courses_bulk(
    session: AsyncSession,
    faculty_number: int,
    location_id: int,
) -> tuple[list[Unit], list[tuple[int, str]]]:
    """Создать курсы 1–5 для факультета; существующие активные курсы пропускаются."""
    if faculty_number < 1:
        raise ValueError("Номер факультета должен быть >= 1")

    await _get_location(session, location_id)
    await ensure_faculty(session, faculty_number, create_duty_posts=True)

    created: list[Unit] = []
    skipped: list[tuple[int, str]] = []

    for course_number in range(1, MAX_COURSE_YEAR + 1):
        cid = course_id(faculty_number, course_number)
        existing = await session.get(Unit, cid)
        if existing and existing.is_active and existing.type == UnitType.COURSE:
            skipped.append((cid, existing.name))
            continue

        course = await create_course(
            session,
            faculty_number,
            course_number,
            location_id,
            ensure_faculty_exists=False,
        )
        created.append(course)

    return created, skipped


async def move_course(
    session: AsyncSession, course_unit_id: int, location_id: int
) -> Unit:
    await _get_location(session, location_id)
    course = await session.get(Unit, course_unit_id)
    if not course or not course.is_active or course.type != UnitType.COURSE:
        raise ValueError(f"Курс id={course_unit_id} не найден")
    try:
        parse_course_id(course_unit_id)
    except ValueError as e:
        raise ValueError(f"Некорректный id курса: {course_unit_id}") from e

    course.parent_id = location_id
    await session.flush()
    return course


async def delete_course(session: AsyncSession, course_unit_id: int) -> None:
    course = await session.get(Unit, course_unit_id)
    if not course or not course.is_active or course.type != UnitType.COURSE:
        raise ValueError(f"Курс id={course_unit_id} не найден")

    course.is_active = False
    posts = await session.execute(
        select(DutyPost).where(DutyPost.unit_id == course_unit_id)
    )
    for post in posts.scalars().all():
        post.is_active = False
    await session.flush()


async def delete_all_courses(session: AsyncSession) -> int:
    """Деактивировать все курсы и их посты ДПК."""
    result = await session.execute(
        select(Unit).where(Unit.type == UnitType.COURSE, Unit.is_active.is_(True))
    )
    courses = list(result.scalars().all())
    course_ids = [c.id for c in courses]
    for course in courses:
        course.is_active = False
    if course_ids:
        posts = await session.execute(
            select(DutyPost).where(DutyPost.unit_id.in_(course_ids))
        )
        for post in posts.scalars().all():
            post.is_active = False
    await session.flush()
    return len(courses)


async def reset_osh_structure(
    session: AsyncSession,
    *,
    create_faculties: bool = True,
    faculty_range: range | None = None,
) -> dict:
    """Расположения 1001–1003, факультеты 1–9 без курсов. Удаляет все курсы."""
    from app.services.unit_ids import LOCATION_NAMES, sync_units_id_sequence

    deleted_courses = await delete_all_courses(session)

    # Деактивировать все факультеты, кафедры и старые расположения
    org_types = (
        select(Unit).where(
            Unit.type.in_(
                [UnitType.FACULTY, UnitType.DEPARTMENT, UnitType.COURSE, UnitType.LOCATION]
            ),
            Unit.is_active.is_(True),
        )
    )
    for unit in (await session.execute(org_types)).scalars().all():
        unit.is_active = False

    await session.flush()

    for loc_id, name in LOCATION_NAMES.items():
        loc = await session.get(Unit, loc_id)
        if loc:
            loc.parent_id = None
            loc.type = UnitType.LOCATION
            loc.name = name
            loc.is_active = True
        else:
            session.add(
                Unit(id=loc_id, parent_id=None, type=UnitType.LOCATION, name=name)
            )
    await session.flush()

    fac_range = faculty_range if faculty_range is not None else range(1, 10)
    if create_faculties:
        for n in fac_range:
            existing = await session.get(Unit, n)
            if existing:
                existing.parent_id = None
                existing.type = UnitType.FACULTY
                existing.name = f"{n}-й факультет"
                existing.is_active = True
            else:
                session.add(
                    Unit(
                        id=n,
                        parent_id=None,
                        type=UnitType.FACULTY,
                        name=f"{n}-й факультет",
                    )
                )
            did = department_id(n)
            dept = await session.get(Unit, did)
            dname = f"Кафедра {n}-й факультет"
            if dept:
                dept.parent_id = n
                dept.type = UnitType.DEPARTMENT
                dept.name = dname
                dept.is_active = True
            else:
                session.add(
                    Unit(
                        id=did,
                        parent_id=n,
                        type=UnitType.DEPARTMENT,
                        name=dname,
                    )
                )
            dpf = await session.execute(
                select(DutyPost).where(
                    DutyPost.unit_id == n,
                    DutyPost.post_type == DutyPostType.DPF,
                )
            )
            dpf_post = dpf.scalar_one_or_none()
            if not dpf_post:
                session.add(
                    DutyPost(
                        unit_id=n,
                        post_type=DutyPostType.DPF,
                        name=f"ДПФ — {n}-й факультет",
                        login_name=duty_login_name(DutyPostType.DPF, n),
                        key_hash=hash_duty_password(
                            default_duty_password(DutyPostType.DPF, n)
                        ),
                        credentials_version=1,
                    )
                )
            else:
                dpf_post.is_active = True
                dpf_post.name = f"ДПФ — {n}-й факультет"
                if not dpf_post.login_name:
                    dpf_post.login_name = duty_login_name(DutyPostType.DPF, n)

    await session.flush()

    # ДПА — в расположении Академия
    dpa = await session.execute(
        select(DutyPost).where(DutyPost.post_type == DutyPostType.DPA)
    )
    for post in dpa.scalars().all():
        post.unit_id = DEFAULT_COURSE_LOCATION_ID
        post.is_active = True

    await sync_units_id_sequence(session)
    return {"deleted_courses": deleted_courses, "locations": list(LOCATION_NAMES.keys())}


async def rebuild_default_osh(session: AsyncSession) -> None:
    """Сброс ОШС: расположения 1001–1003, факультеты 1–9, без курсов."""
    await reset_osh_structure(session, create_faculties=True)
