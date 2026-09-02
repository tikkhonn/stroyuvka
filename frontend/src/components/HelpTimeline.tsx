import type { HelpStep } from "../content/help/types";

export function HelpTimeline({ steps }: { steps: HelpStep[] }) {
  if (steps.length === 0) return null;

  return (
    <ol className="relative space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <li key={index} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast && (
              <span
                className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-vka-navy/20"
                aria-hidden
              />
            )}

            <div
              className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vka-navy text-white font-bold text-lg"
              aria-hidden
            >
              {index + 1}
            </div>

            <div className="flex-1 min-w-0 pt-1">
              <h4 className="font-semibold text-vka-navy text-base">{step.title}</h4>
              <p className="text-gray-700 mt-2 text-base leading-relaxed">{step.body}</p>

              {step.tip && (
                <p className="mt-2 text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded px-3 py-2">
                  {step.tip}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
