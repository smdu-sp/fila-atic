import { CalendarClock } from "lucide-react";

import { describeDue, dueState, formatDueDate } from "@/lib/dueDate";
import { cn } from "@/lib/utils";

const tones = {
  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  muted: "border-border bg-transparent text-muted-foreground",
} as const;

// "Atrasado há 3 dias" / "Vence amanhã" / "Previsão 20/11/2026". Work that is
// already finished or cancelled (closed) only shows the date, never as late.
export function DueBadge({
  dueDate,
  closed = false,
  className,
}: {
  dueDate: Date | string | null | undefined;
  closed?: boolean;
  className?: string;
}) {
  if (!dueDate) return null;

  const { text, tone } = describeDue(dueState(dueDate, { closed }), dueDate);

  return (
    <span
      title={`Previsão de entrega: ${formatDueDate(dueDate)}`}
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      <CalendarClock className="size-3" aria-hidden="true" />
      {text}
    </span>
  );
}
