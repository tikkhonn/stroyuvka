from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuthKind, DutyPostType
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models import ChatMessage, DutyContact, Unit
from app.schemas import (
    AuthUser,
    ChatMessageCreate,
    ChatMessageRead,
    DutyContactRead,
    DutyContactStatus,
    DutyContactUpsert,
    DutySelfRegister,
)
from app.services.audit import log_action
from app.services.chat_access import assert_can_read_chat, assert_can_send_chat, ws_rooms_for_duty_user
from app.services.chat_clear import clear_chats_on_shift_change
from app.services.duty_contacts import (
    ensure_duty_contact_schema,
    get_self_contact_today,
    list_contacts_for_user,
    register_self_contact,
    shift_change_self_contact,
)
from app.ws.manager import ws_manager

router = APIRouter(tags=["chat", "duty"])


@router.get("/chat/messages", response_model=list[ChatMessageRead])
async def list_messages(
    faculty_id: int | None = Query(None),
    limit: int = Query(50, le=200),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    scope = assert_can_read_chat(user, faculty_id)
    query = select(ChatMessage).order_by(ChatMessage.created_at.desc()).limit(limit)
    if scope is None:
        # Канал ДПА — только сообщения без привязки к факультету
        query = query.where(ChatMessage.faculty_id.is_(None))
    else:
        query = query.where(ChatMessage.faculty_id == scope)
    result = await session.execute(query)
    return list(reversed(list(result.scalars().all())))


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
        body=body.body,
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
            "faculty_id": save_faculty_id,
        },
    )
    return msg


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
            rank=contact.rank,
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
        rank=contact.rank,
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
        rank=contact.rank,
        full_name=contact.full_name,
        post_name=contact.post_name,
        phone=contact.phone,
        room=contact.room,
        note=contact.note,
    )
