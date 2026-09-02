import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AbsenceCategoryOption,
  AbsenceEntry,
  AttendanceSnapshot,
  api,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { SummaryCards } from "../components/SummaryCards";
import { StatusBadge } from "../components/StatusBadge";
import { onWsEvent } from "../api/ws";
import { RANK_SUGGESTIONS } from "../constants/ranks";
import { ABSENCE_CATEGORY_OPTIONS, formatAbsenceCategory } from "../constants/absenceCategories";
import { todayLocal } from "../utils/date";

const FALLBACK = ABSENCE_CATEGORY_OPTIONS;

export function AttendancePage() {
  const { session } = useAuth();
  const [unitId, setUnitId] = useState<number | null>(session?.unit_id ?? null);
  const reportDate = todayLocal();
  const [snapshot, setSnapshot] = useState<AttendanceSnapshot | null>(null);
  const [categories, setCategories] = useState<AbsenceCategoryOption[]>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [totalListDraft, setTotalListDraft] = useState("");
  const [newCategory, setNewCategory] = useState("duty");
  const [newRank, setNewRank] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newDetail, setNewDetail] = useState("");

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setMessage("");
    try {
      const [snap, cats] = await Promise.all([
        api<AttendanceSnapshot>(`/api/attendance/${unitId}?report_date=${reportDate}`),
        api<AbsenceCategoryOption[]>("/api/absence-categories").catch(() => FALLBACK),
      ]);
      setSnapshot(snap);
      setTotalListDraft(String(snap.total_list ?? 0));
      setCategories(cats.length ? cats : FALLBACK);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка загрузки");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, reportDate]);

  useEffect(() => {
    if (session?.unit_id && !unitId) setUnitId(session.unit_id);
  }, [session, unitId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = onWsEvent((ev) => {
      if (
        ev.type === "ATTENDANCE_CHANGED" ||
        ev.type === "REPORT_SUBMITTED" ||
        ev.type === "COURSE_CHANGES_PENDING"
      )
        load();
    });
    return () => {
      unsub();
    };
  }, [load]);

  const detailRequired = Boolean(
    categories.find((c) => c.code === newCategory)?.detail_required
  );

  const persistStrength = async (valueOverride?: number): Promise<boolean> => {
    if (!unitId) return false;
    const value = valueOverride ?? Number(totalListDraft);
    if (Number.isNaN(value) || value < 0) {
      setMessage("Укажите корректную численность по списку");
      return false;
    }
    if (snapshot && value === snapshot.total_list) return true;
    setSaving(true);
    setMessage("");
    try {
      const snap = await api<AttendanceSnapshot>(
        `/api/attendance/${unitId}/strength?report_date=${reportDate}`,
        { method: "PUT", body: JSON.stringify({ total_list: value }) }
      );
      setSnapshot(snap);
      setTotalListDraft(String(snap.total_list));
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onStrengthBlur = () => {
    void persistStrength();
  };

  const addAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!unitId || !newLastName.trim() || !newRank.trim()) return;
    if (detailRequired && !newDetail.trim()) {
      setMessage("Укажите уточнение (вид наряда / где болен)");
      return;
    }
    if (!(await persistStrength())) return;
    setSaving(true);
    setMessage("");
    try {
      await api<AbsenceEntry>(
        `/api/attendance/${unitId}/absences?report_date=${reportDate}`,
        {
          method: "POST",
          body: JSON.stringify({
            category_code: newCategory,
            rank: newRank.trim(),
            last_name: newLastName.trim(),
            note: newDetail.trim() || null,
          }),
        }
      );
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
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const startEditing = async () => {
    if (!unitId) return;
    try {
      await api(`/api/reports/courses/${unitId}/start-editing?report_date=${reportDate}`, {
        method: "POST",
      });
      setMessage("Режим редактирования. Правки не уходят в чат до повторной отправки.");
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const labelForCategory = (row: AbsenceEntry) =>
    formatAbsenceCategory(
      row.category_code,
      row.status_date
    );

  if (!unitId) {
    return (
      <div className="bg-white rounded-lg p-6 shadow">
        <p>Укажите ID подразделения:</p>
        <input
          type="number"
          className="border rounded px-2 py-1 mt-2"
          onChange={(e) => setUnitId(Number(e.target.value))}
        />
      </div>
    );
  }

  const editable = Boolean(snapshot?.editable);
  const isSubmitted =
    snapshot?.report_status === "submitted" || snapshot?.report_status === "approved";
  const isEditing = Boolean(snapshot?.is_editing);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <h2 className="text-xl font-serif font-bold text-vka-navy">
          Расход — {snapshot?.unit_name || "..."}
        </h2>
        <p className="text-sm text-gray-600">Дата: {reportDate}</p>
        {snapshot?.report_status && <StatusBadge status={snapshot.report_status} />}
      </div>

      {message && (
        <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded text-sm">{message}</div>
      )}

      {loading || !snapshot ? (
        <p>Загрузка...</p>
      ) : (
        <>
          <SummaryCards
            agg={snapshot.aggregate}
            editableTotalList={editable}
            totalListDraft={totalListDraft}
            onTotalListChange={setTotalListDraft}
            onTotalListBlur={onStrengthBlur}
            totalListDisabled={saving}
          />

          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h3 className="font-medium text-vka-navy mb-3">Отсутствующие</h3>
            {editable && (
              <form onSubmit={addAbsence} className="flex flex-wrap gap-2 mb-4 items-end">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Категория</label>
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
                    placeholder="рядовой"
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
                    placeholder="Иванов"
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
                    placeholder={
                      newCategory === "duty"
                        ? "КПП"
                        : newCategory === "sick"
                          ? "госпиталь"
                          : ""
                    }
                    required={detailRequired}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-vka-gold text-vka-navy px-3 py-2 rounded text-sm font-medium"
                >
                  Добавить
                </button>
              </form>
            )}

            <table className="vka-table w-full">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Звание</th>
                  <th>Категория</th>
                  <th>Фамилия</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {snapshot.absences.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-gray-500 text-sm">
                      Нет отсутствующих — все налицо
                    </td>
                  </tr>
                ) : (
                  snapshot.absences.map((row, i) => (
                    <tr key={row.id}>
                      <td>{i + 1}</td>
                      <td>{row.rank || "—"}</td>
                      <td>{labelForCategory(row)}</td>
                      <td>{row.last_name}{row.note ? ` (${row.note})` : ""}</td>
                      <td>
                        {row.editable && (
                          <button
                            type="button"
                            onClick={() => removeAbsence(row.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Удалить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 no-print">
            {session?.role === "dpk" && (!isSubmitted || snapshot.report_status === "draft") && (
              <button
                onClick={submitReport}
                className="bg-vka-navy text-white px-4 py-2 rounded hover:bg-vka-navy-light"
              >
                Отправить строевку
              </button>
            )}
            {session?.role === "dpk" && isSubmitted && !isEditing && (
              <>
                <p className="text-sm text-gray-600 self-center">
                  Строевка отправлена. Для правок нажмите «Редактировать».
                </p>
                <button
                  onClick={startEditing}
                  className="bg-vka-gold text-vka-navy px-4 py-2 rounded font-medium hover:opacity-90"
                >
                  Редактировать строевку
                </button>
              </>
            )}
            {session?.role === "dpk" && isSubmitted && isEditing && (
              <>
                <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded self-center">
                  Режим редактирования — изменения не уходят в чат до отправки.
                </p>
                <button
                  onClick={submitReport}
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
