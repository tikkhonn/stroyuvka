import type { ReactNode } from "react";

export function AdminPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="vka-admin-page">
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">{title}</h2>
      {children}
    </div>
  );
}

export function AdminFlash({
  message,
  error,
}: {
  message?: string;
  error?: string;
}) {
  return (
    <>
      {message ? <p className="vka-admin-flash vka-admin-flash--success">{message}</p> : null}
      {error ? <p className="vka-admin-flash vka-admin-flash--error">{error}</p> : null}
    </>
  );
}
