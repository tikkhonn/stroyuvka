import { FormEvent, useEffect, useState } from "react";
import { LoginDaySummary, UnitNode, UnitRead, api } from "../api/client";
import { courseDisplayName, parseCourseId } from "../lib/courseId";
import { AdminFlash, AdminPageShell } from "../components/AdminPageShell";

const TYPE_LABELS: Record<string, string> = {
  location: "расположение",
  faculty: "факультет",
  course: "курс",
  department: "кафедра",
};

const NAMED_UNIT_ID_MIN = 2001;
const NAMED_UNIT_ID_MAX = 2999;

function isNamedUnitNode(node: UnitNode) {
  return Boolean(node.is_named) || (node.id >= NAMED_UNIT_ID_MIN && node.id <= NAMED_UNIT_ID_MAX);
}

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
  officerGroup,
}: {
  node: UnitNode;
  locations: UnitRead[];
  view: TreeView;
  onMove: (courseId: number, locationId: number) => void;
  onDelete: (courseId: number) => void;
  officerGroup?: boolean;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="py-2 px-3 font-mono text-xs text-vka-navy">{node.id}</td>
      <td className="py-2 px-3">
        <span className="font-medium text-vka-navy">{node.name}</span>
        {!officerGroup && (
          <span className="block text-xs text-gray-500">{courseMeta(node.id).label}</span>
        )}
      </td>
      {view === "faculty" && (
        <td className="py-2 px-3 text-xs text-gray-600">
          {officerGroup ? "—" : node.location_name || "—"}
        </td>
      )}
      <td className="py-2 px-3 text-xs text-vka-gold">dpk-{node.id}</td>
      <td className="py-2 px-3">
        {officerGroup ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
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
        )}
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
  onDeleteNamedUnit,
  onAddOfficerGroup,
  onDeleteOfficerGroup,
}: {
  node: UnitNode;
  view: TreeView;
  open: boolean;
  onToggle: () => void;
  locations: UnitRead[];
  onMoveCourse: (courseId: number, locationId: number) => void;
  onDeleteCourse: (courseId: number) => void;
  onDeleteFaculty: (facultyId: number) => void;
  onDeleteNamedUnit: (unitId: number) => void;
  onAddOfficerGroup: (facultyId: number, name: string) => Promise<void>;
  onDeleteOfficerGroup: (groupId: number) => void;
}) {
  const [groupName, setGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const typeStr = String(node.type);
  const isFaculty = typeStr === "faculty";
  const isNamed = isFaculty && isNamedUnitNode(node);
  const courses = node.children?.filter((c) => String(c.type) === "course") ?? [];
  const departments = node.children?.filter((c) => String(c.type) === "department") ?? [];

  const submitGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setAddingGroup(true);
    try {
      await onAddOfficerGroup(node.id, groupName.trim());
      setGroupName("");
    } finally {
      setAddingGroup(false);
    }
  };

  return (
    <div className="vka-admin-card !p-0 mb-3 overflow-hidden">
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
          {isNamed
            ? "именованное подразделение"
            : isFaculty
              ? "факультет"
              : TYPE_LABELS[typeStr] || typeStr}
        </span>
        {isNamed && (
          <span className="text-xs bg-vka-gold/15 text-vka-navy px-2 py-0.5 rounded">
            постоянный состав
          </span>
        )}
        <span className="text-xs text-gray-500">
          {isNamed
            ? courses.length
              ? `${courses.length} групп`
              : "групп пока нет"
            : courses.length
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
              if (isNamed) onDeleteNamedUnit(node.id);
              else onDeleteFaculty(node.id);
            }}
            className="ml-auto text-xs text-red-600 hover:underline"
          >
            {isNamed ? "Удалить подразделение" : "Удалить факультет"}
          </button>
        )}
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {isNamed && (
            <form
              onSubmit={submitGroup}
              className="px-4 py-3 flex flex-wrap gap-2 items-end border-b border-gray-100 bg-gray-50/80"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs text-gray-600 mb-1">Группа офицеров</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Управление, 1 отделение…"
                  className="border rounded px-2 py-1 w-full max-w-md text-sm"
                  maxLength={255}
                />
              </div>
              <button
                type="submit"
                disabled={addingGroup || !groupName.trim()}
                className="vka-admin-form-btn vka-admin-form-btn--gold text-sm"
              >
                Добавить группу
              </button>
            </form>
          )}
          {!isNamed && childCount(node) === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              {typeStr === "location"
                ? "В этом расположении пока нет курсов"
                : "В факультете пока нет курсов и кафедр"}
            </p>
          ) : isNamed && courses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">
              Добавьте группу — для каждой создаётся пост ДПК
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
                      onDelete={isNamed ? onDeleteOfficerGroup : onDeleteCourse}
                      officerGroup={isNamed}
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
  const [namedUnitName, setNamedUnitName] = useState("");
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

  const addNamedUnit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      const unit = await api<UnitRead>("/api/units/named", {
        method: "POST",
        body: JSON.stringify({ name: namedUnitName.trim() }),
      });
      setMessage(`Подразделение «${unit.name}» создано (id ${unit.id})`);
      setNamedUnitName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const addOfficerGroup = async (facultyId: number, name: string) => {
    setMessage("");
    setError("");
    try {
      const group = await api<UnitRead>(`/api/units/named/${facultyId}/groups`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setMessage(`Группа «${group.name}» создана (id ${group.id}, dpk-${group.id})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      throw err;
    }
  };

  const deleteOfficerGroup = async (groupId: number) => {
    if (!confirm(`Удалить группу id ${groupId}?`)) return;
    setMessage("");
    setError("");
    try {
      await api(`/api/units/named/groups/${groupId}`, { method: "DELETE" });
      setMessage(`Группа id ${groupId} удалена`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const deleteNamedUnit = async (unitId: number) => {
    if (!confirm(`Удалить подразделение id ${unitId}?`)) return;
    setMessage("");
    setError("");
    try {
      await api(`/api/units/named/${unitId}`, { method: "DELETE" });
      setMessage(`Подразделение id ${unitId} удалено`);
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
    <AdminPageShell title="ОШС">
      <form
        onSubmit={addCourse}
        className="vka-admin-card flex flex-wrap gap-3 items-end"
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
        onSubmit={addNamedUnit}
        className="vka-admin-card flex flex-wrap gap-3 items-end"
      >
        <div className="min-w-[220px]">
          <label className="block text-xs text-gray-600 mb-1">
            Подразделение постоянного состава
          </label>
          <input
            type="text"
            value={namedUnitName}
            onChange={(e) => setNamedUnitName(e.target.value)}
            placeholder="Спецфакультет ВИНИ, Управление…"
            className="border rounded px-2 py-1 w-full max-w-md"
            maxLength={255}
            required
          />
        </div>
        <button type="submit" className="vka-admin-form-btn vka-admin-form-btn--gold">
          Добавить подразделение
        </button>
      </form>

      <AdminFlash message={message} error={error} />

      <div className="vka-admin-card flex flex-wrap gap-2 items-center !py-3">
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
                "Сбросить ОШС? Расположения 1001–1003, факультеты 1–9, все курсы будут удалены. Именованные подразделения (id 2001+) не затрагиваются."
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
          <div className="vka-admin-card py-10 text-center text-sm text-gray-500">
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
              onDeleteNamedUnit={deleteNamedUnit}
              onAddOfficerGroup={addOfficerGroup}
              onDeleteOfficerGroup={deleteOfficerGroup}
            />
          ))
        )}
      </div>
    </AdminPageShell>
  );
}

function loginActorLabel(actorKind: string): string {
  return actorKind === "duty_post" ? "Дежурный" : "Пользователь";
}

function formatLoginDayTitle(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function pluralPeople(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "человека";
  return "человек";
}

function LoginDayCard({ day }: { day: LoginDaySummary }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="vka-admin-card !p-0 overflow-hidden">
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-vka-navy text-sm shrink-0">{open ? "▼" : "▶"}</span>
        <span className="font-medium text-vka-navy capitalize">{formatLoginDayTitle(day.date)}</span>
        <span className="ml-auto text-sm text-gray-600">
          {day.unique_count} {pluralPeople(day.unique_count)}
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          <table className="vka-table w-full text-sm">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Тип</th>
                <th>Первый вход</th>
              </tr>
            </thead>
            <tbody>
              {day.entries.map((entry) => (
                <tr key={`${entry.actor_kind}-${entry.actor_id}`}>
                  <td className="font-medium text-vka-navy">{entry.actor_name}</td>
                  <td>{loginActorLabel(entry.actor_kind)}</td>
                  <td className="whitespace-nowrap">
                    {new Date(entry.first_login_at).toLocaleString("ru-RU", {
                      timeZone: "Europe/Moscow",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AuditPage() {
  const [days, setDays] = useState<LoginDaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api<LoginDaySummary[]>("/api/audit/login-days?days=30")
      .then(setDays)
      .catch((e) => {
        setDays([]);
        setError(e instanceof Error ? e.message : "Не удалось загрузить журнал");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminPageShell title="Журнал входов">
      <AdminFlash error={error} />
      {loading ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : days.length === 0 ? (
        <div className="vka-admin-card py-10 text-center text-sm text-gray-500">
          За этот период входов не было
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <LoginDayCard key={day.date} day={day} />
          ))}
        </div>
      )}
    </AdminPageShell>
  );
}
