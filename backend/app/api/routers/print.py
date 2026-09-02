from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ABSENCE_CATEGORY_DEFS, DutyPostType, UnitType
from app.db.session import get_db
from app.dependencies import assert_unit_access, get_current_user
from app.models import Unit
from app.schemas import AuthUser
from app.services.print_stroevka import build_stroevka_print

router = APIRouter(prefix="/print", tags=["print"])

_VALID_CATEGORY_CODES = {code for code, _label, _req in ABSENCE_CATEGORY_DEFS}


@router.get("/stroevaya", response_class=HTMLResponse)
async def stroevaya(
    report_date: date = Query(default_factory=date.today),
    scope: str = Query("unit", pattern="^(unit|location|faculty|academy)$"),
    unit_id: int | None = None,
    category_code: str | None = Query(None, description="Фильтр по причине отсутствия"),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if category_code and category_code not in _VALID_CATEGORY_CODES:
        raise HTTPException(400, "Неизвестная причина отсутствия")
    if user.post_type == DutyPostType.DPK.value or user.role == "dpk":
        if scope != "unit":
            raise HTTPException(403, "ДПК может печатать только строевку своего курса")
        if user.unit_id is None:
            raise HTTPException(403, "Нет привязки к курсу")
        unit_id = user.unit_id

    if user.post_type == DutyPostType.DPF.value or user.role == "dpf":
        if scope != "faculty":
            raise HTTPException(403, "ДПФ может печатать только строевку своего факультета")
        if user.unit_id is None:
            raise HTTPException(403, "Нет привязки к факультету")
        unit_id = user.unit_id

    if category_code:
        if not (
            user.shell == "admin"
            or user.post_type == DutyPostType.DPA.value
            or user.role == "dpa"
        ):
            raise HTTPException(403, "Отчёт по причине отсутствия доступен только ДПА")
        if scope == "unit":
            raise HTTPException(400, "Для отчёта по причине выберите академию, расположение или факультет")

    if scope == "academy":
        if not (
            user.shell == "admin"
            or user.post_type == DutyPostType.DPA.value
            or user.role == "dpa"
        ):
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

    try:
        html = await build_stroevka_print(
            session, scope, unit_id, report_date, category_code=category_code
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return HTMLResponse(html)
