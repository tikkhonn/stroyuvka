import { FormEvent, useEffect, useState } from "react";
import { DutyContact, api } from "../api/client";
import { RANK_SUGGESTIONS } from "../constants/ranks";

interface DutyContactEditModalProps {
  contact: DutyContact;
  onClose: () => void;
  onSaved: (contact: DutyContact) => void;
}

export function DutyContactEditModal({ contact, onClose, onSaved }: DutyContactEditModalProps) {
  const [rank, setRank] = useState(contact.rank ?? "");
  const [fullName, setFullName] = useState(contact.full_name ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setRank(contact.rank ?? "");
    setFullName(contact.full_name ?? "");
    setPhone(contact.phone ?? "");
    setError("");
  }, [contact]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const updated = await api<DutyContact>("/api/duty-contacts/self", {
        method: "POST",
        body: JSON.stringify({
          rank: rank.trim(),
          full_name: fullName.trim(),
          phone: phone.trim(),
        }),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duty-contact-edit-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100"
          aria-label="Закрыть"
        >
          <span className="text-xl leading-none" aria-hidden="true">
            ×
          </span>
        </button>

        <h3 id="duty-contact-edit-title" className="font-serif text-lg font-bold text-vka-navy mb-1 pr-8">
          Редактировать карточку
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Измените звание, ФИО или телефон. Данные обновятся в разделе «Телефоны» у вышестоящего дежурного.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Звание</label>
            <input
              list="edit-duty-ranks"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="лейтенант"
              required
              autoFocus
            />
            <datalist id="edit-duty-ranks">
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
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="bg-vka-navy text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="border border-gray-300 px-4 py-2 rounded text-sm"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
