"""Схема ID подразделений ОШС.

Расположения: 1001 — Академия, 1002 — Пушкин, 1003 — Лехтуси
  (высокие id, чтобы не пересекаться с факультетами 1–9 и курсами F×10+C)
Факультеты: id = номер факультета (1..99), без расположения (parent_id = null)
Курсы: id = номер_факультета × 10 + год обучения (1–5); parent = расположение
Кафедры: id = номер_факультета × 10 (10, 20, …), parent = факультет
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

COURSES_PER_FACULTY = 5
MAX_COURSE_YEAR = 5

LOCATION_ACADEMY = 1001
LOCATION_PUSHKIN = 1002
LOCATION_LEKHTUSI = 1003

LOCATION_NAMES: dict[int, str] = {
    LOCATION_ACADEMY: "Академия",
    LOCATION_PUSHKIN: "Пушкин",
    LOCATION_LEKHTUSI: "Лехтуси",
}

DEFAULT_COURSE_LOCATION_ID = LOCATION_ACADEMY


def faculty_id(faculty_number: int) -> int:
    return faculty_number


def course_id(faculty_number: int, course_number: int) -> int:
    if not 1 <= course_number <= MAX_COURSE_YEAR:
        raise ValueError(f"Номер курса должен быть от 1 до {MAX_COURSE_YEAR}")
    return faculty_number * 10 + course_number


def department_id(faculty_number: int) -> int:
    return faculty_number * 10


def parse_course_id(unit_id: int) -> tuple[int, int]:
    faculty_number, course_number = divmod(unit_id, 10)
    if faculty_number < 1 or not 1 <= course_number <= MAX_COURSE_YEAR:
        raise ValueError(f"Некорректный id курса: {unit_id}")
    return faculty_number, course_number


def course_display_name(faculty_number: int, course_number: int) -> str:
    return f"{course_number} курс ({faculty_number} фак)"


async def sync_units_id_sequence(session: AsyncSession) -> None:
    await session.execute(
        text(
            "SELECT setval(pg_get_serial_sequence('units', 'id'), "
            "(SELECT COALESCE(MAX(id), 1) FROM units))"
        )
    )
