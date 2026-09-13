/** Названия расположений ОШС (id 1001–1003). */
const LOCATION_NAMES: Record<number, string> = {
  1001: "Академия",
  1002: "ВГ №6 (Пушкин)",
  1003: "ВГ №61 (Лехтуси)",
};

export const KNOWN_LOCATIONS = Object.entries(LOCATION_NAMES).map(([id, name]) => ({
  id: Number(id),
  name,
}));
