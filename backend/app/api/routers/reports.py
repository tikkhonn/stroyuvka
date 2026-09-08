from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DutyPostType
from app.db.session import get_db
from app.dependencies import get_current_user, require_duty_post, require_shell
from app.schemas import AuthUser, ChessboardResponse, FacultyStroevkaBundle, OverviewResponse, RejectRequest, TrendsResponse
from app.services.audit import log_action
from app.services.attendance import ensure_schema_patches
from app.services.chief_reports import build_overview, build_trends
from app.services.chat_notify import (
    notify_dpf_stroevka_submitted,
    notify_dpf_stroevka_updated,
    notify_dpk_stroevka_submitted,
    notify_dpk_stroevka_updated,
)
from app.services.org import get_faculty_for_unit
from app.services.reports import (
    ack_course_changes_dpa,
    ack_course_changes_dpf,
    build_all_faculty_stroevka_bundles,
    build_chessboard,
    build_faculty_stroevka_bundle,
    reject_course_report,
    reject_faculty_report,
    start_course_editing,
    start_faculty_editing,
    submit_course_report,
    submit_faculty_report,
)
from app.ws.manager import ws_manager

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/courses/{course_id}/submit")
async def submit_course(
    course_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPK)),
):
    if user.unit_id != course_id:
        raise HTTPException(403, "Можно отправлять только свой курс")
    try:
        report, is_resubmit = await submit_course_report(session, course_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    faculty = await get_faculty_for_unit(session, course_id)
    rooms = ["dpa"]
    if faculty:
        rooms.append(f"faculty_{faculty.id}")
        if is_resubmit:
            await notify_dpk_stroevka_updated(session, user, course_id, faculty.id)
        else:
            await notify_dpk_stroevka_submitted(session, user, course_id, faculty.id)
    await ws_manager.broadcast_event(
        rooms, "REPORT_SUBMITTED", {"course_id": course_id, "report_date": str(report_date)}
    )
    await log_action(
        session, user.auth_kind, user.duty_post_id or 0, user.display_name,
        "submit_course_report", "course", course_id,
    )
    return {"status": report.status, "course_id": course_id, "is_resubmit": is_resubmit}


@router.post("/courses/{course_id}/start-editing")
async def start_editing_course(
    course_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPK, DutyPostType.DPF)),
):
    if user.post_type == DutyPostType.DPK.value and user.unit_id != course_id:
        raise HTTPException(403, "Можно редактировать только свой курс")
    if user.post_type == DutyPostType.DPF.value:
        faculty = await get_faculty_for_unit(session, course_id)
        if not faculty or faculty.id != user.unit_id:
            raise HTTPException(403, "Можно редактировать только курсы своего факультета")
    try:
        report = await start_course_editing(session, course_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    faculty = await get_faculty_for_unit(session, course_id)
    if faculty:
        await ws_manager.broadcast_event(
            [f"faculty_{faculty.id}"],
            "REPORT_EDITING_STARTED",
            {"course_id": course_id, "report_date": str(report_date)},
        )
    return {"status": report.status, "is_editing": report.is_editing}


@router.post("/courses/{course_id}/reject")
async def reject_course(
    course_id: int,
    body: RejectRequest,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.post_type not in (DutyPostType.DPF.value, DutyPostType.DPA.value):
        raise HTTPException(403, "Только ДПФ или ДПА")
    report = await reject_course_report(session, course_id, report_date, body.comment)
    faculty = await get_faculty_for_unit(session, course_id)
    if faculty:
        await ws_manager.send_to_room(
            f"faculty_{faculty.id}",
            "REPORT_REJECTED",
            {"course_id": course_id, "comment": body.comment},
        )
    return {"status": report.status}


@router.post("/faculties/{faculty_id}/submit")
async def submit_faculty(
    faculty_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPF)),
):
    if user.unit_id != faculty_id:
        raise HTTPException(403, "Можно отправлять только свой факультет")
    await ensure_schema_patches(session)
    try:
        report, is_resubmit = await submit_faculty_report(session, faculty_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    if is_resubmit:
        await notify_dpf_stroevka_updated(session, user, faculty_id)
    else:
        await notify_dpf_stroevka_submitted(session, user, faculty_id)

    await ws_manager.broadcast_event(
        ["dpa", f"faculty_{faculty_id}"],
        "FACULTY_SUBMITTED",
        {
            "faculty_id": faculty_id,
            "report_date": str(report_date),
            "is_resubmit": is_resubmit,
        },
    )
    await log_action(
        session,
        user.auth_kind,
        user.duty_post_id or 0,
        user.display_name,
        "submit_faculty_report",
        "faculty",
        faculty_id,
    )
    return {"status": report.status, "faculty_id": faculty_id, "is_resubmit": is_resubmit}


@router.post("/faculties/{faculty_id}/start-editing")
async def start_editing_faculty(
    faculty_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPF)),
):
    if user.unit_id != faculty_id:
        raise HTTPException(403, "Можно редактировать только свой факультет")
    await ensure_schema_patches(session)
    try:
        report = await start_faculty_editing(session, faculty_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await ws_manager.broadcast_event(
        ["dpa", f"faculty_{faculty_id}"],
        "FACULTY_EDITING_STARTED",
        {"faculty_id": faculty_id, "report_date": str(report_date)},
    )
    return {"status": report.status, "is_editing": report.is_editing}


@router.post("/faculties/{faculty_id}/approve")
async def approve_faculty(
    faculty_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPF)),
):
    """Устаревший алиас → POST /faculties/{id}/submit."""
    if user.unit_id != faculty_id:
        raise HTTPException(403, "Можно отправлять только свой факультет")
    await ensure_schema_patches(session)
    try:
        report, is_resubmit = await submit_faculty_report(session, faculty_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if is_resubmit:
        await notify_dpf_stroevka_updated(session, user, faculty_id)
    else:
        await notify_dpf_stroevka_submitted(session, user, faculty_id)
    await ws_manager.broadcast_event(
        ["dpa", f"faculty_{faculty_id}"],
        "FACULTY_SUBMITTED",
        {
            "faculty_id": faculty_id,
            "report_date": str(report_date),
            "is_resubmit": is_resubmit,
        },
    )
    return {"status": report.status, "faculty_id": faculty_id, "is_resubmit": is_resubmit}


@router.post("/faculties/{faculty_id}/reject")
async def reject_faculty(
    faculty_id: int,
    body: RejectRequest,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPA)),
):
    report = await reject_faculty_report(session, faculty_id, report_date, body.comment)
    await ws_manager.send_to_room(
        f"faculty_{faculty_id}",
        "REPORT_REJECTED",
        {"faculty_id": faculty_id, "comment": body.comment},
    )
    return {"status": report.status}


@router.get("/chessboard", response_model=ChessboardResponse)
async def chessboard(
    report_date: date = Query(default_factory=date.today),
    view: str = Query("faculty", pattern="^(faculty|location)$"),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPA)),
):
    await ensure_schema_patches(session)
    return await build_chessboard(session, report_date, view=view)


@router.get("/overview", response_model=OverviewResponse)
async def academy_overview(
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("chief", "admin")),
):
    await ensure_schema_patches(session)
    return await build_overview(session, report_date)


@router.get("/trends", response_model=TrendsResponse)
async def academy_trends(
    from_date: date | None = Query(None, alias="from"),
    to_date: date = Query(default_factory=date.today, alias="to"),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("chief", "admin")),
):
    await ensure_schema_patches(session)
    start = from_date or (to_date - timedelta(days=13))
    if (to_date - start).days > 90:
        raise HTTPException(400, "Диапазон не более 90 дней")
    return await build_trends(session, start, to_date)


@router.get("/stroevka/faculty/{faculty_id}", response_model=FacultyStroevkaBundle)
async def faculty_stroevka(
    faculty_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    if user.post_type == DutyPostType.DPF.value and user.unit_id != faculty_id:
        raise HTTPException(403, "Только свой факультет")
    if user.post_type not in (DutyPostType.DPF.value, DutyPostType.DPA.value) and user.shell != "admin":
        raise HTTPException(403, "Только ДПФ или ДПА")
    try:
        return await build_faculty_stroevka_bundle(session, faculty_id, report_date)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


@router.get("/stroevka/academy", response_model=list[FacultyStroevkaBundle])
async def academy_stroevka(
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPA)),
):
    await ensure_schema_patches(session)
    return await build_all_faculty_stroevka_bundles(session, report_date)


@router.post("/courses/{course_id}/ack-dpf")
async def ack_dpf(
    course_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPF)),
):
    await ensure_schema_patches(session)
    try:
        report = await ack_course_changes_dpf(
            session, course_id, report_date, user.unit_id or 0
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await ws_manager.broadcast_event(
        ["dpa", f"faculty_{user.unit_id}"],
        "COURSE_CHANGES_ACK_DPF",
        {"course_id": course_id, "report_date": str(report_date), "faculty_id": user.unit_id},
    )
    return {
        "ok": True,
        "changes_pending_dpf": report.changes_pending_dpf,
        "changes_pending_dpa": report.changes_pending_dpa,
    }


@router.post("/courses/{course_id}/ack-dpa")
async def ack_dpa(
    course_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_duty_post(DutyPostType.DPA)),
):
    await ensure_schema_patches(session)
    try:
        report = await ack_course_changes_dpa(session, course_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    faculty = await get_faculty_for_unit(session, course_id)
    rooms = ["dpa"]
    if faculty:
        rooms.append(f"faculty_{faculty.id}")
    await ws_manager.broadcast_event(
        rooms,
        "COURSE_CHANGES_ACK_DPA",
        {"course_id": course_id, "report_date": str(report_date)},
    )
    return {"ok": True, "changes_pending_dpa": report.changes_pending_dpa}
