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

export function formatAbsenceReason(
  code: string,
  statusDate: string,
  note?: string | null
): string {
  const detail = note?.trim();
  if (detail) return `${categoryLabel(code)} (${detail})`;
  return formatAbsenceCategory(code, statusDate);
}

export type AbsenceCategoryKey =
  | "duty"
  | "trip"
  | "leave"
  | "sick"
  | "dismissal"
  | "away_dorm"
  | "other";

export function normalizeAbsenceCategoryCode(code: string): AbsenceCategoryKey {
  if (code === "sick_med" || code === "sick_hosp") return "sick";
  if (code === "awol_other") return "other";
  if (
    code === "duty" ||
    code === "trip" ||
    code === "leave" ||
    code === "sick" ||
    code === "dismissal" ||
    code === "away_dorm" ||
    code === "other"
  ) {
    return code;
  }
  return "other";
}

/** Neutral styling for «По списку» / «Налицо» — not absence reasons. */
export const AGGREGATE_NEUTRAL_TEXT_CLASS = "text-gray-900";

/** Tailwind text color per absence reason (numbers + names). */
export const ABSENCE_CATEGORY_TEXT_CLASS: Record<AbsenceCategoryKey, string> = {
  duty: "text-blue-700",
  trip: "text-teal-700",
  leave: "text-lime-700",
  sick: "text-red-700",
  dismissal: "text-amber-800",
  away_dorm: "text-orange-700",
  other: "text-fuchsia-800",
};

/** Top bar gradient on summary cards — matches category colors above. */
export const ABSENCE_CATEGORY_BAR_CLASS: Record<AbsenceCategoryKey, string> = {
  duty: "bg-gradient-to-r from-blue-700 to-blue-500",
  trip: "bg-gradient-to-r from-teal-700 to-teal-500",
  leave: "bg-gradient-to-r from-lime-600 to-lime-400",
  sick: "bg-gradient-to-r from-red-600 to-red-400",
  dismissal: "bg-gradient-to-r from-amber-700 to-amber-500",
  away_dorm: "bg-gradient-to-r from-orange-600 to-orange-400",
  other: "bg-gradient-to-r from-fuchsia-700 to-fuchsia-500",
};

export const AGGREGATE_NEUTRAL_BAR_CLASS =
  "bg-gradient-to-r from-gray-500/90 to-gray-400/60";

/** Light row background per absence reason (roster / tables). */
export const ABSENCE_CATEGORY_ROW_CLASS: Record<AbsenceCategoryKey, string> = {
  duty: "bg-blue-100",
  trip: "bg-teal-100",
  leave: "bg-lime-100",
  sick: "bg-red-100",
  dismissal: "bg-amber-100",
  away_dorm: "bg-orange-100",
  other: "bg-fuchsia-100",
};

/** Hex for charts — matches Tailwind 700 palette above. */
export const ABSENCE_CATEGORY_HEX: Record<AbsenceCategoryKey, string> = {
  duty: "#1d4ed8",
  trip: "#0f766e",
  leave: "#4d7c0f",
  sick: "#b91c1c",
  dismissal: "#b45309",
  away_dorm: "#c2410c",
  other: "#a21caf",
};

export function absenceCategoryTextClass(code: string): string {
  return ABSENCE_CATEGORY_TEXT_CLASS[normalizeAbsenceCategoryCode(code)];
}

export function absenceCategoryRowClass(code: string): string {
  return ABSENCE_CATEGORY_ROW_CLASS[normalizeAbsenceCategoryCode(code)];
}

export function aggregateBarClass(key: keyof typeof ABSENCE_CATEGORY_BAR_CLASS | "total_list" | "present"): string {
  if (key === "total_list" || key === "present") return AGGREGATE_NEUTRAL_BAR_CLASS;
  return ABSENCE_CATEGORY_BAR_CLASS[key];
}
