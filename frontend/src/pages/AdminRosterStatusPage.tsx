import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RosterStatusFaculty, RosterStatusUnit, api } from "../api/client";
import { AdminFlash, AdminPageShell } from "../components/AdminPageShell";

function peopleLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} человек`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} человека`;
  return `${n} человек`;
}

function loadedPercentClass(pct: number): string {
  if (pct >= 100) return "text-emerald-700";
  if (pct >= 50) return "text-yellow-600";
  if (pct >= 30) return "text-orange-600";
  return "text-red-600";
}

function FacultyCard({
  faculty,
  open,
  onToggle,
  onlyUnloaded,
}: {
  faculty: RosterStatusFaculty;
  open: boolean;
  onToggle: () => void;
  onlyUnloaded: boolean;
}) {
  const rows = onlyUnloaded ? faculty.units.filter((u) => !u.loaded) : faculty.units;

  return (
    <div className="vka-admin-card !p-0 mb-3 overflow-hidden">
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left bg-vka-navy/5 hover:bg-vka-navy/10 transition"
        onClick={onToggle}
      >
        <span className="text-vka-navy text-sm shrink-0">{open ? "▼" : "▶"}</span>
        <span className="font-serif font-semibold text-vka-navy">{faculty.name}</span>
        <span className={`text-xs font-semibold ${loadedPercentClass(faculty.loaded_percent)}`}>
          {faculty.loaded_count}/{faculty.total_count} · {faculty.loaded_percent}%
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wide">
                <th className="py-2 px-3 font-medium">Подразделение</th>
                <th className="py-2 px-3 font-medium">Список</th>
                <th className="py-2 px-3 font-medium">Людей</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((unit) => (
                <UnitRow key={unit.unit_id} unit={unit} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnitRow({ unit }: { unit: RosterStatusUnit }) {
  return (
    <tr
      className={`border-b border-gray-100 last:border-0 ${
        unit.loaded ? "hover:bg-gray-50" : "bg-amber-50/70"
      }`}
    >
      <td className="py-2 px-3">
        <Link
          to={`/attendance?unit=${unit.unit_id}`}
          className="font-medium text-vka-navy hover:underline"
        >
          {unit.name}
        </Link>
        <span className="block text-xs text-gray-500">
          {unit.kind === "officers" ? "офицеры" : `id ${unit.unit_id}`}
        </span>
      </td>
      <td className="py-2 px-3">
        {unit.loaded ? (
          <span className="text-emerald-800">загружен</span>
        ) : (
          <span className="text-amber-900">не загружен</span>
        )}
      </td>
      <td className="py-2 px-3 text-gray-700">{peopleLabel(unit.people_count)}</td>
    </tr>
  );
}

export function AdminRosterStatusPage() {
  const [faculties, setFaculties] = useState<RosterStatusFaculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyUnloaded, setOnlyUnloaded] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = async () => {
    setError("");
    try {
      const data = await api<RosterStatusFaculty[]>("/api/units/roster-status");
      setFaculties(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(
    () =>
      onlyUnloaded
        ? faculties.filter((f) => f.units.some((u) => !u.loaded))
        : faculties,
    [faculties, onlyUnloaded]
  );

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadedFaculties = faculties.filter((f) => f.loaded_count === f.total_count).length;

  return (
    <AdminPageShell title="Загрузка списков">
      <AdminFlash error={error} />

      {loading ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : (
        <>
          <div className="vka-admin-card !py-3 mb-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600">
              Готовы полностью:{" "}
              <strong className="text-vka-navy">
                {loadedFaculties} из {faculties.length}
              </strong>
            </p>
            <label className="ml-auto flex items-center gap-2 text-sm text-vka-navy cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnloaded}
                onChange={(e) => setOnlyUnloaded(e.target.checked)}
              />
              только без списка
            </label>
          </div>

          {visible.map((faculty) => (
            <FacultyCard
              key={faculty.faculty_id}
              faculty={faculty}
              open={expanded.has(faculty.faculty_id)}
              onToggle={() => toggle(faculty.faculty_id)}
              onlyUnloaded={onlyUnloaded}
            />
          ))}

          {visible.length === 0 && (
            <div className="vka-admin-card py-10 text-center text-sm text-gray-500">
              {onlyUnloaded ? "Все списки загружены" : "Факультеты не найдены"}
            </div>
          )}
        </>
      )}
    </AdminPageShell>
  );
}
