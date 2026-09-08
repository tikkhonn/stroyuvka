from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import get_db
from app.dependencies import require_shell
from app.models import User
from app.schemas import AuthUser, UserCreate, UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    result = await session.execute(select(User))
    return list(result.scalars().all())


@router.post("", response_model=UserRead)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    existing = await session.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Пользователь уже существует")
    u = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        unit_id=body.unit_id,
        full_name=body.full_name,
    )
    session.add(u)
    await session.flush()
    return u
