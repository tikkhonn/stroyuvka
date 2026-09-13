import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AbsenceCategoryOption,
  AbsenceEntry,
  Hospital,
  PersonRead,
  RosterImportPreview,
  RosterImportResult,
  api,
  downloadFile,
  uploadApi,
} from "../api/client";
import { HospitalSelect } from "./HospitalSelect";
import {
  formatAbsenceReason,
  absenceCategoryRowClass,
  isSickCategory,
} from "../constants/absenceCategories";
import { RANK_SUGGESTIONS, formatRank } from "../constants/ranks";

type ImportMode = "upsert" | "replace";
type SickDraft = { person_id: number; hospital_id: number | null; note: string };

type Props = {
  unitId: number;
  reportDate: string;
  people: PersonRead[];
  absenceByPersonId: Map<number, AbsenceEntry>;
  editable: boolean;
  categories: AbsenceCategoryOption[];
  hospitals: Hospital[];
  saving: boolean;
  onReload: () => Promise<void>;
  onMessage: (text: string) => void;
  setSaving: (value: boolean) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function RosterSection({
  unitId,
  reportDate,
  people,
  absenceByPersonId,
  editable,
  categories,
  hospitals,
  saving,
  onReload,
  onMessage,
  setSaving,
  open: openProp,
  onOpenChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [internalOpen, setInternalOpen] = useState(true);
  const open = openProp ?? internalOpen;
  const setOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(open) : value;
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [localEditing, setLocalEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("duty");
  const [bulkNote, setBulkNote] = useState("");
  const [newRank, setNewRank] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("upsert");
  const [sickDrafts, setSickDrafts] = useState<SickDraft[] | null>(null);

  useEffect(() => {
    if (!editable) {
      setLocalEditing(false);
      setSelected(new Set());
    }
  }, [editable]);

  useEffect(() => {
    if (!pendingFile) return;
    let cancelled = false;
    void (async () => {
      try {
        setSaving(true);
        const data = await uploadApi<RosterImportPreview>(
          `/api/attendance/${unitId}/people/import/preview?mode=${importMode}&report_date=${reportDate}`,
          pendingFile
        );
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setPendingFile(null);
          onMessage(err instanceof Error ? err.message : "Ошибка разбора файла");
        }
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importMode, pendingFile, unitId, reportDate, onMessage, setSaving]);

  const activePeople = useMemo(
    () => people.filter((p) => p.is_active),
    [people]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activePeople;
    return activePeople.filter((p) =>
      `${p.display_name || p.full_name} ${p.rank}`.toLowerCase().includes(q)
    );
  }, [activePeople, query]);

  const canSelect = editable && localEditing;
  const allSelected =
    canSelect && filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((p) => p.id)));
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleLocalEditing = () => {
    if (localEditing) {
      setLocalEditing(false);
      setSelected(new Set());
      return;
    }
    setLocalEditing(true);
  };

  const addPerson = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRank.trim() || !newFullName.trim()) return;
    setSaving(true);
    onMessage("");
    try {
      await api(`/api/attendance/${unitId}/people?report_date=${reportDate}`, {
        method: "POST",
        body: JSON.stringify({
          rank: newRank.trim(),
          full_name: newFullName.trim(),
          department_code: newDepartment.trim() || null,
        }),
      });
      setNewRank("");
      setNewFullName("");
      setNewDepartment("");
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (person: PersonRead) => {
    setSaving(true);
    onMessage("");
    try {
      await api(`/api/attendance/${unitId}/people/${person.id}?report_date=${reportDate}`, {
        method: "DELETE",
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(person.id);
        return next;
      });
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const markSelected = async (e: FormEvent) => {
    e.preventDefault();
    const ids = [...selected].filter((id) => !absenceByPersonId.has(id));
    if (ids.length === 0) {
      onMessage("Выберите людей, которые ещё не отмечены отсутствующими");
      return;
    }
    const cat = categories.find((c) => c.code === bulkCategory);
    if (isSickCategory(bulkCategory)) {
      if (hospitals.length === 0) {
        onMessage("Справочник мед. учреждений пуст — обратитесь к администратору");
        return;
      }
      const defaultHospital = hospitals.length === 1 ? hospitals[0].id : null;
      setSickDrafts(
        ids.map((person_id) => ({
          person_id,
          hospital_id: defaultHospital,
          note: "",
        }))
      );
      return;
    }
    if (cat?.detail_required && !bulkNote.trim()) {
      onMessage("Укажите уточнение (вид наряда)");
      return;
    }
    setSaving(true);
    onMessage("");
    try {
      await api(`/api/attendance/${unitId}/absences?report_date=${reportDate}`, {
        method: "POST",
        body: JSON.stringify({
          category_code: bulkCategory,
          person_ids: ids,
          note: bulkNote.trim() || null,
        }),
      });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      if (!bulkDetailRequired) setBulkNote("");
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const saveSickDrafts = async () => {
    if (!sickDrafts || sickDrafts.length === 0) return;
    if (sickDrafts.some((row) => !row.hospital_id)) {
      onMessage("Укажите мед. учреждение у каждого больного");
      return;
    }
    setSaving(true);
    onMessage("");
    try {
      await api(`/api/attendance/${unitId}/absences?report_date=${reportDate}`, {
        method: "POST",
        body: JSON.stringify({
          category_code: "sick",
          people: sickDrafts.map((row) => ({
            person_id: row.person_id,
            hospital_id: row.hospital_id,
            note: row.note.trim() || null,
          })),
        }),
      });
      const marked = new Set(sickDrafts.map((row) => row.person_id));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of marked) next.delete(id);
        return next;
      });
      setSickDrafts(null);
      setBulkNote("");
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    setPendingFile(file);
    onMessage("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const applyImport = async () => {
    if (!pendingFile || !preview?.can_apply) return;
    setSaving(true);
    onMessage("");
    try {
      const result = await uploadApi<RosterImportResult>(
        `/api/attendance/${unitId}/people/import?mode=${importMode}&report_date=${reportDate}`,
        pendingFile
      );
      setPreview(null);
      setPendingFile(null);
      onMessage(
        `Импорт: добавлено ${result.added}, обновлено ${result.updated}, ` +
          `восстановлено ${result.restored}, скрыто ${result.deactivated}. По списку: ${result.total_list}`
      );
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Ошибка импорта");
    } finally {
      setSaving(false);
    }
  };

  const exportList = async (ext: "xlsx" | "docx") => {
    try {
      await downloadFile(
        `/api/attendance/${unitId}/people/export.${ext}`,
        `список.${ext}`
      );
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Ошибка экспорта");
    }
  };

  const bulkDetailRequired = Boolean(
    categories.find((c) => c.code === bulkCategory)?.detail_required
  );

  const reasonForPerson = (personId: number) => {
    const absence = absenceByPersonId.get(personId);
    if (!absence) return "в строю";
    return formatAbsenceReason(
      absence.category_code,
      absence.status_date,
      absence.note,
      absence.hospital_name
    );
  };

  return (
    <div className="bg-white rounded-lg shadow mb-4 border border-gray-200">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
        <button
          type="button"
          className="flex items-center gap-2 text-left font-medium text-vka-navy"
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? "▼" : "▶"}</span>
          <span>Список подразделения</span>
          <span className="text-sm font-normal text-gray-500">({activePeople.length})</span>
        </button>
        <div className="flex flex-wrap gap-2 ml-auto">
          {editable && (
            <button
              type="button"
              onClick={toggleLocalEditing}
              className="rounded border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              {localEditing ? "Готово" : "Редактировать"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void exportList("xlsx")}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => void exportList("docx")}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Word
          </button>
          {editable && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.docx"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => fileRef.current?.click()}
                className="rounded bg-vka-navy px-3 py-1.5 text-sm text-white hover:bg-vka-navy-light"
              >
                Загрузить файл
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="p-4">
          <p className="text-sm text-gray-600 mb-3">
            «По списку» равно числу активных людей. Шаблон: «Воинское звание | Кафедра | Фамилия,
            имя, отчество» или «Звание | Фамилия И.О.». Старые двух- и трёхколоночные файлы без
            кафедры тоже поддерживаются.
          </p>

          <div className="flex flex-wrap gap-3 mb-3 items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по фамилии"
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          {editable && (
            <div className="space-y-3 mb-4">
              <form
                onSubmit={addPerson}
                className="flex flex-wrap items-end justify-between gap-2 w-full"
              >
                <div className="flex flex-wrap gap-2 items-end flex-1 min-w-0">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Звание</label>
                    <input
                      list="roster-ranks"
                      value={newRank}
                      onChange={(e) => setNewRank(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">ФИО</label>
                    <input
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="Иванов И.И."
                      className="border rounded px-2 py-1 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Кафедра</label>
                    <input
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      placeholder="61"
                      className="border rounded px-2 py-1 text-sm w-20"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-vka-gold text-vka-navy px-3 py-2 rounded text-sm font-medium shrink-0"
                >
                  Добавить в список
                </button>
              </form>

              {localEditing && (
                <form
                  onSubmit={markSelected}
                  className="flex flex-wrap items-end justify-between gap-2 w-full bg-amber-50 border border-amber-200 px-3 py-2 rounded"
                >
                  <div className="flex flex-wrap gap-2 items-end flex-1 min-w-0">
                    <span className="text-sm text-amber-900 whitespace-nowrap pb-2">
                      Выбрано: {selected.size}
                    </span>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Причина отсутствия</label>
                      <select
                        value={bulkCategory}
                        onChange={(e) => setBulkCategory(e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        {categories.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!isSickCategory(bulkCategory) && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Уточнение</label>
                        <input
                          value={bulkNote}
                          onChange={(e) => setBulkNote(e.target.value)}
                          placeholder={bulkDetailRequired ? "обязательно" : "необяз."}
                          className="border rounded px-2 py-1 text-sm"
                          required={bulkDetailRequired}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={saving || selected.size === 0}
                    className="bg-vka-navy text-white px-3 py-2 rounded text-sm disabled:opacity-50 shrink-0"
                  >
                    Отметить
                  </button>
                </form>
              )}
            </div>
          )}

          <table className="vka-table w-full">
            <thead>
              <tr>
                {editable && (
                  <th className="w-10">
                    {localEditing && (
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    )}
                  </th>
                )}
                <th>№</th>
                <th>Звание</th>
                <th>Кафедра</th>
                <th>ФИО</th>
                <th>Причина отсутствия</th>
                {editable && <th className="w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 7 : 6} className="text-gray-500 text-sm">
                    Список пуст — загрузите файл или добавьте человека вручную
                  </td>
                </tr>
              ) : (
                filtered.map((person, i) => {
                  const absence = absenceByPersonId.get(person.id);
                  const rowClass = absence
                    ? absenceCategoryRowClass(absence.category_code)
                    : "";
                  return (
                  <tr key={person.id} className={rowClass}>
                    {editable && (
                      <td className="w-10">
                        {localEditing && (
                          <input
                            type="checkbox"
                            checked={selected.has(person.id)}
                            disabled={absenceByPersonId.has(person.id)}
                            onChange={() => toggleOne(person.id)}
                          />
                        )}
                      </td>
                    )}
                    <td>{i + 1}</td>
                    <td>{formatRank(person.rank)}</td>
                    <td>{person.department_code || "—"}</td>
                    <td>{person.display_name || person.full_name}</td>
                    <td>{reasonForPerson(person.id)}</td>
                    {editable && (
                      <td className="w-16">
                        {localEditing && (
                          <button
                            type="button"
                            onClick={() => void deactivate(person)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Удалить
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <datalist id="roster-ranks">
            {RANK_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
      )}

      {sickDrafts && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 shadow-xl">
            <h4 className="font-serif text-lg font-bold text-vka-navy mb-1">Больные</h4>
            <p className="text-sm text-gray-600 mb-3">
              Укажите мед. учреждение для каждого. Диагноз — по желанию.
            </p>
            <table className="vka-table w-full">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Мед. учреждение</th>
                  <th>Диагноз</th>
                </tr>
              </thead>
              <tbody>
                {sickDrafts.map((row) => {
                  const person = people.find((p) => p.id === row.person_id);
                  return (
                    <tr key={row.person_id}>
                      <td>{person?.display_name || person?.full_name || row.person_id}</td>
                      <td>
                        <HospitalSelect
                          hospitals={hospitals}
                          value={row.hospital_id}
                          required
                          onChange={(hospital_id) =>
                            setSickDrafts((prev) =>
                              prev
                                ? prev.map((item) =>
                                    item.person_id === row.person_id
                                      ? { ...item, hospital_id }
                                      : item
                                  )
                                : prev
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={row.note}
                          onChange={(e) =>
                            setSickDrafts((prev) =>
                              prev
                                ? prev.map((item) =>
                                    item.person_id === row.person_id
                                      ? { ...item, note: e.target.value }
                                      : item
                                  )
                                : prev
                            )
                          }
                          className="border rounded px-2 py-1 text-sm w-full"
                          placeholder="необяз."
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-3 py-2 text-sm rounded border"
                onClick={() => setSickDrafts(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={saving || sickDrafts.some((row) => !row.hospital_id)}
                onClick={() => void saveSickDrafts()}
                className="px-3 py-2 text-sm rounded bg-vka-navy text-white disabled:opacity-50"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 shadow-xl">
            <h4 className="font-serif text-lg font-bold text-vka-navy mb-3">Предпросмотр импорта</h4>
            <div className="flex gap-3 mb-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={importMode === "upsert"}
                  onChange={() => setImportMode("upsert")}
                />
                Обновить совпавших и добавить новых
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                />
                Полностью заменить список
              </label>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              Добавить: {preview.to_add} · обновить: {preview.to_update} · восстановить:{" "}
              {preview.to_restore} · скрыть: {preview.to_deactivate}
            </p>
            {preview.errors.length > 0 && (
              <ul className="text-sm text-red-700 bg-red-50 rounded p-3 mb-3 space-y-1">
                {preview.errors.map((err, i) => (
                  <li key={i}>
                    {err.row_number ? `Строка ${err.row_number}: ` : ""}
                    {err.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-3 py-2 text-sm rounded border"
                onClick={() => {
                  setPreview(null);
                  setPendingFile(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!preview.can_apply || saving}
                onClick={() => void applyImport()}
                className="px-3 py-2 text-sm rounded bg-vka-navy text-white disabled:opacity-50"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
