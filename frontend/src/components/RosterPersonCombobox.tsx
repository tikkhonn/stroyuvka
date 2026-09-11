import { useEffect, useMemo, useRef, useState } from "react";
import { PersonRead } from "../api/client";
import { formatRank } from "../constants/ranks";

function personDisplayName(person: PersonRead): string {
  return person.display_name || person.full_name;
}

function personLabel(person: PersonRead): string {
  return `${formatRank(person.rank)} ${personDisplayName(person)}`;
}

function matchesQuery(person: PersonRead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const display = personDisplayName(person).toLowerCase();
  const lastName = person.last_name.toLowerCase();
  return display.startsWith(q) || lastName.startsWith(q);
}

type Props = {
  people: PersonRead[];
  absentPersonIds: Set<number>;
  value: number | null;
  onChange: (personId: number | null) => void;
  disabled?: boolean;
};

export function RosterPersonCombobox({
  people,
  absentPersonIds,
  value,
  onChange,
  disabled = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const activePeople = useMemo(
    () => people.filter((person) => person.is_active),
    [people]
  );

  const suggestions = useMemo(() => {
    return activePeople.filter((person) => matchesQuery(person, query));
  }, [activePeople, query]);

  useEffect(() => {
    if (value === null) {
      setQuery("");
      return;
    }
    const selected = activePeople.find((person) => person.id === value);
    if (selected) {
      setQuery(personLabel(selected));
    }
  }, [value, activePeople]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleInputChange = (text: string) => {
    setQuery(text);
    onChange(null);
    setOpen(true);
  };

  const handleSelect = (person: PersonRead) => {
    if (absentPersonIds.has(person.id)) return;
    onChange(person.id);
    setQuery(personLabel(person));
    setOpen(false);
  };

  const showSuggestions = open && !disabled && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative min-w-[220px]">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Начните вводить фамилию"
        className="border rounded px-2 py-1 text-sm w-full"
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
      />
      {showSuggestions && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded border border-gray-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((person) => {
            const alreadyAbsent = absentPersonIds.has(person.id);
            return (
              <li key={person.id} role="option" aria-disabled={alreadyAbsent}>
                <button
                  type="button"
                  disabled={alreadyAbsent}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(person)}
                  className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm ${
                    alreadyAbsent
                      ? "cursor-not-allowed text-gray-400"
                      : "hover:bg-vka-cream/80 text-vka-navy"
                  }`}
                >
                  <span>{personLabel(person)}</span>
                  {alreadyAbsent && (
                    <span className="shrink-0 text-xs text-gray-400">уже отмечен</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
