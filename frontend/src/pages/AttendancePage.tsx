import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AbsenceCategoryOption,
  AbsenceEntry,
  AttendanceSnapshot,
  AttendanceUnitOption,
  PersonRead,
  api,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { SummaryCards } from "../components/SummaryCards";
import { StatusBadge } from "../components/StatusBadge";
import { RosterSection } from "../components/RosterSection";
import { onWsEvent } from "../api/ws";
import { RANK_SUGGESTIONS } from "../constants/ranks";
import { ABSENCE_CATEGORY_OPTIONS, formatAbsenceReason, absenceCategoryRowClass } from "../constants/absenceCategories";
import { todayLocal } from "../utils/date";

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
  const [absencesOpen, setAbsencesOpen] = useState(true);
  const [absencesEditing, setAbsencesEditing] = useState(false);
  const [newCategory, setNewCategory] = useState("duty");
  const [newRank, setNewRank] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newDetail, setNewDetail] = useState("");

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
      const [snap, cats, roster] = await Promise.all([
        api<AttendanceSnapshot>(`/api/attendance/${unitId}?report_date=${reportDate}`),
        api<AbsenceCategoryOption[]>("/api/absence-categories").catch(() => FALLBACK),
        api<PersonRead[]>(`/api/attendance/${unitId}/people?report_date=${reportDate}`),
      ]);
      setSnapshot(snap);
      setCategories(cats.length ? cats : FALLBACK);
      setPeople(roster);
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

  useEffect(() => {
    if (!snapshot?.editable) {
      setAbsencesEditing(false);
    }
  }, [snapshot?.editable]);

  const addAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!unitId || !newLastName.trim() || !newRank.trim()) return;
    if (detailRequired && !newDetail.trim()) {
      setMessage("Укажите уточнение (вид наряда / где болен)");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await api(`/api/attendance/${unitId}/absences?report_date=${reportDate}`, {
        method: "POST",
        body: JSON.stringify({
          category_code: newCategory,
          rank: newRank.trim(),
          last_name: newLastName.trim(),
          note: newDetail.trim() || null,
        }),
      });
      setNewLastName("");
      setNewDetail("");
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

  const submitReport = async () => {
    if (!unitId) return;
    try {
      const res = await api<{ is_resubmit?: boolean }>(
        `/api/reports/courses/${unitId}/submit?report_date=${reportDate}`,
        { method: "POST" }
      );
      setMessage(
        res.is_resubmit
          ? "Строевка обновлена. ДПФ уведомлён в чате."
          : "Строевка отправлена. ДПФ уведомлён в чате."
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const startEditing = async () => {
    if (!unitId) return;
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
    formatAbsenceReason(row.category_code, row.status_date, row.note);

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
  const canStartEditing =
    (session?.role === "dpk" || session?.role === "dpf" || session?.shell === "admin") &&
    isSubmitted &&
    !isEditing &&
    !editable;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <h2 className="text-xl font-serif font-bold text-vka-navy">
          Расход — {snapshot?.unit_name || selectedMeta?.name || "..."}
        </h2>
        <p className="text-sm text-gray-600">Дата: {reportDate}</p>
        {snapshot?.report_status && <StatusBadge status={snapshot.report_status} />}
        {units.length > 1 && (
          <select
            className="border rounded px-2 py-1 text-sm ml-auto"
            value={unitId ?? ""}
            onChange={(e) => selectUnit(Number(e.target.value))}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
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
              Список подразделения пуст. Загрузите Word/Excel или добавьте людей вручную —
              число «по списку» появится автоматически.
            </div>
          )}
          <SummaryCards agg={snapshot.aggregate} />

          <RosterSection
            unitId={unitId!}
            reportDate={reportDate}
            people={people}
            absenceByPersonId={absenceByPersonId}
            editable={editable}
            categories={categories}
            saving={saving}
            onReload={load}
            onMessage={setMessage}
            setSaving={setSaving}
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
                  <form onSubmit={addAbsence} className="flex flex-wrap gap-2 mb-4 items-end">
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
                      <label className="block text-xs text-gray-600 mb-1">Звание</label>
                      <input
                        list="rank-suggestions"
                        value={newRank}
                        onChange={(e) => setNewRank(e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                        required
                      />
                      <datalist id="rank-suggestions">
                        {RANK_SUGGESTIONS.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Фамилия</label>
                      <input
                        value={newLastName}
                        onChange={(e) => setNewLastName(e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                        required
                      />
                    </div>
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
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-vka-gold text-vka-navy px-3 py-2 rounded text-sm font-medium"
                    >
                      Добавить вручную
                    </button>
                  </form>
                )}

                <table className="vka-table w-full">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Звание</th>
                      <th>Причина отсутствия</th>
                      <th>Фамилия</th>
                      {editable && absencesEditing && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.absences.length === 0 ? (
                      <tr>
                        <td
                          colSpan={editable && absencesEditing ? 5 : 4}
                          className="text-gray-500 text-sm"
                        >
                          Нет отсутствующих — все налицо
                        </td>
                      </tr>
                    ) : (
                      snapshot.absences.map((row, i) => (
                        <tr
                          key={row.id}
                          className={absenceCategoryRowClass(row.category_code)}
                        >
                          <td>{i + 1}</td>
                          <td>{row.rank || "—"}</td>
                          <td>{reasonForAbsence(row)}</td>
                          <td>{row.last_name}</td>
                          {editable && absencesEditing && (
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
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 no-print">
            {canSubmitCourse && (!isSubmitted || snapshot.report_status === "draft") && (
              <button
                onClick={() => void submitReport()}
                className="bg-vka-navy text-white px-4 py-2 rounded hover:bg-vka-navy-light"
              >
                Отправить строевку
              </button>
            )}
            {canStartEditing && (
              <>
                <p className="text-sm text-gray-600 self-center">
                  Строевка отправлена. Для правок нажмите «Редактировать».
                </p>
                <button
                  onClick={() => void startEditing()}
                  className="bg-vka-gold text-vka-navy px-4 py-2 rounded font-medium hover:opacity-90"
                >
                  Редактировать строевку
                </button>
              </>
            )}
            {canSubmitCourse && isSubmitted && isEditing && (
              <>
                <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded self-center">
                  Режим редактирования — изменения не уходят в чат до отправки.
                </p>
                <button
                  onClick={() => void submitReport()}
                  className="bg-vka-navy text-white px-4 py-2 rounded hover:bg-vka-navy-light"
                >
                  Отправить строевку
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
