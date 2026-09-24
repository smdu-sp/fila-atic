"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Charts shared by the dashboard and the reports. They only draw: the pages
// decide the numbers, the labels and the colors.

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const TOOLTIP_STYLE = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
} as const;

export type Slice = { key: string; label: string; value: number; color: string };

function Empty({ message = "Sem dados no período." }: { message?: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

// Ring with the total in the middle and a legend (label, count, share) on the
// side; slices with zero are left out of the ring but stay in the legend.
export function DonutChart({
  slices,
  totalLabel = "total",
  emptyMessage,
}: {
  slices: Slice[];
  totalLabel?: string;
  emptyMessage?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) return <Empty message={emptyMessage} />;

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-6 gap-y-3">
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={slices.filter((slice) => slice.value > 0)}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {slices
                .filter((slice) => slice.value > 0)
                .map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="grid min-w-0 gap-1.5 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 truncate text-muted-foreground">
              {slice.label}
            </span>
            <span className="ms-auto ps-2 tabular-nums">
              {slice.value}
              <span className="ps-1 text-xs text-muted-foreground">
                ({Math.round((slice.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROW = 34;

// One horizontal bar per item, each with its own color and its value at the end.
export function BarsChart({
  items,
  labelWidth = 120,
  valueName = "Quantidade",
  emptyMessage,
}: {
  items: Array<{ key: string; label: string; value: number; color: string }>;
  labelWidth?: number;
  // what the number is, for the tooltip ("Quantidade", "Dias"...)
  valueName?: string;
  emptyMessage?: string;
}) {
  if (items.every((item) => item.value === 0)) return <Empty message={emptyMessage} />;

  return (
    <div style={{ height: items.length * ROW + 8 }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            contentStyle={TOOLTIP_STYLE}
          />
          <Bar dataKey="value" name={valueName} radius={4} barSize={16} isAnimationActive={false}>
            {items.map((item) => (
              <Cell key={item.key} fill={item.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              style={{ fill: "var(--foreground)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type Series = { key: string; label: string; color: string };

// Horizontal bars split in segments (for instance completed / open / late per
// person). `rows` carry one number per series key.
export function StackedBarsChart({
  rows,
  series,
  labelWidth = 130,
  emptyMessage,
}: {
  rows: Array<{ label: string } & Record<string, number | string>>;
  series: Series[];
  labelWidth?: number;
  emptyMessage?: string;
}) {
  const empty = rows.every((row) => series.every((item) => !Number(row[item.key])));
  if (empty) return <Empty message={emptyMessage} />;

  return (
    <div style={{ height: rows.length * ROW + 40 }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            contentStyle={TOOLTIP_STYLE}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              stackId="stack"
              fill={item.color}
              barSize={16}
              radius={index === series.length - 1 ? [0, 4, 4, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Two (or more) series over time, as soft areas.
export function TimelineChart({
  points,
  series,
  height = 240,
  emptyMessage,
}: {
  points: Array<{ label: string } & Record<string, number | string>>;
  series: Series[];
  height?: number;
  emptyMessage?: string;
}) {
  const empty = points.every((point) => series.every((item) => !Number(point[item.key])));
  if (empty) return <Empty message={emptyMessage} />;

  return (
    <div style={{ height }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.key} id={`fill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={item.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={item.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {series.map((item) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              fill={`url(#fill-${item.key})`}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
