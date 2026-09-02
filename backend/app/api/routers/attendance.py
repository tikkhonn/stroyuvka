from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import ABSENCE_CATEGORY_DEFS, AuthKind, DutyPostType, ReportStatus, UnitType
from app.db.session import get_db
from app.dependencies import assert_unit_access, get_current_user
from app.models import AbsenceCategory, AbsenceReason, CourseReport, Unit
from app.schemas import (
    AbsenceCategoryRead,
    AbsenceEntryCreate,
    AbsenceEntryRead,
    AbsenceReasonCreate,
    AbsenceReasonRead,
    AttendanceSnapshot,
    AuthUser,
    StrengthUpdate,
)
from app.services.attendance import (
    add_absence_entry,
    delete_absence_entry,
    ensure_schema_patches,
    get_attendance_snapshot,
    update_strength_and_validate,
)
from app.services.audit import log_action
from app.services.org import get_faculty_for_unit
from app.services.reports import get_faculty_id_for_course
from app.ws.manager import ws_manager

router = APIRouter(tags=["attendance"])


@router.get("/absence-categories")
async def list_absence_categories(user: AuthUser = Depends(get_current_user)):
    return [
        {"code": code, "label": label, "detail_required": req}
        for code, label, req in ABSENCE_CATEGORY_DEFS
    ]


@router.get("/absence-reasons", response_model=list[AbsenceCategoryRead])
async def list_absence_reasons(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    result = await session.execute(
        select(AbsenceCategory)
        .options(selectinload(AbsenceCategory.reasons))
        .order_by(AbsenceCategory.sort_order)
    )
    categories = list(result.scalars().all())
    return [
        AbsenceCategoryRead(
            id=c.id,
            code=c.code,
            label=c.label,
            sort_order=c.sort_order,
            reasons=[
                AbsenceReasonRead(
                    id=r.id, category_id=r.category_id, name=r.name, is_active=r.is_active
                )
                for r in c.reasons
                if r.is_active
            ],
        )
        for c in categories
    ]


@router.post("/absence-reasons", response_model=AbsenceReasonRead)
async def create_absence_reason(
    body: AbsenceReasonCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.shell != "admin":
        raise HTTPException(403, "Только администратор")
    reason = AbsenceReason(**body.model_dump())
    session.add(reason)
    await session.flush()
    return reason


def _editable_for_user(user: AuthUser, unit: Unit, unit_id: int) -> bool:
    if user.shell == "admin":
        return True
    if user.auth_kind != AuthKind.DUTY_POST.value:
        return False
    if user.post_type == DutyPostType.DPA.value:
        return False
    if user.post_type == DutyPostType.DPK.value:
        return user.unit_id == unit_id and unit.type == UnitType.COURSE
    if user.post_type == DutyPostType.DPF.value:
        return user.unit_id == unit_id and unit.type == UnitType.FACULTY
    return False


async def _assert_dpk_course_editing(
    session: AsyncSession,
    user: AuthUser,
    unit: Unit,
    unit_id: int,
    report_date: date,
) -> None:
    if user.post_type != DutyPostType.DPK.value or unit.type != UnitType.COURSE:
        return
    result = await session.execute(
        select(CourseReport).where(
            CourseReport.course_id == unit_id,
            CourseReport.report_date == report_date,
        )
    )
    report = result.scalar_one_or_none()
    if report and report.status in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
        if not report.is_editing:
            raise HTTPException(403, "Нажмите «Редактировать строевку» для внесения правок")


async def _notify_attendance(
    session,
    unit_id: int,
    report_date: date,
    notify_dpf: bool = False,
) -> None:
    faculty_id = await get_faculty_id_for_course(session, unit_id)
    rooms = ["dpa"]
    if faculty_id:
        rooms.append(f"faculty_{faculty_id}")
    event = "ATTENDANCE_CHANGED"
    payload = {"unit_id": unit_id, "report_date": str(report_date)}
    if notify_dpf and faculty_id:
        await ws_manager.broadcast_event(
            [f"faculty_{faculty_id}"],
            "COURSE_CHANGES_PENDING",
            {**payload, "course_id": unit_id, "faculty_id": faculty_id},
        )
    await ws_manager.broadcast_event(rooms, event, payload)


@router.get("/attendance/{unit_id}", response_model=AttendanceSnapshot)
async def get_attendance(
    unit_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await assert_unit_access(session, user, unit_id)
    unit = await session.get(Unit, unit_id)
    if not unit or not unit.is_active:
        raise HTTPException(404, "Подразделение не найдено или неактивно")

    if user.auth_kind == AuthKind.DUTY_POST.value:
        if user.post_type == DutyPostType.DPK.value:
            if user.unit_id != unit_id:
                raise HTTPException(403, "ДПК может вносить расход только своего курса")
            if unit.type != UnitType.COURSE:
                raise HTTPException(400, "ДПК привязан не к курсу")
        elif user.post_type == DutyPostType.DPF.value:
            if unit.type == UnitType.FACULTY and user.unit_id != unit_id:
                raise HTTPException(403, "ДПФ может редактировать только свой факультет")
            if unit.type == UnitType.COURSE:
                faculty = await get_faculty_for_unit(session, unit_id)
                if not faculty or faculty.id != user.unit_id:
                    raise HTTPException(403, "Нет доступа к этому курсу")

    editable = _editable_for_user(user, unit, unit_id)
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPA.value:
        editable = False
    # ДПФ может читать курс (не редактировать), editable=False
    if (
        user.auth_kind == AuthKind.DUTY_POST.value
        and user.post_type == DutyPostType.DPF.value
        and unit.type == UnitType.COURSE
    ):
        editable = False
    if editable and user.post_type == DutyPostType.DPK.value and unit.type == UnitType.COURSE:
        result = await session.execute(
            select(CourseReport).where(
                CourseReport.course_id == unit_id,
                CourseReport.report_date == report_date,
            )
        )
        report = result.scalar_one_or_none()
        if report and report.status in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
            if not report.is_editing:
                editable = False

    try:
        return await get_attendance_snapshot(
            session, unit_id, report_date, editable=editable
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/attendance/{unit_id}/strength", response_model=AttendanceSnapshot)
async def put_strength(
    unit_id: int,
    body: StrengthUpdate,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPA.value:
        raise HTTPException(403, "ДПА не вносит расход")
    await assert_unit_access(session, user, unit_id, write=True)
    unit = await session.get(Unit, unit_id)
    if not unit or not _editable_for_user(user, unit, unit_id):
        raise HTTPException(403, "Нет прав на редактирование")
    await _assert_dpk_course_editing(session, user, unit, unit_id, report_date)
    try:
        snap, notify = await update_strength_and_validate(
            session, unit_id, report_date, body.total_list
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date, notify_dpf=notify)
    await log_action(
        session,
        user.auth_kind,
        user.user_id or user.duty_post_id or 0,
        user.display_name,
        "update_strength",
        "unit",
        unit_id,
        f"total_list={body.total_list}",
    )
    return snap


@router.post("/attendance/{unit_id}/absences", response_model=AbsenceEntryRead)
async def create_absence(
    unit_id: int,
    body: AbsenceEntryCreate,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPA.value:
        raise HTTPException(403, "ДПА не вносит расход")
    await assert_unit_access(session, user, unit_id, write=True)
    unit = await session.get(Unit, unit_id)
    if not unit or not _editable_for_user(user, unit, unit_id):
        raise HTTPException(403, "Нет прав на редактирование")
    await _assert_dpk_course_editing(session, user, unit, unit_id, report_date)
    try:
        entry, notify = await add_absence_entry(session, unit_id, report_date, body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date, notify_dpf=notify)
    return AbsenceEntryRead(
        id=entry.id,
        unit_id=entry.unit_id,
        status_date=entry.status_date,
        category_code=entry.category_code,
        rank=entry.rank or "",
        last_name=entry.last_name,
        note=entry.note,
        editable=True,
    )


@router.delete("/attendance/{unit_id}/absences/{entry_id}")
async def remove_absence(
    unit_id: int,
    entry_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPA.value:
        raise HTTPException(403, "ДПА не вносит расход")
    await assert_unit_access(session, user, unit_id, write=True)
    unit = await session.get(Unit, unit_id)
    if not unit or not _editable_for_user(user, unit, unit_id):
        raise HTTPException(403, "Нет прав на редактирование")
    await _assert_dpk_course_editing(session, user, unit, unit_id, report_date)
    try:
        notify = await delete_absence_entry(session, entry_id, unit_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date, notify_dpf=notify)
    return {"ok": True}
