from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def log_action(
    session: AsyncSession,
    actor_kind: str,
    actor_id: int,
    actor_name: str,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    details: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_kind=actor_kind,
        actor_id=actor_id,
        actor_name=actor_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )
    session.add(entry)
    await session.flush()
    return entry
