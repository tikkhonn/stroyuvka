"""Загрузка и хранение вложений чата."""

from __future__ import annotations

import mimetypes
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models import ChatAttachment, ChatMessage, ChatPendingUpload
from app.schemas import AuthUser, ChatAttachmentRead, ChatMessageRead

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_FILES_PER_MESSAGE = 5
PENDING_TTL = timedelta(hours=1)

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
}

ALLOWED_MIME_PREFIXES = ("image/",)
ALLOWED_MIME_EXACT = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
}


def upload_root() -> Path:
    root = Path(settings.chat_upload_dir)
    if not root.is_absolute():
        backend_dir = Path(__file__).resolve().parents[2]
        root = backend_dir / root
    root.mkdir(parents=True, exist_ok=True)
    return root


async def ensure_chat_attachment_schema(session: AsyncSession) -> None:
    await session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS chat_attachments (
                id SERIAL PRIMARY KEY,
                message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                original_filename VARCHAR(512) NOT NULL,
                stored_path VARCHAR(1024) NOT NULL,
                content_type VARCHAR(128) NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )
    )
    await session.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_chat_attachments_message_id "
            "ON chat_attachments (message_id)"
        )
    )
    await session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS chat_pending_uploads (
                id SERIAL PRIMARY KEY,
                uploader_kind VARCHAR(32) NOT NULL,
                uploader_id INTEGER NOT NULL,
                faculty_id INTEGER REFERENCES units(id),
                original_filename VARCHAR(512) NOT NULL,
                stored_path VARCHAR(1024) NOT NULL,
                content_type VARCHAR(128) NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )
    )
    await session.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_chat_pending_uploads_uploader "
            "ON chat_pending_uploads (uploader_kind, uploader_id)"
        )
    )
    await session.flush()


def _uploader_key(user: AuthUser) -> tuple[str, int]:
    if user.duty_post_id:
        return user.auth_kind, user.duty_post_id
    if user.user_id:
        return user.auth_kind, user.user_id
    raise HTTPException(403, "Нет прав на загрузку в чат")


def _safe_filename(name: str) -> str:
    base = Path(name or "file").name
    return base[:200] if base else "file"


def _extension(name: str) -> str:
    ext = Path(name).suffix.lower()
    return ext if ext in ALLOWED_EXTENSIONS else ""


def _guess_content_type(filename: str, reported: str | None) -> str:
    if reported and reported != "application/octet-stream":
        return reported
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _validate_file(filename: str, content_type: str, size: int) -> None:
    if size <= 0:
        raise HTTPException(400, "Пустой файл")
    if size > MAX_FILE_BYTES:
        raise HTTPException(413, "Файл больше 8 МБ")
    ext = _extension(filename)
    if not ext:
        raise HTTPException(
            400,
            "Недопустимый тип файла. Разрешены: фото (jpg, png, webp, gif) и документы (pdf, doc, docx, xls, xlsx)",
        )
    if content_type.startswith(ALLOWED_MIME_PREFIXES):
        return
    if content_type in ALLOWED_MIME_EXACT:
        return
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"} and content_type.startswith("image/"):
        return
    raise HTTPException(400, f"Недопустимый тип файла: {content_type or 'unknown'}")


def is_image_content_type(content_type: str) -> bool:
    return content_type.startswith("image/")


def _absolute_path(stored_path: str) -> Path:
    return upload_root() / stored_path


def unlink_stored_path(stored_path: str) -> None:
    path = _absolute_path(stored_path)
    if path.is_file():
        path.unlink(missing_ok=True)


async def cleanup_stale_pending(session: AsyncSession) -> None:
    cutoff = datetime.now(timezone.utc) - PENDING_TTL
    result = await session.execute(
        select(ChatPendingUpload).where(ChatPendingUpload.created_at < cutoff)
    )
    stale = list(result.scalars().unique().all())
    for row in stale:
        unlink_stored_path(row.stored_path)
        await session.delete(row)
    if stale:
        await session.flush()


async def save_pending_upload(
    session: AsyncSession,
    user: AuthUser,
    faculty_id: int | None,
    file: UploadFile,
) -> ChatPendingUpload:
    await ensure_chat_attachment_schema(session)
    await cleanup_stale_pending(session)

    uploader_kind, uploader_id = _uploader_key(user)
    filename = _safe_filename(file.filename or "file")
    content = await file.read()
    content_type = _guess_content_type(filename, file.content_type)
    _validate_file(filename, content_type, len(content))

    ext = _extension(filename)
    token = uuid.uuid4().hex
    rel = f"pending/{uploader_id}/{token}{ext}"
    abs_path = _absolute_path(rel)
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(content)

    row = ChatPendingUpload(
        uploader_kind=uploader_kind,
        uploader_id=uploader_id,
        faculty_id=faculty_id,
        original_filename=filename,
        stored_path=rel,
        content_type=content_type,
        size_bytes=len(content),
    )
    session.add(row)
    await session.flush()
    return row


async def attach_pending_to_message(
    session: AsyncSession,
    user: AuthUser,
    faculty_id: int | None,
    message_id: int,
    upload_ids: list[int],
) -> list[ChatAttachment]:
    if len(upload_ids) > MAX_FILES_PER_MESSAGE:
        raise HTTPException(400, f"Не больше {MAX_FILES_PER_MESSAGE} файлов в сообщении")

    if not upload_ids:
        return []

    uploader_kind, uploader_id = _uploader_key(user)
    result = await session.execute(
        select(ChatPendingUpload).where(ChatPendingUpload.id.in_(upload_ids))
    )
    pending_rows = list(result.scalars().all())
    if len(pending_rows) != len(upload_ids):
        raise HTTPException(400, "Один или несколько файлов не найдены")

    for row in pending_rows:
        if row.uploader_kind != uploader_kind or row.uploader_id != uploader_id:
            raise HTTPException(403, "Файл загружен другим пользователем")
        if row.faculty_id != faculty_id:
            raise HTTPException(400, "Файл загружен для другого канала чата")

    attachments: list[ChatAttachment] = []
    dest_dir = upload_root() / str(message_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    for row in pending_rows:
        ext = Path(row.original_filename).suffix.lower()
        token = uuid.uuid4().hex
        new_rel = f"{message_id}/{token}{ext}"
        src = _absolute_path(row.stored_path)
        dst = _absolute_path(new_rel)
        shutil.move(str(src), str(dst))

        att = ChatAttachment(
            message_id=message_id,
            original_filename=row.original_filename,
            stored_path=new_rel,
            content_type=row.content_type,
            size_bytes=row.size_bytes,
        )
        session.add(att)
        attachments.append(att)
        await session.delete(row)

    await session.flush()
    return attachments


async def delete_pending_for_uploader(
    session: AsyncSession,
    uploader_kind: str,
    uploader_id: int,
) -> None:
    result = await session.execute(
        select(ChatPendingUpload).where(
            ChatPendingUpload.uploader_kind == uploader_kind,
            ChatPendingUpload.uploader_id == uploader_id,
        )
    )
    for row in result.scalars().all():
        unlink_stored_path(row.stored_path)
        await session.delete(row)
    await session.flush()


def message_to_read(
    msg: ChatMessage,
    attachments: list[ChatAttachment] | None = None,
) -> ChatMessageRead:
    source = attachments if attachments is not None else (msg.attachments or [])
    attachment_reads = [
        ChatAttachmentRead(
            id=a.id,
            original_filename=a.original_filename,
            content_type=a.content_type,
            size_bytes=a.size_bytes,
        )
        for a in source
    ]
    return ChatMessageRead(
        id=msg.id,
        sender_kind=msg.sender_kind,
        sender_id=msg.sender_id,
        sender_name=msg.sender_name,
        recipient_kind=msg.recipient_kind,
        recipient_id=msg.recipient_id,
        faculty_id=msg.faculty_id,
        body=msg.body,
        created_at=msg.created_at,
        attachments=attachment_reads,
    )


def ws_message_payload(
    msg: ChatMessage,
    faculty_id: int | None,
    attachments: list[ChatAttachment] | None = None,
) -> dict:
    source = attachments if attachments is not None else (msg.attachments or [])
    return {
        "id": msg.id,
        "sender_kind": msg.sender_kind,
        "sender_id": msg.sender_id,
        "sender_name": msg.sender_name,
        "body": msg.body,
        "created_at": str(msg.created_at),
        "faculty_id": faculty_id,
        "attachments": [
            {
                "id": a.id,
                "original_filename": a.original_filename,
                "content_type": a.content_type,
                "size_bytes": a.size_bytes,
            }
            for a in source
        ],
    }


async def get_attachment_with_access(
    session: AsyncSession,
    attachment_id: int,
) -> tuple[ChatAttachment, ChatMessage]:
    result = await session.execute(
        select(ChatAttachment)
        .options(selectinload(ChatAttachment.message))
        .where(ChatAttachment.id == attachment_id)
    )
    att = result.scalar_one_or_none()
    if not att or not att.message:
        raise HTTPException(404, "Вложение не найдено")
    return att, att.message
