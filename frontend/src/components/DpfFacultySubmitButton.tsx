import type { ReactNode } from "react";

function SubmitBlockersTooltip({
  blockers,
  children,
}: {
  blockers: string[];
  children: ReactNode;
}) {
  if (blockers.length === 0) {
    return <>{children}</>;
  }

  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 min-w-[280px] max-w-sm rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      >
        <ul className="list-none space-y-0.5">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </span>
    </span>
  );
}

export function DpfFacultySubmitButton({
  label,
  disabled,
  busy,
  submitBlockers,
  onClick,
  variant = "submit",
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  submitBlockers: string[];
  onClick: () => void;
  variant?: "submit" | "edit";
}) {
  const showBlockersTooltip = disabled && submitBlockers.length > 0;
  const buttonClass =
    variant === "edit"
      ? "inline-flex items-center bg-vka-gold text-vka-navy px-4 py-2 rounded text-sm font-medium hover:bg-vka-gold/90 disabled:opacity-50"
      : "inline-flex items-center rounded border-2 border-vka-navy bg-white px-3 py-1 text-sm font-bold uppercase tracking-wide text-vka-navy hover:bg-vka-cream disabled:cursor-not-allowed disabled:opacity-50";

  const button = (
    <button
      type="button"
      disabled={disabled || busy}
      className={buttonClass}
      onClick={onClick}
    >
      {label}
    </button>
  );

  if (!showBlockersTooltip) {
    return button;
  }

  return <SubmitBlockersTooltip blockers={submitBlockers}>{button}</SubmitBlockersTooltip>;
}
