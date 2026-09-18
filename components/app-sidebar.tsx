"use client";

import type { ComponentProps } from "react";

import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavMain } from "@/components/nav-main";
import { NotificationBell } from "@/components/notification-bell";
import { NavUser } from "@/components/nav-user";
import { SidebarToggleButton } from "@/components/sidebar-toggle";

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarToggleButton />
          </SidebarMenuItem>
          <NotificationBell />
        </SidebarMenu>
      </SidebarHeader>
      <NavMain />
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
