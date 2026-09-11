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

const GLASS_OVERLAY =
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:from-white/28 before:via-white/10 before:to-transparent after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:ring-1 after:ring-inset after:ring-white/22";

export function SummaryCards({ agg, hints }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
      {ITEMS.map((item) => {
        const Icon = SUMMARY_ICONS[item.key];
        return (
          <div
            key={item.key}
            className={`relative overflow-hidden rounded-xl p-3 min-h-[4.75rem] text-white shadow-vka border border-white/20 backdrop-blur-sm ${GLASS_OVERLAY} ${SUMMARY_CARD_BG_CLASS[item.key]}`}
          >
            <div className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <Icon className="w-6 h-6" />
            </div>

            <div className="relative z-10">
              <div className="px-9 text-center">
                <p className="text-4xl font-serif font-bold leading-none tabular-nums drop-shadow-sm">
                  {agg[item.key]}
                </p>
                {hints?.[item.key] ? (
                  <div className="mt-1 flex justify-center text-white/90">{hints[item.key]}</div>
                ) : null}
              </div>

              <p className="mt-2 text-[10px] uppercase tracking-wide leading-tight text-white/90 text-right">
                {item.label}
              </p>
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
