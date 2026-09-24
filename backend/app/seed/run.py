from sqlalchemy import select

from app.core.enums import (
    AbsenceCategoryCode,
    DutyPostType,
    UserRole,
)
from app.core.security import hash_password
from app.db.session import async_session_factory, init_db
from app.models import (
    AbsenceCategory,
    AbsenceReason,
    DutyPost,
    Hospital,
    Unit,
    User,
)
from app.services.duty_auth import (
    default_duty_password,
    duty_login_name,
    hash_duty_password,
)
from app.services.faculty_admin import reset_osh_structure
from app.services.unit_ids import LOCATION_ACADEMY, sync_units_id_sequence

DEMO_ADMIN_PASSWORD = "admin123"
DEMO_CHIEF_PASSWORD = "nachalnik123"

CATEGORIES = [
    (AbsenceCategoryCode.PRESENT, "Налицо", 0),
    (AbsenceCategoryCode.DUTY, "Наряд", 1),
    (AbsenceCategoryCode.TRIP, "Командировка", 2),
    (AbsenceCategoryCode.LEAVE, "Отпуск", 3),
    (AbsenceCategoryCode.SICK, "Болен", 4),
    (AbsenceCategoryCode.DISMISSAL, "Увольнение", 5),
    (AbsenceCategoryCode.AWAY_DORM, "Вне общежития", 6),
    (AbsenceCategoryCode.OTHER, "Прочее", 7),
    (AbsenceCategoryCode.ARREST, "Арест", 8),
]

REASONS_BY_CODE = {
    AbsenceCategoryCode.DUTY: ["КПП", "Рота", "Дневальный"],
    AbsenceCategoryCode.SICK: ["Медпункт", "Госпиталь", "Дома"],
    AbsenceCategoryCode.TRIP: ["Командировка", "Учёба"],
    AbsenceCategoryCode.LEAVE: ["Отпуск"],
    AbsenceCategoryCode.DISMISSAL: ["Увольнение"],
    AbsenceCategoryCode.AWAY_DORM: ["Вне общежития"],
    AbsenceCategoryCode.OTHER: ["Прочее"],
}


async def seed_if_empty() -> None:
    async with async_session_factory() as session:
        result = await session.execute(select(Unit).limit(1))
        if result.scalar_one_or_none():
            await session.commit()
            return

        await reset_osh_structure(session, create_faculties=True)
        await sync_units_id_sequence(session)

        cat_map: dict[AbsenceCategoryCode, AbsenceCategory] = {}
        for code, label, order in CATEGORIES:
            cat = AbsenceCategory(code=code, label=label, sort_order=order)
            session.add(cat)
            cat_map[code] = cat
        await session.flush()

        for code, names in REASONS_BY_CODE.items():
            cat = cat_map[code]
            for name in names:
                session.add(AbsenceReason(category_id=cat.id, name=name))
        await session.flush()

        session.add(Hospital(name="Медпункт", sort_order=0, is_active=True))
        session.add(Hospital(name="Госпиталь", sort_order=1, is_active=True))
        await session.flush()

        session.add(
            DutyPost(
                unit_id=LOCATION_ACADEMY,
                post_type=DutyPostType.DPA,
                name="Дежурный по академии",
                login_name=duty_login_name(DutyPostType.DPA, LOCATION_ACADEMY),
                key_hash=hash_duty_password(
                    default_duty_password(DutyPostType.DPA, LOCATION_ACADEMY)
                ),
                credentials_version=1,
            )
        )

        session.add(
            User(
                username="admin",
                password_hash=hash_password(DEMO_ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                full_name="Администратор системы",
            )
        )

        session.add(
            User(
                username="nachalnik",
                password_hash=hash_password(DEMO_CHIEF_PASSWORD),
                role=UserRole.CHIEF,
                full_name="Строевой отдел",
            )
        )

        await session.commit()
        print("Seed completed.")
        print("  DPA:", duty_login_name(DutyPostType.DPA, LOCATION_ACADEMY), "/",
              default_duty_password(DutyPostType.DPA, LOCATION_ACADEMY))
        print("  Admin: admin /", DEMO_ADMIN_PASSWORD)
        print("  Chief: nachalnik /", DEMO_CHIEF_PASSWORD)
        print("  Locations: 1001 Академия, 1002 ВГ №6 (Пушкин), 1003 ВГ №61 (Лехтуси)")
        print("  Faculties: id 1–9 (без курсов — добавляйте в админке)")
        print("  Course IDs: F*10+C (14 = 1 фак 4 курс)")


async def ensure_chief_user() -> None:
    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.username == "nachalnik"))
        existing = result.scalar_one_or_none()
        if existing:
            if existing.full_name == "Начальник академии":
                existing.full_name = "Строевой отдел"
            await session.commit()
            return
        session.add(
            User(
                username="nachalnik",
                password_hash=hash_password(DEMO_CHIEF_PASSWORD),
                role=UserRole.CHIEF,
                full_name="Строевой отдел",
            )
        )
        await session.commit()
        print("Chief user created: nachalnik /", DEMO_CHIEF_PASSWORD)


async def main() -> None:
    from app.services.attendance import ensure_schema_patches
    from app.services.chat_attachments import ensure_chat_attachment_schema
    from app.services.duty_auth import ensure_duty_post_schema
    from app.services.duty_contacts import ensure_duty_contact_schema
    from app.services.people import migrate_rank_abbreviations

    await init_db()
    async with async_session_factory() as session:
        await ensure_schema_patches(session)
        await ensure_duty_post_schema(session)
        await ensure_duty_contact_schema(session)
        await ensure_chat_attachment_schema(session)
        await migrate_rank_abbreviations(session)
        await session.commit()
    await seed_if_empty()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
