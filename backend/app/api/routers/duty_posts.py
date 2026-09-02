from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user, require_shell
from app.models import DutyPost
from app.schemas import (
    AuthUser,
    DutyPostClearRegistrationResult,
    DutyPostPasswordSet,
    DutyPostPasswordSetResult,
    DutyPostRead,
)
from app.services.audit import log_action
from app.services.duty_auth import duty_login_name, hash_duty_password
from app.services.duty_contacts import admin_clear_duty_registration, ensure_duty_contact_schema

router = APIRouter(prefix="/duty-posts", tags=["duty-posts"])


@router.get("", response_model=list[DutyPostRead])
async def list_posts(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    result = await session.execute(select(DutyPost).where(DutyPost.is_active.is_(True)))
    return list(result.scalars().all())


@router.post("/{post_id}/set-password", response_model=DutyPostPasswordSetResult)
async def set_post_password(
    post_id: int,
    body: DutyPostPasswordSet,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    post = await session.get(DutyPost, post_id)
    if not post or not post.is_active:
        raise HTTPException(404, "Пост наряда не найден")

    if not post.login_name:
        post.login_name = duty_login_name(post.post_type, post.unit_id)

    post.key_hash = hash_duty_password(body.password.strip())
    post.credentials_version = int(post.credentials_version or 0) + 1
    await session.flush()

    await log_action(
        session,
        user.auth_kind,
        user.user_id or 0,
        user.display_name,
        "duty_post_set_password",
        "duty_post",
        post.id,
        post.login_name,
    )

    return DutyPostPasswordSetResult(
        login_name=post.login_name,
        message=f"Пароль для «{post.login_name}» обновлён. Сообщите его дежурному.",
    )


@router.post("/{post_id}/clear-registration", response_model=DutyPostClearRegistrationResult)
async def clear_post_registration(
    post_id: int,
    contact_date: date = Query(default_factory=date.today),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    await ensure_duty_contact_schema(session)
    post = await session.get(DutyPost, post_id)
    if not post or not post.is_active:
        raise HTTPException(404, "Пост наряда не найден")

    cleared = await admin_clear_duty_registration(session, post_id, contact_date)
    if cleared:
        await log_action(
            session,
            user.auth_kind,
            user.user_id or 0,
            user.display_name,
            "duty_post_clear_registration",
            "duty_post",
            post.id,
            str(contact_date),
        )

    login = post.login_name or duty_login_name(post.post_type, post.unit_id)
    if cleared:
        return DutyPostClearRegistrationResult(
            cleared=True,
            message=f"Карточка «{login}» сброшена. При входе дежурный снова увидит форму регистрации.",
        )
    return DutyPostClearRegistrationResult(
        cleared=False,
        message=f"У «{login}» нет регистрации на {contact_date:%d.%m.%Y}.",
    )
