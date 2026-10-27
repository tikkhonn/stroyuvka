const FACULTY_ADMIN_CODE = /^управлен(?:ие|ия)\d*факультета$/u;

export function isFacultyAdministrationCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const compact = code.replace(/[^\p{L}\p{N}_]/gu, "").toLocaleLowerCase("ru");
  return FACULTY_ADMIN_CODE.test(compact);
}

export function departmentDisplayName(code: string | null | undefined): string {
  if (!code?.trim()) return "Без кафедры";
  if (isFacultyAdministrationCode(code)) return "Управление факультета";
  return `Кафедра ${code}`;
}

export function departmentRosterLabel(code: string | null | undefined): string {
  if (!code?.trim()) return "—";
  if (isFacultyAdministrationCode(code)) return "Управление факультета";
  return code;
}
