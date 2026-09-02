import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChatUnreadProvider, useChatUnread } from "../context/ChatUnreadContext";
import { DutyOnboardingProvider } from "./DutyOnboardingGate";

const NAV_DPA = [
  { to: "/chessboard", label: "Шахматка" },
  { to: "/stroevka", label: "Строевки" },
  { to: "/chat", label: "Чат ДПФ" },
  { to: "/phones", label: "Телефоны" },
  { to: "/print", label: "Печать" },
  { to: "/shift-change", label: "Смена наряда" },
  { to: "/help", label: "Инструкция" },
];

const NAV_DPF = [
  { to: "/stroevka", label: "Строевки курсов" },
  { to: "/attendance", label: "Офицеры" },
  { to: "/chat", label: "Чат" },
  { to: "/phones", label: "Телефоны" },
  { to: "/print", label: "Печать" },
  { to: "/shift-change", label: "Смена наряда" },
  { to: "/help", label: "Инструкция" },
];

const NAV_DPK = [
  { to: "/attendance", label: "Расход" },
  { to: "/chat", label: "Чат факультета" },
  { to: "/phones", label: "Телефоны" },
  { to: "/print", label: "Печать" },
  { to: "/shift-change", label: "Смена наряда" },
  { to: "/help", label: "Инструкция" },
];

const NAV_BY_SHELL: Record<string, { to: string; label: string }[]> = {
  admin: [
    { to: "/admin/units", label: "ОШС" },
    { to: "/admin/duty-contacts", label: "Дежурные" },
    { to: "/audit", label: "Журнал" },
    { to: "/help", label: "Инструкция" },
  ],
  chief: [
    { to: "/overview", label: "Строевка" },
    { to: "/trends", label: "Динамика" },
    { to: "/phones", label: "Телефоны" },
  ],
};

function navForSession(session: { shell: string; role: string }) {
  if (session.shell === "naryad") {
    if (session.role === "dpf") return NAV_DPF;
    if (session.role === "dpk") return NAV_DPK;
    return NAV_DPA;
  }
  return NAV_BY_SHELL[session.shell] || [];
}

function HeaderActions() {
  const { session, logout } = useAuth();

  if (!session) return null;

  return (
    <div className="text-right text-sm shrink-0">
      <p className="text-vka-gold-light font-medium">{session.display_name}</p>
      <p className="text-gray-400 uppercase">{session.role}</p>
      <button
        onClick={logout}
        className="mt-2 text-xs text-gray-300 hover:text-white underline"
      >
        Выход
      </button>
    </div>
  );
}

export function Header() {
  const { session } = useAuth();
  const location = useLocation();
  const { navHasUnread } = useChatUnread();
  const nav = session ? navForSession(session) : [];
  const onChat = location.pathname === "/chat" || location.pathname.startsWith("/chat/");

  return (
    <header className="bg-vka-navy text-white shadow-lg no-print">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-vka-gold text-xs uppercase tracking-widest mb-1">
              Министерство обороны Российской Федерации
            </p>
            <h1 className="font-serif text-xl md:text-2xl font-bold leading-tight">
              Военно-космическая академия имени А.Ф. Можайского
            </h1>
            <p className="text-gray-300 text-sm mt-1">
              Строевка — учёт расхода личного состава
            </p>
          </div>
          <HeaderActions />
        </div>
        {nav.length > 0 && (
          <nav className="flex flex-wrap gap-1 mt-4 border-t border-vka-navy-light pt-3">
            {nav.map((item) => {
              const isChat = item.to === "/chat";
              const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              const showUnread = isChat && navHasUnread && !onChat;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative px-3 py-1.5 rounded text-sm transition ${
                    active
                      ? "bg-vka-gold text-vka-navy font-semibold"
                      : showUnread
                        ? "bg-red-700 text-white font-semibold ring-2 ring-red-400"
                        : "text-gray-200 hover:bg-vka-navy-light"
                  }`}
                >
                  {item.label}
                  {showUnread && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                      !
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="bg-vka-navy text-gray-300 text-sm mt-auto no-print">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <p>197198, г. Санкт-Петербург, ул. Ждановская, д. 13</p>
        <p className="mt-1">тел.: (812) 347-96-46, 347-97-70</p>
        <p className="mt-2 text-gray-500 text-xs">
          © Военно-космическая академия имени А.Ф. Можайского
        </p>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <DutyOnboardingProvider>
        <ChatUnreadProvider>
          <Header />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
        </ChatUnreadProvider>
      </DutyOnboardingProvider>
      <Footer />
    </div>
  );
}
