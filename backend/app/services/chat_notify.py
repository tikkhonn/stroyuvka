"""Автоматические сообщения в чат от постов наряда."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuthKind, DutyPostType
from app.models import ChatMessage
from app.schemas import AuthUser
from app.ws.manager import ws_manager


def course_chat_label(course_id: int) -> str:
    return f"{course_id} курсу"


def faculty_chat_label(faculty_id: int) -> str:
    return f"{faculty_id} факультету"


async def post_chat_message(
    session: AsyncSession,
    *,
    faculty_id: int | None,
    rooms: list[str],
    sender_name: str,
    sender_kind: str,
    sender_id: int,
    body: str,
) -> ChatMessage:
    msg = ChatMessage(
        sender_kind=sender_kind,
        sender_id=sender_id,
        sender_name=sender_name,
        recipient_kind=AuthKind.DUTY_POST.value,
        recipient_id=0,
        faculty_id=faculty_id,
        body=body,
    )
    session.add(msg)
    await session.flush()
    await ws_manager.broadcast_event(
        rooms,
        "CHAT_MESSAGE",
        {
            "id": msg.id,
            "sender_kind": msg.sender_kind,
            "sender_id": msg.sender_id,
            "sender_name": msg.sender_name,
            "body": msg.body,
            "created_at": str(msg.created_at),
            "faculty_id": faculty_id,
        },
    )
    return msg


async def post_faculty_chat_message(
    session: AsyncSession,
    *,
    faculty_id: int,
    sender_name: str,
    sender_kind: str,
    sender_id: int,
    body: str,
) -> ChatMessage:
    return await post_chat_message(
        session,
        faculty_id=faculty_id,
        rooms=[f"faculty_{faculty_id}"],
        sender_name=sender_name,
        sender_kind=sender_kind,
        sender_id=sender_id,
        body=body,
    )


async def post_dpa_chat_message(
    session: AsyncSession,
    *,
    sender_name: str,
    sender_kind: str,
    sender_id: int,
    body: str,
) -> ChatMessage:
    return await post_chat_message(
        session,
        faculty_id=None,
        rooms=["dpa"],
        sender_name=sender_name,
        sender_kind=sender_kind,
        sender_id=sender_id,
        body=body,
    )


async def notify_dpk_stroevka_submitted(
    session: AsyncSession,
    user: AuthUser,
    course_id: int,
    faculty_id: int,
) -> None:
    label = course_chat_label(course_id)
    body = f"Дежурный по {label} строевку скинул."
    await post_faculty_chat_message(
        session,
        faculty_id=faculty_id,
        sender_name=user.display_name,
        sender_kind=user.auth_kind,
        sender_id=user.duty_post_id or 0,
        body=body,
    )


async def notify_dpk_stroevka_updated(
    session: AsyncSession,
    user: AuthUser,
    course_id: int,
    faculty_id: int,
) -> None:
    if user.post_type != DutyPostType.DPK.value:
        return
    label = course_chat_label(course_id)
    body = f"Дежурный по {label} строевку обновил."
    await post_faculty_chat_message(
        session,
        faculty_id=faculty_id,
        sender_name=user.display_name,
        sender_kind=user.auth_kind,
        sender_id=user.duty_post_id or 0,
        body=body,
    )


async def notify_dpf_stroevka_submitted(
    session: AsyncSession,
    user: AuthUser,
    faculty_id: int,
) -> None:
    label = faculty_chat_label(faculty_id)
    body = f"Дежурный по {label} строевку скинул."
    await post_dpa_chat_message(
        session,
        sender_name=user.display_name,
        sender_kind=user.auth_kind,
        sender_id=user.duty_post_id or 0,
        body=body,
    )


async def notify_dpf_stroevka_updated(
    session: AsyncSession,
    user: AuthUser,
    faculty_id: int,
) -> None:
    if user.post_type != DutyPostType.DPF.value:
        return
    label = faculty_chat_label(faculty_id)
    body = f"Дежурный по {label} строевку обновил."
    await post_dpa_chat_message(
        session,
        sender_name=user.display_name,
        sender_kind=user.auth_kind,
        sender_id=user.duty_post_id or 0,
        body=body,
    )
