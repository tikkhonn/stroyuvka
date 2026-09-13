import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthSession } from "../api/client";
import { ChatUnreadProvider, useChatUnread } from "../context/ChatUnreadContext";
import { openDutyStroevkaPrint } from "../utils/stroevayaPrint";
import { Logo } from "./brand/Logo";
import { DutyOnboardingProvider } from "./DutyOnboardingGate";

const NAV_DPA = [
  { to: "/chessboard", label: "Шахматка" },
  { to: "/stroevka", label: "Строевые записки" },
  { to: "/chat", label: "Чат ДПФ" },
  { to: "/phones", label: "Телефоны" },
  { to: "/print", label: "Печать" },
  { to: "/shift-change", label: "Смена наряда" },
  { to: "/documentation", label: "Документация" },
  { to: "/help", label: "Инструкция" },
];

const NAV_DPF = [
  { to: "/stroevka", label: "Строевые записки" },
  { to: "/attendance", label: "Расход" },
  { to: "/chat", label: "Чат" },
  { to: "/phones", label: "Телефоны" },
  { to: "/print", label: "Печать" },
  { to: "/shift-change", label: "Смена наряда" },
  { to: "/documentation", label: "Документация" },
  { to: "/help", label: "Инструкция" },
];

const NAV_DPK = [
  { to: "/attendance", label: "Расход" },
  { to: "/chat", label: "Чат факультета" },
  { to: "/phones", label: "Телефоны" },
  { to: "/print", label: "Печать" },
  { to: "/shift-change", label: "Смена наряда" },
  { to: "/documentation", label: "Документация" },
  { to: "/help", label: "Инструкция" },
];

const NAV_BY_SHELL: Record<string, { to: string; label: string }[]> = {
  admin: [
    { to: "/admin/units", label: "ОШС" },
    { to: "/admin/hospitals", label: "Мед. учреждения" },
    { to: "/admin/landline-phones", label: "Стационарные" },
    { to: "/attendance", label: "Расход" },
    { to: "/admin/duty-contacts", label: "Дежурные" },
    { to: "/audit", label: "Журнал" },
    { to: "/documentation", label: "Документация" },
    { to: "/help", label: "Инструкция" },
  ],
  chief: [
    { to: "/overview", label: "Строевая записка" },
    { to: "/trends", label: "Динамика" },
    { to: "/phones", label: "Телефоны" },
  ],
};

const SECONDARY_NAV_PATHS = new Set(["/shift-change", "/documentation", "/help"]);

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  chief: "Строевой отдел",
  dpa: "ДПА",
  dpf: "ДПФ",
  dpk: "ДПК",
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

  const roleLabel = ROLE_LABELS[session.role] || session.role.toUpperCase();

  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="hidden sm:block text-right">
        <p className="text-sm font-medium text-white">{session.display_name}</p>
        <p className="text-xs text-vka-gold/90">{roleLabel}</p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-vka-gold/20 ring-2 ring-vka-gold/30">
        <span className="text-sm font-bold text-vka-gold">
          {session.display_name.charAt(0).toUpperCase()}
        </span>
      </div>
      <button
        onClick={logout}
        className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-gray-300 transition hover:border-vka-gold/50 hover:text-white"
      >
        Выход
      </button>
    </div>
  );
}

function navPillClass(active: boolean, showUnread: boolean) {
  return `nav-pill ${
    active
      ? "nav-pill-active"
      : showUnread
        ? "bg-red-600/90 text-white ring-2 ring-red-400/50"
        : "nav-pill-idle"
  }`;
}

function NavPill({
  item,
  active,
  showUnread,
  onPrintClick,
}: {
  item: { to: string; label: string };
  active: boolean;
  showUnread: boolean;
  onPrintClick?: () => void;
}) {
  if (onPrintClick) {
    return (
      <button type="button" onClick={onPrintClick} className={navPillClass(active, showUnread)}>
        {item.label}
      </button>
    );
  }

  return (
    <Link to={item.to} className={navPillClass(active, showUnread)}>
      {item.label}
      {showUnread && (
        <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
          !
        </span>
      )}
    </Link>
  );
}

function dutyPrintHandler(session: AuthSession) {
  return () => {
    const role = session.role;
    if (role !== "dpk" && role !== "dpf") return;
    const printWindow = window.open("", "_blank");
    void openDutyStroevkaPrint({
      role,
      unitId: session.unit_id,
      printWindow,
    }).catch((e) => {
      alert(e instanceof Error ? e.message : "Ошибка печати");
    });
  };
}

function Header() {
  const { session } = useAuth();
  const location = useLocation();
  const { navHasUnread } = useChatUnread();
  const nav = session ? navForSession(session) : [];
  const primaryNav = nav.filter((item) => !SECONDARY_NAV_PATHS.has(item.to));
  const secondaryNav = nav.filter((item) => SECONDARY_NAV_PATHS.has(item.to));
  const onChat = location.pathname === "/chat" || location.pathname.startsWith("/chat/");

  const renderNavItem = (item: { to: string; label: string }) => {
    const isChat = item.to === "/chat";
    const isDutyPrint =
      item.to === "/print" &&
      session != null &&
      (session.role === "dpk" || session.role === "dpf");
    const active =
      location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    const showUnread = isChat && navHasUnread && !onChat;
    return (
      <NavPill
        key={item.to}
        item={item}
        active={active}
        showUnread={showUnread}
        onPrintClick={isDutyPrint ? dutyPrintHandler(session!) : undefined}
      />
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-vka-navy text-white shadow-vka-lg no-print border-b-2 border-vka-gold">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="h-10 w-auto shrink-0" />
            <h1 className="font-serif text-lg md:text-xl font-bold leading-tight truncate">
              ПУЛЬС.ВКА
            </h1>
          </div>
          <HeaderActions />
        </div>

        {nav.length > 0 && (
          <nav className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-white/10">
            <div className="flex flex-wrap gap-1.5">{primaryNav.map(renderNavItem)}</div>
            {secondaryNav.length > 0 && (
              <div className="flex flex-wrap gap-1.5 ml-auto pl-3 border-l border-white/15">
                {secondaryNav.map(renderNavItem)}
              </div>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="bg-vka-navy text-vka-gray text-sm mt-auto no-print border-t border-vka-gold/20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Logo className="mt-0.5 h-8 w-auto shrink-0" />
            <div>
              <p className="font-serif text-vka-gold/90 text-sm">ВКА им. А.Ф. Можайского</p>
              <p className="mt-1 text-xs">197198, г. Санкт-Петербург, ул. Ждановская, д. 13</p>
            </div>
          </div>
          <p className="text-xs text-vka-gray/80">тел.: (812) 347-96-46, 347-97-70</p>
        </div>
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
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">{children}</main>
        </ChatUnreadProvider>
      </DutyOnboardingProvider>
      <Footer />
    </div>
  );
}
