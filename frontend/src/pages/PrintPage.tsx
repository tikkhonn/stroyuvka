import { useEffect, useState } from "react";
import { todayLocal } from "../utils/date";
import { UnitRead, api, downloadFile } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ABSENCE_CATEGORY_OPTIONS } from "../constants/absenceCategories";

type Scope = "academy" | "location" | "faculty";
type ReportKind = Scope | "by_category";

export function PrintPage() {
  const { session } = useAuth();
  const isDpk = session?.role === "dpk";
  const isDpf = session?.role === "dpf";
  const isDpa = session?.role === "dpa";
  const reportDate = todayLocal();
  const [date, setDate] = useState(reportDate);
  const [reportKind, setReportKind] = useState<ReportKind>("academy");
  const [categoryCode, setCategoryCode] = useState("duty");
  const [locations, setLocations] = useState<UnitRead[]>([]);
  const [faculties, setFaculties] = useState<UnitRead[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");

  useEffect(() => {
    if (!isDpa) return;
    Promise.all([
      api<UnitRead[]>("/api/units/locations"),
      api<UnitRead[]>("/api/units"),
    ])
      .then(([locs, units]) => {
        setLocations(locs);
        setFaculties(units.filter((u) => u.type === "faculty"));
        if (locs[0]) setSelectedId(locs[0].id);
      })
      .catch(() => {});
  }, [isDpa]);

  const openPrint = async () => {
    const token = localStorage.getItem("token");
    const base = import.meta.env.VITE_API_URL || "";

    if (isDpk || isDpf) {
      const printScope = isDpk ? "unit" : "faculty";
      const params = new URLSearchParams({
        report_date: reportDate,
        scope: printScope,
        unit_id: String(session?.unit_id ?? ""),
      });
      const res = await fetch(`${base}/api/print/stroevaya?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const html = await res.text();
      if (!res.ok) {
        alert(html || "Ошибка печати");
        return;
      }
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
      return;
    }

    const scope: Scope =
      reportKind === "by_category" ? "academy" : reportKind;

    const params = new URLSearchParams({
      report_date: date,
      scope,
    });

    if (reportKind === "by_category") {
      params.set("category_code", categoryCode);
    }

    if (scope !== "academy") {
      if (!selectedId) {
        alert("Выберите подразделение");
        return;
      }
      params.set("unit_id", String(selectedId));
    }

    const res = await fetch(`${base}/api/print/stroevaya?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const html = await res.text();
    if (!res.ok) {
      alert(html || "Ошибка печати");
      return;
    }
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  const exportRashodXlsx = async () => {
    try {
      const [y, m, d] = date.split("-");
      const stamp = y && m && d ? `${d}.${m}.${y}` : date;
      await downloadFile(
        `/api/print/sick.xlsx?report_date=${date}`,
        `Расход ${stamp}.xlsx`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка скачивания");
    }
  };

  const unitOptions = reportKind === "location" ? locations : faculties;

  if (isDpk) {
    return (
      <div>
        <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">
          Строевая записка курса
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {session?.display_name || "Ваш курс"} — печать строевки на сегодня ({reportDate}).
        </p>

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <button
            onClick={openPrint}
            className="inline-block bg-vka-navy text-white px-4 py-2 rounded hover:bg-vka-navy-light"
          >
            Открыть и печатать
          </button>
        </div>
      </div>
    );
  }

  if (isDpf) {
    return (
      <div>
        <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">
          Строевая записка факультета
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {session?.display_name || "Ваш факультет"} — сводный расход всех курсов и офицеров на
          сегодня ({reportDate}).
        </p>

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <button
            onClick={openPrint}
            className="inline-block bg-vka-navy text-white px-4 py-2 rounded hover:bg-vka-navy-light"
          >
            Открыть и печатать
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">Печать расхода</h2>
      <p className="text-sm text-gray-600 mb-4">
        Сводные строевые записки и списки отсутствующих по выбранному срезу.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Вид отчёта</label>
          <select
            value={reportKind}
            onChange={(e) => {
              const kind = e.target.value as ReportKind;
              setReportKind(kind);
              if (kind === "location" && locations[0]) setSelectedId(locations[0].id);
              if (kind === "faculty" && faculties[0]) setSelectedId(faculties[0].id);
            }}
            className="border rounded px-2 py-1 min-w-[220px]"
          >
            <option value="academy">Расход всей академии</option>
            <option value="location">Расход по расположению</option>
            <option value="faculty">Расход факультета</option>
            <option value="by_category">По причине отсутствия (вся академия)</option>
          </select>
        </div>
        {reportKind === "location" || reportKind === "faculty" ? (
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              {reportKind === "location" ? "Расположение" : "Факультет"}
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="border rounded px-2 py-1 min-w-[200px]"
            >
              {unitOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {reportKind === "by_category" ? (
          <div>
            <label className="block text-xs text-gray-600 mb-1">Причина отсутствия</label>
            <select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              className="border rounded px-2 py-1 min-w-[180px]"
            >
              {ABSENCE_CATEGORY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button
          onClick={openPrint}
          className="inline-block bg-vka-navy text-white px-4 py-2 rounded hover:bg-vka-navy-light"
        >
          Открыть и печатать
        </button>
        <button
          type="button"
          onClick={() => void exportRashodXlsx()}
          className="inline-block bg-white text-vka-navy border border-vka-navy px-4 py-2 rounded hover:bg-vka-cream"
        >
          Скачать Excel
        </button>
      </div>
    </div>
  );
}
