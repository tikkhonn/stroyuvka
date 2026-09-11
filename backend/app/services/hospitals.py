from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Hospital
from app.schemas import HospitalCreate, HospitalUpdate


async def list_hospitals(
    session: AsyncSession, *, active_only: bool = False
) -> list[Hospital]:
    stmt = select(Hospital).order_by(Hospital.sort_order, Hospital.name, Hospital.id)
    if active_only:
        stmt = stmt.where(Hospital.is_active.is_(True))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_active_hospital(session: AsyncSession, hospital_id: int) -> Hospital:
    hospital = await session.get(Hospital, hospital_id)
    if not hospital or not hospital.is_active:
        raise ValueError("Мед. учреждение не найдено или скрыто")
    return hospital


async def create_hospital(session: AsyncSession, body: HospitalCreate) -> Hospital:
    name = body.name.strip()
    if not name:
        raise ValueError("Укажите название мед. учреждения")
    row = Hospital(name=name, sort_order=body.sort_order, is_active=True)
    session.add(row)
    await session.flush()
    return row


async def update_hospital(
    session: AsyncSession, hospital_id: int, body: HospitalUpdate
) -> Hospital:
    hospital = await session.get(Hospital, hospital_id)
    if not hospital:
        raise ValueError("Мед. учреждение не найдено")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise ValueError("Укажите название мед. учреждения")
        hospital.name = name
    if body.sort_order is not None:
        hospital.sort_order = body.sort_order
    if body.is_active is not None:
        hospital.is_active = body.is_active
    await session.flush()
    return hospital
