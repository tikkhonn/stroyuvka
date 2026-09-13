"""Справочник стационарных телефонов."""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuthKind
from app.models import LandlinePhone
from app.schemas import AuthUser, LandlinePhoneCreate, LandlinePhoneUpdate
from app.services.unit_ids import parse_course_id

LEGACY_DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "landline_phones.json"
_FACULTY_BUILDING_RE = re.compile(
    r"учебному\s+корпусу\s+(\d+)\s+факультета", re.IGNORECASE
)
_FACULTY_CHIEF_RE = re.compile(
    r"начальник\s+(\d+)\s+ф(?:акультета|-т\b)", re.IGNORECASE
)
_FACULTY_SCOPED_ROLES = frozenset({"dpf", "faculty_chief"})


def assert_can_use_phones_page(user: AuthUser) -> None:
    if user.shell == "chief":
        return
    if user.auth_kind == AuthKind.DUTY_POST.value:
        return
    if user.shell == "admin":
        return
    raise HTTPException(403, "Нет доступа к справочнику телефонов")


def _infer_duty_scope(name: str) -> tuple[str | None, int | None]:
    lowered = name.lower()
    if "дпа" in lowered or "академ" in lowered:
        return "dpa", None
    chief_match = _FACULTY_CHIEF_RE.search(name)
    if chief_match:
        return "faculty_chief", int(chief_match.group(1))
    if "начальник" in lowered and "факульт" in lowered:
        return "faculty_chief", None
    match = _FACULTY_BUILDING_RE.search(name)
    if match:
        return "dpf", int(match.group(1))
    return None, None


def _resolve_dpa_phone(rows: list[LandlinePhone]) -> str | None:
    dpa_phone: str | None = None
    for row in rows:
        if not row.phone:
            continue
        if row.duty_scope == "dpa":
            return row.phone
        if row.duty_scope is None and dpa_phone is None and "дпа" in row.name.lower():
            dpa_phone = row.phone
    return dpa_phone


def _resolve_faculty_scoped_phone(
    rows: list[LandlinePhone],
    *,
    duty_scope: str,
    faculty_id: int,
    name_pattern: re.Pattern[str] | None = None,
) -> str | None:
    phone: str | None = None
    for row in rows:
        if not row.phone:
            continue
        if row.duty_scope == duty_scope and row.faculty_id == faculty_id:
            return row.phone
        if row.duty_scope is None and phone is None and name_pattern:
            match = name_pattern.search(row.name)
            if match and int(match.group(1)) == faculty_id:
                phone = row.phone
    return phone


async def ensure_landline_phones_table(session: AsyncSession) -> None:
    from sqlalchemy import text

    await session.execute(
        text(
            "CREATE TABLE IF NOT EXISTS landline_phones ("
            "id SERIAL PRIMARY KEY, "
            "name VARCHAR(255) NOT NULL, "
            "phone VARCHAR(64) NOT NULL DEFAULT '', "
            "sort_order INTEGER NOT NULL DEFAULT 0, "
            "is_active BOOLEAN NOT NULL DEFAULT TRUE"
            ")"
        )
    )
    await session.execute(
        text("ALTER TABLE landline_phones ADD COLUMN IF NOT EXISTS duty_scope VARCHAR(32)")
    )
    await session.execute(
        text(
            "ALTER TABLE landline_phones "
            "ALTER COLUMN duty_scope TYPE VARCHAR(32)"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE landline_phones "
            "ADD COLUMN IF NOT EXISTS faculty_id INTEGER REFERENCES units(id)"
        )
    )

    existing = await session.scalar(select(LandlinePhone.id).limit(1))
    if existing is None and LEGACY_DATA_FILE.is_file():
        raw = json.loads(LEGACY_DATA_FILE.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            for index, item in enumerate(raw):
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "").strip()
                if not name:
                    continue
                duty_scope, faculty_id = _infer_duty_scope(name)
                session.add(
                    LandlinePhone(
                        name=name,
                        phone=str(item.get("phone") or "").strip(),
                        sort_order=index,
                        is_active=True,
                        duty_scope=duty_scope,
                        faculty_id=faculty_id,
                    )
                )

    rows = await list_landline_phones(session)
    for row in rows:
        if row.duty_scope is not None:
            continue
        duty_scope, faculty_id = _infer_duty_scope(row.name)
        if duty_scope:
            row.duty_scope = duty_scope
            row.faculty_id = faculty_id


async def duty_landlines_for_course(
    session: AsyncSession, course_unit_id: int
) -> tuple[str | None, str | None]:
    try:
        faculty_number, _ = parse_course_id(course_unit_id)
    except ValueError:
        return None, None

    rows = await list_landline_phones(session, active_only=True)
    dpf_phone = _resolve_faculty_scoped_phone(
        rows,
        duty_scope="dpf",
        faculty_id=faculty_number,
        name_pattern=_FACULTY_BUILDING_RE,
    )
    dpa_phone = _resolve_dpa_phone(rows)
    return dpf_phone, dpa_phone


async def duty_landlines_for_faculty(
    session: AsyncSession, faculty_id: int
) -> tuple[str | None, str | None]:
    rows = await list_landline_phones(session, active_only=True)
    chief_phone = _resolve_faculty_scoped_phone(
        rows,
        duty_scope="faculty_chief",
        faculty_id=faculty_id,
        name_pattern=_FACULTY_CHIEF_RE,
    )
    dpa_phone = _resolve_dpa_phone(rows)
    return chief_phone, dpa_phone


async def list_landline_phones(
    session: AsyncSession, *, active_only: bool = False
) -> list[LandlinePhone]:
    stmt = select(LandlinePhone).order_by(
        LandlinePhone.sort_order, LandlinePhone.name, LandlinePhone.id
    )
    if active_only:
        stmt = stmt.where(LandlinePhone.is_active.is_(True))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def create_landline_phone(
    session: AsyncSession, body: LandlinePhoneCreate
) -> LandlinePhone:
    name = body.name.strip()
    if not name:
        raise ValueError("Укажите должность или название")
    duty_scope = body.duty_scope
    faculty_id = body.faculty_id
    if duty_scope is None:
        duty_scope, faculty_id = _infer_duty_scope(name)
    elif duty_scope not in _FACULTY_SCOPED_ROLES:
        faculty_id = None

    row = LandlinePhone(
        name=name,
        phone=body.phone.strip(),
        sort_order=body.sort_order,
        is_active=True,
        duty_scope=duty_scope,
        faculty_id=faculty_id,
    )
    session.add(row)
    await session.flush()
    return row


async def update_landline_phone(
    session: AsyncSession, phone_id: int, body: LandlinePhoneUpdate
) -> LandlinePhone:
    row = await session.get(LandlinePhone, phone_id)
    if not row:
        raise ValueError("Стационарный номер не найден")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ValueError("Укажите должность или название")
        row.name = name
    if body.phone is not None:
        row.phone = body.phone.strip()
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    if body.is_active is not None:
        row.is_active = body.is_active
    if body.duty_scope is not None:
        row.duty_scope = body.duty_scope
        row.faculty_id = (
            body.faculty_id if body.duty_scope in _FACULTY_SCOPED_ROLES else None
        )
    elif body.faculty_id is not None:
        row.faculty_id = body.faculty_id
    if body.name is not None and body.duty_scope is None and body.faculty_id is None:
        duty_scope, faculty_id = _infer_duty_scope(row.name)
        if duty_scope:
            row.duty_scope = duty_scope
            row.faculty_id = faculty_id
    await session.flush()
    return row
