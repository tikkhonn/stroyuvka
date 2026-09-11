import enum


class UnitType(str, enum.Enum):
    LOCATION = "location"
    FACULTY = "faculty"
    COURSE = "course"
    DEPARTMENT = "department"
    OTHER = "other"


class Composition(str, enum.Enum):
    VARIABLE = "variable"
    PERMANENT = "permanent"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    CHIEF = "chief"


class DutyPostType(str, enum.Enum):
    DPK = "dpk"
    DPF = "dpf"
    DPA = "dpa"


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class AbsenceCategoryCode(str, enum.Enum):
    PRESENT = "present"
    DUTY = "duty"
    TRIP = "trip"
    LEAVE = "leave"
    SICK = "sick"
    DISMISSAL = "dismissal"  # увольнение
    AWAY_DORM = "away_dorm"  # вне общежития
    OTHER = "other"
    ARREST = "arrest"  # арест / гауптвахта
    # legacy (не используются в новом UI)
    SICK_MED = "sick_med"
    SICK_HOSP = "sick_hosp"
    AWOL_OTHER = "awol_other"


class AuthKind(str, enum.Enum):
    USER = "user"
    DUTY_POST = "duty_post"


# Категории для ввода ДПК/ДПФ (порядок столбцов)
ABSENCE_CATEGORY_DEFS: list[tuple[str, str, bool]] = [
    # code, label, detail_required
    ("duty", "Наряд", True),
    ("trip", "Командировка", False),
    ("leave", "Отпуск", False),
    ("sick", "Болен", False),
    ("dismissal", "Увольнение", False),
    ("away_dorm", "Вне общежития", False),
    ("other", "Прочее", False),
    ("arrest", "Арест", False),
]

DETAIL_REQUIRED_CODES = {c for c, _, req in ABSENCE_CATEGORY_DEFS if req}
