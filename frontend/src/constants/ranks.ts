export function formatRank(rank: string | null | undefined): string {
  const text = (rank ?? "").trim().replace(/\s+/g, " ");
  return text ? text.toLocaleLowerCase("ru-RU") : "";
}

export function ranksMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return formatRank(a) === formatRank(b);
}

/** Частые звания для подсказки при вводе. */
export const RANK_SUGGESTIONS = [
  "рядовой",
  "ефрейтор",
  "младший сержант",
  "сержант",
  "старшина",
  "младший лейтенант",
  "лейтенант",
  "старший лейтенант",
  "капитан",
  "майор",
  "подполковник",
  "полковник",
];

const UNKNOWN_RANK_INDEX = 999;

const RANK_ORDER = new Map(RANK_SUGGESTIONS.map((rank, index) => [rank, index]));

/** Индекс звания в шкале RANK_SUGGESTIONS; неизвестные — 999, пустые — 1000. */
export function rankSortIndex(rank: string | null | undefined): number {
  const normalized = formatRank(rank);
  if (!normalized) return UNKNOWN_RANK_INDEX + 1;
  return RANK_ORDER.get(normalized) ?? UNKNOWN_RANK_INDEX;
}

export function compareRanks(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: "asc" | "desc"
): number {
  const aIdx = rankSortIndex(a);
  const bIdx = rankSortIndex(b);
  const aUnknown = aIdx >= UNKNOWN_RANK_INDEX;
  const bUnknown = bIdx >= UNKNOWN_RANK_INDEX;
  if (aUnknown && bUnknown) {
    return formatRank(a).localeCompare(formatRank(b), "ru");
  }
  if (aUnknown) return 1;
  if (bUnknown) return -1;
  const diff = aIdx - bIdx;
  return direction === "asc" ? diff : -diff;
}

export type PersonNameSortFields = {
  last_name: string;
  first_name: string;
  middle_name?: string | null;
};

/** Вторичная сортировка: всегда ФИО А–Я. */
export function comparePersonNamesAsc(a: PersonNameSortFields, b: PersonNameSortFields): number {
  return (
    a.last_name.localeCompare(b.last_name, "ru") ||
    a.first_name.localeCompare(b.first_name, "ru") ||
    (a.middle_name ?? "").localeCompare(b.middle_name ?? "", "ru")
  );
}

/** Уникальные звания из активного списка подразделения (порядок по RANK_SUGGESTIONS). */
export function ranksFromRoster(
  people: { is_active: boolean; rank: string }[]
): string[] {
  const set = new Set<string>();
  for (const person of people) {
    if (!person.is_active) continue;
    const rank = formatRank(person.rank);
    if (rank) set.add(rank);
  }
  return [...set].sort(
    (a, b) =>
      rankSortIndex(a) - rankSortIndex(b) || a.localeCompare(b, "ru")
  );
}

export function formatAbsenceName(row: { rank?: string; last_name: string; note?: string | null }) {
  const rank = formatRank(row.rank);
  const name = row.last_name + (row.note ? ` (${row.note})` : "");
  return rank ? `${rank} ${name}` : name;
}
