import { cn } from "@/lib/utils";

const STEPS = ["Property", "Upload", "Review", "Report"] as const;

export type FlowStep = (typeof STEPS)[number];

export function StepIndicator({
  current,
  className,
}: {
  current: FlowStep;
  className?: string;
}) {
  const currentIndex = STEPS.indexOf(current);
  return (
    <nav
      aria-label="Report progress"
      className={cn("w-full", className)}
    >
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((label, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-medium tabular-nums transition-colors",
                    active &&
                      "border-gold bg-gold text-gold-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-gold)_18%,transparent)]",
                    done && "border-foreground bg-foreground text-background",
                    !active && !done && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "truncate text-xs font-medium uppercase tracking-[0.16em] sm:text-sm",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    done ? "bg-foreground/60" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}