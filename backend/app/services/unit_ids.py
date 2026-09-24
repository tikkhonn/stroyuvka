"""Схема ID подразделений ОШС.

Расположения: 1001 — Академия, 1002 — ВГ №6 (Пушкин), 1003 — ВГ №61 (Лехтуси)
  (высокие id, чтобы не пересекаться с факультетами 1–9 и курсами F×10+C)
Факультеты: id = номер факультета (1..99), без расположения (parent_id = null)
Курсы: id = номер_факультета × 10 + год обучения (1–5); parent = расположение
Кафедры: id = номер_факультета × 10 (10, 20, …), parent = факультет
Именованные подразделения: id = 2001..2999 (автовыдача), type=faculty, без курсов
"""

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Unit

COURSES_PER_FACULTY = 5
MAX_COURSE_YEAR = 5

LOCATION_ACADEMY = 1001
LOCATION_PUSHKIN = 1002
LOCATION_LEKHTUSI = 1003

LOCATION_NAMES: dict[int, str] = {
    LOCATION_ACADEMY: "Академия",
    LOCATION_PUSHKIN: "ВГ №6 (Пушкин)",
    LOCATION_LEKHTUSI: "ВГ №61 (Лехтуси)",
}

DEFAULT_COURSE_LOCATION_ID = LOCATION_ACADEMY

NAMED_UNIT_ID_BASE = 2001
NAMED_UNIT_ID_MAX = 2999


def is_named_unit_id(unit_id: int) -> bool:
    return NAMED_UNIT_ID_BASE <= unit_id <= NAMED_UNIT_ID_MAX


async def allocate_named_unit_id(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.max(Unit.id)).where(
            Unit.id >= NAMED_UNIT_ID_BASE,
            Unit.id <= NAMED_UNIT_ID_MAX,
        )
    )
    current_max = result.scalar_one_or_none()
    if current_max is None:
        return NAMED_UNIT_ID_BASE
    next_id = int(current_max) + 1
    if next_id > NAMED_UNIT_ID_MAX:
        raise ValueError(
            f"Исчерпан диапазон id для именованных подразделений ({NAMED_UNIT_ID_BASE}–{NAMED_UNIT_ID_MAX})"
        )
    return next_id


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
    if faculty_number < 1 or course_number < 1:
        raise ValueError(f"Некорректный id курса: {unit_id}")
    if is_named_unit_id(faculty_number):
        if course_number > 99:
            raise ValueError(f"Некорректный id группы: {unit_id}")
        return faculty_number, course_number
    if not 1 <= course_number <= MAX_COURSE_YEAR:
        raise ValueError(f"Некорректный id курса: {unit_id}")
    return faculty_number, course_number


def course_display_name(faculty_number: int, course_number: int) -> str:
    return f"{course_id(faculty_number, course_number)} курс"


async def sync_units_id_sequence(session: AsyncSession) -> None:
    await session.execute(
        text(
            "SELECT setval(pg_get_serial_sequence('units', 'id'), "
            "(SELECT COALESCE(MAX(id), 1) FROM units))"
        )
    )
