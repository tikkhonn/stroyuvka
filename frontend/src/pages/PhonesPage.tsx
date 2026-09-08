import { useEffect, useMemo, useState } from "react";
import { DutyContact, api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { onWsEvent } from "../api/ws";

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
  if (c.rank && c.full_name) return `${c.rank} ${c.full_name}`;
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

export function PhonesPage() {
  const { session } = useAuth();
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
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">Телефоны</h2>

      {loading ? (
        <p>Загрузка...</p>
      ) : contacts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">{emptyMessage}</div>
      ) : showGrouped ? (
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
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {contacts.map((c) => (
            <ContactCard key={c.id} contact={c} />
          ))}
        </div>
      )}
    </div>
  );
}
