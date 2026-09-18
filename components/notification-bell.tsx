"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import {
  getNotificationSummary,
  markAllNotificationsRead,
  type NotificationItem,
} from "@/actions/notificationActions";
import {
  NotificationIcon,
  NotificationLink,
  timeAgo,
} from "@/components/notification-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

// Bell of the sidebar: unread counter, the latest notifications in a menu,
// and a link to the full list. It polls once a minute and whenever the tab
// becomes visible again, so a new notice shows up without reloading.
export function NotificationBell() {
  const { isMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const result = await getNotificationSummary();
    if (!result.success) return;
    setUnread(result.data.unread);
    setItems(result.data.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      getNotificationSummary().then((result) => {
        if (cancelled || !result.success) return;
        setUnread(result.data.unread);
        setItems(result.data.items);
      });

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void load();
  };

  const markAll = () =>
    startTransition(async () => {
      await markAllNotificationsRead();
      await load();
    });

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <SidebarMenuItem>
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip="Notificações"
            aria-label={
              unread > 0
                ? `Notificações, ${unread} não lidas`
                : "Notificações"
            }
          >
            <span className="relative">
              <Bell />
              {unread > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 size-2 rounded-full bg-red-500 ring-2 ring-sidebar"
                />
              ) : null}
            </span>
            <span>Notificações</span>
            {unread > 0 ? (
              <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums group-data-[collapsible=icon]:hidden">
                {badge}
              </span>
            ) : null}
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? "bottom" : "right"}
          align="start"
          sideOffset={8}
          className="w-96 max-w-[calc(100vw-2rem)] p-0"
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <span className="text-sm font-semibold">Notificações</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={markAll}
              disabled={unread === 0 || isPending}
            >
              <CheckCheck />
              Marcar todas como lidas
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhuma notificação por enquanto.
              </p>
            ) : (
              <ul>
                {items.map((item) => {
                  const isUnread = item.readAt === null;
                  return (
                    <li key={item.id} className="border-b last:border-b-0">
                      <NotificationLink
                        id={item.id}
                        href={item.href}
                        unread={isUnread}
                        onNavigate={() => setOpen(false)}
                        className={cn(
                          "flex gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                          isUnread && "bg-primary/5",
                        )}
                      >
                        <NotificationIcon
                          kind={item.kind}
                          className="mt-0.5 shrink-0 text-muted-foreground"
                        />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span
                            className={cn(
                              "line-clamp-2 leading-snug",
                              isUnread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {item.title}
                          </span>
                          {item.body ? (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {item.body}
                            </span>
                          ) : null}
                          <span className="text-[11px] text-muted-foreground">
                            {timeAgo(item.createdAt)}
                          </span>
                        </span>
                        {isUnread ? (
                          <span
                            aria-label="Não lida"
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                          />
                        ) : null}
                      </NotificationLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t p-2">
            <Button variant="ghost" className="w-full" asChild>
              <Link href="/notificacoes" onClick={() => setOpen(false)}>
                Ver todas as notificações
              </Link>
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
