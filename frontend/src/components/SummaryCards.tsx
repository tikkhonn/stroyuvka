import type { AttendanceAggregate } from "../api/client";
import {
  type AbsenceCategoryKey,
  ABSENCE_CATEGORY_TEXT_CLASS,
  AGGREGATE_NEUTRAL_TEXT_CLASS,
  absenceCategoryTextClass,
  aggregateBarClass,
} from "../constants/absenceCategories";

type SummaryCardsProps = {
  agg: AttendanceAggregate;
};

const NEUTRAL_CLASS = AGGREGATE_NEUTRAL_TEXT_CLASS;

export function SummaryCards({ agg }: SummaryCardsProps) {
  const items: {
    key: keyof AttendanceAggregate;
    label: string;
    value: number;
    valueClass: string;
    barClass: string;
  }[] = [
    { key: "total_list", label: "По списку", value: agg.total_list, valueClass: NEUTRAL_CLASS, barClass: aggregateBarClass("total_list") },
    { key: "present", label: "Налицо", value: agg.present, valueClass: NEUTRAL_CLASS, barClass: aggregateBarClass("present") },
    { key: "duty", label: "Наряд", value: agg.duty, valueClass: ABSENCE_CATEGORY_TEXT_CLASS.duty, barClass: aggregateBarClass("duty") },
    { key: "trip", label: "Команд.", value: agg.trip, valueClass: ABSENCE_CATEGORY_TEXT_CLASS.trip, barClass: aggregateBarClass("trip") },
    { key: "leave", label: "Отпуск", value: agg.leave, valueClass: ABSENCE_CATEGORY_TEXT_CLASS.leave, barClass: aggregateBarClass("leave") },
    { key: "sick", label: "Болен", value: agg.sick, valueClass: ABSENCE_CATEGORY_TEXT_CLASS.sick, barClass: aggregateBarClass("sick") },
    { key: "dismissal", label: "Увольн.", value: agg.dismissal, valueClass: ABSENCE_CATEGORY_TEXT_CLASS.dismissal, barClass: aggregateBarClass("dismissal") },
    { key: "away_dorm", label: "Вне общ.", value: agg.away_dorm, valueClass: ABSENCE_CATEGORY_TEXT_CLASS.away_dorm, barClass: aggregateBarClass("away_dorm") },
    { key: "other", label: "Прочее", value: agg.other, valueClass: ABSENCE_CATEGORY_TEXT_CLASS.other, barClass: aggregateBarClass("other") },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3 mb-8">
      {items.map((item) => (
        <div key={item.key} className="stat-card !p-3 text-center">
          <div className={`stat-card__bar ${item.barClass}`} aria-hidden />
          <p className={`text-2xl font-serif font-bold ${item.valueClass}`}>{item.value}</p>
          <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-wide leading-tight">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}

export function aggregateCellClass(key: keyof AttendanceAggregate): string {
  if (key === "total_list" || key === "present") return NEUTRAL_CLASS;
  return absenceCategoryTextClass(key as AbsenceCategoryKey);
}
