import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return <div className={`glass-card p-5 ${className}`}>{children}</div>;
}

export function CardHeader({ title }: { title: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-vka-navy">{title}</h3>
    </div>
  );
}
