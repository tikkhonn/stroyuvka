from datetime import date

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuthKind, DutyPostType
from app.models import DutyContact, DutyPost, Unit
from app.schemas import AuthUser, DutyContactRead, DutySelfRegister
from app.services.org import get_courses_for_faculty
from app.services.people import format_rank, validate_rank


async def ensure_duty_contact_schema(session: AsyncSession) -> None:
    await session.execute(
        text("ALTER TABLE duty_contacts ADD COLUMN IF NOT EXISTS duty_post_id INTEGER")
    )
    await session.execute(
        text("ALTER TABLE duty_contacts ADD COLUMN IF NOT EXISTS rank VARCHAR(64)")
    )
    await session.execute(
        text("ALTER TABLE duty_contacts ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)")
    )
    await session.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_duty_contact_post_date "
            "ON duty_contacts (contact_date, duty_post_id) "
            "WHERE duty_post_id IS NOT NULL"
        )
    )
    await _migrate_legacy_contacts(session)
    await session.flush()


async def _migrate_legacy_contacts(session: AsyncSession) -> None:
    """Bind orphan cards (duty_post_id IS NULL) to the only post on their unit."""
    orphan_result = await session.execute(
        select(DutyContact).where(DutyContact.duty_post_id.is_(None))
    )
    for contact in orphan_result.scalars().all():
        posts_result = await session.execute(
            select(DutyPost).where(
                DutyPost.unit_id == contact.unit_id,
                DutyPost.is_active.is_(True),
            )
        )
        posts = list(posts_result.scalars().all())
        if len(posts) == 1:
            contact.duty_post_id = posts[0].id


def _contact_label(post: DutyPost | None, rank: str, full_name: str) -> str:
    if post:
        return f"{post.name}: {rank} {full_name}"
    return f"{rank} {full_name}"


async def get_self_contact_today(
    session: AsyncSession, user: AuthUser, contact_date: date
) -> DutyContact | None:
    if user.auth_kind != AuthKind.DUTY_POST.value or not user.duty_post_id:
        return None
    result = await session.execute(
        select(DutyContact).where(
            DutyContact.contact_date == contact_date,
            DutyContact.duty_post_id == user.duty_post_id,
        )
    )
    contact = result.scalar_one_or_none()
    if contact:
        return contact
    return await _find_claimable_legacy_contact(session, user, contact_date)


async def _find_claimable_legacy_contact(
    session: AsyncSession,
    user: AuthUser,
    contact_date: date,
) -> DutyContact | None:
    if user.unit_id is None:
        return None
    result = await session.execute(
        select(DutyContact).where(
            DutyContact.contact_date == contact_date,
            DutyContact.unit_id == user.unit_id,
            DutyContact.duty_post_id.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def register_self_contact(
    session: AsyncSession,
    user: AuthUser,
    body: DutySelfRegister,
    contact_date: date,
) -> DutyContact:
    if user.auth_kind != AuthKind.DUTY_POST.value or not user.duty_post_id:
        raise ValueError("Только для постов наряда")
    if user.unit_id is None:
        raise ValueError("Нет привязки к подразделению")

    rank = validate_rank(body.rank.strip())
    full_name = body.full_name.strip()
    phone = body.phone.strip()
    if not full_name or not phone:
        raise ValueError("Заполните звание, ФИО и телефон")

    post = await session.get(DutyPost, user.duty_post_id)
    existing = await get_self_contact_today(session, user, contact_date)
    label = _contact_label(post, rank, full_name)

    if existing:
        existing.rank = rank
        existing.full_name = full_name
        existing.phone = phone
        existing.post_name = label
        existing.unit_id = user.unit_id
        existing.duty_post_id = user.duty_post_id
        contact = existing
    else:
        contact = DutyContact(
            contact_date=contact_date,
            unit_id=user.unit_id,
            duty_post_id=user.duty_post_id,
            rank=rank,
            full_name=full_name,
            post_name=label,
            phone=phone,
        )
        session.add(contact)

    await session.flush()
    return contact


async def shift_change_self_contact(
    session: AsyncSession,
    user: AuthUser,
    contact_date: date,
) -> bool:
    """Смена наряда: удалить карточку дежурного, строевка за день не трогается."""
    if user.auth_kind != AuthKind.DUTY_POST.value or not user.duty_post_id:
        raise ValueError("Только для постов наряда")
    contact = await get_self_contact_today(session, user, contact_date)
    if not contact:
        return False
    await session.delete(contact)
    await session.flush()
    return True


async def admin_clear_duty_registration(
    session: AsyncSession,
    duty_post_id: int,
    contact_date: date,
) -> bool:
    """Админ: сбросить карточку дежурного — при входе снова появится стартовая форма."""
    result = await session.execute(
        select(DutyContact).where(
            DutyContact.contact_date == contact_date,
            DutyContact.duty_post_id == duty_post_id,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        return False
    await session.delete(contact)
    await session.flush()
    return True


async def _faculty_unit_ids(session: AsyncSession, faculty_id: int) -> set[int]:
    courses = await get_courses_for_faculty(session, faculty_id)
    return {faculty_id, *(c.id for c in courses)}


def _course_faculty_id(course_unit_id: int) -> int:
    return course_unit_id // 10


_POST_TYPE_ORDER = {
    DutyPostType.DPA.value: 0,
    DutyPostType.DPF.value: 1,
    DutyPostType.DPK.value: 2,
}


def _post_type_str(post_type) -> str:
    return post_type.value if hasattr(post_type, "value") else str(post_type or "")


def _contact_visible(
    user: AuthUser,
    contact_pt: str,
    contact_unit_id: int,
    faculty_id: int | None,
    faculty_unit_ids: set[int] | None,
) -> bool:
    if user.auth_kind != AuthKind.DUTY_POST.value:
        if user.shell == "admin":
            return True
        if user.shell == "chief":
            return contact_pt in (DutyPostType.DPA.value, DutyPostType.DPF.value)
        return False

    if user.post_type == DutyPostType.DPA.value:
        return contact_pt == DutyPostType.DPF.value

    if user.post_type == DutyPostType.DPF.value:
        if contact_pt == DutyPostType.DPA.value:
            return True
        if contact_pt == DutyPostType.DPF.value:
            return True
        if contact_pt == DutyPostType.DPK.value:
            return faculty_unit_ids is not None and contact_unit_id in faculty_unit_ids
        return False

    if user.post_type == DutyPostType.DPK.value:
        if contact_pt == DutyPostType.DPF.value:
            return faculty_id is not None and contact_unit_id == faculty_id
        if contact_pt == DutyPostType.DPK.value:
            return faculty_unit_ids is not None and contact_unit_id in faculty_unit_ids
        return False

    return False


async def get_duty_contact_on_date(
    session: AsyncSession,
    contact_date: date,
    unit_id: int,
    post_type: DutyPostType,
) -> DutyContact | None:
    """Дежурный, зарегистрировавшийся на посту unit_id в указанную дату."""
    result = await session.execute(
        select(DutyContact)
        .join(DutyPost, DutyContact.duty_post_id == DutyPost.id)
        .where(
            DutyContact.contact_date == contact_date,
            DutyContact.unit_id == unit_id,
            DutyContact.duty_post_id.isnot(None),
            DutyPost.post_type == post_type.value,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_contacts_for_user(
    session: AsyncSession,
    user: AuthUser,
    contact_date: date,
) -> list[DutyContactRead]:
    result = await session.execute(
        select(DutyContact, Unit.name.label("unit_name"), DutyPost.post_type)
        .join(Unit, Unit.id == DutyContact.unit_id, isouter=True)
        .join(DutyPost, DutyPost.id == DutyContact.duty_post_id, isouter=True)
        .where(DutyContact.contact_date == contact_date)
    )
    rows = result.all()

    faculty_id: int | None = None
    faculty_unit_ids: set[int] | None = None
    if user.auth_kind == AuthKind.DUTY_POST.value and user.unit_id:
        if user.post_type == DutyPostType.DPK.value:
            faculty_id = _course_faculty_id(user.unit_id)
            faculty_unit_ids = await _faculty_unit_ids(session, faculty_id)
        elif user.post_type == DutyPostType.DPF.value:
            faculty_id = user.unit_id
            faculty_unit_ids = await _faculty_unit_ids(session, faculty_id)

    out: list[DutyContactRead] = []
    for contact, unit_name, post_type in rows:
        if user.duty_post_id and contact.duty_post_id == user.duty_post_id:
            continue
        pt = _post_type_str(post_type)
        if user.shell == "admin":
            visible = True
        elif user.shell == "chief":
            visible = pt in (DutyPostType.DPA.value, DutyPostType.DPF.value)
        elif user.auth_kind == AuthKind.DUTY_POST.value:
            visible = _contact_visible(
                user, pt, contact.unit_id, faculty_id, faculty_unit_ids
            )
        else:
            visible = False
        if not visible:
            continue
        out.append(
            DutyContactRead(
                id=contact.id,
                contact_date=contact.contact_date,
                unit_id=contact.unit_id,
                unit_name=unit_name,
                duty_post_id=contact.duty_post_id,
                post_type=pt or None,
                rank=format_rank(contact.rank),
                full_name=contact.full_name,
                post_name=contact.post_name,
                phone=contact.phone,
                room=contact.room,
                note=contact.note,
            )
        )

    out.sort(
        key=lambda c: (
            _POST_TYPE_ORDER.get(c.post_type or "", 99),
            c.unit_id,
            c.id,
        )
    )
    return out
