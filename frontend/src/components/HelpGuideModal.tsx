import { useEffect, useId, useRef } from "react";
import type { HelpGuideChapter } from "../content/help/types";

type HelpGuideModalProps = {
  open: boolean;
  title: string;
  chapters: HelpGuideChapter[];
  onClose: () => void;
};

function slugScrollTarget(id: string): string {
  return `help-guide-${id}`;
}

export function HelpGuideModal({ open, title, chapters, onClose }: HelpGuideModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const scrollToChapter = (id: string) => {
    const target = document.getElementById(slugScrollTarget(id));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] shadow-xl flex flex-col relative outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <h3 id={titleId} className="font-serif text-lg font-bold text-vka-navy pr-8">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-8">
          <nav className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Оглавление
            </p>
            <ol className="space-y-1.5 text-sm">
              {chapters.map((chapter, index) => (
                <li key={chapter.id}>
                  <button
                    type="button"
                    onClick={() => scrollToChapter(chapter.id)}
                    className="text-left text-vka-navy hover:underline w-full"
                  >
                    {index + 1}. {chapter.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {chapters.map((chapter) => (
            <section key={chapter.id} id={slugScrollTarget(chapter.id)} className="scroll-mt-4">
              <h4 className="font-serif text-base font-bold text-vka-navy mb-3">{chapter.title}</h4>
              <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                {chapter.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={`${chapter.id}-p-${paragraphIndex}`}>{paragraph}</p>
                ))}
                {chapter.bullets && chapter.bullets.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1.5">
                    {chapter.bullets.map((item, bulletIndex) => (
                      <li key={`${chapter.id}-b-${bulletIndex}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {chapter.tips && chapter.tips.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {chapter.tips.map((tip, tipIndex) => (
                      <p
                        key={`${chapter.id}-t-${tipIndex}`}
                        className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2"
                      >
                        {tip}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
