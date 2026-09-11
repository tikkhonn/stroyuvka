import { Hospital } from "../api/client";

type Props = {
  hospitals: Hospital[];
  value: number | null;
  onChange: (id: number | null) => void;
  extra?: { id: number; name: string } | null;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function HospitalSelect({
  hospitals,
  value,
  onChange,
  extra,
  disabled,
  required,
  className = "border rounded px-2 py-1 text-sm min-w-[12rem]",
}: Props) {
  const options = [...hospitals];
  if (extra && extra.id && !options.some((h) => h.id === extra.id)) {
    options.unshift({
      id: extra.id,
      name: extra.name,
      sort_order: 0,
      is_active: false,
    });
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={className}
      disabled={disabled}
      required={required}
    >
      <option value="">{required ? "Выберите мед. учреждение" : "Не указано"}</option>
      {options.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
    </select>
  );
}
