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
        ...d,
        label: formatDay(d.date),
      })),
    [data]
  );

  const facultyBars = useMemo(
    () =>
      (data?.faculties_today ?? []).map((f) => ({
        name: f.faculty_name.replace(/^(\d+)\s*/, "$1 "),
        sick: f.sick,
        trip: f.trip,
        leave: f.leave,
        dismissal: f.dismissal,
      })),
    [data]
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-bold text-vka-navy">Динамика</h2>
          <p className="text-sm text-gray-600 mt-1">
            Изменение расхода по академии · {formatDay(fromDate)} — {formatDay(toDate)}
          </p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              onClick={() => setPeriodDays(days)}
              className={`px-3 py-1.5 text-sm rounded border transition ${
                periodDays === days
                  ? "bg-vka-navy text-white border-vka-navy"
                  : "bg-white text-gray-700 border-gray-300 hover:border-vka-gold"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : !data || chartDays.length === 0 ? (
        <p className="text-gray-500">Нет данных за период</p>
      ) : (
        <div className="space-y-8">
          <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-vka-navy mb-4">
              Отсутствующие по категориям
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartDays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.date
                        ? formatDay(String(payload[0].payload.date))
                        : ""
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="sick"
                    name="Больные"
                    stroke="#be123c"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="trip"
                    name="Командировка"
                    stroke="#0369a1"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="leave"
                    name="Отпуск"
                    stroke="#b45309"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="dismissal"
                    name="Увольнение"
                    stroke="#6d28d9"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-vka-navy mb-4">Численность и «в строю»</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartDays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total_list"
                    name="По списку"
                    stroke="#1e3a5f"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="present"
                    name="В строю"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {facultyBars.length > 0 && (
            <section className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-vka-navy mb-4">
                Факультеты на {formatDay(toDate)}
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={facultyBars}
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
                    <Bar dataKey="sick" name="Больные" fill="#be123c" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="trip" name="Команд." fill="#0369a1" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="leave" name="Отпуск" fill="#b45309" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="dismissal" name="Увольн." fill="#6d28d9" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
