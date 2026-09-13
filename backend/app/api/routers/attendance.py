from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    ABSENCE_CATEGORY_DEFS,
    AuthKind,
    DutyPostType,
    ReportStatus,
    UnitType,
)
from app.db.session import get_db
from app.dependencies import assert_unit_access, get_current_user
from app.models import AbsenceCategory, AbsenceReason, CourseReport, FacultyReport, Person, Unit
from app.schemas import (
    AbsenceCategoryRead,
    AbsenceEntryCreate,
    AbsenceEntryPatch,
    AbsenceEntryRead,
    AbsenceReasonCreate,
    AbsenceReasonRead,
    AttendanceSnapshot,
    AttendanceUnitOption,
    AuthUser,
    PersonRead,
    PersonRosterWrite,
    PersonRosterPatch,
    RosterImportPreview,
    RosterImportResult,
)
from app.services.attendance import (
    add_absence_entry,
    delete_absence_entry,
    ensure_schema_patches,
    get_attendance_snapshot,
    update_absence_entry,
)
from app.services.audit import log_action
from app.services.org import get_courses_for_faculty, get_faculty_for_unit
from app.services.people import (
    create_person,
    deactivate_person,
    display_last_name,
    format_rank,
    list_people,
    person_to_read,
    update_person,
)
from app.services.people_import import apply_import, export_docx, export_xlsx, preview_import
from app.services.reports import get_faculty_id_for_course
from app.services.unit_ids import parse_course_id
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
        if unit.type == UnitType.FACULTY:
            return user.unit_id == unit_id
        if unit.type == UnitType.COURSE:
            try:
                faculty_number, _ = parse_course_id(unit_id)
            except ValueError:
                return False
            return faculty_number == user.unit_id
    return False


async def _assert_can_view(session: AsyncSession, user: AuthUser, unit: Unit, unit_id: int) -> None:
    if user.auth_kind != AuthKind.DUTY_POST.value:
        return
    if user.post_type == DutyPostType.DPK.value:
        if user.unit_id != unit_id:
            raise HTTPException(403, "ДПК может работать только со своим курсом")
        if unit.type != UnitType.COURSE:
            raise HTTPException(400, "ДПК привязан не к курсу")
    elif user.post_type == DutyPostType.DPF.value:
        if unit.type == UnitType.FACULTY and user.unit_id != unit_id:
            raise HTTPException(403, "ДПФ может работать только со своим факультетом")
        if unit.type == UnitType.COURSE:
            faculty = await get_faculty_for_unit(session, unit_id)
            if not faculty or faculty.id != user.unit_id:
                raise HTTPException(403, "Нет доступа к этому курсу")


async def _assert_report_editing(
    session: AsyncSession,
    user: AuthUser,
    unit: Unit,
    unit_id: int,
    report_date: date,
) -> None:
    if user.shell == "admin":
        return
    if unit.type == UnitType.COURSE:
        result = await session.execute(
            select(CourseReport).where(
                CourseReport.course_id == unit_id,
                CourseReport.report_date == report_date,
            )
        )
        report = result.scalar_one_or_none()
        if report and report.status in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
            if not report.is_editing:
                raise HTTPException(
                    403, "Нажмите «Редактировать строевую записку» для внесения правок"
                )
        return
    if unit.type == UnitType.FACULTY:
        result = await session.execute(
            select(FacultyReport).where(
                FacultyReport.faculty_id == unit_id,
                FacultyReport.report_date == report_date,
            )
        )
        report = result.scalar_one_or_none()
        if report and report.status in (ReportStatus.SUBMITTED, ReportStatus.APPROVED):
            if not report.is_editing:
                raise HTTPException(
                    403, "Нажмите «Редактировать строевую записку» для внесения правок"
                )


async def _effective_editable(
    session: AsyncSession,
    user: AuthUser,
    unit: Unit,
    unit_id: int,
    report_date: date,
) -> bool:
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPA.value:
        return False
    if not _editable_for_user(user, unit, unit_id):
        return False
    if user.shell == "admin":
        return True
    try:
        await _assert_report_editing(session, user, unit, unit_id, report_date)
    except HTTPException:
        return False
    return True


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
    payload = {"unit_id": unit_id, "report_date": str(report_date)}
    if notify_dpf and faculty_id:
        await ws_manager.broadcast_event(
            [f"faculty_{faculty_id}"],
            "COURSE_CHANGES_PENDING",
            {**payload, "course_id": unit_id, "faculty_id": faculty_id},
        )
    await ws_manager.broadcast_event(rooms, "ATTENDANCE_CHANGED", payload)


def _entry_read(entry, editable: bool = True) -> AbsenceEntryRead:
    return AbsenceEntryRead(
        id=entry.id,
        unit_id=entry.unit_id,
        person_id=entry.person_id,
        status_date=entry.status_date,
        category_code=entry.category_code,
        rank=format_rank(entry.rank or ""),
        last_name=entry.last_name,
        note=entry.note,
        hospital_id=entry.hospital_id,
        hospital_name=entry.hospital.name if getattr(entry, "hospital", None) else None,
        editable=editable,
    )


async def _require_writable_unit(
    session: AsyncSession,
    user: AuthUser,
    unit_id: int,
    report_date: date,
) -> Unit:
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPA.value:
        raise HTTPException(403, "ДПА не вносит расход")
    await assert_unit_access(session, user, unit_id, write=True)
    unit = await session.get(Unit, unit_id)
    if not unit or not unit.is_active:
        raise HTTPException(404, "Подразделение не найдено или неактивно")
    if not _editable_for_user(user, unit, unit_id):
        raise HTTPException(403, "Нет прав на редактирование")
    await _assert_report_editing(session, user, unit, unit_id, report_date)
    return unit


@router.get("/attendance-units", response_model=list[AttendanceUnitOption])
async def list_attendance_units(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    options: list[AttendanceUnitOption] = []
    if user.shell == "admin":
        faculties = (
            await session.execute(
                select(Unit)
                .where(Unit.type == UnitType.FACULTY, Unit.is_active.is_(True))
                .order_by(Unit.id)
            )
        ).scalars().all()
        for fac in faculties:
            options.append(
                AttendanceUnitOption(
                    id=fac.id, name=f"Офицеры · {fac.name}", type=fac.type, kind="officers"
                )
            )
            for course in await get_courses_for_faculty(session, fac.id):
                options.append(
                    AttendanceUnitOption(
                        id=course.id, name=course.name, type=course.type, kind="course"
                    )
                )
        return options
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPK.value:
        unit = await session.get(Unit, user.unit_id) if user.unit_id else None
        if unit:
            options.append(
                AttendanceUnitOption(id=unit.id, name=unit.name, type=unit.type, kind="course")
            )
        return options
    if user.auth_kind == AuthKind.DUTY_POST.value and user.post_type == DutyPostType.DPF.value:
        unit = await session.get(Unit, user.unit_id) if user.unit_id else None
        if unit:
            options.append(
                AttendanceUnitOption(
                    id=unit.id, name=f"Офицеры · {unit.name}", type=unit.type, kind="officers"
                )
            )
            for course in await get_courses_for_faculty(session, unit.id):
                options.append(
                    AttendanceUnitOption(
                        id=course.id, name=course.name, type=course.type, kind="course"
                    )
                )
    return options


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
    await _assert_can_view(session, user, unit, unit_id)
    editable = await _effective_editable(session, user, unit, unit_id, report_date)
    try:
        return await get_attendance_snapshot(
            session, unit_id, report_date, editable=editable
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/attendance/{unit_id}/absences", response_model=list[AbsenceEntryRead])
async def create_absence(
    unit_id: int,
    body: AbsenceEntryCreate,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await _require_writable_unit(session, user, unit_id, report_date)
    try:
        entries, notify = await add_absence_entry(session, unit_id, report_date, body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date, notify_dpf=notify)
    return [_entry_read(entry) for entry in entries]


@router.patch("/attendance/{unit_id}/absences/{entry_id}", response_model=AbsenceEntryRead)
async def patch_absence(
    unit_id: int,
    entry_id: int,
    body: AbsenceEntryPatch,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await _require_writable_unit(session, user, unit_id, report_date)
    try:
        entry, notify = await update_absence_entry(
            session, entry_id, unit_id, report_date, body
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date, notify_dpf=notify)
    return _entry_read(entry)


@router.delete("/attendance/{unit_id}/absences/{entry_id}")
async def remove_absence(
    unit_id: int,
    entry_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await _require_writable_unit(session, user, unit_id, report_date)
    try:
        notify = await delete_absence_entry(session, entry_id, unit_id, report_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date, notify_dpf=notify)
    return {"ok": True}


@router.get("/attendance/{unit_id}/people", response_model=list[PersonRead])
async def get_people(
    unit_id: int,
    include_inactive: bool = Query(False),
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await assert_unit_access(session, user, unit_id)
    unit = await session.get(Unit, unit_id)
    if not unit or not unit.is_active:
        raise HTTPException(404, "Подразделение не найдено или неактивно")
    await _assert_can_view(session, user, unit, unit_id)
    people = await list_people(session, unit_id, include_inactive=include_inactive)
    return [person_to_read(p) for p in people]


@router.post("/attendance/{unit_id}/people", response_model=PersonRead)
async def add_person(
    unit_id: int,
    body: PersonRosterWrite,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    unit = await _require_writable_unit(session, user, unit_id, report_date)
    try:
        person = await create_person(
            session, unit, body.rank, body.full_name, department_code=body.department_code
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date)
    await log_action(
        session,
        user.auth_kind,
        user.user_id or user.duty_post_id or 0,
        user.display_name,
        "create_person",
        "person",
        person.id,
        f"{person.rank} {display_last_name(person)}",
    )
    return person_to_read(person)


@router.patch("/attendance/{unit_id}/people/{person_id}", response_model=PersonRead)
async def patch_person(
    unit_id: int,
    person_id: int,
    body: PersonRosterPatch,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await _require_writable_unit(session, user, unit_id, report_date)
    person = await session.get(Person, person_id)
    if not person or person.unit_id != unit_id:
        raise HTTPException(404, "Человек не найден")
    try:
        person = await update_person(
            session,
            person,
            rank=body.rank,
            full_name=body.full_name,
            department_code=body.department_code,
            department_code_set="department_code" in body.model_fields_set,
            is_active=body.is_active,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date)
    return person_to_read(person)


@router.delete("/attendance/{unit_id}/people/{person_id}", response_model=PersonRead)
async def remove_person(
    unit_id: int,
    person_id: int,
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await _require_writable_unit(session, user, unit_id, report_date)
    person = await session.get(Person, person_id)
    if not person or person.unit_id != unit_id:
        raise HTTPException(404, "Человек не найден")
    person = await deactivate_person(session, person)
    await _notify_attendance(session, unit_id, report_date)
    await log_action(
        session,
        user.auth_kind,
        user.user_id or user.duty_post_id or 0,
        user.display_name,
        "deactivate_person",
        "person",
        person.id,
        f"{display_last_name(person)}",
    )
    return person_to_read(person)


async def _read_upload(file: UploadFile) -> tuple[str, bytes]:
    filename = file.filename or "roster"
    content = await file.read()
    if not content:
        raise HTTPException(400, "Пустой файл")
    return filename, content


@router.post("/attendance/{unit_id}/people/import/preview", response_model=RosterImportPreview)
async def import_people_preview(
    unit_id: int,
    mode: str = Query("upsert"),
    report_date: date = Query(default_factory=date.today),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    unit = await _require_writable_unit(session, user, unit_id, report_date)
    filename, content = await _read_upload(file)
    try:
        return await preview_import(session, unit, filename, content, mode)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/attendance/{unit_id}/people/import", response_model=RosterImportResult)
async def import_people(
    unit_id: int,
    mode: str = Query("upsert"),
    report_date: date = Query(default_factory=date.today),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    unit = await _require_writable_unit(session, user, unit_id, report_date)
    filename, content = await _read_upload(file)
    try:
        result = await apply_import(session, unit, filename, content, mode)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await _notify_attendance(session, unit_id, report_date)
    await log_action(
        session,
        user.auth_kind,
        user.user_id or user.duty_post_id or 0,
        user.display_name,
        "import_people",
        "unit",
        unit_id,
        f"mode={mode} added={result.added} updated={result.updated} "
        f"restored={result.restored} deactivated={result.deactivated}",
    )
    return result


@router.get("/attendance/{unit_id}/people/export.xlsx")
async def export_people_xlsx(
    unit_id: int,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await assert_unit_access(session, user, unit_id)
    unit = await session.get(Unit, unit_id)
    if not unit or not unit.is_active:
        raise HTTPException(404, "Подразделение не найдено или неактивно")
    await _assert_can_view(session, user, unit, unit_id)
    people = await list_people(session, unit_id, include_inactive=False)
    data = export_xlsx(people)
    filename = quote(f"{unit.name}.xlsx")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("/attendance/{unit_id}/people/export.docx")
async def export_people_docx(
    unit_id: int,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_schema_patches(session)
    await assert_unit_access(session, user, unit_id)
    unit = await session.get(Unit, unit_id)
    if not unit or not unit.is_active:
        raise HTTPException(404, "Подразделение не найдено или неактивно")
    await _assert_can_view(session, user, unit, unit_id)
    people = await list_people(session, unit_id, include_inactive=False)
    data = export_docx(people, f"Список — {unit.name}")
    filename = quote(f"{unit.name}.docx")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
