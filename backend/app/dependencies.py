from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuthKind, DutyPostType, UserRole
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import DutyPost, User
from app.schemas import AuthUser
from app.services.org import get_unit_descendant_ids

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> AuthUser:
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется авторизация")
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Недействительный токен")

    auth_kind = payload.get("auth_kind")
    if auth_kind == AuthKind.USER.value:
        user = await session.get(User, payload.get("user_id"))
        if not user or not user.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
        shell = _shell_for_user_role(user.role)
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        return AuthUser(
            auth_kind=AuthKind.USER.value,
            role=role_str,
            shell=shell,
            user_id=user.id,
            unit_id=user.unit_id,
            display_name=user.full_name,
        )

    if auth_kind == AuthKind.DUTY_POST.value:
        post = await session.get(DutyPost, payload.get("duty_post_id"))
        if not post or not post.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пост не найден")
        return AuthUser(
            auth_kind=AuthKind.DUTY_POST.value,
            role=post.post_type.value if hasattr(post.post_type, "value") else str(post.post_type),
            shell="naryad",
            duty_post_id=post.id,
            unit_id=post.unit_id,
            display_name=post.name,
            post_type=post.post_type.value if hasattr(post.post_type, "value") else str(post.post_type),
        )

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неизвестный тип авторизации")


def _shell_for_user_role(role: UserRole | str) -> str:
    if role in (UserRole.ADMIN, UserRole.ADMIN.value, "admin"):
        return "admin"
    if role in (UserRole.CHIEF, UserRole.CHIEF.value, "chief"):
        return "chief"
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Доступ только для администратора или начальника")


async def assert_unit_access(
    session: AsyncSession, user: AuthUser, unit_id: int, write: bool = False
) -> None:
    if user.shell == "admin":
        return
    if user.shell == "chief":
        if write:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Только просмотр")
        return
    if user.auth_kind == AuthKind.DUTY_POST.value:
        if user.post_type == DutyPostType.DPA.value:
            if write:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "ДПА не вносит расход")
            return
        if user.unit_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет привязки к подразделению")
        allowed = await get_unit_descendant_ids(session, user.unit_id)
        if unit_id not in allowed and unit_id != user.unit_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к подразделению")
        return

    if user.unit_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет привязки к подразделению")
    allowed = await get_unit_descendant_ids(session, user.unit_id)
    if unit_id not in allowed and unit_id != user.unit_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к подразделению")


def require_shell(*shells: str):
    async def checker(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.shell not in shells:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")
        return user

    return checker


def require_duty_post(*post_types: DutyPostType):
    async def checker(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.auth_kind != AuthKind.DUTY_POST.value:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Только для постов наряда")
        if user.post_type not in [p.value for p in post_types]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав поста")
        return user

    return checker
