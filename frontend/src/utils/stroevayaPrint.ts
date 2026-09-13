import { todayLocal } from "./date";

export function openPrintHtml(html: string, printWindow?: Window | null): Window {
  const w = printWindow ?? window.open("", "_blank");
  if (!w) {
    throw new Error("Разрешите всплывающие окна в браузере");
  }
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  w.location.replace(url);
  w.addEventListener(
    "load",
    () => {
      URL.revokeObjectURL(url);
    },
    { once: true }
  );
  return w;
}

export async function openDutyStroevkaPrint(options: {
  role: "dpk" | "dpf";
  unitId: number | null;
  reportDate?: string;
  printWindow?: Window | null;
}): Promise<void> {
  const reportDate = options.reportDate ?? todayLocal();
  if (!options.unitId) {
    throw new Error("Не определено подразделение");
  }

  const token = localStorage.getItem("token");
  const base = import.meta.env.VITE_API_URL || "";
  const params = new URLSearchParams({
    report_date: reportDate,
    scope: options.role === "dpk" ? "unit" : "faculty",
    unit_id: String(options.unitId),
  });

  const res = await fetch(`${base}/api/print/stroevaya?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const html = await res.text();
  if (!res.ok) {
    options.printWindow?.close();
    throw new Error(html.replace(/<[^>]+>/g, " ").trim() || "Ошибка печати");
  }

  openPrintHtml(html, options.printWindow);
}
