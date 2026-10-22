import { useCallback, useEffect, useState } from "react";

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      setVisible(window.scrollY > window.innerHeight);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Наверх"
      title="Наверх"
      className="no-print fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-vka-navy text-vka-gold shadow-vka-lg ring-2 ring-vka-gold/30 transition hover:bg-vka-navy-light focus:outline-none focus-visible:ring-2 focus-visible:ring-vka-gold"
    >
      <ChevronUpIcon className="h-5 w-5" />
    </button>
  );
}
