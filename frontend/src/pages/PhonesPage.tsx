import { useEffect, useMemo, useState } from "react";
import { DutyContact, LandlinePhone, api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { onWsEvent } from "../api/ws";
import { formatRank } from "../constants/ranks";

type PhonesTab = "landline" | "mobile";

const GROUP_LABELS: Record<string, string> = {
  dpa: "ДПА",
  dpf: "ДПФ",
  dpk: "ДПК",
};

const GROUP_ORDER: Record<string, string[]> = {
  dpk: ["dpf", "dpk"],
  dpf: ["dpa", "dpf", "dpk"],
  dpa: ["dpf"],
  chief: ["dpa", "dpf"],
};

function displayName(c: DutyContact) {
  if (c.rank && c.full_name) return `${formatRank(c.rank)} ${c.full_name}`;
  return c.post_name;
}

function ContactCard({ contact }: { contact: DutyContact }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-vka-gold">
      {contact.unit_name && (
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{contact.unit_name}</p>
      )}
      <p className="font-medium text-vka-navy">{displayName(contact)}</p>
      <p className="text-sm mt-1">{contact.phone || "—"}</p>
      {contact.room && <p className="text-sm text-gray-500">пом. {contact.room}</p>}
    </div>
  );
}

function MobileContactsList({
  loading,
  contacts,
  groups,
  emptyMessage,
  showGrouped,
}: {
  loading: boolean;
  contacts: DutyContact[];
  groups: { type: string; label: string; items: DutyContact[] }[];
  emptyMessage: string;
  showGrouped: boolean;
}) {
  if (loading) {
    return <p>Загрузка...</p>;
  }

  if (contacts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">{emptyMessage}</div>
    );
  }

  if (showGrouped) {
    return (
      <div className="space-y-6">
        {groups.map(({ type, label, items }) => (
          <section key={type}>
            <h3 className="text-sm font-semibold text-vka-navy uppercase tracking-wide mb-3">
              {label}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((c) => (
                <ContactCard key={c.id} contact={c} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {contacts.map((c) => (
        <ContactCard key={c.id} contact={c} />
      ))}
    </div>
  );
}

function LandlineTable() {
  const [rows, setRows] = useState<LandlinePhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    void api<LandlinePhone[]>("/api/landline-phones?active_only=true")
      .then(setRows)
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p>Загрузка...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">
        Список стационарных номеров пуст.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase tracking-wide">
            <th className="py-2 px-3 font-medium">Должность</th>
            <th className="py-2 px-3 font-medium w-48">Номер</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100">
              <td className="py-2 px-3">{row.name}</td>
              <td className="py-2 px-3 whitespace-nowrap">{row.phone || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PhonesPage() {
  const { session } = useAuth();
  const [tab, setTab] = useState<PhonesTab>("landline");
  const [contacts, setContacts] = useState<DutyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const role = session?.role || "";
  const shell = session?.shell || "";

  const load = () =>
    api<DutyContact[]>("/api/duty-contacts")
      .then(setContacts)
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const unsub = onWsEvent((ev) => {
      if (ev.type === "DUTY_SHIFT_CHANGED") load();
    });
    return () => {
      unsub();
    };
  }, []);

  const groups = useMemo(() => {
    const order = GROUP_ORDER[shell === "chief" ? "chief" : role] || [];
    const byType = new Map<string, DutyContact[]>();
    for (const c of contacts) {
      const t = c.post_type || "other";
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(c);
    }
    return order
      .filter((t) => byType.has(t))
      .map((t) => ({ type: t, label: GROUP_LABELS[t] || t, items: byType.get(t)! }));
  }, [contacts, role, shell]);

  const emptyMessage =
    shell === "chief"
      ? "Пока никто из дежурных не зарегистрировался на сегодня."
      : role === "dpk"
        ? "Пока не зарегистрировались ДПФ или другие ДПК вашего факультета."
        : role === "dpf"
          ? "Пока никто из дежурных (ДПА, ДПФ, ДПК) не зарегистрировался."
          : "Пока ни один ДПФ не зарегистрировался.";

  const showGrouped = role === "dpf" || role === "dpk" || shell === "chief";

  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-2">Телефоны</h2>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("landline")}
          className={`text-sm px-3 py-1.5 rounded border ${
            tab === "landline" ? "bg-vka-navy text-white" : "bg-white"
          }`}
        >
          Стационарные
        </button>
        <button
          type="button"
          onClick={() => setTab("mobile")}
          className={`text-sm px-3 py-1.5 rounded border ${
            tab === "mobile" ? "bg-vka-navy text-white" : "bg-white"
          }`}
        >
          Мобильные
        </button>
      </div>

      {tab === "landline" ? (
        <LandlineTable />
      ) : (
        <MobileContactsList
          loading={loading}
          contacts={contacts}
          groups={groups}
          emptyMessage={emptyMessage}
          showGrouped={showGrouped}
        />
      )}
    </div>
  );
}
