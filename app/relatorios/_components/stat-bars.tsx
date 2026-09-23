// Plain, dependency-free bar rows for count breakdowns: a label, the count,
// and a bar whose width is proportional to the largest value in the group.
export function StatBars({
  items,
}: {
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));

  if (items.every((item) => item.value === 0)) {
    return (
      <p className="text-sm text-muted-foreground">Sem dados no período.</p>
    );
  }

  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item.label}
          className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm"
        >
          <span className="truncate text-muted-foreground">{item.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
