import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
  barClassName?: string;
  className?: string;
};

export function StatCard({
  label,
  value,
  hint,
  valueClassName = "text-vka-navy",
  barClassName = "bg-gradient-to-r from-vka-gold/80 to-vka-gold-light/40",
  className = "",
}: StatCardProps) {
  return (
    <div className={`stat-card ${className}`}>
      <div className={`stat-card__bar ${barClassName}`} aria-hidden />
      <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className={`text-3xl font-serif font-bold ${valueClassName}`}>{value}</p>
      {hint && <div className="mt-2">{hint}</div>}
    </div>
  );
}
