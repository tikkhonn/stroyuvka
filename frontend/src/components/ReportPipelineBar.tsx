import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ReportStatus } from "../api/client";

type PipelineStage = "dpk" | "dpf" | "approved";

function resolvePipelineStage(
  status: ReportStatus | null | undefined,
  isOfficers = false
): PipelineStage {
  if (status === "approved") return "approved";
  if (isOfficers) return "dpf";
  if (status === "submitted") return "dpf";
  return "dpk";
}

function PipelineTooltip({
  id,
  anchorRect,
  text,
}: {
  id: string;
  anchorRect: DOMRect;
  text: string;
}) {
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    const pad = 8;
    const gap = 8;
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    let top = anchorRect.top - height - gap;

    if (top < pad) {
      top = anchorRect.bottom + gap;
    }

    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));

    setPosition({ top, left });
  }, [anchorRect, text]);

  return createPortal(
    <span
      ref={tooltipRef}
      id={id}
      role="tooltip"
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: -9999, left: -9999, visibility: "hidden" }
      }
      className="fixed z-[9999] max-w-[min(280px,calc(100vw-16px))] rounded bg-gray-900 px-2.5 py-1.5 text-xs font-medium normal-case leading-snug text-white shadow-lg whitespace-normal"
    >
      {text}
    </span>,
    document.body
  );
}

function PipelineBarTrigger({
  tooltipText,
  children,
}: {
  tooltipText: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ rect: DOMRect; text: string } | null>(null);

  const showTooltip = () => {
    const el = triggerRef.current;
    if (!el) return;
    setTooltip({ rect: el.getBoundingClientRect(), text: tooltipText });
  };

  const hideTooltip = () => setTooltip(null);

  useEffect(() => {
    if (!tooltip) return;
    const onDismiss = () => hideTooltip();
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [tooltip]);

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex w-[130px] rounded outline-none focus-visible:ring-2 focus-visible:ring-vka-navy/40"
        tabIndex={0}
        aria-describedby={tooltip ? tooltipId : undefined}
        onPointerEnter={showTooltip}
        onPointerLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>
      {tooltip ? (
        <PipelineTooltip id={tooltipId} anchorRect={tooltip.rect} text={tooltip.text} />
      ) : null}
    </>
  );
}

export function ReportPipelineBar({
  status,
  isOfficers = false,
}: {
  status: ReportStatus | null | undefined;
  isOfficers?: boolean;
}) {
  const stage = resolvePipelineStage(status, isOfficers);
  const tooltipText =
    stage === "approved"
      ? "ДПФ утвердил строевую записку факультета"
      : isOfficers
        ? "Ожидается утверждение офицеров факультета ДПФ"
        : stage === "dpf"
          ? "ДПК отправил строевую записку, ДПФ ещё не утвердил факультет"
          : "ДПК ещё не отправил строевую записку";

  if (stage === "approved") {
    return (
      <PipelineBarTrigger tooltipText={tooltipText}>
        <span className="flex flex-1 items-center justify-center overflow-hidden rounded border border-emerald-700 bg-emerald-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Утверждено
        </span>
      </PipelineBarTrigger>
    );
  }

  if (stage === "dpf") {
    if (isOfficers) {
      return (
        <PipelineBarTrigger tooltipText={tooltipText}>
          <span className="flex flex-1 items-center justify-center overflow-hidden rounded border border-amber-500 bg-amber-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 ring-1 ring-inset ring-amber-400">
            ДПФ
          </span>
        </PipelineBarTrigger>
      );
    }

    return (
      <PipelineBarTrigger tooltipText={tooltipText}>
        <span className="flex flex-1 items-center justify-center overflow-hidden rounded-l border border-r-0 border-amber-500 bg-amber-400 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-950">
          ДПК
        </span>
        <span className="flex flex-1 items-center justify-center overflow-hidden rounded-r border border-amber-500 bg-amber-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 ring-1 ring-inset ring-amber-400">
          ДПФ
        </span>
      </PipelineBarTrigger>
    );
  }

  return (
    <PipelineBarTrigger tooltipText={tooltipText}>
      <span className="flex flex-1 items-center justify-center overflow-hidden rounded border border-red-700 bg-red-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
        ДПК
      </span>
    </PipelineBarTrigger>
  );
}
