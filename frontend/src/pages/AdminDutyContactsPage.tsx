import { useEffect, useMemo, useState } from "react";
import { DutyContact, DutyPost, UnitRead, api } from "../api/client";
import { onWsEvent } from "../api/ws";
import { todayLocal } from "../utils/date";
import { formatRank } from "../constants/ranks";
import { AdminFlash, AdminPageShell } from "../components/AdminPageShell";

const POST_GROUPS: { type: string; label: string }[] = [
  { type: "dpa", label: "ДПА — дежурный по академии" },
  { type: "dpf", label: "ДПФ — дежурные по факультетам" },
  { type: "dpk", label: "ДПК — дежурные по курсам" },
];

type PostRow = {
  post: DutyPost;
  unitName: string;
  contact: DutyContact | null;
};

function DutyGroup({
  label,
  rows,
  open,
  onToggle,
  onSetPassword,
  onClearRegistration,
  busyPostId,
}: {
  label: string;
  rows: PostRow[];
  open: boolean;
  onToggle: () => void;
  onSetPassword: (post: DutyPost) => void;
  onClearRegistration: (post: DutyPost) => void;
  busyPostId: number | null;
}) {
  const registered = rows.filter((r) => r.contact).length;

  return (
    <div className="vka-admin-card !p-0 mb-3 overflow-hidden">
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left bg-vka-navy/5 hover:bg-vka-navy/10 transition"
        onClick={onToggle}
      >
        <span className="text-vka-navy text-sm shrink-0">{open ? "▼" : "▶"}</span>
        <span className="font-serif font-semibold text-vka-navy">{label}</span>
        <span className="text-xs text-gray-500">
          {registered} из {rows.length} на дежурстве
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wide">
                <th className="py-2 px-3 font-medium">Пост</th>
                <th className="py-2 px-3 font-medium">Подразделение</th>
                <th className="py-2 px-3 font-medium">Воинское звание</th>
                <th className="py-2 px-3 font-medium">ФИО</th>
                <th className="py-2 px-3 font-medium">Телефон</th>
                <th className="py-2 px-3 font-medium">Помощь</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ post, unitName, contact }) => (
                <tr
                  key={post.id}
                  className={`border-b border-gray-100 last:border-0 ${
                    contact ? "hover:bg-gray-50" : "bg-gray-50/80 text-gray-500"
                  }`}
                >
                  <td className="py-2 px-3">
                    <span className="font-medium text-vka-navy">{post.name}</span>
                    {post.login_name && (
                      <span className="block text-xs text-vka-gold">{post.login_name}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs">{unitName}</td>
                  <td className="py-2 px-3">{contact?.rank ? formatRank(contact.rank) : "—"}</td>
                  <td className="py-2 px-3">{contact?.full_name || "—"}</td>
                  <td className="py-2 px-3">
                    {contact?.phone || (
                      <span className="text-xs italic">не зарегистрирован</span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyPostId === post.id}
                        onClick={() => onSetPassword(post)}
                        className="text-xs text-vka-navy hover:underline disabled:opacity-50"
                      >
                        Пароль
                      </button>
                      <button
                        type="button"
                        disabled={busyPostId === post.id || !contact}
                        onClick={() => onClearRegistration(post)}
                        className="text-xs text-amber-800 hover:underline disabled:opacity-40"
                        title={contact ? undefined : "Нет регистрации на сегодня"}
                      >
                        Сбросить форму
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminDutyContactsPage() {
  const reportDate = todayLocal();
  const [contacts, setContacts] = useState<DutyContact[]>([]);
  const [posts, setPosts] = useState<DutyPost[]>([]);
  const [units, setUnits] = useState<UnitRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["dpa", "dpf", "dpk"]));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyPostId, setBusyPostId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api<DutyContact[]>("/api/duty-contacts"),
      api<DutyPost[]>("/api/duty-posts"),
      api<UnitRead[]>("/api/units"),
    ])
      .then(([c, p, u]) => {
        setContacts(c);
        setPosts(p.filter((x) => x.is_active));
        setUnits(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const unsub = onWsEvent((ev) => {
      if (ev.type === "DUTY_SHIFT_CHANGED") load();
    });
    return () => {
      unsub();
    };
  }, []);

  const unitNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of units) map.set(u.id, u.name);
    return map;
  }, [units]);

  const contactByPostId = useMemo(() => {
    const map = new Map<number, DutyContact>();
    for (const c of contacts) {
      if (c.duty_post_id) map.set(c.duty_post_id, c);
    }
    return map;
  }, [contacts]);

  const groups = useMemo(() => {
    return POST_GROUPS.map(({ type, label }) => {
      const rows: PostRow[] = posts
        .filter((p) => p.post_type === type)
        .sort((a, b) => a.unit_id - b.unit_id || a.id - b.id)
        .map((post) => ({
          post,
          unitName:
            contactByPostId.get(post.id)?.unit_name ||
            unitNames.get(post.unit_id) ||
            `id ${post.unit_id}`,
          contact: contactByPostId.get(post.id) ?? null,
        }));
      return { type, label, rows };
    });
  }, [posts, contactByPostId, unitNames]);

  const toggle = (type: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const setPostPassword = async (post: DutyPost) => {
    const login = post.login_name || `пост ${post.id}`;
    const password = window.prompt(`Новый пароль для ${login}:`);
    if (!password || !password.trim()) return;
    if (password.trim().length < 4) {
      setError("Пароль должен быть не короче 4 символов");
      return;
    }
    setMessage("");
    setError("");
    setBusyPostId(post.id);
    try {
      const res = await api<{ message: string }>(`/api/duty-posts/${post.id}/set-password`, {
        method: "POST",
        body: JSON.stringify({ password: password.trim() }),
      });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusyPostId(null);
    }
  };

  const clearRegistration = async (post: DutyPost) => {
    const login = post.login_name || post.name;
    if (
      !confirm(
        `Сбросить регистрацию «${login}» на сегодня? Дежурный снова увидит стартовую форму при входе.`
      )
    ) {
      return;
    }
    setMessage("");
    setError("");
    setBusyPostId(post.id);
    try {
      const res = await api<{ message: string }>(`/api/duty-posts/${post.id}/clear-registration`, {
        method: "POST",
      });
      setMessage(res.message);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusyPostId(null);
    }
  };

  const registeredTotal = contacts.length;
  const postsTotal = posts.length;

  return (
    <AdminPageShell title="Дежурные">
      <AdminFlash message={message} error={error} />

      {loading ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : (
        <>
          <p className="text-sm text-gray-600 vka-admin-card !py-3">
            Сегодня ({reportDate}): зарегистрировано{" "}
            <strong className="text-vka-navy">{registeredTotal}</strong> из{" "}
            <strong className="text-vka-navy">{postsTotal}</strong> постов
          </p>
          {groups.map(({ type, label, rows }) =>
            rows.length === 0 ? null : (
              <DutyGroup
                key={type}
                label={label}
                rows={rows}
                open={expanded.has(type)}
                onToggle={() => toggle(type)}
                onSetPassword={setPostPassword}
                onClearRegistration={clearRegistration}
                busyPostId={busyPostId}
              />
            )
          )}
          {posts.length === 0 && (
            <div className="vka-admin-card py-10 text-center text-sm text-gray-500">
              Посты наряда не настроены
            </div>
          )}
        </>
      )}
    </AdminPageShell>
  );
}
