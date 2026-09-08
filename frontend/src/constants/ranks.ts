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
  const rank = row.rank?.trim();
  const name = row.last_name + (row.note ? ` (${row.note})` : "");
  return rank ? `${rank} ${name}` : name;
}
