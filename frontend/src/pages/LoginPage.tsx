import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { Logo } from "../components/brand/Logo";
import { useAuth } from "../context/AuthContext";
import { homePath } from "../lib/homePath";

export function LoginPage() {
  const { session, loginUser, loginDuty, loading } = useAuth();
  const [tab, setTab] = useState<"duty" | "user">("duty");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Navigate to={homePath(session.role, session.shell)} replace />;
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      if (tab === "duty") {
        await loginDuty(String(fd.get("login_name")), String(fd.get("password")));
      } else {
        await loginUser(String(fd.get("username")), String(fd.get("password")));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-screen__photo" aria-hidden />
      <div className="login-screen__building" aria-hidden />
      <div className="login-screen__overlay" aria-hidden />

      <div className="relative w-full max-w-[420px] animate-slide-up">
        <div className="mb-5 flex flex-col items-center">
          <Logo alt="" className="h-20 w-auto mix-blend-screen" />
          <p className="mt-3 text-center font-serif text-sm text-white tracking-wide">
            ВКА им. А.Ф. Можайского
          </p>
        </div>

        <div className="login-screen__card">
          <div className="mb-6 text-center">
            <h1 className="font-serif text-3xl font-bold text-vka-navy">ПУЛЬС.ВКА</h1>
            <p className="mt-1.5 whitespace-nowrap text-[20px] font-semibold tracking-[0.04em] text-[#F5C451] drop-shadow-[0_1px_2px_rgba(230,189,117,0.35)] sm:text-[14px] sm:tracking-[0.06em]">
              ПЛАТФОРМА УЧЕТА ЛИЧНОГО СОСТАВА
            </p>
          </div>

          <div className="mb-6 flex rounded-xl bg-gray-100/90 p-1">
            <button
              type="button"
              onClick={() => setTab("duty")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${
                tab === "duty"
                  ? "bg-vka-navy text-white shadow-md"
                  : "text-gray-600 hover:text-vka-navy"
              }`}
            >
              Пост наряда
            </button>
            <button
              type="button"
              onClick={() => setTab("user")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${
                tab === "user"
                  ? "bg-vka-navy text-white shadow-md"
                  : "text-gray-600 hover:text-vka-navy"
              }`}
            >
              Админ / офицер 
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {tab === "duty" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Логин поста
                  </label>
                  <input
                    name="login_name"
                    required
                    autoComplete="username"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Пароль</label>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="input-field"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Логин</label>
                  <input name="username" required autoComplete="username" className="input-field" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Пароль</label>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="input-field"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-gold w-full py-3">
              {submitting ? "Вход..." : "Войти в систему"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
