import { useEffect, useState } from "react";
import { AttendanceSnapshot, DepartmentStroevkaSummary, api } from "../api/client";
import { todayLocal } from "../utils/date";
import { openDutyStroevkaPrint } from "../utils/stroevayaPrint";

export type DpfPrintChoice =
  | { kind: "all" }
  | { kind: "variable" }
  | { kind: "permanent" }
  | { kind: "department"; code: string };

type DpfPrintModalProps = {
  open: boolean;
  onClose: () => void;
  onPrinted?: () => void;
  facultyId: number | null;
};

function choiceValue(choice: DpfPrintChoice): string {
  if (choice.kind === "department") return `department:${choice.code}`;
  return choice.kind;
}

function choiceFromValue(value: string, departments: DepartmentStroevkaSummary[]): DpfPrintChoice {
  if (value === "variable") return { kind: "variable" };
  if (value === "permanent") return { kind: "permanent" };
  if (value.startsWith("department:")) {
    const code = value.slice("department:".length);
    if (departments.some((d) => d.code === code)) {
      return { kind: "department", code };
    }
  }
  return { kind: "all" };
}

export function DpfPrintModal({ open, onClose, onPrinted, facultyId }: DpfPrintModalProps) {
  const [departments, setDepartments] = useState<DepartmentStroevkaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [printError, setPrintError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [selected, setSelected] = useState("all");

  useEffect(() => {
    if (!open || !facultyId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setPrintError("");
    setSelected("all");

    void api<AttendanceSnapshot>(
      `/api/attendance/${facultyId}?report_date=${todayLocal()}`
    )
      .then((snap) => {
        if (cancelled) return;
        const coded = (snap.departments ?? []).filter((d) => d.code != null);
        setDepartments(coded);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Не удалось загрузить кафедры");
        setDepartments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, facultyId]);

  if (!open) return null;

  const handlePrint = async () => {
    if (!facultyId) {
      setPrintError("Не определён факультет");
      return;
    }

    const choice = choiceFromValue(selected, departments);
    setPrinting(true);
    setPrintError("");

    const printWindow = window.open("", "_blank");
    try {
      await openDutyStroevkaPrint({
        role: "dpf",
        unitId: facultyId,
        printWindow,
        composition: choice.kind === "department" ? undefined : choice.kind,
        departmentCode: choice.kind === "department" ? choice.code : undefined,
      });
      if (onPrinted) onPrinted();
      else onClose();
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Ошибка печати");
    } finally {
      setPrinting(false);
    }
  };

  const options: { value: string; label: string }[] = [
    { value: "all", label: "Строевая записка за весь факультет" },
    { value: "variable", label: "Строевая записка переменного состава" },
    { value: "permanent", label: "Строевая записка постоянного состава" },
    ...departments.map((dept) => ({
      value: choiceValue({ kind: "department", code: dept.code! }),
      label: `Строевая записка — ${dept.name}`,
    })),
  ];

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl max-w-lg w-full p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dpf-print-title"
      >
        <h3 id="dpf-print-title" className="font-serif text-lg font-bold text-vka-navy mb-1">
          Печать строевой записки
        </h3>
        <p className="text-sm text-gray-600 mb-4">Выберите состав для печати.</p>

        {loading ? (
          <p className="text-sm text-gray-500 mb-4">Загрузка…</p>
        ) : loadError ? (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {loadError}
          </p>
        ) : (
          <fieldset className="space-y-2 mb-4">
            <legend className="sr-only">Вид строевой записки</legend>
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer transition ${
                  selected === option.value
                    ? "border-vka-navy bg-vka-cream/60"
                    : "border-gray-200 hover:border-vka-navy/40"
                }`}
              >
                <input
                  type="radio"
                  name="dpf-print-choice"
                  value={option.value}
                  checked={selected === option.value}
                  onChange={() => setSelected(option.value)}
                  className="mt-1"
                />
                <span className="text-sm text-gray-800">{option.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        {printError ? (
          <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {printError}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="px-4 py-2 rounded text-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={printing || loading || !!loadError || !facultyId}
            className="bg-vka-navy text-white px-4 py-2 rounded text-sm hover:bg-vka-navy-light disabled:opacity-50"
          >
            {printing ? "Печать…" : "Печать"}
          </button>
        </div>
      </div>
    </div>
  );
}
