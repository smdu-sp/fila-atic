"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlarmClock,
  Bell,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Inbox,
  MessageSquare,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import { markNotificationRead } from "@/actions/notificationActions";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  NEW_REQUEST: Inbox,
  TASK_ASSIGNED: CheckSquare,
  PROJECT_ASSIGNED: Briefcase,
  MESSAGE: MessageSquare,
  STATUS_CHANGED: RefreshCw,
  DUE_CHANGED: CalendarClock,
  DEADLINE: AlarmClock,
};

export function NotificationIcon({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  const Icon = icons[kind] ?? Bell;
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}

// "há 5 min", "há 3 h", "ontem", or the date.
export function timeAgo(value: Date | string, now: Date = new Date()) {
  const date = new Date(value);
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);

  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return date.toLocaleDateString("pt-BR");
}

// A link that also marks the notification as read. The call is not awaited:
// the navigation must never wait for it.
export function NotificationLink({
  id,
  href,
  unread,
  className,
  onNavigate,
  children,
}: {
  id: string;
  href: string;
  unread: boolean;
  className?: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (unread) void markNotificationRead(id);
        onNavigate?.();
      }}
    >
      {children}
    </Link>
  );
}
