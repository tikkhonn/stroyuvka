import { AbsenceCategoryOption, AbsenceEntry } from "../api/client";

function normalizeCategoryCode(code: string): string {
  if (code === "sick_med" || code === "sick_hosp") return "sick";
  if (code === "awol_other") return "other";
  return code;
}

function categoryOrderIndex(code: string, categories: AbsenceCategoryOption[]): number {
  const normalized = normalizeCategoryCode(code);
  const idx = categories.findIndex((c) => c.code === normalized);
  return idx >= 0 ? idx : categories.length;
}

export function compareDepartments(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc"
): number {
  const aTrim = a?.trim() ?? "";
  const bTrim = b?.trim() ?? "";
  const aEmpty = !aTrim;
  const bEmpty = !bTrim;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNum = /^\d+$/.test(aTrim);
  const bNum = /^\d+$/.test(bTrim);
  let diff: number;
  if (aNum && bNum) {
    diff = Number(aTrim) - Number(bTrim);
  } else if (aNum !== bNum) {
    diff = aNum ? -1 : 1;
  } else {
    diff = aTrim.localeCompare(bTrim, "ru");
  }
  return direction === "asc" ? diff : -diff;
}

export function compareAbsenceEntries(
  aPersonId: number,
  bPersonId: number,
  absenceByPersonId: Map<number, AbsenceEntry>,
  categories: AbsenceCategoryOption[],
  direction: "asc" | "desc"
): number {
  const aAbs = absenceByPersonId.get(aPersonId);
  const bAbs = absenceByPersonId.get(bPersonId);
  const aPresent = !aAbs;
  const bPresent = !bAbs;
  if (aPresent && bPresent) return 0;
  if (aPresent) return 1;
  if (bPresent) return -1;

  const aIdx = categoryOrderIndex(aAbs.category_code, categories);
  const bIdx = categoryOrderIndex(bAbs.category_code, categories);
  const diff = aIdx - bIdx;
  return direction === "asc" ? diff : -diff;
}
