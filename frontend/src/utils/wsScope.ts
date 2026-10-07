import { isNamedOfficerFaculty } from "./namedUnits";

const MAX_COURSE_YEAR = 5;

type DutyScope = {
  role: string;
  shell: string;
  unit_id: number | null;
};

function readFacultyId(payload: Record<string, unknown>): number | null {
  const raw = payload.faculty_id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Факультет поста ДПК: курс 21 → 2, группа именованного подразделения 20011 → 2001. */
export function facultyFromDutyCourse(unitId: number | null): number | null {
  if (unitId == null) return null;
  const faculty = Math.floor(unitId / 10);
  const course = unitId % 10;
  if (faculty < 1 || course < 1) return null;
  if (isNamedOfficerFaculty(faculty)) return faculty;
  if (course > MAX_COURSE_YEAR) return null;
  return faculty;
}

/**
 * ДПА, админ и строевой отдел обновляются на любое операционное событие.
 * ДПФ и ДПК — только если событие их факультета. Без faculty_id чужое не применяем.
 */
export function shouldReloadOperationalEvent(
  session: DutyScope | null,
  payload: Record<string, unknown>,
): boolean {
  if (!session) return false;
  if (session.role === "dpa" || session.shell === "admin" || session.shell === "chief") {
    return true;
  }
  if (session.role !== "dpf" && session.role !== "dpk") return false;

  const facultyId = readFacultyId(payload);
  if (facultyId == null) return false;
  if (session.role === "dpf") return session.unit_id === facultyId;
  return facultyFromDutyCourse(session.unit_id) === facultyId;
}
