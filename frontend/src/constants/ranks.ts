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
  const order = new Map(RANK_SUGGESTIONS.map((rank, index) => [rank, index]));
  return [...set].sort(
    (a, b) =>
      (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b, "ru")
  );
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

export function formatAbsenceName(row: { rank?: string; last_name: string; note?: string | null }) {
  const rank = formatRank(row.rank);
  const name = row.last_name + (row.note ? ` (${row.note})` : "");
  return rank ? `${rank} ${name}` : name;
}
