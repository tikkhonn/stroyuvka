import { FormEvent, useEffect, useState } from "react";
import { LandlinePhone, api } from "../api/client";

type DutyFormScope = "" | NonNullable<LandlinePhone["duty_scope"]>;
type Drafts = Record<
  number,
  { name: string; phone: string; duty_scope: DutyFormScope; faculty_id: string }
>;

const DUTY_OPTIONS: { value: DutyFormScope; label: string }[] = [
  { value: "", label: "Обычный (только справочник)" },
  { value: "dpa", label: "ДПА — для всех ДПК и ДПФ" },
  { value: "dpf", label: "ДПФ (уч. корпус) — для ДПК" },
  { value: "faculty_chief", label: "Начальник факультета — для ДПФ" },
];

function dutyLabel(row: Pick<LandlinePhone, "duty_scope" | "faculty_id">): string {
  if (!row.duty_scope) return "—";
  if (row.duty_scope === "dpa") return "ДПА";
  if (row.duty_scope === "dpf") {
    return row.faculty_id ? `ДПФ, ${row.faculty_id} ф-т` : "ДПФ";
  }
  if (row.duty_scope === "faculty_chief") {
    return row.faculty_id ? `Нач., ${row.faculty_id} ф-т` : "Начальник";
  }
  return row.duty_scope;
}

function needsFaculty(scope: DutyFormScope): scope is "dpf" | "faculty_chief" {
  return scope === "dpf" || scope === "faculty_chief";
}

export function AdminLandlinePhonesPage() {
  const [items, setItems] = useState<LandlinePhone[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dutyScope, setDutyScope] = useState<DutyFormScope>("");
  const [facultyId, setFacultyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({});

  const load = async () => {
    const data = await api<LandlinePhone[]>("/api/landline-phones");
    setItems(data);
    setDrafts(
      Object.fromEntries(
        data.map((row) => [
          row.id,
          {
            name: row.name,
            phone: row.phone,
            duty_scope: row.duty_scope ?? "",
            faculty_id: row.faculty_id != null ? String(row.faculty_id) : "",
          },
        ])
      )
    );
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"));
  }, []);

  const buildDutyPayload = (scope: DutyFormScope, faculty: string) => {
    if (!scope) return { duty_scope: null, faculty_id: null };
    if (!needsFaculty(scope)) return { duty_scope: scope, faculty_id: null };
    const parsed = Number(faculty);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error("Укажите номер факультета (1, 2, 3 …)");
    }
    return { duty_scope: scope, faculty_id: parsed };
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const duty = buildDutyPayload(dutyScope, facultyId);
      await api("/api/landline-phones", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          phone: phone.trim(),
          sort_order: items.length ? Math.max(...items.map((row) => row.sort_order)) + 1 : 0,
          ...duty,
        }),
      });
      setName("");
      setPhone("");
      setDutyScope("");
      setFacultyId("");
      setMessage("Стационарный номер добавлен");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const saveRow = async (row: LandlinePhone) => {
    const draft = drafts[row.id];
    if (!draft) return;
    const nextName = draft.name.trim();
    const nextPhone = draft.phone.trim();
    if (!nextName) return;

    setSaving(true);
    setError("");
    try {
      const duty = buildDutyPayload(draft.duty_scope ?? "", draft.faculty_id);
      const sameDuty =
        (row.duty_scope ?? "") === (draft.duty_scope ?? "") &&
        (row.faculty_id ?? null) === duty.faculty_id;
      if (nextName === row.name && nextPhone === row.phone && sameDuty) return;

      await api(`/api/landline-phones/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: nextName,
          phone: nextPhone,
          ...duty,
        }),
      });
      setMessage("Изменения сохранены");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row: LandlinePhone, is_active: boolean) => {
    setSaving(true);
    setError("");
    try {
      await api(`/api/landline-phones/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active }),
      });
      setMessage(is_active ? "Номер снова в списке" : "Номер скрыт");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const move = async (row: LandlinePhone, dir: -1 | 1) => {
    const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const idx = ordered.findIndex((item) => item.id === row.id);
    const swap = ordered[idx + dir];
    if (!swap) return;
    setSaving(true);
    setError("");
    try {
      await Promise.all([
        api(`/api/landline-phones/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: swap.sort_order }),
        }),
        api(`/api/landline-phones/${swap.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: row.sort_order }),
        }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">Стационарные телефоны</h2>
      <p className="text-sm text-gray-600 mb-4">
        Раздел доступен только администратору. Для плашек у дежурных выберите назначение:{" "}
        <strong>ДПА</strong> (один на всю академию), <strong>ДПФ</strong> (учебный корпус — для
        ДПК, укажите номер факультета), <strong>Начальник факультета</strong> (для ДПФ, укажите
        номер факультета). Номер факультета — это цифра в id курса: у «63 курс» факультет{" "}
        <strong>6</strong>, у «21 курс» — <strong>2</strong>.
      </p>
      {message && (
        <div className="mb-3 p-3 bg-blue-50 text-blue-800 rounded text-sm">{message}</div>
      )}
      {error && <div className="mb-3 p-3 bg-red-50 text-red-800 rounded text-sm">{error}</div>}

      <form
        onSubmit={add}
        className="flex flex-wrap items-end justify-between gap-2 mb-4 bg-white p-4 rounded-lg shadow border border-gray-200 w-full"
      >
        <div className="flex flex-wrap gap-2 items-end flex-1 min-w-0">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Должность / название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border rounded px-2 py-1 text-sm min-w-[14rem]"
              placeholder="Начальник 6 факультета"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Номер</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-28"
              placeholder="94-74"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Назначение</label>
            <select
              value={dutyScope}
              onChange={(e) => setDutyScope(e.target.value as DutyFormScope)}
              className="border rounded px-2 py-1 text-sm min-w-[12rem]"
            >
              {DUTY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value ?? ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {needsFaculty(dutyScope) ? (
            <div>
              <label className="block text-xs text-gray-600 mb-1">№ факультета</label>
              <input
                type="number"
                min={1}
                max={99}
                value={facultyId}
                onChange={(e) => setFacultyId(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-20"
                placeholder="6"
                required
              />
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="vka-admin-form-btn vka-admin-form-btn--navy"
        >
          Добавить
        </button>
      </form>

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wide">
              <th className="py-2 px-3 font-medium">Порядок</th>
              <th className="py-2 px-3 font-medium">Должность</th>
              <th className="py-2 px-3 font-medium w-32">Номер</th>
              <th className="py-2 px-3 font-medium">Назначение</th>
              <th className="py-2 px-3 font-medium">Статус</th>
              <th className="py-2 px-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 px-3 text-center text-gray-500">
                  Справочник пуст — добавьте стационарный номер
                </td>
              </tr>
            ) : (
              ordered.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-t border-gray-100 ${row.is_active ? "" : "bg-gray-50 text-gray-500"}`}
                >
                  <td className="py-2 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={saving || index === 0}
                      onClick={() => void move(row, -1)}
                      className="text-xs text-vka-navy hover:underline disabled:opacity-30 mr-2"
                    >
                      Вверх
                    </button>
                    <button
                      type="button"
                      disabled={saving || index === ordered.length - 1}
                      onClick={() => void move(row, 1)}
                      className="text-xs text-vka-navy hover:underline disabled:opacity-30"
                    >
                      Вниз
                    </button>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      value={drafts[row.id]?.name ?? row.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: {
                            ...prev[row.id],
                            name: e.target.value,
                            phone: prev[row.id]?.phone ?? row.phone,
                            duty_scope: prev[row.id]?.duty_scope ?? row.duty_scope ?? "",
                            faculty_id:
                              prev[row.id]?.faculty_id ??
                              (row.faculty_id != null ? String(row.faculty_id) : ""),
                          },
                        }))
                      }
                      onBlur={() => void saveRow(row)}
                      className="border rounded px-2 py-1 text-sm w-full min-w-[10rem]"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      value={drafts[row.id]?.phone ?? row.phone}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: {
                            name: prev[row.id]?.name ?? row.name,
                            phone: e.target.value,
                            duty_scope: prev[row.id]?.duty_scope ?? row.duty_scope ?? "",
                            faculty_id:
                              prev[row.id]?.faculty_id ??
                              (row.faculty_id != null ? String(row.faculty_id) : ""),
                          },
                        }))
                      }
                      onBlur={() => void saveRow(row)}
                      className="border rounded px-2 py-1 text-sm w-full"
                    />
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-1">
                      <select
                        value={drafts[row.id]?.duty_scope ?? row.duty_scope ?? ""}
                        onChange={(e) => {
                          const nextScope = e.target.value as DutyFormScope;
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              name: prev[row.id]?.name ?? row.name,
                              phone: prev[row.id]?.phone ?? row.phone,
                              duty_scope: nextScope,
                              faculty_id: needsFaculty(nextScope)
                                ? prev[row.id]?.faculty_id ??
                                  (row.faculty_id != null ? String(row.faculty_id) : "")
                                : "",
                            },
                          }));
                        }}
                        onBlur={() => void saveRow(row)}
                        className="border rounded px-1 py-0.5 text-xs max-w-[9rem]"
                      >
                        {DUTY_OPTIONS.map((opt) => (
                          <option key={opt.label} value={opt.value ?? ""}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {needsFaculty(drafts[row.id]?.duty_scope ?? row.duty_scope ?? "") ? (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={drafts[row.id]?.faculty_id ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: {
                                name: prev[row.id]?.name ?? row.name,
                                phone: prev[row.id]?.phone ?? row.phone,
                                duty_scope: prev[row.id]?.duty_scope ?? row.duty_scope ?? "",
                                faculty_id: e.target.value,
                              },
                            }))
                          }
                          onBlur={() => void saveRow(row)}
                          className="border rounded px-1 py-0.5 text-xs w-12"
                          title="№ факультета"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{dutyLabel(row)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3">{row.is_active ? "В списке" : "Скрыт"}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.is_active ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void setActive(row, false)}
                        className="text-xs text-amber-800 hover:underline"
                      >
                        Скрыть
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void setActive(row, true)}
                        className="text-xs text-vka-navy hover:underline"
                      >
                        Показать
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
