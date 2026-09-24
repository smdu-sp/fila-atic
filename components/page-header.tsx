import { NotificationBell } from "@/components/notification-bell";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

// Top bar of every page inside the app: sidebar toggle and title on the left,
// the notification bell on the right.
export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sm:h-16">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:px-4">
        <SidebarTrigger className="-ml-1 md:hidden" />
        <Separator orientation="vertical" className="mr-2 h-4 md:hidden" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{title}</span>
          {subtitle ? (
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </div>
      </div>
      <div className="px-3 sm:px-4">
        <NotificationBell />
      </div>
    </header>
  );
}
