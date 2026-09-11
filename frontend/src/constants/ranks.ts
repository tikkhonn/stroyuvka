export function formatRank(rank: string | null | undefined): string {
  const text = (rank ?? "").trim().replace(/\s+/g, " ");
  return text ? text.toLocaleLowerCase("ru-RU") : "";
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
