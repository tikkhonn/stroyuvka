from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user, require_shell
from app.models import AuditLog
from app.schemas import AuditLogRead, AuthUser

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
async def list_audit(
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(require_shell("admin")),
):
    result = await session.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())
