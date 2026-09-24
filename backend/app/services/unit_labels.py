"""Подписи блоков личного состава на уровне факультета (офицеры и именованные подразделения)."""

from app.models import Unit

OFFICERS_SHORT_LABEL = "Офицеры"


def attendance_option_name_for_faculty_roster(unit: Unit) -> str:
    return f"{OFFICERS_SHORT_LABEL} · {unit.name}"


def chessboard_faculty_subrow_name(unit: Unit) -> str:
    return OFFICERS_SHORT_LABEL


def print_roster_block_name(unit: Unit) -> str:
    return f"{OFFICERS_SHORT_LABEL} ({unit.name})"


def faculty_roster_blocker_label(unit: Unit) -> str:
    return OFFICERS_SHORT_LABEL


def sick_entry_labels_for_faculty_roster(unit: Unit) -> tuple[str, str | None, bool]:
    """unit_name, location_name, is_faculty_level_roster для сводки по больным."""
    return f"{OFFICERS_SHORT_LABEL} ({unit.name})", OFFICERS_SHORT_LABEL, True
