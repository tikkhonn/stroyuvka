import { Fragment, useEffect, useMemo, useState } from "react";
import { ChessboardResponse, ChessboardRow, ChessboardSickSummary, api } from "../api/client";
import { todayLocal } from "../utils/date";
import { StatusBadge } from "../components/StatusBadge";
import { aggregateCellClass } from "../components/SummaryCards";
import { formatAbsenceName } from "../constants/ranks";
import { absenceCategoryTextClass } from "../constants/absenceCategories";

type View = "faculty" | "location";
type PanelFilter = "all" | "sick" | number;

const COLS = [
  { key: "total_list", label: "По списку" },
  { key: "present", label: "Налицо" },
  { key: "duty", label: "Наряд" },
  { key: "trip", label: "Команд." },
  { key: "leave", label: "Отпуск" },
  { key: "sick", label: "Болен" },
  { key: "dismissal", label: "Увольн." },
  { key: "away_dorm", label: "Вне общ." },
  { key: "other", label: "Прочее" },
] as const;

const KNOWN_LOCATIONS: { id: number; name: string }[] = [
  { id: 1001, name: "Академия" },
  { id: 1002, name: "Пушкин" },
  { id: 1003, name: "Лехтуси" },
];

type LocationSection = {
  locationId: number;
  locationName: string;
  courses: ChessboardRow[];
  total: ChessboardRow | null;
};

function buildLocationSections(rows: ChessboardRow[]): LocationSection[] {
  const byId = new Map<number, LocationSection>();

  for (const loc of KNOWN_LOCATIONS) {
    byId.set(loc.id, {
      locationId: loc.id,
      locationName: loc.name,
      courses: [],
      total: null,
    });
  }

  for (const row of rows) {
    if (row.row_kind === "academy_total") continue;
    const locId = row.location_id;
    if (!locId) continue;

    let section = byId.get(locId);
    if (!section) {
      section = {
        locationId: locId,
        locationName: row.location_name || String(locId),
        courses: [],
        total: null,
      };
      byId.set(locId, section);
    }

    if (row.row_kind === "location_total") {
      section.total = row;
      if (row.location_name) section.locationName = row.location_name;
    } else if (row.row_kind === "course") {
      section.courses.push(row);
      if (row.location_name) section.locationName = row.location_name;
    }
  }

  return KNOWN_LOCATIONS.map((loc) => byId.get(loc.id)!);
}

function academyTotalRow(rows: ChessboardRow[]): ChessboardRow | null {
  return rows.find((r) => r.row_kind === "academy_total") ?? null;
}

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function filterSickSummary(
  summary: ChessboardSickSummary,
  panelFilter: PanelFilter
): ChessboardSickSummary {
  if (panelFilter === "all" || panelFilter === "sick") return summary;
  const entries = summary.entries.filter((e) => e.location_id === panelFilter);
  const loc = summary.by_location.find((b) => b.location_id === panelFilter);
  return {
    total: entries.length,
    by_location: loc ? [loc] : [],
    officers_count: 0,
    entries,
  };
}

function SickListTable({ summary }: { summary: ChessboardSickSummary }) {
  if (summary.total === 0) {
    return (
      <div className="bg-white rounded-lg shadow px-4 py-8 text-center text-gray-500">
        Больных нет
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="vka-table w-full min-w-[720px]">
        <thead>
          <tr>
            <th>№</th>
            <th>Фамилия</th>
            <th>Подразделение</th>
            <th>Факультет</th>
            <th>Расположение</th>
            <th>С</th>
          </tr>
        </thead>
        <tbody>
          {summary.entries.map((entry, i) => (
            <tr key={entry.id}>
              <td className="text-gray-500">{i + 1}</td>
              <td className={`font-medium text-left ${absenceCategoryTextClass("sick")}`}>
                {formatAbsenceName(entry)}
              </td>
              <td className="text-left">{entry.unit_name}</td>
              <td>{entry.faculty_name || "—"}</td>
              <td>{entry.location_name || "—"}</td>
              <td className="whitespace-nowrap">{formatDateRu(entry.status_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChessboardPage() {
  const [date, setDate] = useState(todayLocal());
  const [view, setView] = useState<View>("location");
  const [rows, setRows] = useState<ChessboardRow[]>([]);
  const [sickSummary, setSickSummary] = useState<ChessboardSickSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelFilter, setPanelFilter] = useState<PanelFilter>("all");

  useEffect(() => {
    setLoading(true);
    api<ChessboardResponse>(
      `/api/reports/chessboard?report_date=${date}&view=${view}`
    )
      .then((data) => {
        setRows(data.rows);
        setSickSummary(data.sick_summary ?? null);
      })
      .catch(() => {
        setRows([]);
        setSickSummary(null);
      })
      .finally(() => setLoading(false));
  }, [date, view]);

  useEffect(() => {
    if (view !== "location" && panelFilter !== "sick") setPanelFilter("all");
  }, [view, panelFilter]);

  const sickData = useMemo(
    () => (sickSummary ? filterSickSummary(sickSummary, panelFilter) : null),
    [sickSummary, panelFilter]
  );

  const locationSections = useMemo(
    () => (view === "location" ? buildLocationSections(rows) : []),
    [rows, view]
  );

  const academyTotal = useMemo(() => academyTotalRow(rows), [rows]);

  const visibleSections = useMemo(() => {
    if (view !== "location") return [];
    if (panelFilter === "all" || panelFilter === "sick") return locationSections;
    return locationSections.filter((s) => s.locationId === panelFilter);
  }, [view, panelFilter, locationSections]);

  const tableColCount =
    view === "location" ? COLS.length + 4 : COLS.length + 4;

  const rowClass = (row: ChessboardRow) => {
    if (row.row_kind === "academy_total") return "bg-vka-navy/15 font-bold border-t-2 border-vka-navy";
    if (row.row_kind === "location_total")
      return "bg-vka-navy/8 font-semibold border-t-2 border-vka-navy/40";
    if (row.is_officers || row.row_kind === "officers") return "bg-amber-50 font-medium";
    if (row.changes_pending_dpa || row.changes_pending_dpf) return "bg-amber-50";
    return undefined;
  };

  const renderDataCells = (row: ChessboardRow) => (
    <>
      {COLS.map((c) => (
        <td key={c.key} className={`text-center font-medium ${aggregateCellClass(c.key)}`}>
          {row[c.key]}
        </td>
      ))}
      <td>
        {row.row_kind === "course" || row.row_kind === "officers" || row.is_officers ? (
          <StatusBadge status={row.status} />
        ) : (
          "—"
        )}
      </td>
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <h2 className="text-xl font-serif font-bold text-vka-navy">Шахматка</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView("location")}
            className={`text-sm px-3 py-1.5 rounded border ${
              view === "location"
                ? "bg-vka-navy text-white border-vka-navy"
                : "bg-white border-gray-200"
            }`}
          >
            По расположениям
          </button>
          <button
            type="button"
            onClick={() => setView("faculty")}
            className={`text-sm px-3 py-1.5 rounded border ${
              view === "faculty"
                ? "bg-vka-navy text-white border-vka-navy"
                : "bg-white border-gray-200"
            }`}
          >
            По факультетам
          </button>
        </div>
      </div>

      {!loading && sickSummary ? (
        <div className="mb-4">
          {view === "location" ? (
            <p className="text-sm text-gray-600 mb-2">
              Расположения и сводка — выберите плашку для просмотра:
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {view === "location" ? (
              <>
                <button
                  type="button"
                  onClick={() => setPanelFilter("all")}
                  className={`rounded-lg border-2 px-4 py-3 text-left min-w-[140px] transition-colors ${
                    panelFilter === "all"
                      ? "border-vka-navy bg-vka-navy text-white shadow-md"
                      : "border-gray-200 bg-white hover:border-vka-navy/40"
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide opacity-80">Все</div>
                  <div className="font-semibold">3 расположения</div>
                </button>
                {locationSections.map((section) => {
                  const active = panelFilter === section.locationId;
                  const total = section.total;
                  return (
                    <button
                      key={section.locationId}
                      type="button"
                      onClick={() => setPanelFilter(section.locationId)}
                      className={`rounded-lg border-2 px-4 py-3 text-left min-w-[160px] transition-colors ${
                        active
                          ? "border-vka-navy bg-vka-navy text-white shadow-md"
                          : "border-gray-200 bg-white hover:border-vka-navy/40"
                      }`}
                    >
                      <div className="text-xs uppercase tracking-wide opacity-80">
                        Расположение
                      </div>
                      <div className="font-semibold text-base">{section.locationName}</div>
                      <div className={`text-xs mt-1 ${active ? "text-white/90" : "text-gray-500"}`}>
                        {section.courses.length} курс.
                        {total ? ` · налицо ${total.present} / ${total.total_list}` : ""}
                      </div>
                    </button>
                  );
                })}
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setPanelFilter("sick")}
              className={`rounded-lg border-2 px-4 py-3 text-left min-w-[160px] transition-colors ${
                panelFilter === "sick"
                  ? "border-red-600 bg-red-600 text-white shadow-md"
                  : "border-gray-200 bg-white hover:border-red-400/60"
              }`}
            >
              <div className="text-xs uppercase tracking-wide opacity-80">Сводка</div>
              <div className="font-semibold text-base">Больные</div>
              <div className={`text-xs mt-1 ${panelFilter === "sick" ? "text-white/90" : "text-gray-500"}`}>
                всего {sickSummary.total}
                {sickSummary.by_location.some((l) => l.count > 0)
                  ? ` · ${sickSummary.by_location
                      .filter((l) => l.count > 0)
                      .map((l) => `${l.location_name} ${l.count}`)
                      .join(", ")}`
                  : ""}
                {sickSummary.officers_count > 0
                  ? ` · офицеры ${sickSummary.officers_count}`
                  : ""}
              </div>
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p>Загрузка...</p>
      ) : panelFilter === "sick" && sickData ? (
        <SickListTable summary={sickData} />
      ) : view === "location" ? (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="vka-table w-full min-w-[1100px]">
            <thead>
              <tr>
                <th>Расположение</th>
                <th>Факультет</th>
                <th>Курс</th>
                {COLS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {visibleSections.map((section) => (
                <Fragment key={section.locationId}>
                  {panelFilter === "all" && (
                    <tr key={`hdr-${section.locationId}`} className="bg-vka-navy/5">
                      <td
                        colSpan={tableColCount}
                        className="py-2 px-3 font-serif font-bold text-vka-navy text-sm uppercase tracking-wide border-y border-vka-navy/20"
                      >
                        {section.locationName}
                        <span className="ml-2 font-normal normal-case text-gray-600">
                          ({section.courses.length}{" "}
                          {section.courses.length === 1 ? "курс" : "курсов"})
                        </span>
                      </td>
                    </tr>
                  )}
                  {section.courses.length === 0 && !section.total ? (
                    <tr key={`empty-${section.locationId}`}>
                      <td colSpan={tableColCount} className="text-center text-gray-400 py-3">
                        В расположении «{section.locationName}» нет курсов
                      </td>
                    </tr>
                  ) : (
                    section.courses.map((row, idx) => (
                      <tr key={`${section.locationId}-${row.course_id}-${idx}`} className={rowClass(row)}>
                        {idx === 0 && panelFilter === "all" ? (
                          <td rowSpan={section.courses.length + (section.total ? 1 : 0)}>
                            <span className="font-medium">{section.locationName}</span>
                          </td>
                        ) : panelFilter !== "all" && typeof panelFilter === "number" ? (
                          idx === 0 ? (
                            <td rowSpan={section.courses.length + (section.total ? 1 : 0)}>
                              <span className="font-medium">{section.locationName}</span>
                            </td>
                          ) : null
                        ) : null}
                        <td>{row.faculty_name}</td>
                        <td>
                          {row.course_name || "—"}
                          {row.changes_pending_dpa ? " ⚠" : ""}
                        </td>
                        {renderDataCells(row)}
                      </tr>
                    ))
                  )}
                  {section.total ? (
                    <tr key={`total-${section.locationId}`} className={rowClass(section.total)}>
                      {section.courses.length === 0 ? (
                        <td>
                          <span className="font-medium">{section.locationName}</span>
                        </td>
                      ) : null}
                      <td colSpan={2} className="font-semibold">
                        Итого: {section.locationName}
                      </td>
                      {renderDataCells(section.total)}
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {academyTotal && (panelFilter === "all" || visibleSections.length > 0) ? (
                <tr className={rowClass(academyTotal)}>
                  <td colSpan={3} className="font-bold">
                    {academyTotal.course_name || "Вся академия"}
                  </td>
                  {renderDataCells(academyTotal)}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="vka-table w-full min-w-[1100px]">
            <thead>
              <tr>
                <th>Факультет</th>
                <th>Курс</th>
                <th>Расположение</th>
                {COLS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={rowClass(row)}>
                  <td>{row.faculty_name}</td>
                  <td>
                    {row.course_name || "—"}
                    {row.changes_pending_dpa ? " ⚠" : ""}
                  </td>
                  <td>{row.location_name || "—"}</td>
                  {renderDataCells(row)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
