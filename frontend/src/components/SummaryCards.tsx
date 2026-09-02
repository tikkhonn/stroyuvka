import type { AttendanceAggregate } from "../api/client";

type SummaryCardsProps = {
  agg: AttendanceAggregate;
  editableTotalList?: boolean;
  totalListDraft?: string;
  onTotalListChange?: (value: string) => void;
  onTotalListBlur?: () => void;
  totalListDisabled?: boolean;
};

export function SummaryCards({
  agg,
  editableTotalList,
  totalListDraft,
  onTotalListChange,
  onTotalListBlur,
  totalListDisabled,
}: SummaryCardsProps) {
  const absentCount =
    agg.duty + agg.trip + agg.leave + agg.sick + agg.dismissal + agg.away_dorm + agg.other;
  const draftTotal = Number(totalListDraft);
  const totalListValue =
    editableTotalList && totalListDraft !== undefined && !Number.isNaN(draftTotal)
      ? draftTotal
      : agg.total_list;
  const presentValue =
    editableTotalList && totalListDraft !== undefined && !Number.isNaN(draftTotal)
      ? Math.max(0, draftTotal - absentCount)
      : agg.present;

  const items = [
    { key: "total_list", label: "По списку", value: totalListValue, editable: editableTotalList },
    { key: "present", label: "Налицо", value: presentValue, editable: false },
    { key: "duty", label: "Наряд", value: agg.duty, editable: false },
    { key: "trip", label: "Командировка", value: agg.trip, editable: false },
    { key: "leave", label: "Отпуск", value: agg.leave, editable: false },
    { key: "sick", label: "Болен", value: agg.sick, editable: false },
    { key: "dismissal", label: "Увольнение", value: agg.dismissal, editable: false },
    { key: "away_dorm", label: "Вне общежития", value: agg.away_dorm, editable: false },
    { key: "other", label: "Прочее", value: agg.other, editable: false },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3 mb-6">
      {items.map((item) => (
        <div
          key={item.key}
          className="bg-white border border-gray-200 rounded-lg p-3 text-center shadow-sm"
        >
          {item.editable ? (
            <input
              type="number"
              min={0}
              value={totalListDraft ?? String(item.value)}
              disabled={totalListDisabled}
              onChange={(e) => onTotalListChange?.(e.target.value)}
              onBlur={onTotalListBlur}
              className="w-full text-center text-2xl font-bold text-vka-navy border border-gray-300 rounded px-1 py-0.5 disabled:bg-gray-100"
            />
          ) : (
            <p className="text-2xl font-bold text-vka-navy">{item.value}</p>
          )}
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide leading-tight">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}
