import { Fragment, useEffect, useMemo, useState } from "react";
import { ChessboardResponse, ChessboardRow, ChessboardSickByHospital, ChessboardSickEntry, ChessboardSickSummary, api } from "../api/client";
import { formatDateRu, todayLocal } from "../utils/date";
import { ReportPipelineBar } from "../components/ReportPipelineBar";
import { aggregateCellClass } from "../components/SummaryCards";
import { formatAbsenceName } from "../constants/ranks";
import { absenceCategoryTextClass } from "../constants/absenceCategories";
import { KNOWN_LOCATIONS } from "../constants/locations";

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
  { key: "arrest", label: "Арест" },
] as const;

const FACULTY_BAND_CLASSES = [
  "border-l-4 border-amber-500 bg-amber-50/80",
  "border-l-4 border-sky-500 bg-sky-50/70",
  "border-l-4 border-emerald-500 bg-emerald-50/70",
  "border-l-4 border-violet-500 bg-violet-50/70",
  "border-l-4 border-rose-500 bg-rose-50/70",
  "border-l-4 border-cyan-500 bg-cyan-50/70",
  "border-l-4 border-orange-500 bg-orange-50/70",
  "border-l-4 border-teal-500 bg-teal-50/70",
  "border-l-4 border-fuchsia-500 bg-fuchsia-50/70",
] as const;

function facultyBandClass(facultyId: number): string {
  if (facultyId < 1) return "border-l-4 border-gray-400 bg-gray-50/70";
  return FACULTY_BAND_CLASSES[(facultyId - 1) % FACULTY_BAND_CLASSES.length];
}

type FacultyBlock = {
  facultyId: number;
  facultyName: string;
  rows: ChessboardRow[];
};

function groupRowsByFaculty(rows: ChessboardRow[]): FacultyBlock[] {
  const blocks: FacultyBlock[] = [];
  for (const row of rows) {
    if (row.row_kind !== "course" && row.row_kind !== "officers") continue;
    const last = blocks[blocks.length - 1];
    if (!last || last.facultyId !== row.faculty_id) {
      blocks.push({
        facultyId: row.faculty_id,
        facultyName: row.faculty_name,
        rows: [row],
      });
    } else {
      last.rows.push(row);
    }
  }
  return blocks;
}

type LocationSection = {
  locationId: number;
  locationName: string;
  dataRows: ChessboardRow[];
  facultyBlocks: FacultyBlock[];
  total: ChessboardRow | null;
};

function buildLocationSections(rows: ChessboardRow[]): LocationSection[] {
  const byId = new Map<number, LocationSection>();

  for (const loc of KNOWN_LOCATIONS) {
    byId.set(loc.id, {
      locationId: loc.id,
      locationName: loc.name,
      dataRows: [],
      facultyBlocks: [],
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
        dataRows: [],
        facultyBlocks: [],
        total: null,
      };
      byId.set(locId, section);
    }

    if (row.row_kind === "location_total") {
      section.total = row;
      if (row.location_name) section.locationName = row.location_name;
    } else if (row.row_kind === "course" || row.row_kind === "officers") {
      section.dataRows.push(row);
      if (row.location_name) section.locationName = row.location_name;
    }
  }

  for (const section of byId.values()) {
    section.facultyBlocks = groupRowsByFaculty(section.dataRows);
  }

  return KNOWN_LOCATIONS.map((loc) => byId.get(loc.id)!);
}

function buildFacultySections(rows: ChessboardRow[]): FacultyBlock[] {
  return groupRowsByFaculty(rows);
}

function countCourses(rows: ChessboardRow[]): number {
  return rows.filter((r) => r.row_kind === "course").length;
}

function academyTotalRow(rows: ChessboardRow[]): ChessboardRow | null {
  return rows.find((r) => r.row_kind === "academy_total") ?? null;
}

function hospitalBuckets(entries: ChessboardSickEntry[]): ChessboardSickByHospital[] {
  const map = new Map<string, ChessboardSickByHospital>();
  for (const entry of entries) {
    const hospital_id = entry.hospital_id ?? null;
    const hospital_name = entry.hospital_name || "Не указано";
    const key = `${hospital_id ?? "none"}:${hospital_name}`;
    const current = map.get(key);
    if (current) current.count += 1;
    else map.set(key, { hospital_id, hospital_name, count: 1 });
  }
  return [...map.values()].sort((a, b) => {
    if (a.hospital_id == null && b.hospital_id != null) return 1;
    if (a.hospital_id != null && b.hospital_id == null) return -1;
    return a.hospital_name.localeCompare(b.hospital_name, "ru");
  });
}

function filterSickSummary(
  summary: ChessboardSickSummary,
  panelFilter: PanelFilter
): ChessboardSickSummary {
  if (panelFilter === "all" || panelFilter === "sick") {
    return {
      ...summary,
      by_hospital: summary.by_hospital?.length ? summary.by_hospital : hospitalBuckets(summary.entries),
    };
  }
  const entries = summary.entries.filter((e) => e.location_id === panelFilter);
  const loc = summary.by_location.find((b) => b.location_id === panelFilter);
  return {
    total: entries.length,
    by_location: loc ? [loc] : [],
    by_hospital: hospitalBuckets(entries),
    officers_count: 0,
    entries,
  };
}

function hospitalFilterKey(hospitalId: number | null | undefined): number | "none" {
  return hospitalId == null ? "none" : hospitalId;
}

function SickListTable({ summary }: { summary: ChessboardSickSummary }) {
  const [hospitalFilter, setHospitalFilter] = useState<number | "all" | "none">("all");
  const hospitals = summary.by_hospital?.length
    ? summary.by_hospital
    : hospitalBuckets(summary.entries);

  useEffect(() => {
    setHospitalFilter("all");
  }, [summary.entries]);

  const entries = useMemo(() => {
    if (hospitalFilter === "all") return summary.entries;
    if (hospitalFilter === "none") {
      return summary.entries.filter((e) => e.hospital_id == null);
    }
    return summary.entries.filter((e) => e.hospital_id === hospitalFilter);
  }, [summary.entries, hospitalFilter]);

  if (summary.total === 0) {
    return (
      <div className="bg-white rounded-lg shadow px-4 py-8 text-center text-gray-500">
        Больных нет
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hospitals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHospitalFilter("all")}
            className={`rounded-full border px-3 py-1 text-sm ${
              hospitalFilter === "all"
                ? "border-red-600 bg-red-600 text-white"
                : "border-gray-200 bg-white hover:border-red-400"
            }`}
          >
            Все · {summary.total}
          </button>
          {hospitals.map((h) => {
            const key = hospitalFilterKey(h.hospital_id);
            const active = hospitalFilter === key;
            return (
              <button
                type="button"
                key={`${h.hospital_id ?? "none"}-${h.hospital_name}`}
                onClick={() => setHospitalFilter(key)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  active
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-gray-200 bg-white hover:border-red-400"
                }`}
              >
                {h.hospital_name} · {h.count}
              </button>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="vka-table w-full min-w-[860px]">
          <thead>
            <tr>
              <th>№</th>
              <th>ФИО</th>
              <th>Подразделение</th>
              <th>Факультет</th>
              <th>Расположение</th>
              <th>Мед. учреждение</th>
              <th>Диагноз</th>
              <th>С</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id}>
                <td className="text-gray-500">{i + 1}</td>
                <td className={`font-medium text-left ${absenceCategoryTextClass("sick")}`}>
                  {formatAbsenceName(entry)}
                </td>
                <td className="text-left">{entry.unit_name}</td>
                <td>{entry.faculty_name || "—"}</td>
                <td>{entry.location_name || "—"}</td>
                <td className="text-left">{entry.hospital_name || "Не указано"}</td>
                <td className="text-left">{entry.note?.trim() || "—"}</td>
                <td className="whitespace-nowrap">{formatDateRu(entry.status_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

  const facultySections = useMemo(
    () => (view === "faculty" ? buildFacultySections(rows) : []),
    [rows, view]
  );

  const visibleSections = useMemo(() => {
    if (view !== "location") return [];
    if (panelFilter === "all" || panelFilter === "sick") return locationSections;
    return locationSections.filter((s) => s.locationId === panelFilter);
  }, [view, panelFilter, locationSections]);

  const facultyTableColCount = COLS.length + 3;
  const locationTableColCount =
    panelFilter === "all" ? COLS.length + 2 : COLS.length + 3;

  const rowClass = (row: ChessboardRow, facultyId?: number) => {
    const parts: string[] = [];
    if (row.row_kind === "academy_total") {
      parts.push("bg-vka-navy/15 font-bold border-t-2 border-vka-navy");
    } else if (row.row_kind === "location_total") {
      parts.push("bg-vka-navy/8 font-semibold border-t-2 border-vka-navy/40");
    } else if (row.is_officers || row.row_kind === "officers") {
      parts.push("font-medium");
    } else if (row.changes_pending_dpa || row.changes_pending_dpf) {
      parts.push("bg-amber-50");
    }
    if (facultyId != null && facultyId > 0) {
      parts.push(facultyBandClass(facultyId));
    }
    return parts.length ? parts.join(" ") : undefined;
  };

  const locationSectionRowCount = (section: LocationSection) => {
    const blockRows = section.facultyBlocks.reduce(
      (sum, block) => sum + 1 + block.rows.length,
      0
    );
    return blockRows + (section.total ? 1 : 0);
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
          <ReportPipelineBar status={row.status} isOfficers={row.is_officers} />
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
                  <div className="font-semibold">
                    {KNOWN_LOCATIONS.length} расположения
                  </div>
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
                        {countCourses(section.dataRows)} курс.
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
          <table className="vka-table w-full min-w-[1240px]">
            <thead>
              <tr>
                {panelFilter !== "all" ? <th>Расположение</th> : null}
                <th>Курс</th>
                {COLS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {visibleSections.map((section) => {
                const sectionRows = locationSectionRowCount(section);

                return (
                  <Fragment key={section.locationId}>
                    {panelFilter === "all" && (
                      <tr key={`hdr-${section.locationId}`} className="bg-vka-navy/5">
                        <td
                          colSpan={locationTableColCount}
                          className="py-2 px-3 font-serif font-bold text-vka-navy text-sm uppercase tracking-wide border-y border-vka-navy/20"
                        >
                          {section.locationName}
                          <span className="ml-2 font-normal normal-case text-gray-600">
                            ({countCourses(section.dataRows)}{" "}
                            {countCourses(section.dataRows) === 1 ? "курс" : "курсов"})
                          </span>
                        </td>
                      </tr>
                    )}
                    {section.dataRows.length === 0 && !section.total ? (
                      <tr key={`empty-${section.locationId}`}>
                        <td colSpan={locationTableColCount} className="text-center text-gray-400 py-3">
                          В расположении «{section.locationName}» нет курсов
                        </td>
                      </tr>
                    ) : (
                      section.facultyBlocks.map((block, blockIdx) => (
                        <Fragment key={`${section.locationId}-fac-${block.facultyId}`}>
                          <tr className={facultyBandClass(block.facultyId)}>
                            {panelFilter !== "all" && blockIdx === 0 ? (
                              <td rowSpan={sectionRows}>
                                <span className="font-medium">{section.locationName}</span>
                              </td>
                            ) : null}
                            <td
                              colSpan={locationTableColCount - (panelFilter !== "all" ? 1 : 0)}
                              className="py-1.5 px-3 font-semibold text-vka-navy text-sm border-b border-black/5"
                            >
                              {block.facultyName}
                            </td>
                          </tr>
                          {block.rows.map((row, idx) => (
                            <tr
                              key={`${section.locationId}-${block.facultyId}-${row.course_id ?? "off"}-${idx}`}
                              className={rowClass(row, block.facultyId)}
                            >
                              <td>
                                {row.course_name || "—"}
                                {row.changes_pending_dpa ? " ⚠" : ""}
                              </td>
                              {renderDataCells(row)}
                            </tr>
                          ))}
                        </Fragment>
                      ))
                    )}
                    {section.total ? (
                      <tr key={`total-${section.locationId}`} className={rowClass(section.total)}>
                        {panelFilter !== "all" && section.dataRows.length === 0 ? (
                          <td>
                            <span className="font-medium">{section.locationName}</span>
                          </td>
                        ) : null}
                        <td className="font-semibold">Итого: {section.locationName}</td>
                        {renderDataCells(section.total)}
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {academyTotal && (panelFilter === "all" || visibleSections.length > 0) ? (
                <tr className={rowClass(academyTotal)}>
                  {panelFilter !== "all" ? <td /> : null}
                  <td className="font-bold">
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
          <table className="vka-table w-full min-w-[1240px]">
            <thead>
              <tr>
                <th>Курс</th>
                <th>Расположение</th>
                {COLS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {facultySections.map((block) => (
                <Fragment key={`fac-${block.facultyId}`}>
                  <tr className={facultyBandClass(block.facultyId)}>
                    <td
                      colSpan={facultyTableColCount}
                      className="py-1.5 px-3 font-semibold text-vka-navy text-sm border-b border-black/5"
                    >
                      {block.facultyName}
                    </td>
                  </tr>
                  {block.rows.map((row, idx) => (
                    <tr
                      key={`${block.facultyId}-${row.course_id ?? "off"}-${idx}`}
                      className={rowClass(row, block.facultyId)}
                    >
                      <td>
                        {row.course_name || "—"}
                        {row.changes_pending_dpa ? " ⚠" : ""}
                      </td>
                      <td>{row.location_name || "—"}</td>
                      {renderDataCells(row)}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
