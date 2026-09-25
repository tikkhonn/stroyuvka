/** Фамилия и инициалы: буквы (кириллица/латиница), пробел, точка, дефис. */
const FULL_NAME_CHAR = /[\p{L}\s.\-]/u;

export function filterDutyFullNameInput(raw: string): string {
  return [...raw].filter((ch) => FULL_NAME_CHAR.test(ch)).join("");
}

export function filterDutyPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 11);
}

export const DUTY_PHONE_MIN_LEN = 10;
export const DUTY_PHONE_MAX_LEN = 11;

export function validateDutyPhoneDigits(digits: string): string | null {
  if (digits.length < DUTY_PHONE_MIN_LEN) {
    return `Телефон: минимум ${DUTY_PHONE_MIN_LEN} цифр`;
  }
  if (digits.length > DUTY_PHONE_MAX_LEN) {
    return `Телефон: не более ${DUTY_PHONE_MAX_LEN} цифр`;
  }
  return null;
}

export function validateDutyFullName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return "Укажите фамилию (не короче 2 букв)";
  }
  if (!/^[\p{L}\s.\-]+$/u.test(trimmed)) {
    return "ФИО: только буквы, пробелы, точки и дефис";
  }
  return null;
}
