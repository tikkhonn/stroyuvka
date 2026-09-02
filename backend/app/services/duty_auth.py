from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DutyPostType
from app.core.security import hash_password
from app.models import DutyPost


def duty_login_name(post_type: DutyPostType | str, unit_id: int) -> str:
    pt = post_type.value if isinstance(post_type, DutyPostType) else str(post_type)
    if pt == DutyPostType.DPA.value:
        return "dpa"
    if pt == DutyPostType.DPF.value:
        return f"dpf-{unit_id}"
    if pt == DutyPostType.DPK.value:
        return f"dpk-{unit_id}"
    raise ValueError(f"Неизвестный тип поста: {pt}")


def default_duty_password(post_type: DutyPostType | str, unit_id: int) -> str:
    pt = post_type.value if isinstance(post_type, DutyPostType) else str(post_type)
    if pt == DutyPostType.DPA.value:
        return "dpa-naryad"
    if pt == DutyPostType.DPF.value:
        return f"dpf-{unit_id}"
    if pt == DutyPostType.DPK.value:
        return f"dpk-{unit_id}"
    raise ValueError(f"Неизвестный тип поста: {pt}")


def hash_duty_password(password: str) -> str:
    return hash_password(password)


async def ensure_duty_post_schema(session: AsyncSession) -> None:
    """login_name + статичные пароли; однократный сброс со старых ключей."""
    await session.execute(
        text(
            "ALTER TABLE duty_posts "
            "ADD COLUMN IF NOT EXISTS login_name VARCHAR(64)"
        )
    )
    await session.execute(
        text(
            "ALTER TABLE duty_posts "
            "ADD COLUMN IF NOT EXISTS credentials_version INTEGER DEFAULT 0"
        )
    )
    await session.flush()

    result = await session.execute(select(DutyPost))
    for post in result.scalars().all():
        if not post.login_name:
            post.login_name = duty_login_name(post.post_type, post.unit_id)
        version = int(getattr(post, "credentials_version", 0) or 0)
        if version < 1:
            post.key_hash = hash_duty_password(
                default_duty_password(post.post_type, post.unit_id)
            )
            post.credentials_version = 1

    await session.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_duty_posts_login_name "
            "ON duty_posts (login_name) WHERE login_name IS NOT NULL"
        )
    )
    await session.flush()
