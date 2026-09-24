import { FormEvent, useEffect, useState } from "react";
import { Hospital, api } from "../api/client";
import { AdminFlash, AdminPageShell } from "../components/AdminPageShell";

export function AdminHospitalsPage() {
  const [items, setItems] = useState<Hospital[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const load = async () => {
    const data = await api<Hospital[]>("/api/hospitals");
    setItems(data);
    setDrafts(Object.fromEntries(data.map((h) => [h.id, h.name])));
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"));
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/api/hospitals", {
        method: "POST",
        body: JSON.stringify({
          name: trimmed,
          sort_order: items.length ? Math.max(...items.map((h) => h.sort_order)) + 1 : 0,
        }),
      });
      setName("");
      setMessage("Мед. учреждение добавлено");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const rename = async (hospital: Hospital) => {
    const next = (drafts[hospital.id] ?? hospital.name).trim();
    if (!next || next === hospital.name) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/hospitals/${hospital.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next }),
      });
      setMessage("Название сохранено");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (hospital: Hospital, is_active: boolean) => {
    setSaving(true);
    setError("");
    try {
      await api(`/api/hospitals/${hospital.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active }),
      });
      setMessage(is_active ? "Мед. учреждение снова в списке" : "Мед. учреждение скрыто");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const move = async (hospital: Hospital, dir: -1 | 1) => {
    const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const idx = ordered.findIndex((h) => h.id === hospital.id);
    const swap = ordered[idx + dir];
    if (!swap) return;
    setSaving(true);
    setError("");
    try {
      await Promise.all([
        api(`/api/hospitals/${hospital.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: swap.sort_order }),
        }),
        api(`/api/hospitals/${swap.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sort_order: hospital.sort_order }),
        }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageShell title="Мед. учреждения">
      <AdminFlash message={message} error={error} />

      <form onSubmit={add} className="vka-admin-card flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Название</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-2 py-1 text-sm min-w-[16rem]"
            placeholder="Госпиталь №1"
            required
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="vka-admin-form-btn vka-admin-form-btn--navy"
        >
          Добавить
        </button>
      </form>

      <div className="vka-admin-table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wide">
              <th className="py-2 px-3 font-medium">Порядок</th>
              <th className="py-2 px-3 font-medium">Название</th>
              <th className="py-2 px-3 font-medium">Статус</th>
              <th className="py-2 px-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 px-3 text-center text-gray-500">
                  Справочник пуст — добавьте мед. учреждение
                </td>
              </tr>
            ) : (
              items.map((h, i) => (
                <tr key={h.id} className={`border-t border-gray-100 ${h.is_active ? "" : "bg-gray-50 text-gray-500"}`}>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={saving || i === 0}
                      onClick={() => void move(h, -1)}
                      className="text-xs text-vka-navy hover:underline disabled:opacity-30 mr-2"
                    >
                      Вверх
                    </button>
                    <button
                      type="button"
                      disabled={saving || i === items.length - 1}
                      onClick={() => void move(h, 1)}
                      className="text-xs text-vka-navy hover:underline disabled:opacity-30"
                    >
                      Вниз
                    </button>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      value={drafts[h.id] ?? h.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [h.id]: e.target.value }))
                      }
                      onBlur={() => void rename(h)}
                      className="border rounded px-2 py-1 text-sm w-full min-w-[12rem]"
                    />
                  </td>
                  <td className="py-2 px-3">{h.is_active ? "В списке" : "Скрыта"}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {h.is_active ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void setActive(h, false)}
                        className="text-xs text-amber-800 hover:underline"
                      >
                        Скрыть
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void setActive(h, true)}
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
    </AdminPageShell>
  );
}
