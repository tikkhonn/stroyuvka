import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DutyContact, api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { RANK_SUGGESTIONS } from "../constants/ranks";

interface DutyOnboardingContextValue {
  isDuty: boolean;
  startShiftChange: () => Promise<void>;
}

const DutyOnboardingContext = createContext<DutyOnboardingContextValue | null>(null);

export function useDutyOnboarding() {
  const ctx = useContext(DutyOnboardingContext);
  if (!ctx) throw new Error("useDutyOnboarding outside provider");
  return ctx;
}

export function DutyOnboardingProvider({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [registered, setRegistered] = useState(true);
  const [shiftMode, setShiftMode] = useState(false);
  const [rank, setRank] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isDuty =
    session?.shell === "naryad" &&
    (session.auth_kind === "duty_post" ||
      session.role === "dpk" ||
      session.role === "dpf" ||
      session.role === "dpa");

  const checkStatus = useCallback(async () => {
    if (!isDuty) {
      setRegistered(true);
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const s = await api<{ registered: boolean }>("/api/duty-contacts/self/status");
      setRegistered(s.registered);
    } catch {
      setRegistered(false);
    } finally {
      setChecking(false);
    }
  }, [isDuty]);

  useEffect(() => {
    setShiftMode(false);
    checkStatus();
  }, [checkStatus, session?.duty_post_id]);

  const startShiftChange = useCallback(async () => {
    if (!isDuty) return;
    await api("/api/duty-contacts/self/shift-change", { method: "POST" });
    setRank("");
    setFullName("");
    setPhone("");
    setShiftMode(true);
    setRegistered(false);
    setError("");
  }, [isDuty]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api<DutyContact>("/api/duty-contacts/self", {
        method: "POST",
        body: JSON.stringify({
          rank: rank.trim(),
          full_name: fullName.trim(),
          phone: phone.trim(),
        }),
      });
      setRegistered(true);
      setShiftMode(false);
      navigate("/help", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  };

  const ctxValue = useMemo(
    () => ({ isDuty, startShiftChange }),
    [isDuty, startShiftChange]
  );

  const showModal = isDuty && !checking && !registered;

  return (
    <DutyOnboardingContext.Provider value={ctxValue}>
      {children}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-vka-navy/90 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-serif font-bold text-vka-navy mb-1">
              {shiftMode ? "Смена наряда" : "Данные дежурного"}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {shiftMode
                ? "Введите звание, ФИО и телефон нового дежурного. Цифры расхода за сегодня останутся — их можно править."
                : "Укажите звание, ФИО и телефон на сегодня. Карточка появится у вышестоящего дежурного в «Телефоны»."}
            </p>
            {session?.display_name && (
              <p className="text-xs text-gray-500 mb-4">Пост: {session.display_name}</p>
            )}
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Звание</label>
                <input
                  list="onboarding-ranks"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="лейтенант"
                  required
                  autoFocus
                />
                <datalist id="onboarding-ranks">
                  {RANK_SUGGESTIONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">ФИО</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Телефон</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="8 (812) ..."
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-vka-navy text-white py-2.5 rounded font-medium disabled:opacity-50"
              >
                {submitting ? "Сохранение..." : "Продолжить работу"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleLogout}
                className="w-full border border-gray-300 text-gray-700 py-2.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>
      )}
    </DutyOnboardingContext.Provider>
  );
}
