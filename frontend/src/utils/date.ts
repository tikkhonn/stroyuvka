/** Локальная дата YYYY-MM-DD (без сдвига UTC). */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Дата ДД.ММ.ГГГГ из ISO-строки (принимает как дату, так и метку времени). */
export function formatDateRu(iso: string): string {
  const [y, m, day] = iso.slice(0, 10).split("-");
  if (y && m && day) return `${day}.${m}.${y}`;
  return iso;
}

/** Время и дата отправки: ЧЧ:ММ ДД.ММ.ГГГГ (локальный часовой пояс). */
export function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} ${day}.${month}.${year}`;
}
