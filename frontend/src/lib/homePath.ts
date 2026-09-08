export function homePath(role: string, shell: string): string {
  if (shell === "admin") return "/admin/units";
  if (shell === "chief") return "/overview";
  if (role === "dpa") return "/chessboard";
  if (role === "dpf") return "/stroevka";
  return "/attendance";
}
