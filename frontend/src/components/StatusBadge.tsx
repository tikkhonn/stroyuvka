import type { ReportStatus } from "../api/client";

const LABELS: Record<ReportStatus, string> = {
  draft: "Черновик",
  submitted: "Отправлено",
  approved: "Утверждено",
  rejected: "Возвращено",
};

const STYLES: Record<ReportStatus, string> = {
  draft: "bg-gray-100 text-gray-700 ring-gray-200",
  submitted: "bg-sky-50 text-sky-800 ring-sky-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
