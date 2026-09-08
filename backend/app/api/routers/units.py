from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UnitType
from app.db.session import get_db
from app.dependencies import get_current_user, require_shell
from app.models import Unit
from app.schemas import AuthUser, CourseBulkCreate, CourseBulkResult, CourseBulkSkippedItem, CourseCreate, CourseMove, FacultyCreate, UnitCreate, UnitRead, UnitUpdate
from app.services.audit import log_action
from app.services.faculty_admin import (
    create_course,
    create_courses_bulk,
    create_faculty,
    delete_course,
    delete_faculty,
    delete_all_courses,
    move_course,
    reset_osh_structure,
)
from app.services.org import build_faculty_tree, build_location_tree, build_unit_tree
from app.services.unit_ids import LOCATION_NAMES, course_id, parse_course_id

router = APIRouter(prefix="/units", tags=["units"])


@router.post("/rebuild-default")
async def rebuild_default(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    """Сброс: расположения 1001–1003, факультеты 1–9, все курсы удалены."""
    result = await reset_osh_structure(session, create_faculties=True)
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "rebuild_default_osh",
    )
    return {
        "ok": True,
        "message": "ОШС сброшена: расположения 1001–1003, факультеты 1–9, курсы удалены",
        **result,
    }


@router.delete("/courses")
async def remove_all_courses(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    """Удалить все курсы (факультеты и расположения не трогаются)."""
    count = await delete_all_courses(session)
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "delete_all_courses",
    )
    return {"ok": True, "deleted_courses": count}


@router.get("/tree")
async def get_tree(
    view: str = Query("location", pattern="^(location|faculty|raw)$"),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if view == "faculty":
        return await build_faculty_tree(session)
    if view == "raw":
        return await build_unit_tree(session)
    return await build_location_tree(session)


@router.get("/locations", response_model=list[UnitRead])
async def list_locations(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    result = await session.execute(
        select(Unit)
        .where(Unit.type == UnitType.LOCATION, Unit.is_active.is_(True))
        .order_by(Unit.id)
    )
    return list(result.scalars().all())


@router.get("/id-scheme")
async def id_scheme(user: AuthUser = Depends(get_current_user)):
    return {
        "locations": LOCATION_NAMES,
        "faculty": "id = номер факультета, без расположения",
        "course": "id = факультет×10 + год (1–5); parent = расположение",
        "department": "id = факультет×10; parent = факультет",
        "examples": [
            {"faculty": 1, "course": 4, "course_id": course_id(1, 4)},
            {"faculty": 6, "course": 3, "course_id": course_id(6, 3)},
        ],
    }


@router.get("", response_model=list[UnitRead])
async def list_units(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    result = await session.execute(select(Unit).where(Unit.is_active.is_(True)).order_by(Unit.id))
    return list(result.scalars().all())


@router.post("/faculties", response_model=UnitRead)
async def add_faculty(
    body: FacultyCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    try:
        faculty = await create_faculty(
            session,
            body.faculty_number,
            name=body.name,
            with_courses=False,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "create_faculty",
        "unit",
        faculty.id,
        faculty.name,
    )
    return faculty


@router.delete("/faculties/{faculty_number}")
async def remove_faculty(
    faculty_number: int,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    try:
        await delete_faculty(session, faculty_number)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "delete_faculty",
        "unit",
        faculty_number,
    )
    return {"ok": True, "faculty_number": faculty_number}


@router.post("/courses", response_model=UnitRead)
async def add_course(
    body: CourseCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    try:
        course = await create_course(
            session,
            body.faculty_number,
            body.course_number,
            body.location_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "create_course",
        "unit",
        course.id,
        course.name,
    )
    return course


@router.post("/courses/bulk", response_model=CourseBulkResult)
async def add_courses_bulk(
    body: CourseBulkCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    try:
        created, skipped = await create_courses_bulk(
            session,
            body.faculty_number,
            body.location_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    created_ids = [c.id for c in created]
    skipped_ids = [sid for sid, _ in skipped]
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "create_courses_bulk",
        "unit",
        body.faculty_number,
        f"created={created_ids}, skipped={skipped_ids}, location_id={body.location_id}",
    )

    return CourseBulkResult(
        created=[UnitRead.model_validate(c) for c in created],
        skipped=[CourseBulkSkippedItem(id=sid, name=name) for sid, name in skipped],
    )


@router.patch("/courses/{course_id}/location", response_model=UnitRead)
async def relocate_course(
    course_id: int,
    body: CourseMove,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    try:
        course = await move_course(session, course_id, body.location_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "move_course",
        "unit",
        course.id,
        f"location_id={body.location_id}",
    )
    return course


@router.delete("/courses/{course_id}")
async def remove_course(
    course_id: int,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    try:
        await delete_course(session, course_id)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "delete_course",
        "unit",
        course_id,
    )
    return {"ok": True, "course_id": course_id}


@router.post("", response_model=UnitRead)
async def create_unit(
    body: UnitCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    unit = Unit(**body.model_dump())
    session.add(unit)
    await session.flush()
    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "create_unit",
        "unit",
        unit.id,
        unit.name,
    )
    return unit


@router.patch("/{unit_id}", response_model=UnitRead)
async def update_unit(
    unit_id: int,
    body: UnitUpdate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    unit = await session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, "Подразделение не найдено")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(unit, k, v)
    await session.flush()
    return unit


@router.delete("/{unit_id}")
async def delete_unit(
    unit_id: int,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    unit = await session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, "Подразделение не найдено")
    if unit.type == UnitType.FACULTY:
        raise HTTPException(
            400, "Факультет удаляйте через DELETE /api/units/faculties/{номер}"
        )
    if unit.type == UnitType.COURSE:
        raise HTTPException(
            400, "Курс удаляйте через DELETE /api/units/courses/{id}"
        )
    unit.is_active = False
    await session.flush()
    return {"ok": True}


@router.get("/courses/{unit_id}/info")
async def course_info(
    unit_id: int,
    user: AuthUser = Depends(get_current_user),
):
    try:
        fac, course = parse_course_id(unit_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {
        "course_id": unit_id,
        "faculty_number": fac,
        "course_number": course,
        "label": f"{fac} факультет, {course} курс",
    }
