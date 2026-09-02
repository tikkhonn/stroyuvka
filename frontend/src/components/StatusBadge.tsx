import type { ReportStatus } from "../api/client";

const LABELS: Record<ReportStatus, string> = {
  draft: "Черновик",
  submitted: "Отправлено",
  approved: "Утверждено",
  rejected: "Возвращено",
};

const STYLES: Record<ReportStatus, string> = {
  draft: "bg-gray-200 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
