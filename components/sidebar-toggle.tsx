"use client";

import { ArrowLeftFromLineIcon } from "lucide-react";

import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { MiniLogo } from "@/components/mini-logo";

export function SidebarToggleButton() {
  const { toggleSidebar } = useSidebar();

  return (
    <SidebarMenuButton
      className="cursor-pointer"
      size="lg"
      onClick={() => toggleSidebar()}
    >
      <MiniLogo />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate text-xs font-semibold">FilaAtic</span>
      </div>
      <ArrowLeftFromLineIcon />
    </SidebarMenuButton>
  );
}
