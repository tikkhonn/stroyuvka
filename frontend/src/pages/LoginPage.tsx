import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function homePath(role: string, shell: string): string {
  if (shell === "admin") return "/admin/units";
  if (shell === "chief") return "/overview";
  if (role === "dpa") return "/chessboard";
  if (role === "dpf") return "/stroevka";
  return "/attendance";
}

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
    <div className="min-h-screen bg-vka-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 text-white">
          <p className="text-vka-gold text-sm uppercase tracking-widest mb-2">
            «ВКА им. А.Ф. Можайского»
          </p>
          <h1 className="font-serif text-2xl font-bold">СТРОЕВКА</h1>
          <p className="text-gray-400 text-sm mt-2">
            Автоматизированная система мониторинга расхода личного состава
          </p>
          <p className="text-gray-500 text-xs mt-1">Основана 16 января 1712 года</p>
        </div>

        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          <div className="flex border-b">
            <button
              type="button"
              onClick={() => setTab("duty")}
              className={`flex-1 py-3 text-sm font-medium ${
                tab === "duty" ? "bg-vka-gold text-vka-navy" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Пост наряда
            </button>
            <button
              type="button"
              onClick={() => setTab("user")}
              className={`flex-1 py-3 text-sm font-medium ${
                tab === "user" ? "bg-vka-gold text-vka-navy" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Админ / начальник
            </button>
          </div>

          <form onSubmit={onSubmit} className="p-6 space-y-4">
            {tab === "duty" ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Логин поста
                  </label>
                  <input
                    name="login_name"
                    required
                    autoComplete="username"
                    placeholder="dpk-11, dpf-1, dpa"
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-vka-gold focus:border-vka-gold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-vka-gold outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Демо: <code className="bg-gray-100 px-1">dpa</code> /{" "}
                    <code className="bg-gray-100 px-1">dpa-naryad</code>
                    {" · "}
                    <code className="bg-gray-100 px-1">dpk-11</code> /{" "}
                    <code className="bg-gray-100 px-1">dpk-11</code>
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Логин</label>
                  <input
                    name="username"
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-vka-gold outline-none"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                  <input
                    name="password"
                    type="password"
                    required
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-vka-gold outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Демо: admin / admin123 · nachalnik / nachalnik123
                  </p>
                </div>
              </>
            )}

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-vka-navy text-white py-2.5 rounded font-medium hover:bg-vka-navy-light transition disabled:opacity-50"
            >
              {submitting ? "Вход..." : "Войти"}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          г. Санкт-Петербург · ул. Ждановская, д. 13
        </p>
      </div>
    </div>
  );
}
