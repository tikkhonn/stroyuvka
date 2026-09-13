export function DutyLandlinePlaque({
  items,
}: {
  items: { label: string; phone: string | null | undefined }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-vka-navy/15 bg-white shadow-vka">
      {items.map(({ label, phone }, index) => (
        <div
          key={label}
          className={`flex items-center gap-2 px-3 py-1.5 ${
            index > 0 ? "border-l border-vka-navy/10" : "border-l-[3px] border-vka-gold"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-vka-navy-light">
            {label}
          </span>
          <span className="text-sm font-semibold tabular-nums text-vka-navy">
            {phone || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
