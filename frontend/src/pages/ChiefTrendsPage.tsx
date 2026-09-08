import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendsResponse, api } from "../api/client";
import { ABSENCE_CATEGORY_HEX } from "../constants/absenceCategories";
import { Card, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { todayLocal } from "../utils/date";

const PERIODS = [
  { days: 7, label: "7 дней" },
  { days: 14, label: "14 дней" },
  { days: 30, label: "30 дней" },
] as const;

function formatDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function shiftDate(iso: string, daysBack: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function shortFacultyName(name: string): string {
  return name.replace(/^(\d+)\s*/, "$1 ");
}

type DayChartRow = {
  date: string;
  label: string;
  sick: number;
  trip: number;
  dismissal: number;
};

function TrendLineChart({
  data,
  dataKey,
  name,
  color,
}: {
  data: DayChartRow[];
  dataKey: keyof Pick<DayChartRow, "sick" | "trip" | "dismissal">;
  name: string;
  color: string;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.date ? formatDay(String(payload[0].payload.date)) : ""
            }
          />
          <Legend />
          <Line
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChiefTrendsPage() {
  const [periodDays, setPeriodDays] = useState<number>(14);
  const toDate = todayLocal();
  const fromDate = useMemo(() => shiftDate(toDate, periodDays - 1), [toDate, periodDays]);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api<TrendsResponse>(`/api/reports/trends?from=${fromDate}&to=${toDate}`)
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  const chartDays = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        date: d.date,
        label: formatDay(d.date),
        sick: d.sick,
        trip: d.trip,
        dismissal: d.dismissal,
      })),
    [data]
  );

  const facultyDutyBars = useMemo(
    () =>
      (data?.faculties_today ?? []).map((f) => ({
        name: shortFacultyName(f.faculty_name),
        duty: f.duty,
      })),
    [data]
  );

  const facultySummaryBars = useMemo(
    () =>
      (data?.faculties_today ?? []).map((f) => ({
        name: shortFacultyName(f.faculty_name),
        sick: f.sick,
        trip: f.trip,
        leave: f.leave,
        dismissal: f.dismissal,
      })),
    [data]
  );

  return (
    <div>
      <PageHeader
        title="Динамика"
        subtitle={`Изменение расхода по академии · ${formatDay(fromDate)} — ${formatDay(toDate)}`}
        action={
          <div className="glass-card p-1 flex rounded-xl">
            {PERIODS.map(({ days, label }) => (
              <button
                key={days}
                type="button"
                onClick={() => setPeriodDays(days)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  periodDays === days
                    ? "bg-vka-navy text-white shadow-md"
                    : "text-gray-600 hover:text-vka-navy"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 animate-pulse">Загрузка...</p>
      ) : !data || chartDays.length === 0 ? (
        <p className="text-gray-500">Нет данных за период</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Больные" />
            <TrendLineChart
              data={chartDays}
              dataKey="sick"
              name="Больные"
              color={ABSENCE_CATEGORY_HEX.sick}
            />
          </Card>

          <Card>
            <CardHeader title={`Наряд по факультетам · ${formatDay(toDate)}`} />
            {facultyDutyBars.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">Нет данных по факультетам</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={facultyDutyBars}
                    margin={{ top: 8, right: 8, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="duty"
                      name="Наряд"
                      fill={ABSENCE_CATEGORY_HEX.duty}
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Увольнения" />
            <TrendLineChart
              data={chartDays}
              dataKey="dismissal"
              name="Увольнение"
              color={ABSENCE_CATEGORY_HEX.dismissal}
            />
          </Card>

          <Card>
            <CardHeader title="Командировки" />
            <TrendLineChart
              data={chartDays}
              dataKey="trip"
              name="Командировка"
              color={ABSENCE_CATEGORY_HEX.trip}
            />
          </Card>

          {facultySummaryBars.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader title={`Факультеты на ${formatDay(toDate)}`} />
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={facultySummaryBars}
                    margin={{ top: 8, right: 8, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="sick"
                      name="Больные"
                      fill={ABSENCE_CATEGORY_HEX.sick}
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="trip"
                      name="Команд."
                      fill={ABSENCE_CATEGORY_HEX.trip}
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="leave"
                      name="Отпуск"
                      fill={ABSENCE_CATEGORY_HEX.leave}
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="dismissal"
                      name="Увольн."
                      fill={ABSENCE_CATEGORY_HEX.dismissal}
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
