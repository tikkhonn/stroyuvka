/** Названия расположений ОШС (id 1001–1003). */
export const LOCATION_ACADEMY = 1001;

const LOCATION_NAMES: Record<number, string> = {
  [LOCATION_ACADEMY]: "Академия",
  1002: "ВГ №6 (Пушкин)",
  1003: "ВГ №61 (Лехтуси)",
};

export const KNOWN_LOCATIONS = Object.entries(LOCATION_NAMES).map(([id, name]) => ({
  id: Number(id),
  name,
}));
