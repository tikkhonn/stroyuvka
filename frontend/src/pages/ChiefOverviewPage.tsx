import { useEffect, useState } from "react";
import {
  AttendanceAggregate,
  OverviewResponse,
  OverviewUnitBreakdown,
  api,
} from "../api/client";
import { onWsEvent } from "../api/ws";
import { formatAbsenceName } from "../constants/ranks";
import { todayLocal } from "../utils/date";

const KEY_METRICS: {
  key: keyof AttendanceAggregate;
  label: string;
  deltaKey?: keyof NonNullable<OverviewResponse["delta_vs_yesterday"]>;
  accent?: string;
}[] = [
  { key: "total_list", label: "По списку" },
  { key: "present", label: "В строю", deltaKey: "present", accent: "text-emerald-700" },
  { key: "sick", label: "Больные", deltaKey: "sick", accent: "text-rose-700" },
  { key: "trip", label: "Командировка", deltaKey: "trip", accent: "text-sky-700" },
  { key: "leave", label: "Отпуск", deltaKey: "leave", accent: "text-amber-700" },
  { key: "dismissal", label: "Увольнение", deltaKey: "dismissal", accent: "text-violet-700" },
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
        {a.sick > 0 && <span>больные {a.sick}</span>}
        {a.trip > 0 && <span>команд. {a.trip}</span>}
        {a.leave > 0 && <span>отпуск {a.leave}</span>}
        {a.dismissal > 0 && <span>увольн. {a.dismissal}</span>}
        {a.duty > 0 && <span>наряд {a.duty}</span>}
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
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-bold text-vka-navy">Строевка академии</h2>
          <p className="text-sm text-gray-600 mt-1">Сводка на выбранную дату</p>
        </div>
        <label className="text-sm">
          <span className="text-gray-600 mr-2">Дата</span>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5"
          />
        </label>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : !data ? (
        <p className="text-gray-500">Нет данных</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {KEY_METRICS.map(({ key, label, deltaKey, accent }) => (
              <div
                key={key}
                className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 text-center"
              >
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</p>
                <p className={`text-3xl font-serif font-bold ${accent || "text-vka-navy"}`}>
                  {data.academy[key]}
                </p>
                {deltaKey && data.delta_vs_yesterday && (
                  <div className="mt-1">
                    <DeltaBadge value={data.delta_vs_yesterday[deltaKey]} />
                  </div>
                )}
                {key === "present" && (
                  <p className="text-xs text-gray-500 mt-1">{data.present_percent}% от списка</p>
                )}
              </div>
            ))}
          </div>

          {readiness && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
              <h3 className="text-sm font-semibold text-vka-navy mb-3">Готовность строевки на сегодня</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Курсы сданы</span>
                    <span>
                      {readiness.courses_submitted} / {readiness.courses_total} ({readinessPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded"
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
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-vka-navy rounded"
                      style={{ width: `${facultyReadyPct}%` }}
                    />
                  </div>
                </div>
              </div>
              {readinessPct < 100 && (
                <p className="text-xs text-amber-700 mt-3">
                  Картина может быть неполной — не все курсы передали строевку.
                </p>
              )}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-vka-navy uppercase tracking-wide mb-3">
                По факультетам
              </h3>
              {data.faculties.length === 0 ? (
                <p className="text-sm text-gray-500">Факультеты не настроены</p>
              ) : (
                data.faculties.map((row) => <BreakdownRow key={row.unit_id} row={row} />)
              )}
            </section>

            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-vka-navy uppercase tracking-wide mb-3">
                По расположениям
              </h3>
              {data.locations.map((row) => (
                <BreakdownRow key={row.unit_id} row={row} />
              ))}
            </section>
          </div>

          {data.sick_summary.total > 0 && (
            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-vka-navy mb-3">
                Больные сейчас ({data.sick_summary.total})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-3 font-medium">ФИО</th>
                      <th className="py-2 pr-3 font-medium">Подразделение</th>
                      <th className="py-2 pr-3 font-medium">С даты</th>
                      <th className="py-2 font-medium">Примечание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sick_summary.entries.slice(0, 15).map((e) => (
                      <tr key={e.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-3">
                          {formatAbsenceName({
                            rank: e.rank,
                            last_name: e.last_name,
                            note: e.note,
                          })}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {e.unit_name}
                          {e.faculty_name && e.faculty_name !== e.unit_name && (
                            <span className="block text-xs">{e.faculty_name}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{e.status_date}</td>
                        <td className="py-2 text-gray-500">{e.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.sick_summary.total > 15 && (
                <p className="text-xs text-gray-500 mt-2">
                  Показаны первые 15 из {data.sick_summary.total}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
