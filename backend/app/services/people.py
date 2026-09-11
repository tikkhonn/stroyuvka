import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Composition, UnitType
from app.models import Person, Unit, UnitStrength
from app.schemas import PersonRead


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


def parse_fio(value: str) -> tuple[str, str]:
    text = " ".join(value.split()).strip()
    if not text:
        raise ValueError("Укажите фамилию и инициалы в формате «Иванов И.И.»")
    match = _FIO_RE.match(text)
    if not match:
        raise ValueError("Укажите фамилию и инициалы в формате «Иванов И.И.»")
    last_name = format_last_name(match.group("last").strip())
    rest = match.group("init").strip()
    if _looks_like_initials(rest):
        initials = format_initials(rest)
    else:
        initials = initials_from_words(rest.split())
    if len([c for c in initials if c.isalpha()]) < 2:
        raise ValueError("Укажите инициалы в формате «И.И.»")
    return last_name, initials


def format_display_name(last_name: str, initials: str) -> str:
    last = last_name.strip()
    init = initials.strip()
    return f"{last} {init}" if init else last


def format_rank(value: str | None) -> str:
    text = " ".join((value or "").split()).strip()
    return text.casefold() if text else ""


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


def match_key(last_name: str, initials: str) -> tuple[str, str]:
    return normalize_last_name(last_name), normalize_initials(initials)


def display_last_name(person: Person) -> str:
    return format_display_name(person.last_name, person.first_name)


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
    initials: str,
    exclude_id: int | None = None,
) -> None:
    key = match_key(last_name, initials)
    people = await list_people(session, unit_id, include_inactive=False)
    for person in people:
        if exclude_id is not None and person.id == exclude_id:
            continue
        if match_key(person.last_name, person.first_name) == key:
            raise ValueError(
                f"В подразделении уже есть {person.last_name} {person.first_name}"
            )


async def create_person(
    session: AsyncSession,
    unit: Unit,
    rank: str,
    full_name: str,
    middle_name: str | None = None,
    department_code: str | None = None,
) -> Person:
    rank = format_rank(rank)
    if not rank:
        raise ValueError("Укажите звание")
    last_name, first_name = parse_fio(full_name)
    await assert_unique_in_unit(session, unit.id, last_name, first_name)
    person = Person(
        unit_id=unit.id,
        rank=rank,
        last_name=last_name,
        first_name=first_name,
        middle_name=(middle_name or "").strip() or None,
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
    if full_name is not None:
        next_last, next_first = parse_fio(full_name)
    next_active = person.is_active if is_active is None else is_active
    if next_active:
        await assert_unique_in_unit(
            session, person.unit_id, next_last, next_first, exclude_id=person.id
        )
    if rank is not None:
        person.rank = format_rank(rank)
        if not person.rank:
            raise ValueError("Укажите звание")
    if full_name is not None:
        person.last_name = next_last
        person.first_name = next_first
    if middle_name is not None:
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
    people: list[Person], last_name: str, initials: str
) -> tuple[list[Person], list[Person]]:
    key = match_key(last_name, initials)
    active = [
        p for p in people if p.is_active and match_key(p.last_name, p.first_name) == key
    ]
    inactive = [
        p
        for p in people
        if not p.is_active and match_key(p.last_name, p.first_name) == key
    ]
    return active, inactive
