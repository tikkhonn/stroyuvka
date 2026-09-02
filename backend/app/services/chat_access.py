"""Права доступа к чату по типу поста наряда."""

from fastapi import HTTPException

from app.core.enums import AuthKind, DutyPostType
from app.schemas import AuthUser
from app.services.unit_ids import parse_course_id


def faculty_id_for_duty_user(user: AuthUser) -> int | None:
    if user.auth_kind != AuthKind.DUTY_POST.value:
        return None
    if user.post_type == DutyPostType.DPF.value:
        return user.unit_id
    if user.post_type == DutyPostType.DPK.value and user.unit_id:
        try:
            faculty_number, _ = parse_course_id(user.unit_id)
            return faculty_number
        except ValueError:
            return None
    return None


def ws_rooms_for_duty_user(user: AuthUser) -> list[str]:
    if user.auth_kind != AuthKind.DUTY_POST.value:
        return []
    if user.post_type == DutyPostType.DPA.value:
        return ["dpa"]
    if user.post_type == DutyPostType.DPF.value and user.unit_id:
        # ДПФ: чат факультета + канал с ДПА
        return [f"faculty_{user.unit_id}", "dpa"]
    if user.post_type == DutyPostType.DPK.value and user.unit_id:
        fid = faculty_id_for_duty_user(user)
        if fid:
            return [f"faculty_{fid}"]
    return []


def assert_can_read_chat(user: AuthUser, faculty_id: int | None) -> int | None:
    """
    faculty_id=None → канал ДПА↔ДПФ
    faculty_id=N → чат факультета N
    """
    if user.shell == "admin":
        return faculty_id

    if user.auth_kind != AuthKind.DUTY_POST.value:
        raise HTTPException(403, "Чат только для постов наряда")

    if user.post_type == DutyPostType.DPA.value:
        if faculty_id is not None:
            raise HTTPException(403, "ДПА пишет только в канал с ДПФ")
        return None

    if user.post_type == DutyPostType.DPF.value:
        if faculty_id is None:
            return None  # канал ДПА↔ДПФ
        if faculty_id != user.unit_id:
            raise HTTPException(403, "Нет доступа к чату другого факультета")
        return user.unit_id

    if user.post_type == DutyPostType.DPK.value:
        fid = faculty_id_for_duty_user(user)
        if not fid:
            raise HTTPException(403, "Не удалось определить факультет")
        if faculty_id is None:
            raise HTTPException(403, "ДПК не имеет доступа к чату ДПА")
        if faculty_id != fid:
            raise HTTPException(403, "Нет доступа к чату другого факультета")
        return fid

    raise HTTPException(403, "Нет доступа к чату")


def assert_can_send_chat(user: AuthUser, faculty_id: int | None) -> tuple[list[str], int | None]:
    scope = assert_can_read_chat(user, faculty_id)
    if scope is None:
        return ["dpa"], None
    return [f"faculty_{scope}"], scope
