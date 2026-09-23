import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AbsenceCategoryOption,
  AbsenceEntry,
  AttendanceSnapshot,
  AttendanceUnitOption,
  Hospital,
  PersonRead,
  api,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { SummaryCards } from "../components/SummaryCards";
import { StatusBadge } from "../components/StatusBadge";
import { SubmittedReportStatus } from "../components/SubmittedReportStatus";
import { DutyLandlinePlaque } from "../components/DutyLandlinePlaque";
import { RosterSection, type RosterSortState } from "../components/RosterSection";
import { RosterPersonCombobox } from "../components/RosterPersonCombobox";
import { HospitalSelect } from "../components/HospitalSelect";
import { onWsEvent } from "../api/ws";
import {
  ABSENCE_CATEGORY_OPTIONS,
  formatAbsenceReason,
  absenceCategoryRowClass,
  isSickCategory,
} from "../constants/absenceCategories";
import { todayLocal } from "../utils/date";
import { formatRank, ranksFromRoster, ranksMatch } from "../constants/ranks";

const FALLBACK = ABSENCE_CATEGORY_OPTIONS;

export function AttendancePage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const reportDate = todayLocal();
  const [units, setUnits] = useState<AttendanceUnitOption[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<AttendanceSnapshot | null>(null);
  const [people, setPeople] = useState<PersonRead[]>([]);
  const [categories, setCategories] = useState<AbsenceCategoryOption[]>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [rosterOpen, setRosterOpen] = useState(true);
  const [absencesOpen, setAbsencesOpen] = useState(true);
  const [absencesEditing, setAbsencesEditing] = useState(false);
  const [newCategory, setNewCategory] = useState("duty");
  const [newRankFilter, setNewRankFilter] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [newDetail, setNewDetail] = useState("");
  const [newHospitalId, setNewHospitalId] = useState<number | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [rosterSortState, setRosterSortState] = useState<RosterSortState>({
    key: "last_name",
    dir: "asc",
  });

  useEffect(() => {
    void (async () => {
      try {
        const list = await api<AttendanceUnitOption[]>("/api/attendance-units");
        setUnits(list);
        const fromUrl = Number(params.get("unit"));
        const validUrl = list.some((u) => u.id === fromUrl);
        const fallback = session?.unit_id && list.some((u) => u.id === session.unit_id)
          ? session.unit_id
          : list[0]?.id ?? null;
        const next = validUrl ? fromUrl : fallback;
        setUnitId(next);
        if (next && Number(params.get("unit")) !== next) {
          const nextParams = new URLSearchParams(params);
          nextParams.set("unit", String(next));
          setParams(nextParams, { replace: true });
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Ошибка загрузки подразделений");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.unit_id]);

  const selectUnit = (id: number) => {
    setUnitId(id);
    const nextParams = new URLSearchParams(params);
    nextParams.set("unit", String(id));
    setParams(nextParams);
  };

  useEffect(() => {
    hasLoadedRef.current = false;
    setSnapshot(null);
    setPeople([]);
  }, [unitId]);

  const load = useCallback(async () => {
    if (!unitId) {
      setLoading(false);
      return;
    }
    const background = hasLoadedRef.current;
    if (!background) setLoading(true);
    setMessage("");
    try {
      const [snap, cats, roster, hospitalList] = await Promise.all([
        api<AttendanceSnapshot>(`/api/attendance/${unitId}?report_date=${reportDate}`),
        api<AbsenceCategoryOption[]>("/api/absence-categories").catch(() => FALLBACK),
        api<PersonRead[]>(`/api/attendance/${unitId}/people?report_date=${reportDate}`),
        api<Hospital[]>("/api/hospitals?active_only=true").catch(() => [] as Hospital[]),
      ]);
      setSnapshot(snap);
      setCategories(cats.length ? cats : FALLBACK);
      setPeople(roster);
      setHospitals(hospitalList);
      hasLoadedRef.current = true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка загрузки");
      if (!background) setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, reportDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = onWsEvent((ev) => {
      if (
        ev.type === "ATTENDANCE_CHANGED" ||
        ev.type === "REPORT_SUBMITTED" ||
        ev.type === "COURSE_CHANGES_PENDING" ||
        ev.type === "REPORT_EDITING_STARTED" ||
        ev.type === "FACULTY_EDITING_STARTED"
      )
        void load();
    });
    return () => {
      unsub();
    };
  }, [load]);

  const detailRequired = Boolean(
    categories.find((c) => c.code === newCategory)?.detail_required
  );

  const absenceByPersonId = useMemo(() => {
    const map = new Map<number, AbsenceEntry>();
    for (const row of snapshot?.absences ?? []) {
      if (row.person_id) map.set(row.person_id, row);
    }
    return map;
  }, [snapshot]);

  const absentPersonIds = useMemo(
    () => new Set(absenceByPersonId.keys()),
    [absenceByPersonId]
  );

  const rosterRanks = useMemo(() => ranksFromRoster(people), [people]);

  useEffect(() => {
    setSelectedPersonId(null);
    setNewRankFilter("");
  }, [unitId]);

  const handleRankFilterChange = (rank: string) => {
    setNewRankFilter(rank);
    if (!selectedPersonId) return;
    const person = people.find((p) => p.id === selectedPersonId);
    if (person && rank && !ranksMatch(person.rank, rank)) {
      setSelectedPersonId(null);
    }
  };

  const handlePersonSelect = (personId: number | null) => {
    setSelectedPersonId(personId);
    if (personId === null) return;
    const person = people.find((p) => p.id === personId);
    if (person) {
      setNewRankFilter(formatRank(person.rank));
    }
  };

  useEffect(() => {
    if (!snapshot?.editable) {
      setAbsencesEditing(false);
    }
  }, [snapshot?.editable]);

  const addingSick = isSickCategory(newCategory);

  const addAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!unitId || selectedPersonId === null) {
      setMessage("Выберите человека из списка подразделения");
      return;
    }
    if (addingSick && !newHospitalId) {
      setMessage("Укажите мед. учреждение");
      return;
    }
    if (detailRequired && !newDetail.trim()) {
      setMessage("Укажите уточнение (вид наряда)");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await api(`/api/attendance/${unitId}/absences?report_date=${reportDate}`, {
        method: "POST",
        body: JSON.stringify({
          category_code: newCategory,
          person_ids: [selectedPersonId],
          hospital_id: addingSick ? newHospitalId : null,
          note: newDetail.trim() || null,
        }),
      });
      setSelectedPersonId(null);
      setNewDetail("");
      setNewHospitalId(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const removeAbsence = async (entryId: number) => {
    if (!unitId) return;
    setSaving(true);
    setMessage("");
    try {
      await api(`/api/attendance/${unitId}/absences/${entryId}?report_date=${reportDate}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const patchAbsence = async (
    entryId: number,
    body: { hospital_id?: number | null; note?: string | null }
  ) => {
    if (!unitId) return;
    setSaving(true);
    setMessage("");
    try {
      await api(`/api/attendance/${unitId}/absences/${entryId}?report_date=${reportDate}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const submitReport = async () => {
    if (!unitId) return;
    try {
      const res = await api<{ is_resubmit?: boolean }>(
        `/api/reports/courses/${unitId}/submit?report_date=${reportDate}`,
        { method: "POST" }
      );
      setMessage(
        res.is_resubmit
          ? "Строевая записка обновлена. ДПФ уведомлён в чате."
          : "Строевая записка отправлена. ДПФ уведомлён в чате."
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const openAbsencesSection = () => {
    setAbsencesOpen(true);
  };

  const startEditing = async () => {
    if (!unitId) return;
    openAbsencesSection();
    const selected = units.find((u) => u.id === unitId);
    const path =
      selected?.type === "faculty"
        ? `/api/reports/faculties/${unitId}/start-editing?report_date=${reportDate}`
        : `/api/reports/courses/${unitId}/start-editing?report_date=${reportDate}`;
    try {
      await api(path, { method: "POST" });
      setMessage("Режим редактирования. Правки не уходят в чат до повторной отправки.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const reasonForAbsence = (row: AbsenceEntry) =>
    formatAbsenceReason(row.category_code, row.status_date, row.note, row.hospital_name);

  const sickMissingHospital = (snapshot?.absences ?? []).some(
    (row) => isSickCategory(row.category_code) && !row.hospital_id
  );

  if (!unitId && !loading && units.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 shadow">
        <p className="text-gray-600">
          Не удалось определить подразделение. Обратитесь к администратору.
        </p>
      </div>
    );
  }

  const editable = Boolean(snapshot?.editable);
  const isSubmitted =
    snapshot?.report_status === "submitted" || snapshot?.report_status === "approved";
  const isEditing = Boolean(snapshot?.is_editing);
  const selectedMeta = units.find((u) => u.id === unitId);
  const canSubmitCourse = session?.role === "dpk";
  const isDpf = session?.role === "dpf";
  const enableRosterSort = session?.role === "dpk" || session?.role === "dpf";
  const isAdmin = session?.shell === "admin";
  const showSubmittedStatus = (canSubmitCourse || isDpf) && snapshot;
  const showDutyPlaque = (canSubmitCourse || isDpf) && snapshot;
  const dutyPlaqueItems = canSubmitCourse
    ? [
        { label: "ДПФ", phone: snapshot?.dpf_landline },
        { label: "ДПА", phone: snapshot?.dpa_landline },
      ]
    : isDpf
      ? [
          { label: "Нач. ф-т", phone: snapshot?.faculty_chief_landline },
          { label: "ДПА", phone: snapshot?.dpa_landline },
        ]
      : [];
  const canStartEditing =
    (session?.role === "dpk" || session?.role === "dpf" || session?.shell === "admin") &&
    isSubmitted &&
    !isEditing &&
    !editable;

  const unitSelector =
    units.length > 1 ? (
      <select
        className="border rounded px-2 py-1 text-sm"
        value={unitId ?? ""}
        onChange={(e) => selectUnit(Number(e.target.value))}
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    ) : null;

  const submittedStatusEl = showSubmittedStatus ? (
    <SubmittedReportStatus
      status={snapshot!.report_status ?? "draft"}
      submittedAt={snapshot!.report_submitted_at}
    />
  ) : null;

  const showRightHeaderGroup =
    showDutyPlaque || (isDpf && showSubmittedStatus) || (!isDpf && units.length > 1);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-serif font-bold text-vka-navy">
            Расход — {snapshot?.unit_name || selectedMeta?.name || "..."}
          </h2>
          {isDpf ? unitSelector : submittedStatusEl}
        </div>
        {!canSubmitCourse && !isDpf && (
          <p className="text-sm text-gray-600">Дата: {reportDate}</p>
        )}
        {!canSubmitCourse && !isDpf && snapshot?.report_status ? (
          <StatusBadge status={snapshot.report_status} />
        ) : null}
        {showRightHeaderGroup ? (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {showDutyPlaque ? <DutyLandlinePlaque items={dutyPlaqueItems} /> : null}
            {isDpf ? submittedStatusEl : unitSelector}
          </div>
        ) : null}
      </div>

      {message && (
        <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded text-sm">{message}</div>
      )}

      {loading || !snapshot ? (
        <p>Загрузка...</p>
      ) : (
        <>
          {snapshot.total_list === 0 && (
            <div className="mb-4 p-3 bg-amber-50 text-amber-900 rounded text-sm">
              Список подразделения пуст. Загрузите файл Word (.docx) или Excel (.xlsx) с колонками
              «Воинское звание» и «Фамилия, имя, отчество» (кафедра и «№» — по желанию) или
              добавьте людей вручную — число «по списку» появится автоматически.
            </div>
          )}
          <SummaryCards agg={snapshot.aggregate} />

          {canStartEditing && (
            <div className="flex justify-end mb-4 no-print">
              <button
                type="button"
                onClick={() => void startEditing()}
                className="bg-vka-gold text-vka-navy px-4 py-2 rounded font-medium hover:opacity-90"
              >
                Редактировать строевую записку
              </button>
            </div>
          )}

          <RosterSection
            unitId={unitId!}
            reportDate={reportDate}
            people={people}
            absenceByPersonId={absenceByPersonId}
            editable={editable}
            categories={categories}
            hospitals={hospitals}
            saving={saving}
            onReload={load}
            onMessage={setMessage}
            setSaving={setSaving}
            open={rosterOpen}
            onOpenChange={setRosterOpen}
            enableSort={enableRosterSort}
            sortState={rosterSortState}
            onSortStateChange={setRosterSortState}
            compactCheckboxActions={isAdmin}
          />

          <div className="bg-white rounded-lg shadow mb-4 border border-gray-200">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
              <button
                type="button"
                className="flex items-center gap-2 text-left font-medium text-vka-navy"
                onClick={() => setAbsencesOpen((v) => !v)}
              >
                <span>{absencesOpen ? "▼" : "▶"}</span>
                <span>Отсутствующие</span>
                <span className="text-sm font-normal text-gray-500">
                  ({snapshot.absences.length})
                </span>
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => {
                    if (absencesEditing) setAbsencesEditing(false);
                    else setAbsencesEditing(true);
                  }}
                  className="rounded border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 ml-auto"
                >
                  {absencesEditing ? "Готово" : "Редактировать"}
                </button>
              )}
            </div>

            {absencesOpen && (
              <div className="p-4">
                {editable && (
                  <form
                    onSubmit={addAbsence}
                    className="flex flex-wrap items-end justify-between gap-2 mb-4 w-full"
                  >
                    <div className="flex flex-wrap gap-2 items-end flex-1 min-w-0">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Причина отсутствия</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        {categories.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Воинское звание</label>
                      <select
                        value={newRankFilter}
                        onChange={(e) => handleRankFilterChange(e.target.value)}
                        className="border rounded px-2 py-1 text-sm min-w-[160px]"
                        disabled={saving || rosterRanks.length === 0}
                      >
                        <option value="">
                          {rosterRanks.length === 0 ? "Список пуст" : "Все звания"}
                        </option>
                        {rosterRanks.map((rank) => (
                          <option key={rank} value={rank}>
                            {rank}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">ФИО</label>
                      <RosterPersonCombobox
                        people={people}
                        absentPersonIds={absentPersonIds}
                        value={selectedPersonId}
                        onChange={handlePersonSelect}
                        disabled={saving}
                        rankFilter={newRankFilter || null}
                      />
                    </div>
                    {addingSick ? (
                      <>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Мед. учреждение</label>
                          <HospitalSelect
                            hospitals={hospitals}
                            value={newHospitalId}
                            onChange={setNewHospitalId}
                            required
                            disabled={saving}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Диагноз (необяз.)</label>
                          <input
                            value={newDetail}
                            onChange={(e) => setNewDetail(e.target.value)}
                            className="border rounded px-2 py-1 text-sm"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">
                          Уточнение {detailRequired ? "(обязательно)" : "(необяз.)"}
                        </label>
                        <input
                          value={newDetail}
                          onChange={(e) => setNewDetail(e.target.value)}
                          className="border rounded px-2 py-1 text-sm"
                          required={detailRequired}
                        />
                      </div>
                    )}
                    </div>
                    <button
                      type="submit"
                      disabled={saving || selectedPersonId === null}
                      className="bg-vka-gold text-vka-navy px-3 py-2 rounded text-sm font-medium disabled:opacity-50 shrink-0"
                    >
                      Добавить вручную
                    </button>
                  </form>
                )}

                <table className="vka-table w-full">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Воинское звание</th>
                      <th>Причина отсутствия</th>
                      <th>ФИО</th>
                      {editable && absencesEditing && (
                        <>
                          <th>Мед. учреждение</th>
                          <th>Диагноз</th>
                          <th></th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.absences.length === 0 ? (
                      <tr>
                        <td
                          colSpan={editable && absencesEditing ? 7 : 4}
                          className="text-gray-500 text-sm"
                        >
                          Нет отсутствующих — все налицо
                        </td>
                      </tr>
                    ) : (
                      snapshot.absences.map((row, i) => {
                        const sick = isSickCategory(row.category_code);
                        return (
                        <tr
                          key={row.id}
                          className={absenceCategoryRowClass(row.category_code)}
                        >
                          <td>{i + 1}</td>
                          <td>{formatRank(row.rank) || "—"}</td>
                          <td>{reasonForAbsence(row)}</td>
                          <td>{row.last_name}</td>
                          {editable && absencesEditing && (
                            <>
                              <td>
                                {sick && row.editable ? (
                                  <HospitalSelect
                                    hospitals={hospitals}
                                    value={row.hospital_id ?? null}
                                    extra={
                                      row.hospital_id
                                        ? {
                                            id: row.hospital_id,
                                            name: row.hospital_name || "Не указано",
                                          }
                                        : null
                                    }
                                    required
                                    disabled={saving}
                                    onChange={(hospital_id) => {
                                      if (hospital_id) {
                                        void patchAbsence(row.id, { hospital_id });
                                      }
                                    }}
                                  />
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {sick && row.editable ? (
                                  <input
                                    key={`${row.id}-${row.note ?? ""}`}
                                    defaultValue={row.note ?? ""}
                                    onBlur={(e) => {
                                      const next = e.target.value.trim() || null;
                                      if (next !== (row.note?.trim() || null)) {
                                        void patchAbsence(row.id, { note: next });
                                      }
                                    }}
                                    className="border rounded px-2 py-1 text-sm w-full"
                                    placeholder="необяз."
                                    disabled={saving}
                                  />
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>
                                {row.editable && (
                                  <button
                                    type="button"
                                    onClick={() => void removeAbsence(row.id)}
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                    Удалить
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2 no-print">
            {sickMissingHospital && (
              <p className="text-sm text-red-800 bg-red-50 px-3 py-2 rounded">
                Укажите мед. учреждение у всех больных, иначе строевую записку нельзя отправить.
              </p>
            )}
            {canStartEditing && (
              <p className="text-sm text-gray-600">
                Строевая записка отправлена. Для правок нажмите «Редактировать строевую записку» выше.
              </p>
            )}
            {canSubmitCourse && isSubmitted && isEditing && (
              <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded">
                Режим редактирования — изменения не уходят в чат до отправки.
              </p>
            )}
            {(canSubmitCourse && (!isSubmitted || snapshot.report_status === "draft")) ||
            (canSubmitCourse && isSubmitted && isEditing) ? (
              <div className="flex justify-end">
                <button
                  onClick={() => void submitReport()}
                  disabled={sickMissingHospital}
                  className="bg-vka-navy text-white px-4 py-2 rounded hover:bg-vka-navy-light disabled:opacity-50"
                >
                  Отправить строевую записку
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
