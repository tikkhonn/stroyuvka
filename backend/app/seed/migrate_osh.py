"""Сброс ОШС в БД: расположения 1001–1003, факультеты 1–9, удаление всех курсов."""

import asyncio

from app.db.session import async_session_factory, init_db
from app.services.faculty_admin import reset_osh_structure


async def main() -> None:
    await init_db()
    async with async_session_factory() as session:
        result = await reset_osh_structure(session, create_faculties=True)
        await session.commit()
        print("OK:", result)


if __name__ == "__main__":
    asyncio.run(main())
