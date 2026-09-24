export const NAMED_FACULTY_ID_MIN = 2001;
export const NAMED_FACULTY_ID_MAX = 2999;

export function isNamedOfficerFaculty(unitId: number): boolean {
  return unitId >= NAMED_FACULTY_ID_MIN && unitId <= NAMED_FACULTY_ID_MAX;
}
