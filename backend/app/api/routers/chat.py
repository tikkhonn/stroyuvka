from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models import ChatMessage, DutyContact, Unit
from app.schemas import (
    AuthUser,
    ChatMessageCreate,
    ChatMessageRead,
    ChatPendingUploadRead,
    DutyContactRead,
    DutyContactStatus,
    DutyContactUpsert,
    DutySelfRegister,
)
from app.services.audit import log_action
from app.services.chat_access import assert_can_read_chat, assert_can_send_chat, ws_rooms_for_duty_user
from app.services.chat_attachments import (
    _absolute_path,
    attach_pending_to_message,
    ensure_chat_attachment_schema,
    get_attachment_with_access,
    is_image_content_type,
    message_to_read,
    save_pending_upload,
    ws_message_payload,
)
from app.services.chat_clear import clear_chats_on_shift_change
from app.services.duty_contacts import (
    ensure_duty_contact_schema,
    get_self_contact_today,
    list_contacts_for_user,
    register_self_contact,
    shift_change_self_contact,
)
from app.services.people import format_rank
from app.ws.manager import ws_manager

router = APIRouter(tags=["chat", "duty"])


@router.get("/chat/messages", response_model=list[ChatMessageRead])
async def list_messages(
    faculty_id: int | None = Query(None),
    limit: int = Query(50, le=200),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_chat_attachment_schema(session)
    scope = assert_can_read_chat(user, faculty_id)
    query = (
        select(ChatMessage)
        .options(selectinload(ChatMessage.attachments))
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    if scope is None:
        query = query.where(ChatMessage.faculty_id.is_(None))
    else:
        query = query.where(ChatMessage.faculty_id == scope)
    result = await session.execute(query)
    messages = list(reversed(list(result.scalars().all())))
    return [message_to_read(m) for m in messages]


@router.post("/chat/uploads", response_model=ChatPendingUploadRead)
async def upload_chat_file(
    faculty_id: int | None = Query(None),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _, save_faculty_id = assert_can_send_chat(user, faculty_id)
    row = await save_pending_upload(session, user, save_faculty_id, file)
    return ChatPendingUploadRead(
        id=row.id,
        filename=row.original_filename,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
    )


@router.post("/chat/messages", response_model=ChatMessageRead)
async def send_message(
    body: ChatMessageCreate,
    faculty_id: int | None = Query(None),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    rooms, save_faculty_id = assert_can_send_chat(user, faculty_id)
    actor_id = user.user_id or user.duty_post_id or 0
    msg = ChatMessage(
        sender_kind=user.auth_kind,
        sender_id=actor_id,
        sender_name=user.display_name,
        recipient_kind=body.recipient_kind,
        recipient_id=body.recipient_id,
        faculty_id=save_faculty_id,
        body=body.body.strip(),
    )
    session.add(msg)
    await session.flush()

    attachments = await attach_pending_to_message(
        session, user, save_faculty_id, msg.id, body.upload_ids
    )

    await ws_manager.broadcast_event(
        rooms,
        "CHAT_MESSAGE",
        ws_message_payload(msg, save_faculty_id, attachments),
    )
    return message_to_read(msg, attachments)


@router.get("/chat/attachments/{attachment_id}")
async def download_attachment(
    attachment_id: int,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_chat_attachment_schema(session)
    att, msg = await get_attachment_with_access(session, attachment_id)
    assert_can_read_chat(user, msg.faculty_id)

    path = _absolute_path(att.stored_path)
    if not path.is_file():
        raise HTTPException(404, "Файл не найден на сервере")

    disposition = "inline" if is_image_content_type(att.content_type) else "attachment"
    encoded_name = quote(att.original_filename)
    return FileResponse(
        path,
        media_type=att.content_type,
        headers={
            "Content-Disposition": (
                f'{disposition}; filename="{att.original_filename}"; '
                f"filename*=UTF-8''{encoded_name}"
            )
        },
    )


@router.get("/duty-contacts/self/status", response_model=DutyContactStatus)
async def self_contact_status(
    contact_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_duty_contact_schema(session)
    contact = await get_self_contact_today(session, user, contact_date)
    if not contact:
        return DutyContactStatus(registered=False, contact=None)
    unit = await session.get(Unit, contact.unit_id) if contact.unit_id else None
    return DutyContactStatus(
        registered=True,
        contact=DutyContactRead(
            id=contact.id,
            contact_date=contact.contact_date,
            unit_id=contact.unit_id,
            unit_name=unit.name if unit else None,
            duty_post_id=contact.duty_post_id,
            post_type=user.post_type,
            rank=format_rank(contact.rank),
            full_name=contact.full_name,
            post_name=contact.post_name,
            phone=contact.phone,
            room=contact.room,
            note=contact.note,
        ),
    )


@router.post("/duty-contacts/self", response_model=DutyContactRead)
async def register_self_contact_route(
    body: DutySelfRegister,
    contact_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_duty_contact_schema(session)
    try:
        contact = await register_self_contact(session, user, body, contact_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    unit = await session.get(Unit, contact.unit_id)
    return DutyContactRead(
        id=contact.id,
        contact_date=contact.contact_date,
        unit_id=contact.unit_id,
        unit_name=unit.name if unit else None,
        duty_post_id=contact.duty_post_id,
        post_type=user.post_type,
        rank=format_rank(contact.rank),
        full_name=contact.full_name,
        post_name=contact.post_name,
        phone=contact.phone,
        room=contact.room,
        note=contact.note,
    )


@router.post("/duty-contacts/self/shift-change")
async def shift_change_route(
    contact_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_duty_contact_schema(session)
    try:
        changed = await shift_change_self_contact(session, user, contact_date)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if changed:
        await log_action(
            session,
            user.auth_kind,
            user.user_id or user.duty_post_id or 0,
            user.display_name,
            "duty_shift_change",
            "duty_post",
            user.duty_post_id,
        )
        cleared_scopes, notify_rooms = await clear_chats_on_shift_change(session, user)
        if cleared_scopes:
            await ws_manager.broadcast_event(
                notify_rooms,
                "CHAT_CLEARED",
                {"faculty_ids": cleared_scopes, "post_id": user.duty_post_id},
            )
        await ws_manager.broadcast_event(
            notify_rooms or ws_rooms_for_duty_user(user),
            "DUTY_SHIFT_CHANGED",
            {"post_id": user.duty_post_id},
        )
    return {"ok": True, "changed": changed}


@router.get("/duty-contacts", response_model=list[DutyContactRead])
async def list_contacts(
    contact_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_duty_contact_schema(session)
    return await list_contacts_for_user(session, user, contact_date)


@router.put("/duty-contacts", response_model=DutyContactRead)
async def upsert_contact(
    body: DutyContactUpsert,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    await ensure_duty_contact_schema(session)
    contact_date = body.contact_date or date.today()
    result = await session.execute(
        select(DutyContact).where(
            DutyContact.contact_date == contact_date,
            DutyContact.unit_id == body.unit_id,
        )
    )
    contact = result.scalar_one_or_none()
    if contact:
        contact.post_name = body.post_name
        contact.phone = body.phone
        contact.room = body.room
        contact.note = body.note
    else:
        contact = DutyContact(
            contact_date=contact_date,
            unit_id=body.unit_id,
            post_name=body.post_name,
            phone=body.phone,
            room=body.room,
            note=body.note,
        )
        session.add(contact)
    await session.flush()
    unit = await session.get(Unit, contact.unit_id)
    return DutyContactRead(
        id=contact.id,
        contact_date=contact.contact_date,
        unit_id=contact.unit_id,
        unit_name=unit.name if unit else None,
        duty_post_id=contact.duty_post_id,
        post_type=user.post_type,
        rank=format_rank(contact.rank),
        full_name=contact.full_name,
        post_name=contact.post_name,
        phone=contact.phone,
        room=contact.room,
        note=contact.note,
    )
