from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog
from app.schemas import LoginDayEntryRead, LoginDaySummaryRead

MSK = ZoneInfo("Europe/Moscow")
LOGIN_ACTIONS = ("login", "duty_login")


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


def _as_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


async def list_login_days(
    session: AsyncSession, *, days: int = 30
) -> list[LoginDaySummaryRead]:
    since_msk = datetime.now(MSK).date() - timedelta(days=days - 1)
    since_utc = datetime.combine(since_msk, datetime.min.time(), tzinfo=MSK).astimezone(
        timezone.utc
    )

    result = await session.execute(
        select(AuditLog)
        .where(AuditLog.action.in_(LOGIN_ACTIONS))
        .where(AuditLog.created_at >= since_utc)
        .order_by(AuditLog.created_at.asc())
    )
    rows = list(result.scalars().all())

    by_day: dict[date, dict[tuple[str, int], LoginDayEntryRead]] = {}
    for row in rows:
        created = _as_utc(row.created_at)
        day = created.astimezone(MSK).date()
        if day < since_msk:
            continue
        key = (row.actor_kind, row.actor_id)
        bucket = by_day.setdefault(day, {})
        if key not in bucket:
            bucket[key] = LoginDayEntryRead(
                actor_kind=row.actor_kind,
                actor_id=row.actor_id,
                actor_name=row.actor_name,
                first_login_at=created,
            )

    summaries: list[LoginDaySummaryRead] = []
    for day in sorted(by_day.keys(), reverse=True):
        entries = sorted(by_day[day].values(), key=lambda e: e.first_login_at)
        summaries.append(
            LoginDaySummaryRead(
                date=day,
                unique_count=len(entries),
                entries=entries,
            )
        )
    return summaries
