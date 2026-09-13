import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { openDutyStroevkaPrint } from "../utils/stroevayaPrint";

export function DutyAutoPrint({
  role,
  unitId,
}: {
  role: "dpk" | "dpf";
  unitId: number | null;
}) {
  const navigate = useNavigate();
  const startedRef = useRef(false);
  const [error, setError] = useState("");

  const backTo = role === "dpk" ? "/attendance" : "/stroevka";

  const runPrint = async (printWindow?: Window | null) => {
    setError("");
    try {
      await openDutyStroevkaPrint({ role, unitId, printWindow });
      navigate(backTo, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка печати");
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const printWindow = window.open("", "_blank");
    void runPrint(printWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="max-w-lg">
        <h2 className="text-xl font-serif font-bold text-vka-navy mb-3">Печать</h2>
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const printWindow = window.open("", "_blank");
              void runPrint(printWindow);
            }}
            className="bg-vka-navy text-white px-4 py-2 rounded text-sm hover:bg-vka-navy-light"
          >
            Повторить
          </button>
          <Link to={backTo} className="px-4 py-2 rounded text-sm border border-gray-300 hover:bg-gray-50">
            Назад
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-600">
      <p>Открываем окно печати…</p>
    </div>
  );
}
