from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuthKind, UserRole
from app.core.security import (
    create_access_token,
    verify_password,
)
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models import DutyPost, User
from app.schemas import (
    AuthUser,
    DutyLoginRequest,
    LoginRequest,
    TokenResponse,
)
from app.services.audit import log_action

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: AuthUser, token: str) -> TokenResponse:
    return TokenResponse(
        access_token=token,
        auth_kind=user.auth_kind,
        role=user.role,
        shell=user.shell,
        unit_id=user.unit_id,
        duty_post_id=user.duty_post_id,
        display_name=user.display_name,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")

    role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_str not in (UserRole.ADMIN.value, UserRole.CHIEF.value):
        raise HTTPException(403, "Вход по учётной записи только для администратора или начальника")

    shell = "admin" if role_str == UserRole.ADMIN.value else "chief"
    token = create_access_token(
        {
            "auth_kind": AuthKind.USER.value,
            "user_id": user.id,
            "role": role_str,
            "shell": shell,
        }
    )
    auth_user = AuthUser(
        auth_kind=AuthKind.USER.value,
        role=role_str,
        shell=shell,
        user_id=user.id,
        unit_id=user.unit_id,
        display_name=user.full_name,
    )
    await log_action(session, AuthKind.USER.value, user.id, user.full_name, "login")
    return _token_response(auth_user, token)


@router.post("/duty-login", response_model=TokenResponse)
async def duty_login(body: DutyLoginRequest, session: AsyncSession = Depends(get_db)):
    login = body.login_name.strip().lower()
    result = await session.execute(
        select(DutyPost).where(
            DutyPost.is_active.is_(True),
            DutyPost.login_name == login,
        )
    )
    matched = result.scalar_one_or_none()
    if not matched or not verify_password(body.password, matched.key_hash):
        raise HTTPException(401, "Неверный логин или пароль")

    post_type = (
        matched.post_type.value
        if hasattr(matched.post_type, "value")
        else str(matched.post_type)
    )
    token = create_access_token(
        {
            "auth_kind": AuthKind.DUTY_POST.value,
            "duty_post_id": matched.id,
            "post_type": post_type,
            "unit_id": matched.unit_id,
            "shell": "naryad",
        }
    )
    auth_user = AuthUser(
        auth_kind=AuthKind.DUTY_POST.value,
        role=post_type,
        shell="naryad",
        duty_post_id=matched.id,
        unit_id=matched.unit_id,
        display_name=matched.name,
        post_type=post_type,
    )
    await log_action(
        session, AuthKind.DUTY_POST.value, matched.id, matched.name, "duty_login"
    )
    return _token_response(auth_user, token)


@router.get("/me", response_model=AuthUser)
async def me(user: AuthUser = Depends(get_current_user)):
    return user
