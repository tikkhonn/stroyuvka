import type { ReportStatus } from "../api/client";
import { formatSubmittedAt } from "../utils/date";

export function SubmittedReportStatus({
  status,
  submittedAt,
  isEditing = false,
}: {
  status: ReportStatus;
  submittedAt?: string | null;
  isEditing?: boolean;
}) {
  const isSent = status === "submitted" || status === "approved";
  if (isSent && isEditing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded border-2 border-amber-500 bg-amber-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-amber-900">
          Редактирование
        </span>
        {submittedAt ? (
          <span className="text-sm font-medium text-gray-700">
            Время: {formatSubmittedAt(submittedAt)}
          </span>
        ) : null}
      </div>
    );
  }
  if (isSent) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded border-2 border-emerald-500 bg-emerald-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-emerald-800">
          Отправлено
        </span>
        {submittedAt ? (
          <span className="text-sm font-medium text-gray-700">
            Время: {formatSubmittedAt(submittedAt)}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center rounded border-2 border-red-500 bg-red-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-red-800">
      Черновик
    </span>
  );
}
