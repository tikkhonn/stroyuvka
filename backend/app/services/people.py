import re

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Composition, UnitType
from app.models import Person, Unit, UnitStrength
from app.schemas import PersonRead

FIO_REQUIRED_MSG = "Укажите фамилию, имя и отчество полностью, без инициалов"
RANK_ABBR_MSG = "Воинское звание указывайте полностью, без сокращений"

RANK_ABBREVIATIONS: frozenset[str] = frozenset(
    {
        "к-т",
        "к-н",
        "ст.л-т",
        "ст. лейтенант",
        "мл.л-т",
        "мл. лейтенант",
        "п/п-к",
        "с-т",
        "пр-к",
        "ефр.",
        "ряд.",
        "полк.",
        "кап.",
    }
)

RANK_MIGRATION_MAP: dict[str, str] = {
    "к-т": "курсант",
    "к-н": "капитан",
    "ст.л-т": "старший лейтенант",
    "ст. лейтенант": "старший лейтенант",
    "мл.л-т": "младший лейтенант",
    "мл. лейтенант": "младший лейтенант",
    "п/п-к": "подполковник",
    "с-т": "сержант",
    "пр-к": "прапорщик",
    "ефр.": "ефрейтор",
    "ряд.": "рядовой",
    "полк.": "полковник",
    "кап.": "капитан",
}


def normalize_last_name(value: str) -> str:
    return " ".join(value.split()).casefold()


def normalize_initials(value: str) -> str:
    return "".join(ch for ch in value.casefold() if ch.isalpha())


def format_last_name(value: str) -> str:
    text = " ".join(value.split()).strip()
    if not text:
        return text
    return "-".join(
        part[:1].upper() + part[1:].lower() if part else part
        for part in text.split("-")
    )


def format_initials(raw: str) -> str:
    letters = [ch.upper() for ch in raw if ch.isalpha()]
    if len(letters) >= 2:
        return f"{letters[0]}.{letters[1]}."
    if len(letters) == 1:
        return f"{letters[0]}."
    return raw.strip()


def initials_from_words(words: list[str]) -> str:
    letters = [w[0].upper() for w in words if w and w[0].isalpha()]
    if len(letters) >= 2:
        return ".".join(letters[:2]) + "."
    if len(letters) == 1:
        return f"{letters[0]}."
    return ""


def _looks_like_initials(rest: str) -> bool:
    words = rest.split()
    if not words:
        return False
    for word in words:
        letters = "".join(ch for ch in word if ch.isalpha())
        if len(letters) > 2:
            return False
    return True


_FIO_RE = re.compile(
    r"^(?P<last>[А-ЯЁа-яё-]+(?:-[А-ЯЁа-яё-]+)?)\s+(?P<init>.+)$",
    re.UNICODE,
)

_FIO_FULL_RE = re.compile(
    r"^(?P<last>[А-ЯЁа-яё-]+(?:-[А-ЯЁа-яё-]+)?)\s+(?P<first>[А-ЯЁа-яё-]+)\s+(?P<middle>[А-ЯЁа-яё-]+)$",
    re.UNICODE,
)


def format_name_part(value: str) -> str:
    return format_last_name(value)


def parse_fio(value: str) -> tuple[str, str, str]:
    text = " ".join(value.split()).strip()
    if not text:
        raise ValueError(FIO_REQUIRED_MSG)
    match = _FIO_FULL_RE.match(text)
    if not match:
        loose = _FIO_RE.match(text)
        if loose and _looks_like_initials(loose.group("init").strip()):
            raise ValueError(FIO_REQUIRED_MSG)
        raise ValueError(FIO_REQUIRED_MSG)
    return (
        format_last_name(match.group("last").strip()),
        format_name_part(match.group("first").strip()),
        format_name_part(match.group("middle").strip()),
    )


def format_display_name(
    last_name: str, first_name: str, middle_name: str | None = None
) -> str:
    parts = [last_name.strip(), first_name.strip()]
    if middle_name and middle_name.strip():
        parts.append(middle_name.strip())
    return " ".join(part for part in parts if part)


def format_rank(value: str | None) -> str:
    text = " ".join((value or "").split()).strip()
    return text.casefold() if text else ""


def validate_rank(value: str | None) -> str:
    rank = format_rank(value)
    if not rank:
        raise ValueError("Укажите воинское звание")
    if "." in rank:
        raise ValueError(RANK_ABBR_MSG)
    if rank in RANK_ABBREVIATIONS:
        raise ValueError(RANK_ABBR_MSG)
    return rank


def normalize_department_code(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    cleaned = re.sub(r"[^\w]", "", text, flags=re.UNICODE)
    return cleaned or None


def department_display_name(code: str | None) -> str:
    if not code:
        return "Без кафедры"
    return f"Кафедра {code}"


def normalize_given_name(value: str) -> str:
    return " ".join(value.split()).casefold()


def match_key(last_name: str, initials: str) -> tuple[str, str]:
    return normalize_last_name(last_name), normalize_initials(initials)


def fio_key(last_name: str, first_name: str, middle_name: str | None) -> tuple[str, str, str]:
    return (
        normalize_last_name(last_name),
        normalize_given_name(first_name),
        normalize_given_name(middle_name or ""),
    )


def is_legacy_initials_record(person: Person) -> bool:
    if person.middle_name:
        return False
    return _looks_like_initials(person.first_name)


def initials_key_from_parts(last_name: str, first_name: str, middle_name: str) -> tuple[str, str]:
    initials = format_initials(f"{first_name[:1]}{middle_name[:1]}")
    return match_key(last_name, initials)


def display_last_name(person: Person) -> str:
    return format_display_name(person.last_name, person.first_name, person.middle_name)


def person_to_read(person: Person) -> PersonRead:
    display = display_last_name(person)
    base = PersonRead.model_validate(person)
    return base.model_copy(
        update={
            "full_name": display,
            "display_name": display,
            "rank": format_rank(person.rank),
        }
    )


def composition_for_unit(unit: Unit) -> Composition:
    if unit.composition is not None:
        return unit.composition
    if unit.type == UnitType.COURSE:
        from app.services.unit_ids import is_named_unit_id, parse_course_id

        try:
            faculty_number, _ = parse_course_id(unit.id)
            if is_named_unit_id(faculty_number):
                return Composition.PERMANENT
        except ValueError:
            pass
    if unit.type == UnitType.FACULTY:
        return Composition.PERMANENT
    return Composition.VARIABLE


async def count_active_people(session: AsyncSession, unit_id: int) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(Person)
        .where(Person.unit_id == unit_id, Person.is_active.is_(True))
    )
    return int(result.scalar_one())


async def sync_unit_strength_from_people(session: AsyncSession, unit_id: int) -> int:
    total = await count_active_people(session, unit_id)
    row = await session.get(UnitStrength, unit_id)
    if row is None:
        session.add(UnitStrength(unit_id=unit_id, total_list=total))
    else:
        row.total_list = total
    await session.flush()
    return total


async def list_people(
    session: AsyncSession, unit_id: int, include_inactive: bool = False
) -> list[Person]:
    stmt = select(Person).where(Person.unit_id == unit_id)
    if not include_inactive:
        stmt = stmt.where(Person.is_active.is_(True))
    stmt = stmt.order_by(Person.last_name, Person.first_name, Person.id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def assert_unique_in_unit(
    session: AsyncSession,
    unit_id: int,
    last_name: str,
    first_name: str,
    middle_name: str,
    exclude_id: int | None = None,
) -> None:
    key = fio_key(last_name, first_name, middle_name)
    people = await list_people(session, unit_id, include_inactive=False)
    for person in people:
        if exclude_id is not None and person.id == exclude_id:
            continue
        if is_legacy_initials_record(person):
            continue
        if fio_key(person.last_name, person.first_name, person.middle_name) == key:
            raise ValueError(
                f"В подразделении уже есть {format_display_name(last_name, first_name, middle_name)}"
            )


async def create_person(
    session: AsyncSession,
    unit: Unit,
    rank: str,
    full_name: str,
    middle_name: str | None = None,
    department_code: str | None = None,
) -> Person:
    rank = validate_rank(rank)
    last_name, first_name, parsed_middle = parse_fio(full_name)
    resolved_middle = parsed_middle if middle_name is None else (middle_name.strip() or None)
    if middle_name is not None and middle_name.strip():
        resolved_middle = format_name_part(middle_name.strip())

    existing = await list_people(session, unit.id, include_inactive=True)
    active, inactive = find_match(existing, last_name, first_name, resolved_middle)
    if len(active) > 1 or (not active and len(inactive) > 1):
        raise ValueError(
            f"Конфликт: несколько записей {format_display_name(last_name, first_name, resolved_middle)}"
        )
    if len(active) == 1:
        if is_legacy_initials_record(active[0]):
            return await update_person(
                session,
                active[0],
                rank=rank,
                full_name=full_name,
                department_code=department_code,
                is_active=True,
            )
        raise ValueError(
            f"В подразделении уже есть {format_display_name(last_name, first_name, resolved_middle)}"
        )
    if len(inactive) == 1:
        return await update_person(
            session,
            inactive[0],
            rank=rank,
            full_name=full_name,
            department_code=department_code,
            is_active=True,
        )

    await assert_unique_in_unit(
        session, unit.id, last_name, first_name, resolved_middle or ""
    )
    person = Person(
        unit_id=unit.id,
        rank=rank,
        last_name=last_name,
        first_name=first_name,
        middle_name=resolved_middle,
        department_code=normalize_department_code(department_code),
        composition=composition_for_unit(unit),
        is_active=True,
    )
    session.add(person)
    await session.flush()
    await sync_unit_strength_from_people(session, unit.id)
    return person


async def update_person(
    session: AsyncSession,
    person: Person,
    *,
    rank: str | None = None,
    full_name: str | None = None,
    middle_name: str | None = None,
    department_code: str | None = None,
    department_code_set: bool = False,
    is_active: bool | None = None,
) -> Person:
    next_last = person.last_name
    next_first = person.first_name
    next_middle = person.middle_name or ""
    if full_name is not None:
        next_last, next_first, next_middle = parse_fio(full_name)
    elif middle_name is not None:
        next_middle = middle_name.strip() or ""
    next_active = person.is_active if is_active is None else is_active
    if next_active:
        await assert_unique_in_unit(
            session,
            person.unit_id,
            next_last,
            next_first,
            next_middle,
            exclude_id=person.id,
        )
    if rank is not None:
        person.rank = validate_rank(rank)
    if full_name is not None:
        person.last_name = next_last
        person.first_name = next_first
        person.middle_name = next_middle or None
    elif middle_name is not None:
        person.middle_name = middle_name.strip() or None
    if department_code_set:
        person.department_code = normalize_department_code(department_code)
    if is_active is not None:
        person.is_active = is_active
    await session.flush()
    await sync_unit_strength_from_people(session, person.unit_id)
    return person


async def deactivate_person(session: AsyncSession, person: Person) -> Person:
    person.is_active = False
    await session.flush()
    await sync_unit_strength_from_people(session, person.unit_id)
    return person


def find_match(
    people: list[Person], last_name: str, first_name: str, middle_name: str | None
) -> tuple[list[Person], list[Person]]:
    target = fio_key(last_name, first_name, middle_name)

    def matches_full(person: Person) -> bool:
        if is_legacy_initials_record(person):
            return False
        return fio_key(person.last_name, person.first_name, person.middle_name) == target

    active = [p for p in people if p.is_active and matches_full(p)]
    inactive = [p for p in people if not p.is_active and matches_full(p)]
    if active or inactive:
        return active, inactive

    legacy_key = initials_key_from_parts(last_name, first_name, middle_name or "")
    active_legacy = [
        p
        for p in people
        if p.is_active and is_legacy_initials_record(p) and match_key(p.last_name, p.first_name) == legacy_key
    ]
    inactive_legacy = [
        p
        for p in people
        if not p.is_active and is_legacy_initials_record(p) and match_key(p.last_name, p.first_name) == legacy_key
    ]
    return active_legacy, inactive_legacy


async def migrate_rank_abbreviations(session: AsyncSession) -> None:
    for old, new in RANK_MIGRATION_MAP.items():
        new_rank = format_rank(new)
        old_key = format_rank(old)
        for table in ("people", "absence_entries", "duty_contacts"):
            await session.execute(
                text(f"UPDATE {table} SET rank = :new_rank WHERE rank = :old_rank"),
                {"new_rank": new_rank, "old_rank": old_key},
            )
    await session.flush()
