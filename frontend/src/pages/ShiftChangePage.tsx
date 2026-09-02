import { useCallback, useEffect, useState } from "react";
import { DutyContact, api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useDutyOnboarding } from "../components/DutyOnboardingGate";

export function ShiftChangePage() {
  const { session } = useAuth();
  const { startShiftChange } = useDutyOnboarding();
  const [contact, setContact] = useState<DutyContact | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api<{ registered: boolean; contact: DutyContact | null }>(
        "/api/duty-contacts/self/status"
      );
      setRegistered(s.registered);
      setContact(s.contact);
    } catch {
      setRegistered(false);
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleShiftChange = async () => {
    setError("");
    setBusy(true);
    try {
      await startShiftChange();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить смену наряда");
    } finally {
      setBusy(false);
    }
  };

  const currentName =
    contact?.rank && contact?.full_name
      ? `${contact.rank} ${contact.full_name}`
      : contact?.post_name;

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-2">Смена наряда</h2>
      <p className="text-sm text-gray-600 mb-6">
        Пост: <strong>{session?.display_name}</strong>
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Загрузка...</p>
      ) : (
        <>
          {registered && contact && (
            <div className="bg-white rounded-lg shadow p-4 mb-6 border-l-4 border-vka-gold">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Сейчас на дежурстве
              </p>
              <p className="font-medium text-vka-navy">{currentName}</p>
              <p className="text-sm mt-1">{contact.phone}</p>
            </div>
          )}

          {!registered && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-900">
              Карточка дежурного ещё не заполнена. Сначала укажите данные на стартовой форме,
              затем здесь можно будет передать смену следующему дежурному.
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-5 mb-6">
            <h3 className="font-semibold text-vka-navy mb-3">Что произойдёт</h3>
            <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
              <li>
                Откроется форма для ввода данных <strong>нового дежурного</strong> — звание, ФИО и
                телефон. Без этого работа в системе недоступна.
              </li>
              <li>
                <strong>Расход за сегодня сохранится</strong> — цифры и строевки можно продолжать
                править.
              </li>
              <li>
                Следующий дежурный входит под <strong>тем же логином и паролем</strong> поста.
              </li>
            </ul>
          </div>

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          {!confirming ? (
            <button
              type="button"
              disabled={!registered || busy}
              onClick={() => setConfirming(true)}
              className="bg-vka-navy text-white px-5 py-2.5 rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Смена наряда
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-900 mb-4">
                Подтвердите смену наряда: откроется форма для нового дежурного. Расход за день
                сохранится.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleShiftChange}
                  className="bg-red-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  {busy ? "Выполняется..." : "Да, сменить наряд"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="border border-gray-300 px-4 py-2 rounded text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
