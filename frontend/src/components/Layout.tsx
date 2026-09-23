import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthSession } from "../api/client";
import { ChatUnreadProvider, useChatUnread } from "../context/ChatUnreadContext";
import { openDutyStroevkaPrint } from "../utils/stroevayaPrint";
import { Logo } from "./brand/Logo";
import { DutyOnboardingProvider } from "./DutyOnboardingGate";
import { DpfPrintModal } from "./DpfPrintModal";

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

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
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
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md bg-vka-gold/20 ring-2 ring-vka-gold/30"
        aria-hidden="true"
      >
        <UserIcon className="h-5 w-5 text-vka-gold" />
      </div>
      <span className="relative inline-flex group">
        <button
          type="button"
          onClick={logout}
          aria-label="Выход"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-gray-300 transition hover:border-vka-gold/50 hover:text-white"
        >
          <LogOutIcon className="h-5 w-5" />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
        >
          Выход
        </span>
      </span>
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

function Header({ onDpfPrint }: { onDpfPrint: () => void }) {
  const { session } = useAuth();
  const location = useLocation();
  const { navHasUnread } = useChatUnread();
  const nav = session ? navForSession(session) : [];
  const primaryNav = nav.filter((item) => !SECONDARY_NAV_PATHS.has(item.to));
  const secondaryNav = nav.filter((item) => SECONDARY_NAV_PATHS.has(item.to));
  const onChat = location.pathname === "/chat" || location.pathname.startsWith("/chat/");

  const renderNavItem = (item: { to: string; label: string }) => {
    const isChat = item.to === "/chat";
    const isDpkPrint =
      item.to === "/print" && session != null && session.role === "dpk";
    const isDpfPrint =
      item.to === "/print" && session != null && session.role === "dpf";
    const active =
      location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    const showUnread = isChat && navHasUnread && !onChat;
    return (
      <NavPill
        key={item.to}
        item={item}
        active={active}
        showUnread={showUnread}
        onPrintClick={
          isDpkPrint
            ? dutyPrintHandler(session!)
            : isDpfPrint
              ? onDpfPrint
              : undefined
        }
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
  const { session } = useAuth();
  const [dpfPrintOpen, setDpfPrintOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <DutyOnboardingProvider>
        <ChatUnreadProvider>
          <Header onDpfPrint={() => setDpfPrintOpen(true)} />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">{children}</main>
          {session?.role === "dpf" ? (
            <DpfPrintModal
              open={dpfPrintOpen}
              onClose={() => setDpfPrintOpen(false)}
              facultyId={session.unit_id}
            />
          ) : null}
        </ChatUnreadProvider>
      </DutyOnboardingProvider>
      <Footer />
    </div>
  );
}
