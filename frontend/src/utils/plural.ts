/** «1 курс», «2 курса», «5 курсов», «0 курсов», «21 курс», «11 курсов». */
export function pluralCourses(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} курс`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} курса`;
  return `${n} курсов`;
}
