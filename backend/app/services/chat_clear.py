"""Очистка чата при смене наряда."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuthKind, DutyPostType
from app.models import ChatMessage
from app.schemas import AuthUser
from app.services.chat_access import faculty_id_for_duty_user, ws_rooms_for_duty_user
from app.services.chat_attachments import (
    delete_pending_for_uploader,
    unlink_stored_path,
)


async def _delete_message_files(session: AsyncSession, message_ids: list[int]) -> None:
    if not message_ids:
        return
    from app.models import ChatAttachment

    result = await session.execute(
        select(ChatAttachment.stored_path).where(
            ChatAttachment.message_id.in_(message_ids)
        )
    )
    for (stored_path,) in result.all():
        unlink_stored_path(stored_path)


async def clear_chats_on_shift_change(
    session: AsyncSession,
    user: AuthUser,
) -> tuple[list[int | None], list[str]]:
    """
    Удаляет сообщения чата, доступные посту при смене наряда.
    Возвращает (очищенные faculty_id: None = канал ДПА↔ДПФ, список WS-комнат).
    """
    if user.auth_kind != AuthKind.DUTY_POST.value:
        return [], []

    cleared_scopes: list[int | None] = []
    rooms: set[str] = set()

    if user.duty_post_id:
        await delete_pending_for_uploader(
            session, user.auth_kind, user.duty_post_id
        )

    if user.post_type == DutyPostType.DPA.value:
        ids_result = await session.execute(
            select(ChatMessage.id).where(ChatMessage.faculty_id.is_(None))
        )
        message_ids = [row[0] for row in ids_result.all()]
        await _delete_message_files(session, message_ids)
        await session.execute(delete(ChatMessage).where(ChatMessage.faculty_id.is_(None)))
        cleared_scopes.append(None)
        rooms.add("dpa")

    elif user.post_type == DutyPostType.DPF.value and user.unit_id:
        ids_result = await session.execute(
            select(ChatMessage.id).where(ChatMessage.faculty_id == user.unit_id)
        )
        message_ids = [row[0] for row in ids_result.all()]
        await _delete_message_files(session, message_ids)
        await session.execute(
            delete(ChatMessage).where(ChatMessage.faculty_id == user.unit_id)
        )
        cleared_scopes.append(user.unit_id)
        rooms.add(f"faculty_{user.unit_id}")
        rooms.add("dpa")

    elif user.post_type == DutyPostType.DPK.value:
        faculty_id = faculty_id_for_duty_user(user)
        if faculty_id is not None:
            ids_result = await session.execute(
                select(ChatMessage.id).where(ChatMessage.faculty_id == faculty_id)
            )
            message_ids = [row[0] for row in ids_result.all()]
            await _delete_message_files(session, message_ids)
            await session.execute(
                delete(ChatMessage).where(ChatMessage.faculty_id == faculty_id)
            )
            cleared_scopes.append(faculty_id)
            rooms.add(f"faculty_{faculty_id}")

    await session.flush()
    rooms.update(ws_rooms_for_duty_user(user))
    return cleared_scopes, list(rooms)
