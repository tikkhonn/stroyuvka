export function parseCourseId(unitId: number): { faculty: number; course: number } {
  const faculty = Math.floor(unitId / 10);
  const course = unitId % 10;
  if (faculty < 1 || course < 1) throw new Error("bad course id");
  return { faculty, course };
}

export function courseDisplayName(unitId: number): string {
  return `${unitId} курс`;
}
