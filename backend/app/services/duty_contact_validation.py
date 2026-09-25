import re

_FULL_NAME_RE = re.compile(r"^[\s.\-A-Za-zА-Яа-яЁё]+$")
_PHONE_DIGITS_RE = re.compile(r"^\d+$")

DUTY_PHONE_MIN_LEN = 10
DUTY_PHONE_MAX_LEN = 11


def validate_duty_full_name(value: str) -> str:
    name = " ".join(value.split())
    if len(name) < 2:
        raise ValueError("Укажите фамилию (не короче 2 букв)")
    if not _FULL_NAME_RE.fullmatch(name):
        raise ValueError("ФИО: только буквы, пробелы, точки и дефис")
    return name


def validate_duty_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if not digits or not _PHONE_DIGITS_RE.fullmatch(digits):
        raise ValueError("Телефон: только цифры")
    if len(digits) < DUTY_PHONE_MIN_LEN or len(digits) > DUTY_PHONE_MAX_LEN:
        raise ValueError(
            f"Телефон: укажите {DUTY_PHONE_MIN_LEN} или {DUTY_PHONE_MAX_LEN} цифр "
            "(номер без пробелов и скобок)"
        )
    return digits
