import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AbsenceEntry,
  AttendanceAggregate,
  AttendanceSnapshot,
  DepartmentStroevkaSummary,
  FacultyStroevkaBundle,
  api,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { SummaryCards } from "../components/SummaryCards";
import { ReportPipelineBar } from "../components/ReportPipelineBar";
import { StatusBadge } from "../components/StatusBadge";
import { SubmittedReportStatus } from "../components/SubmittedReportStatus";
import { DutyLandlinePlaque } from "../components/DutyLandlinePlaque";
import { onWsEvent } from "../api/ws";
import { formatAbsenceName } from "../constants/ranks";
import { formatAbsenceCategory, formatAbsenceReason, absenceCategoryTextClass, absenceCategoryRowClass } from "../constants/absenceCategories";
import { todayLocal } from "../utils/date";

function formatDateRu(iso: string): string {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}.${m}.${y}`;
  return iso;
}

function absenceReasonLabel(row: AbsenceEntry): string {
  return formatAbsenceReason(
    row.category_code,
    row.status_date,
    row.note,
    row.hospital_name
  );
}

function emptyAggregate(): AttendanceAggregate {
  return {
    total_list: 0,
    present: 0,
    duty: 0,
    trip: 0,
    leave: 0,
    sick: 0,
    dismissal: 0,
    away_dorm: 0,
    other: 0,
    arrest: 0,
  };
}

function sumAggregates(parts: AttendanceAggregate[]): AttendanceAggregate {
  if (!parts.length) return emptyAggregate();
  const total_list = parts.reduce((sum, part) => sum + part.total_list, 0);
  const duty = parts.reduce((sum, part) => sum + part.duty, 0);
  const trip = parts.reduce((sum, part) => sum + part.trip, 0);
  const leave = parts.reduce((sum, part) => sum + part.leave, 0);
  const sick = parts.reduce((sum, part) => sum + part.sick, 0);
  const dismissal = parts.reduce((sum, part) => sum + part.dismissal, 0);
  const away_dorm = parts.reduce((sum, part) => sum + part.away_dorm, 0);
  const other = parts.reduce((sum, part) => sum + part.other, 0);
  const arrest = parts.reduce((sum, part) => sum + part.arrest, 0);
  const totalAbsent = duty + trip + leave + sick + dismissal + away_dorm + other + arrest;
  return {
    total_list,
    present: Math.max(0, total_list - totalAbsent),
    duty,
    trip,
    leave,
    sick,
    dismissal,
    away_dorm,
    other,
    arrest,
  };
}

function AbsencesList({ rows }: { rows: AbsenceEntry[] }) {
  if (!rows.length) return <p className="text-sm text-gray-500">Отсутствующих нет</p>;
  return (
    <ul className="text-sm space-y-1">
      {rows.map((r) => {
        const colorClass = absenceCategoryTextClass(r.category_code);
        return (
        <li key={r.id}>
          <span className={`font-medium ${colorClass}`}>{formatAbsenceName(r)}</span> —{" "}
          <span className={colorClass}>
            {formatAbsenceCategory(r.category_code, r.status_date)}
          </span>
        </li>
        );
      })}
    </ul>
  );
}

function CourseCard({
  course,
  date,
  role,
  canAckDpf,
  canAckDpa,
  defaultOpen,
  onAck,
}: {
  course: FacultyStroevkaBundle["courses"][0];
  date: string;
  role: string;
  canAckDpf: boolean;
  canAckDpa: boolean;
  defaultOpen: boolean;
  onAck: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const pending =
    (canAckDpf && course.changes_pending_dpf) || (canAckDpa && course.changes_pending_dpa);

  const ack = async () => {
    const path = canAckDpf
      ? `/api/reports/courses/${course.course_id}/ack-dpf?report_date=${date}`
      : `/api/reports/courses/${course.course_id}/ack-dpa?report_date=${date}`;
    await api(path, { method: "POST" });
    onAck();
  };

  return (
    <div
      className={`border rounded-lg mb-2 ${
        pending ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white"
      }`}
    >
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium text-vka-navy">
          {open ? "▼" : "▶"} {course.course_name}
        </span>
        {role === "dpa" ? (
          <ReportPipelineBar status={course.report_status} />
        ) : (
          course.report_status && <StatusBadge status={course.report_status} />
        )}
        {pending && (
          <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
            есть изменения
          </span>
        )}
        <span className="text-sm text-gray-600 ml-auto">
          список {course.aggregate.total_list} · налицо {course.aggregate.present}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <SummaryCards agg={course.aggregate} />
          <AbsencesList rows={course.absences} />
          {pending && (
            <button
              type="button"
              onClick={ack}
              className="mt-3 bg-green-700 text-white px-3 py-1.5 rounded text-sm"
            >
              {canAckDpf ? "Подтвердить изменения (→ уведомление ДПА)" : "Подтвердить"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DepartmentBlock({ dept }: { dept: DepartmentStroevkaSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border rounded-lg mb-2 border-gray-100 bg-gray-50/50">
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium text-vka-navy text-sm">
          {open ? "▼" : "▶"} {dept.name}
        </span>
        <span className="text-sm text-gray-600 ml-auto">
          список {dept.aggregate.total_list} · налицо {dept.aggregate.present}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <SummaryCards agg={dept.aggregate} />
          <div className="mt-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Отсутствующие</p>
            <AbsencesList rows={dept.absences} />
          </div>
        </div>
      )}
    </div>
  );
}

function OfficersCard({
  officers,
  role,
  showEditHint,
  defaultOpen = false,
}: {
  officers: AttendanceSnapshot;
  role: string;
  showEditHint: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const departments = officers.departments ?? [];
  const hasDepartments = departments.length > 0;

  return (
    <div className="border rounded-lg mb-2 border-gray-200 bg-white">
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium text-vka-navy">
          {open ? "▼" : "▶"} Офицеры / постоянный состав
        </span>
        {role === "dpa" ? (
          <ReportPipelineBar status={officers.report_status} isOfficers />
        ) : (
          officers.report_status && <StatusBadge status={officers.report_status} />
        )}
        <span className="text-sm text-gray-600 ml-auto">
          список {officers.aggregate.total_list} · налицо {officers.aggregate.present}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {hasDepartments ? (
            <>
              {departments.map((dept) => (
                <DepartmentBlock key={dept.code ?? "_none"} dept={dept} />
              ))}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-vka-navy mb-2">Итого</p>
                <SummaryCards agg={officers.aggregate} />
                <div className="mt-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                    Отсутствующие
                  </p>
                  <AbsencesList rows={officers.absences} />
                </div>
              </div>
            </>
          ) : (
            <>
              <SummaryCards agg={officers.aggregate} />
              <div className="mt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Отсутствующие</p>
                <AbsencesList rows={officers.absences} />
              </div>
            </>
          )}
          {showEditHint && (
            <p className="mt-4 text-sm text-gray-600">
              Заполнение и правки — в разделе{" "}
              <Link to="/attendance" className="text-vka-navy font-medium underline">
                Офицеры
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function VariableCompositionAbsencesTable({
  courses,
}: {
  courses: FacultyStroevkaBundle["courses"];
}) {
  const rows = courses
    .filter((course) => course.absences.length > 0)
    .flatMap((course) =>
      course.absences.map((absence) => ({
        key: `${course.course_id}-${absence.id}`,
        courseName: course.course_name,
        absence,
      }))
    );

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">Отсутствующих нет</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="vka-table w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th>Курс</th>
            <th>ФИО</th>
            <th>Причина</th>
            <th>С</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, courseName, absence }) => {
            const colorClass = absenceCategoryTextClass(absence.category_code);
            return (
              <tr key={key} className={absenceCategoryRowClass(absence.category_code)}>
                <td className="whitespace-nowrap">{courseName}</td>
                <td className={`font-medium ${colorClass}`}>{formatAbsenceName(absence)}</td>
                <td className={colorClass}>{absenceReasonLabel(absence)}</td>
                <td className="whitespace-nowrap">{formatDateRu(absence.status_date)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VariableCompositionCard({
  courses,
  defaultOpen = false,
}: {
  courses: FacultyStroevkaBundle["courses"];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const aggregate = sumAggregates(courses.map((course) => course.aggregate));

  return (
    <div className="border rounded-lg mb-2 border-gray-200 bg-white">
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium text-vka-navy">
          {open ? "▼" : "▶"} Строевая записка (переменный состав)
        </span>
        <span className="text-sm text-gray-600 ml-auto">
          список {aggregate.total_list} · налицо {aggregate.present}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <SummaryCards agg={aggregate} />
          <div className="mt-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Отсутствующие</p>
            <VariableCompositionAbsencesTable courses={courses} />
          </div>
        </div>
      )}
    </div>
  );
}

function FacultyBlock({
  bundle,
  date,
  role,
  onReload,
}: {
  bundle: FacultyStroevkaBundle;
  date: string;
  role: string;
  onReload: () => void;
}) {
  const [open, setOpen] = useState(
    role === "dpf" || bundle.has_pending_for_dpf || bundle.has_pending_for_dpa
  );
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending =
    (role === "dpf" && bundle.has_pending_for_dpf) ||
    (role === "dpa" && bundle.has_pending_for_dpa);

  const facultyStatus = bundle.faculty_report_status ?? null;
  const isSubmitted = facultyStatus === "submitted" || facultyStatus === "approved";
  const isEditing = Boolean(bundle.is_editing);
  const canFirstSubmit =
    !facultyStatus || facultyStatus === "draft" || facultyStatus === "rejected";
  const submitBlockers = bundle.submit_blockers ?? [];
  const canSubmitNow = submitBlockers.length === 0;

  const submitFaculty = async () => {
    setBusy(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const res = await api<{ is_resubmit?: boolean }>(
        `/api/reports/faculties/${bundle.faculty_id}/submit?report_date=${date}`,
        { method: "POST" }
      );
      setMessage(
        res.is_resubmit
          ? "Строевая записка факультета обновлена. ДПА уведомлён в чате."
          : "Строевая записка факультета отправлена. ДПА уведомлён в чате."
      );
      onReload();
    } catch (e) {
      setMessageIsError(true);
      setMessage(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const startEditing = async () => {
    setBusy(true);
    setMessage("");
    setMessageIsError(false);
    try {
      await api(
        `/api/reports/faculties/${bundle.faculty_id}/start-editing?report_date=${date}`,
        { method: "POST" }
      );
      setMessage("Режим редактирования. Правки не уходят в чат до повторной отправки.");
      onReload();
    } catch (e) {
      setMessageIsError(true);
      setMessage(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`mb-4 rounded-lg shadow ${pending ? "ring-2 ring-amber-400" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-vka-navy text-white px-4 py-3 rounded-t-lg flex items-center gap-2 text-left"
      >
        <span>
          {open ? "▼" : "▶"} {bundle.faculty_name}
        </span>
        {facultyStatus && (
          <span className="text-xs bg-white/15 px-2 py-0.5 rounded uppercase tracking-wide">
            {facultyStatus === "approved"
              ? "отправлена"
              : facultyStatus === "rejected"
                ? "отклонена"
                : facultyStatus}
          </span>
        )}
        {pending && (
          <span className="text-xs bg-vka-gold text-vka-navy px-2 py-0.5 rounded">
            изменения
          </span>
        )}
      </button>
      {open && (
        <div className="bg-gray-50 p-4 rounded-b-lg">
          <OfficersCard
            officers={bundle.officers}
            role={role}
            showEditHint={role === "dpf"}
            defaultOpen={role === "dpf"}
          />
          {role === "dpf" && (
            <VariableCompositionCard courses={bundle.courses} defaultOpen={role === "dpf"} />
          )}
          <p className="text-sm font-medium text-gray-700 mb-2 mt-1">Курсы</p>
          {bundle.courses.length === 0 ? (
            <p className="text-sm text-gray-500">Нет курсов</p>
          ) : (
            bundle.courses.map((c) => (
              <CourseCard
                key={c.course_id}
                course={c}
                date={date}
                role={role}
                canAckDpf={role === "dpf"}
                canAckDpa={role === "dpa"}
                defaultOpen={
                  (role === "dpf" && c.changes_pending_dpf) ||
                  (role === "dpa" && c.changes_pending_dpa)
                }
                onAck={onReload}
              />
            ))
          )}
          {message && (
            <p
              className={`mt-3 text-sm px-3 py-2 rounded ${
                messageIsError
                  ? "text-red-800 bg-red-50 border border-red-200"
                  : "text-blue-800 bg-blue-50"
              }`}
            >
              {message}
            </p>
          )}
          {role === "dpf" && submitBlockers.length > 0 && canFirstSubmit && (
            <div className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <p className="font-medium mb-1">Перед отправкой факультета:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {submitBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {role === "dpf" && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              {canFirstSubmit && (
                <button
                  type="button"
                  disabled={busy || !canSubmitNow}
                  className="bg-vka-navy text-white px-4 py-2 rounded text-sm hover:bg-vka-navy-light disabled:opacity-50"
                  onClick={submitFaculty}
                >
                  Отправить строевую записку за факультет
                </button>
              )}
              {isSubmitted && !isEditing && (
                <>
                  <p className="text-sm text-gray-600">
                    Строевая записка отправлена ДПА. Для правок нажмите «Редактировать».
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    className="bg-vka-gold text-vka-navy px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                    onClick={startEditing}
                  >
                    Редактировать строевую записку
                  </button>
                </>
              )}
              {isSubmitted && isEditing && (
                <>
                  <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded">
                    Режим редактирования — изменения не уходят в чат до отправки.
                  </p>
                  {!canSubmitNow && submitBlockers.length > 0 && (
                    <ul className="text-sm text-amber-900 list-disc pl-5">
                      {submitBlockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    disabled={busy || !canSubmitNow}
                    className="bg-vka-navy text-white px-4 py-2 rounded text-sm hover:bg-vka-navy-light disabled:opacity-50"
                    onClick={submitFaculty}
                  >
                    Отправить строевую записку за факультет
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StroevkaReviewPage() {
  const { session } = useAuth();
  const reportDate = todayLocal();
  const [bundles, setBundles] = useState<FacultyStroevkaBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const role = session?.role || "";

  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      if (role === "dpf" && session?.unit_id) {
        const b = await api<FacultyStroevkaBundle>(
          `/api/reports/stroevka/faculty/${session.unit_id}?report_date=${reportDate}`
        );
        setBundles([b]);
      } else if (role === "dpa") {
        const list = await api<FacultyStroevkaBundle[]>(
          `/api/reports/stroevka/academy?report_date=${reportDate}`
        );
        setBundles(list);
      } else {
        setBundles([]);
      }
    } catch (e) {
      setBundles([]);
      setLoadError(e instanceof Error ? e.message : "Не удалось загрузить строевые записки");
    } finally {
      setLoading(false);
    }
  }, [reportDate, role, session?.unit_id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = onWsEvent((ev) => {
      if (
        ev.type === "ATTENDANCE_CHANGED" ||
        ev.type === "COURSE_CHANGES_PENDING" ||
        ev.type === "COURSE_CHANGES_ACK_DPF" ||
        ev.type === "COURSE_CHANGES_ACK_DPA" ||
        ev.type === "REPORT_SUBMITTED" ||
        ev.type === "FACULTY_SUBMITTED" ||
        ev.type === "FACULTY_EDITING_STARTED" ||
        ev.type === "FACULTY_APPROVED"
      )
        load();
    });
    return () => {
      unsub();
    };
  }, [load]);

  const dpfBundle = role === "dpf" ? bundles[0] : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-serif font-bold text-vka-navy">
            {role === "dpf" ? "Строевые записки" : "Строевые записки академии"}
          </h2>
          {dpfBundle && !loading ? (
            <SubmittedReportStatus
              status={dpfBundle.faculty_report_status ?? "draft"}
              submittedAt={dpfBundle.faculty_report_submitted_at}
            />
          ) : null}
        </div>
        {role !== "dpf" && <p className="text-sm text-gray-600">Дата: {reportDate}</p>}
        {dpfBundle && !loading ? (
          <div className="ml-auto">
            <DutyLandlinePlaque
              items={[
                { label: "Нач. ф-т", phone: dpfBundle.officers.faculty_chief_landline },
                { label: "ДПА", phone: dpfBundle.officers.dpa_landline },
              ]}
            />
          </div>
        ) : null}
      </div>
      {loadError && (
        <p className="mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
          {loadError}
        </p>
      )}
      {loading ? (
        <p>Загрузка...</p>
      ) : (
        bundles.map((b) => (
          <FacultyBlock key={b.faculty_id} bundle={b} date={reportDate} role={role} onReload={load} />
        ))
      )}
    </div>
  );
}
