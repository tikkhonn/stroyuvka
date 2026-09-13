import type { ReactNode } from "react";
import type { AttendanceAggregate } from "../api/client";
import {
  type AbsenceCategoryKey,
  AGGREGATE_NEUTRAL_TEXT_CLASS,
  SUMMARY_CARD_BG_CLASS,
  absenceCategoryTextClass,
} from "../constants/absenceCategories";
import { SUMMARY_ICONS } from "./summaryIcons";

type SummaryCardKey = keyof AttendanceAggregate;

type SummaryCardsProps = {
  agg: AttendanceAggregate;
  hints?: Partial<Record<SummaryCardKey, ReactNode>>;
};

const NEUTRAL_CLASS = AGGREGATE_NEUTRAL_TEXT_CLASS;

const ITEMS: { key: SummaryCardKey; label: string }[] = [
  { key: "total_list", label: "По списку" },
  { key: "present", label: "Налицо" },
  { key: "duty", label: "Наряд" },
  { key: "trip", label: "Командировка" },
  { key: "leave", label: "Отпуск" },
  { key: "sick", label: "Болен" },
  { key: "dismissal", label: "Увольнение" },
  { key: "away_dorm", label: "Вне общ." },
  { key: "other", label: "Прочее" },
  { key: "arrest", label: "Арест" },
];

export function SummaryCards({ agg, hints }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
      {ITEMS.map((item) => {
        const Icon = SUMMARY_ICONS[item.key];
        return (
          <div
            key={item.key}
            className="relative overflow-hidden rounded-lg p-3 min-h-[4.75rem] text-white shadow-vka"
          >
            <div
              className={`absolute inset-0 ${SUMMARY_CARD_BG_CLASS[item.key]}`}
              aria-hidden
            />
            <div className="absolute inset-0 bg-black/25" aria-hidden />

            <div className="relative z-10 flex items-start gap-2.5">
              <div className="rounded-md bg-white/20 p-2 shrink-0 -mt-0.5">
                <Icon className="w-6 h-6 text-white" />
              </div>

              <div className="flex-1 min-w-0 flex flex-col items-end">
                <p className="text-4xl font-serif font-bold leading-none tabular-nums text-white">
                  {agg[item.key]}
                </p>
                {hints?.[item.key] ? (
                  <div className="mt-1 flex justify-end text-white">{hints[item.key]}</div>
                ) : null}
                <p className="mt-2 text-[10px] uppercase tracking-wide leading-tight text-white text-right w-full">
                  {item.label}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function aggregateCellClass(key: keyof AttendanceAggregate): string {
  if (key === "total_list" || key === "present") return NEUTRAL_CLASS;
  return absenceCategoryTextClass(key as AbsenceCategoryKey);
}
