from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ABSENCE_CATEGORY_DEFS, DutyPostType, UnitType
from app.db.session import get_db
from app.dependencies import assert_unit_access, get_current_user
from app.models import Unit
from app.schemas import AuthUser
from app.services.attendance import ensure_schema_patches
from app.services.print_sick_xlsx import build_sick_xlsx
from app.services.print_stroevka import build_stroevka_print

router = APIRouter(prefix="/print", tags=["print"])

_VALID_CATEGORY_CODES = {code for code, _label, _req in ABSENCE_CATEGORY_DEFS}


def _can_print_academy(user: AuthUser) -> bool:
    return (
        user.shell == "admin"
        or user.post_type == DutyPostType.DPA.value
        or user.role == "dpa"
    )


@router.get("/stroevaya", response_class=HTMLResponse)
async def stroevaya(
    report_date: date = Query(default_factory=date.today),
    scope: str = Query("unit", pattern="^(unit|location|faculty|academy)$"),
    unit_id: int | None = None,
    category_code: str | None = Query(None, description="Фильтр по причине отсутствия"),
    composition: str = Query(
        "all",
        pattern="^(all|variable|permanent)$",
        description="Состав факультета: all — курсы и офицеры, variable — только курсы, permanent — только офицеры",
    ),
    department_code: str | None = Query(
        None,
        description="Код кафедры офицеров (только для scope=faculty)",
    ),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if category_code and category_code not in _VALID_CATEGORY_CODES:
        raise HTTPException(400, "Неизвестная причина отсутствия")
    if user.post_type == DutyPostType.DPK.value or user.role == "dpk":
        if scope != "unit":
            raise HTTPException(403, "ДПК может печатать только строевую записку своего курса")
        if user.unit_id is None:
            raise HTTPException(403, "Нет привязки к курсу")
        unit_id = user.unit_id

    if user.post_type == DutyPostType.DPF.value or user.role == "dpf":
        if scope != "faculty":
            raise HTTPException(403, "ДПФ может печатать только строевую записку своего факультета")
        if user.unit_id is None:
            raise HTTPException(403, "Нет привязки к факультету")
        unit_id = user.unit_id

    if category_code:
        if not _can_print_academy(user):
            raise HTTPException(403, "Отчёт по причине отсутствия доступен только ДПА")
        if scope == "unit":
            raise HTTPException(400, "Для отчёта по причине выберите академию, расположение или факультет")

    if scope == "academy":
        if not _can_print_academy(user):
            raise HTTPException(403, "Нет доступа к сводке всей академии")
    elif unit_id is None:
        raise HTTPException(400, "Укажите unit_id")
    else:
        await assert_unit_access(session, user, unit_id)
        unit = await session.get(Unit, unit_id)
        if not unit or not unit.is_active:
            raise HTTPException(404, "Подразделение не найдено")
        if scope == "location" and unit.type != UnitType.LOCATION:
            raise HTTPException(400, "Для scope=location нужен id расположения")
        if scope == "faculty" and unit.type != UnitType.FACULTY:
            raise HTTPException(400, "Для scope=faculty нужен id факультета")
        if scope == "unit" and unit.type != UnitType.COURSE:
            raise HTTPException(400, "Для scope=unit нужен id курса")

    if department_code and scope != "faculty":
        raise HTTPException(400, "department_code доступен только для scope=faculty")
    if scope != "faculty" and composition != "all":
        composition = "all"

    try:
        html = await build_stroevka_print(
            session,
            scope,
            unit_id,
            report_date,
            category_code=category_code,
            composition=composition,
            department_code=department_code,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return HTMLResponse(html)


@router.get("/sick.xlsx")
async def sick_xlsx(
    report_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if not _can_print_academy(user):
        raise HTTPException(403, "Выгрузка расхода доступна только ДПА")
    await ensure_schema_patches(session)
    data = await build_sick_xlsx(session, report_date)
    filename = quote(f"Расход {report_date.strftime('%d.%m.%Y')}.xlsx")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
