import { useEffect, useState } from "react";
import {
  AttendanceAggregate,
  OverviewResponse,
  OverviewUnitBreakdown,
  api,
} from "../api/client";
import { onWsEvent } from "../api/ws";
import { formatAbsenceName } from "../constants/ranks";
import {
  ABSENCE_CATEGORY_TEXT_CLASS,
  AGGREGATE_NEUTRAL_TEXT_CLASS,
  absenceCategoryTextClass,
} from "../constants/absenceCategories";
import { Card, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { todayLocal } from "../utils/date";

const KEY_METRICS: {
  key: keyof AttendanceAggregate;
  label: string;
  deltaKey?: keyof NonNullable<OverviewResponse["delta_vs_yesterday"]>;
  valueClassName: string;
}[] = [
  { key: "total_list", label: "По списку", valueClassName: AGGREGATE_NEUTRAL_TEXT_CLASS },
  { key: "present", label: "В строю", deltaKey: "present", valueClassName: AGGREGATE_NEUTRAL_TEXT_CLASS },
  { key: "sick", label: "Больные", deltaKey: "sick", valueClassName: ABSENCE_CATEGORY_TEXT_CLASS.sick },
  { key: "trip", label: "Командировка", deltaKey: "trip", valueClassName: ABSENCE_CATEGORY_TEXT_CLASS.trip },
  { key: "leave", label: "Отпуск", deltaKey: "leave", valueClassName: ABSENCE_CATEGORY_TEXT_CLASS.leave },
  { key: "dismissal", label: "Увольнение", deltaKey: "dismissal", valueClassName: ABSENCE_CATEGORY_TEXT_CLASS.dismissal },
];

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span
      className={`text-xs font-medium ${up ? "text-rose-600" : "text-emerald-600"}`}
      title="Изменение к вчера"
    >
      {up ? "+" : ""}
      {value}
    </span>
  );
}

function BreakdownRow({ row }: { row: OverviewUnitBreakdown }) {
  const { aggregate: a } = row;
  const pct = a.total_list ? Math.round((a.present / a.total_list) * 100) : 0;
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="font-medium text-vka-navy truncate">{row.unit_name}</span>
        <span className="text-sm text-gray-600 shrink-0">
          {a.present} / {a.total_list} · {pct}%
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded overflow-hidden">
        <div
          className="h-full bg-vka-gold rounded"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        {a.sick > 0 && (
          <span className={ABSENCE_CATEGORY_TEXT_CLASS.sick}>больные {a.sick}</span>
        )}
        {a.trip > 0 && (
          <span className={ABSENCE_CATEGORY_TEXT_CLASS.trip}>команд. {a.trip}</span>
        )}
        {a.leave > 0 && (
          <span className={ABSENCE_CATEGORY_TEXT_CLASS.leave}>отпуск {a.leave}</span>
        )}
        {a.dismissal > 0 && (
          <span className={ABSENCE_CATEGORY_TEXT_CLASS.dismissal}>увольн. {a.dismissal}</span>
        )}
        {a.duty > 0 && (
          <span className={ABSENCE_CATEGORY_TEXT_CLASS.duty}>наряд {a.duty}</span>
        )}
        {a.away_dorm > 0 && (
          <span className={ABSENCE_CATEGORY_TEXT_CLASS.away_dorm}>вне общ. {a.away_dorm}</span>
        )}
        {a.other > 0 && (
          <span className={ABSENCE_CATEGORY_TEXT_CLASS.other}>прочее {a.other}</span>
        )}
      </div>
    </div>
  );
}

export function ChiefOverviewPage() {
  const [reportDate, setReportDate] = useState(todayLocal());
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api<OverviewResponse>(`/api/reports/overview?report_date=${reportDate}`)
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const unsub = onWsEvent((ev) => {
      if (
        ev.type === "REPORT_SUBMITTED" ||
        ev.type === "ATTENDANCE_CHANGED" ||
        ev.type === "DUTY_SHIFT_CHANGED"
      ) {
        load();
      }
    });
    return () => {
      unsub();
    };
  }, [reportDate]);

  const readiness = data?.readiness;
  const readinessPct =
    readiness && readiness.courses_total
      ? Math.round((readiness.courses_submitted / readiness.courses_total) * 100)
      : 0;
  const facultyReadyPct =
    readiness && readiness.faculties_total
      ? Math.round((readiness.faculties_submitted / readiness.faculties_total) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="Строевка академии"
        subtitle="Сводка на выбранную дату"
        action={
          <label className="text-sm flex items-center gap-2">
            <span className="text-gray-600">Дата</span>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="input-field !w-auto !py-1.5"
            />
          </label>
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 animate-pulse">Загрузка...</p>
      ) : !data ? (
        <p className="text-gray-500">Нет данных</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            {KEY_METRICS.map(({ key, label, deltaKey, valueClassName }) => (
              <StatCard
                key={key}
                label={label}
                value={data.academy[key]}
                valueClassName={valueClassName}
                hint={
                  <>
                    {deltaKey && data.delta_vs_yesterday && (
                      <DeltaBadge value={data.delta_vs_yesterday[deltaKey]} />
                    )}
                    {key === "present" && (
                      <p className="text-xs text-gray-500">{data.present_percent}% от списка</p>
                    )}
                  </>
                }
              />
            ))}
          </div>

          {readiness && (
            <Card className="mb-8">
              <CardHeader title="Готовность строевки на сегодня" />
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Курсы сданы</span>
                    <span>
                      {readiness.courses_submitted} / {readiness.courses_total} ({readinessPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all"
                      style={{ width: `${readinessPct}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Факультеты сданы</span>
                    <span>
                      {readiness.faculties_submitted} / {readiness.faculties_total} ({facultyReadyPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-vka-navy rounded-full transition-all"
                      style={{ width: `${facultyReadyPct}%` }}
                    />
                  </div>
                </div>
              </div>
              {readinessPct < 100 && (
                <p className="text-xs text-amber-700 mt-3 bg-amber-50 rounded-lg px-3 py-2">
                  Картина может быть неполной — не все курсы передали строевку.
                </p>
              )}
            </Card>
          )}

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader title="По факультетам" />
              {data.faculties.length === 0 ? (
                <p className="text-sm text-gray-500">Факультеты не настроены</p>
              ) : (
                data.faculties.map((row) => <BreakdownRow key={row.unit_id} row={row} />)
              )}
            </Card>

            <Card>
              <CardHeader title="По расположениям" />
              {data.locations.map((row) => (
                <BreakdownRow key={row.unit_id} row={row} />
              ))}
            </Card>
          </div>

          {data.sick_summary.total > 0 && (
            <Card>
              <CardHeader title={`Больные сейчас (${data.sick_summary.total})`} />
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b bg-gray-50/80">
                      <th className="py-2.5 px-3 font-medium">ФИО</th>
                      <th className="py-2.5 px-3 font-medium">Подразделение</th>
                      <th className="py-2.5 px-3 font-medium">С даты</th>
                      <th className="py-2.5 px-3 font-medium">Примечание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sick_summary.entries.slice(0, 15).map((e) => (
                      <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-vka-cream/50">
                        <td className={`py-2.5 px-3 font-medium ${absenceCategoryTextClass("sick")}`}>
                          {formatAbsenceName({
                            rank: e.rank,
                            last_name: e.last_name,
                            note: e.note,
                          })}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {e.unit_name}
                          {e.faculty_name && e.faculty_name !== e.unit_name && (
                            <span className="block text-xs">{e.faculty_name}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">{e.status_date}</td>
                        <td className="py-2.5 px-3 text-gray-500">{e.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.sick_summary.total > 15 && (
                <p className="text-xs text-gray-500 mt-3">
                  Показаны первые 15 из {data.sick_summary.total}
                </p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
