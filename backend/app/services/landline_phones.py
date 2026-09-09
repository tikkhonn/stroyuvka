"""Справочник стационарных телефонов (JSON-файл)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import HTTPException

from app.core.enums import AuthKind
from app.schemas import AuthUser, LandlinePhone

DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "landline_phones.json"


def assert_can_use_phones_page(user: AuthUser) -> None:
    if user.shell == "chief":
        return
    if user.auth_kind == AuthKind.DUTY_POST.value:
        return
    raise HTTPException(403, "Нет доступа к справочнику телефонов")


def _read_raw() -> list[dict]:
    if not DATA_FILE.is_file():
        return []
    text = DATA_FILE.read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, list):
        raise HTTPException(500, "Справочник стационарных номеров повреждён")
    return data


def load_landline_phones() -> list[LandlinePhone]:
    rows: list[LandlinePhone] = []
    for item in _read_raw():
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        rows.append(
            LandlinePhone(
                id=int(item.get("id") or 0),
                name=name,
                phone=str(item.get("phone") or "").strip(),
            )
        )
    return rows
