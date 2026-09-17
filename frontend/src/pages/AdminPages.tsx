import { FormEvent, useEffect, useState } from "react";
import { AuditEntry, UnitNode, UnitRead, api } from "../api/client";
import { courseDisplayName, parseCourseId } from "../lib/courseId";

const TYPE_LABELS: Record<string, string> = {
  location: "расположение",
  faculty: "факультет",
  course: "курс",
  department: "кафедра",
};

function courseMeta(id: number) {
  const { faculty, course } = parseCourseId(id);
  return { faculty, course, label: courseDisplayName(id) };
}

type TreeView = "location" | "faculty";

function childCount(node: UnitNode) {
  return node.children?.length ?? 0;
}

function pluralCourses(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} курс`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} курса`;
  return `${n} курсов`;
}

function CourseRow({
  node,
  locations,
  view,
  onMove,
  onDelete,
}: {
  node: UnitNode;
  locations: UnitRead[];
  view: TreeView;
  onMove: (courseId: number, locationId: number) => void;
  onDelete: (courseId: number) => void;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="py-2 px-3 font-mono text-xs text-vka-navy">{node.id}</td>
      <td className="py-2 px-3">
        <span className="font-medium text-vka-navy">{node.name}</span>
        <span className="block text-xs text-gray-500">{courseMeta(node.id).label}</span>
      </td>
      {view === "faculty" && (
        <td className="py-2 px-3 text-xs text-gray-600">{node.location_name || "—"}</td>
      )}
      <td className="py-2 px-3 text-xs text-vka-gold">dpk-{node.id}</td>
      <td className="py-2 px-3">
        <select
          className="text-xs border rounded px-2 py-1"
          value={node.parent_id ?? node.location_id ?? ""}
          onChange={(e) => onMove(node.id, Number(e.target.value))}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 px-3">
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="text-xs text-red-600 hover:underline"
        >
          Удалить
        </button>
      </td>
    </tr>
  );
}

function DepartmentRow({ node, view }: { node: UnitNode; view: TreeView }) {
  const extraCols = view === "faculty" ? 4 : 3;
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="py-2 px-3 font-mono text-xs text-vka-navy">{node.id}</td>
      <td className="py-2 px-3 font-medium text-vka-navy" colSpan={extraCols}>
        {node.name} · {TYPE_LABELS.department}
      </td>
    </tr>
  );
}

function CollapsibleGroup({
  node,
  view,
  open,
  onToggle,
  locations,
  onMoveCourse,
  onDeleteCourse,
  onDeleteFaculty,
}: {
  node: UnitNode;
  view: TreeView;
  open: boolean;
  onToggle: () => void;
  locations: UnitRead[];
  onMoveCourse: (courseId: number, locationId: number) => void;
  onDeleteCourse: (courseId: number) => void;
  onDeleteFaculty: (facultyId: number) => void;
}) {
  const typeStr = String(node.type);
  const isFaculty = typeStr === "faculty";
  const courses = node.children?.filter((c) => String(c.type) === "course") ?? [];
  const departments = node.children?.filter((c) => String(c.type) === "department") ?? [];

  return (
    <div className="border border-gray-200 rounded-lg mb-3 overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left bg-vka-navy/5 hover:bg-vka-navy/10 transition"
        onClick={onToggle}
      >
        <span className="text-vka-navy text-sm shrink-0">{open ? "▼" : "▶"}</span>
        <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border text-vka-navy">
          id {node.id}
        </span>
        <span className="font-serif font-semibold text-vka-navy">{node.name}</span>
        <span className="text-xs text-gray-500">
          {isFaculty ? "факультет" : TYPE_LABELS[typeStr] || typeStr}
        </span>
        <span className="text-xs text-gray-500">
          {courses.length
            ? pluralCourses(courses.length) +
              (departments.length ? ` · ${departments.length} каф.` : "")
            : departments.length
              ? `${departments.length} каф.`
              : "пусто"}
        </span>
        {isFaculty && (
          <span className="text-xs text-vka-gold">логин dpf-{node.id}</span>
        )}
        {isFaculty && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFaculty(node.id);
            }}
            className="ml-auto text-xs text-red-600 hover:underline"
          >
            Удалить факультет
          </button>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {childCount(node) === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              {typeStr === "location"
                ? "В этом расположении пока нет курсов"
                : "В факультете пока нет курсов и кафедр"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wide">
                    <th className="py-2 px-3 font-medium">ID</th>
                    <th className="py-2 px-3 font-medium">Подразделение</th>
                    {view === "faculty" && (
                      <th className="py-2 px-3 font-medium">Расположение</th>
                    )}
                    <th className="py-2 px-3 font-medium">Логин</th>
                    <th className="py-2 px-3 font-medium">Перенести</th>
                    <th className="py-2 px-3 font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <CourseRow
                      key={c.id}
                      node={c}
                      locations={locations}
                      view={view}
                      onMove={onMoveCourse}
                      onDelete={onDeleteCourse}
                    />
                  ))}
                  {departments.map((d) => (
                    <DepartmentRow key={d.id} node={d} view={view} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminUnitsPage() {
  const [view, setView] = useState<TreeView>("location");
  const [tree, setTree] = useState<UnitNode[]>([]);
  const [locations, setLocations] = useState<UnitRead[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [courseFaculty, setCourseFaculty] = useState(1);
  const [courseNumber, setCourseNumber] = useState(1);
  const [courseLocationId, setCourseLocationId] = useState(1001);
  const [facultyNumber, setFacultyNumber] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [t, locs] = await Promise.all([
      api<UnitNode[]>(`/api/units/tree?view=${view}`),
      api<UnitRead[]>("/api/units/locations"),
    ]);
    setTree(t);
    setLocations(locs);
    if (locs.length && !locs.find((l) => l.id === courseLocationId)) {
      setCourseLocationId(locs[0].id);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [view]);

  useEffect(() => {
    setExpandedIds(new Set(tree.map((n) => n.id)));
  }, [tree, view]);

  const toggleGroup = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(tree.map((n) => n.id)));
  const collapseAll = () => setExpandedIds(new Set());

  const addCourse = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    const cid = courseFaculty * 10 + courseNumber;
    try {
      await api("/api/units/courses", {
        method: "POST",
        body: JSON.stringify({
          faculty_number: courseFaculty,
          course_number: courseNumber,
          location_id: courseLocationId,
        }),
      });
      setMessage(`Курс id ${cid} (${courseMeta(cid).label}) добавлен; факультет создан при необходимости`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const addCoursesBulk = async () => {
    setMessage("");
    setError("");
    try {
      const result = await api<{
        created: { id: number; name: string }[];
        skipped: { id: number; name: string }[];
      }>("/api/units/courses/bulk", {
        method: "POST",
        body: JSON.stringify({
          faculty_number: courseFaculty,
          location_id: courseLocationId,
        }),
      });

      const parts: string[] = [];
      if (result.created.length > 0) {
        parts.push(
          `Создано: ${result.created.map((c) => c.id).join(", ")}`
        );
      }
      if (result.skipped.length > 0) {
        parts.push(
          `Пропущено (уже есть): ${result.skipped.map((c) => c.id).join(", ")}`
        );
      }
      if (parts.length === 0) {
        setMessage("Все курсы (1–5) для этого факультета уже существуют");
      } else {
        setMessage(parts.join(". "));
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const addFaculty = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/api/units/faculties", {
        method: "POST",
        body: JSON.stringify({ faculty_number: facultyNumber }),
      });
      setMessage(`Факультет №${facultyNumber} создан (без курсов)`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const deleteFaculty = async (num: number) => {
    if (!confirm(`Удалить ${num}-й факультет и все его курсы?`)) return;
    setMessage("");
    setError("");
    try {
      await api(`/api/units/faculties/${num}`, { method: "DELETE" });
      setMessage(`Факультет №${num} удалён`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const moveCourse = async (courseId: number, newLocationId: number) => {
    try {
      await api(`/api/units/courses/${courseId}/location`, {
        method: "PATCH",
        body: JSON.stringify({ location_id: newLocationId }),
      });
      setMessage(`Курс id ${courseId} перенесён`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const deleteCourse = async (courseId: number) => {
    if (!confirm(`Удалить курс id ${courseId}? Факультет останется.`)) return;
    setMessage("");
    setError("");
    try {
      await api(`/api/units/courses/${courseId}`, { method: "DELETE" });
      setMessage(`Курс id ${courseId} удалён`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-2">ОШС</h2>
      <p className="text-sm text-gray-600 mb-4">
        ID курса = факультет × 10 + год (14 = 14 курс, 63 = 63 курс). Расположения:{" "}
        <strong>1001 Академия</strong>, 1002 ВГ №6 (Пушкин), 1003 ВГ №61 (Лехтуси). Факультет без
        расположения;
        курс привязан к расположению. Расход факта = все его курсы; расположения — отдельный
        срез; «вся академия» = все курсы + офицеры.
      </p>

      <form
        onSubmit={addCourse}
        className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end"
      >
        <div>
          <label className="block text-xs text-gray-600 mb-1">Факультет</label>
          <input
            type="number"
            min={1}
            max={99}
            value={courseFaculty}
            onChange={(e) => setCourseFaculty(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Год (1–5)</label>
          <input
            type="number"
            min={1}
            max={5}
            value={courseNumber}
            onChange={(e) => setCourseNumber(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            id = {courseFaculty * 10 + courseNumber}
          </label>
          <select
            value={courseLocationId}
            onChange={(e) => setCourseLocationId(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id} — {l.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="vka-admin-form-btn vka-admin-form-btn--gold"
        >
          Добавить курс в расположение
        </button>
        <button
          type="button"
          onClick={addCoursesBulk}
          className="vka-admin-form-btn vka-admin-form-btn--navy"
        >
          Добавить все курсы (1–5)
        </button>
      </form>

      <form
        onSubmit={addFaculty}
        className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end"
      >
        <div>
          <label className="block text-xs text-gray-600 mb-1">Пустой факультет</label>
          <input
            type="number"
            min={1}
            max={99}
            value={facultyNumber}
            onChange={(e) => setFacultyNumber(Number(e.target.value))}
            className="border rounded px-2 py-1 w-24"
          />
        </div>
        <button type="submit" className="vka-admin-form-btn vka-admin-form-btn--navy">
          Создать факультет
        </button>
      </form>

      {message && <p className="text-sm text-green-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => setView("location")}
          className={`text-sm px-3 py-1.5 rounded border ${
            view === "location"
              ? "bg-vka-navy text-white border-vka-navy"
              : "bg-white text-vka-navy border-gray-200"
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
              : "bg-white text-vka-navy border-gray-200"
          }`}
        >
          По факультетам
        </button>
        <button
          type="button"
          onClick={expandAll}
          className="text-sm px-3 py-1.5 rounded border bg-white text-vka-navy border-gray-200 hover:bg-gray-50"
        >
          Развернуть все
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="text-sm px-3 py-1.5 rounded border bg-white text-vka-navy border-gray-200 hover:bg-gray-50"
        >
          Свернуть все
        </button>
        <button
          type="button"
          onClick={async () => {
            if (
              !confirm(
                "Сбросить ОШС? Расположения 1001–1003, факультеты 1–9, все курсы будут удалены."
              )
            )
              return;
            try {
              await api("/api/units/rebuild-default", { method: "POST" });
              setMessage("ОШС сброшена: расположения 1001–1003, факультеты 1–9, курсов нет");
              load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Ошибка");
            }
          }}
          className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded hover:bg-amber-100 ml-auto"
        >
          Сбросить ОШС (без курсов)
        </button>
      </div>

      <div className="space-y-0">
        {tree.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-sm text-gray-500">
            Подразделений пока нет
          </div>
        ) : (
          tree.map((node) => (
            <CollapsibleGroup
              key={`${view}-${node.id}`}
              node={node}
              view={view}
              open={expandedIds.has(node.id)}
              onToggle={() => toggleGroup(node.id)}
              locations={locations}
              onMoveCourse={moveCourse}
              onDeleteCourse={deleteCourse}
              onDeleteFaculty={deleteFaculty}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    api<AuditEntry[]>("/api/audit").then(setEntries).catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">Журнал действий</h2>
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="vka-table w-full">
          <thead>
            <tr>
              <th>Время</th>
              <th>Оператор</th>
              <th>Действие</th>
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString("ru-RU")}</td>
                <td>{e.actor_name}</td>
                <td>{e.action}</td>
                <td>{e.details || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
