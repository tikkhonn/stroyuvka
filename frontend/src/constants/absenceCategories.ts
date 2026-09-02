import { AbsenceCategoryOption } from "../api/client";

export const ABSENCE_CATEGORY_OPTIONS: AbsenceCategoryOption[] = [
  { code: "duty", label: "Наряд", detail_required: true },
  { code: "trip", label: "Командировка", detail_required: false },
  { code: "leave", label: "Отпуск", detail_required: false },
  { code: "sick", label: "Болен", detail_required: true },
  { code: "dismissal", label: "Увольнение", detail_required: false },
  { code: "away_dorm", label: "Вне общежития", detail_required: false },
  { code: "other", label: "Прочее", detail_required: false },
];

export const ABSENCE_CATEGORY_LABELS: Record<string, string> = {
  duty: "Наряд",
  trip: "Командировка",
  leave: "Отпуск",
  sick: "Болен",
  dismissal: "Увольнение",
  away_dorm: "Вне общежития",
  other: "Прочее",
  sick_med: "Болен",
  sick_hosp: "Болен",
  awol_other: "Прочее",
};

export function categoryLabel(code: string): string {
  return ABSENCE_CATEGORY_LABELS[code] || code;
}

export const PERSISTENT_ABSENCE_CODES = new Set([
  "sick",
  "trip",
  "leave",
  "sick_med",
  "sick_hosp",
]);

export function formatAbsenceCategory(code: string, statusDate: string): string {
  const label = categoryLabel(code);
  if (!PERSISTENT_ABSENCE_CODES.has(code)) return label;
  const d = statusDate.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${label} (с ${day}.${m}.${y})`;
  return label;
}
